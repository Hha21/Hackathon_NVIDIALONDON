"""
Phase 4: Train the GPT-2 causal transformer on London Fire Brigade incident sequences.

Usage:
    python src/train_gpt2.py                      # small tier, 15 epochs
    python src/train_gpt2.py --tier gpt2          # GPT-2 small, 15 epochs
    python src/train_gpt2.py --epochs 20          # override epoch count
    python src/train_gpt2.py --resume             # resume from checkpoint

Outputs:
    models/gpt2_best.pt     best checkpoint (lowest val loss)
    models/gpt2_last.pt     latest checkpoint (for resuming)
"""

import sys
import time
import json
import math
import argparse
import numpy as np
import torch
from pathlib import Path

# Allow running from repo root
sys.path.insert(0, str(Path(__file__).parent.parent))
from src.dataset import build_dataloaders, load_vocab
from src.model   import GPT, GPTConfig

# ── Config ─────────────────────────────────────────────────────────────────────

MODEL_DIR  = Path("models")
MODEL_DIR.mkdir(exist_ok=True)

BEST_CKPT  = MODEL_DIR / "gpt2_best.pt"
LAST_CKPT  = MODEL_DIR / "gpt2_last.pt"

TIERS = {
    "nano":  GPTConfig.nano,
    "small": GPTConfig.small,
    "gpt2":  GPTConfig.gpt2,
}

# ── LR schedule: linear warmup + cosine decay ─────────────────────────────────

def get_lr(step: int, warmup_steps: int, max_steps: int, max_lr: float, min_lr: float) -> float:
    if step < warmup_steps:
        return max_lr * step / warmup_steps
    if step >= max_steps:
        return min_lr
    progress = (step - warmup_steps) / (max_steps - warmup_steps)
    return min_lr + 0.5 * (max_lr - min_lr) * (1.0 + math.cos(math.pi * progress))


# ── Sample generation (shown during training to verify learning) ───────────────

@torch.no_grad()
def generate_sample(model: GPT, vocab: dict, device: torch.device, n_new: int = 48) -> str:
    import json, pandas as pd
    from src.dataset import build_prefix, load_weather_lut

    inv_vocab   = {v: k for k, v in vocab.items()}
    weather_lut = load_weather_lut()

    # Cold-start: Friday evening, mild weather, post-Grenfell era
    ref_dt  = pd.Timestamp("2023-11-03 18:00:00")   # a Friday evening
    prefix  = build_prefix(ref_dt, vocab, weather_lut)
    prompt  = torch.tensor(prefix, dtype=torch.long).unsqueeze(0).to(device)

    model.eval()
    out = model.generate(prompt, max_new_tokens=n_new, temperature=0.8, top_k=40)
    model.train()

    tokens = [inv_vocab.get(int(t), "?") for t in out[0].tolist()]
    return " ".join(tokens)


# ── Training loop ──────────────────────────────────────────────────────────────

def train(args):
    device      = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    device_type = "cuda" if device.type == "cuda" else "cpu"
    print(f"Device: {device}  ({torch.cuda.get_device_name(0) if device_type=='cuda' else 'CPU'})")

    # ── Data ──
    SEQ_LEN    = 256
    BATCH_SIZE = args.batch_size
    train_dl, val_dl, data_meta = build_dataloaders(
        seq_len=SEQ_LEN, batch_size=BATCH_SIZE, stride=128
    )
    vocab = load_vocab()

    # ── Model ──
    cfg_fn = TIERS[args.tier]
    cfg    = cfg_fn(vocab_size=data_meta["vocab_size"], seq_len=SEQ_LEN - 1)
    model  = GPT(cfg).to(device)
    n_params = model.n_parameters()
    print(f"\nModel: {args.tier} tier  |  {n_params/1e6:.1f}M params")
    print(f"  Layers: {cfg.n_layer}  Heads: {cfg.n_head}  "
          f"d_model: {cfg.d_model}  d_ff: {cfg.d_ff}")

    # Optionally compile for speed (PyTorch 2.0+)
    if args.compile and device_type == "cuda":
        print("Compiling model with torch.compile ...")
        model = torch.compile(model)

    # ── Optimiser ──
    MAX_LR      = 3e-4
    MIN_LR      = MAX_LR / 10
    WEIGHT_DECAY = 0.1
    steps_per_epoch = len(train_dl)
    total_steps     = steps_per_epoch * args.epochs
    warmup_steps    = min(500, total_steps // 20)

    optimizer = model.configure_optimizer(
        lr=MAX_LR, weight_decay=WEIGHT_DECAY, device_type=device_type
    )

    # ── Resume ──
    start_epoch = 0
    best_val    = float("inf")
    global_step = 0

    if args.resume and LAST_CKPT.exists():
        ckpt = torch.load(LAST_CKPT, map_location=device)
        model.load_state_dict(ckpt["model"])
        optimizer.load_state_dict(ckpt["optimizer"])
        start_epoch = ckpt["epoch"] + 1
        best_val    = ckpt.get("best_val", float("inf"))
        global_step = ckpt.get("global_step", 0)
        print(f"Resumed from epoch {start_epoch}  (best val loss: {best_val:.4f})")

    # ── Time estimate ──
    print(f"\nTraining plan:")
    print(f"  Epochs         : {args.epochs}")
    print(f"  Steps/epoch    : {steps_per_epoch:,}")
    print(f"  Total steps    : {total_steps:,}")
    print(f"  Warmup steps   : {warmup_steps}")
    print(f"  Batch size     : {BATCH_SIZE}")
    print(f"  Train windows  : {data_meta['n_train']:,}")
    print(f"  Val windows    : {data_meta['n_val']:,}")

    # Estimate step time from a quick benchmark
    print("\nBenchmarking step time ...")
    dummy_x = torch.randint(0, cfg.vocab_size, (BATCH_SIZE, SEQ_LEN-1), device=device)
    t0 = time.time()
    for _ in range(5):
        _, loss = model(dummy_x, dummy_x)
        if device_type == "cuda":
            torch.cuda.synchronize()
    step_ms = (time.time() - t0) / 5 * 1000
    est_epoch_s = step_ms / 1000 * steps_per_epoch
    est_total_m = est_epoch_s * args.epochs / 60
    print(f"  ~{step_ms:.0f}ms/step  →  ~{est_epoch_s:.0f}s/epoch  →  ~{est_total_m:.0f} min total")

    # ── Training ──
    scaler = torch.amp.GradScaler(device_type) if device_type == "cuda" else None
    log_every  = max(1, steps_per_epoch // 10)
    val_every  = steps_per_epoch  # once per epoch
    save_every = steps_per_epoch

    print(f"\n{'─'*65}")
    train_start = time.time()

    for epoch in range(start_epoch, args.epochs):
        model.train()
        epoch_loss = 0.0
        epoch_t    = time.time()

        for step_in_epoch, (x, y) in enumerate(train_dl):
            x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)

            # LR schedule
            lr = get_lr(global_step, warmup_steps, total_steps, MAX_LR, MIN_LR)
            for g in optimizer.param_groups:
                g["lr"] = lr

            optimizer.zero_grad(set_to_none=True)

            if scaler is not None:
                with torch.amp.autocast(device_type):
                    _, loss = model(x, y)
                scaler.scale(loss).backward()
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                scaler.step(optimizer)
                scaler.update()
            else:
                _, loss = model(x, y)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()

            epoch_loss  += loss.item()
            global_step += 1

            if (step_in_epoch + 1) % log_every == 0:
                avg = epoch_loss / (step_in_epoch + 1)
                pct = (step_in_epoch + 1) / steps_per_epoch * 100
                print(f"  epoch {epoch+1:2d}  {pct:5.1f}%  "
                      f"loss={avg:.4f}  lr={lr:.2e}  "
                      f"step={global_step:,}", flush=True)

        # ── Validation ────────────────────────────────────────────────────
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for xv, yv in val_dl:
                xv, yv = xv.to(device), yv.to(device)
                if scaler is not None:
                    with torch.amp.autocast(device_type):
                        _, lv = model(xv, yv)
                else:
                    _, lv = model(xv, yv)
                val_loss += lv.item()
        val_loss /= len(val_dl)

        train_loss = epoch_loss / steps_per_epoch
        epoch_time = time.time() - epoch_t
        elapsed    = time.time() - train_start
        remaining  = elapsed / (epoch - start_epoch + 1) * (args.epochs - epoch - 1)

        print(f"\nEpoch {epoch+1:2d}/{args.epochs}  "
              f"train={train_loss:.4f}  val={val_loss:.4f}  "
              f"time={epoch_time:.0f}s  "
              f"ETA={remaining/60:.1f}min")

        # Sample generation
        sample = generate_sample(model, vocab, device)
        print(f"  Sample: {sample[:120]}")
        print()

        # ── Checkpoint ────────────────────────────────────────────────────
        ckpt = {
            "model":       model.state_dict(),
            "optimizer":   optimizer.state_dict(),
            "epoch":       epoch,
            "global_step": global_step,
            "val_loss":    val_loss,
            "train_loss":  train_loss,
            "best_val":    best_val,
            "config":      vars(cfg),
        }
        torch.save(ckpt, LAST_CKPT)

        if val_loss < best_val:
            best_val = val_loss
            torch.save(ckpt, BEST_CKPT)
            print(f"  ★ New best val loss: {best_val:.4f}  →  saved {BEST_CKPT}")

        print(f"{'─'*65}")

    total_time = time.time() - train_start
    print(f"\nTraining complete in {total_time/60:.1f} min")
    print(f"Best val loss: {best_val:.4f}")
    print(f"Checkpoints: {BEST_CKPT}  |  {LAST_CKPT}")


# ── CLI ────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Train GPT-2 on LFB incident sequences")
    parser.add_argument("--tier",       default="small", choices=list(TIERS.keys()),
                        help="Model tier: nano | small | gpt2")
    parser.add_argument("--epochs",     type=int, default=15)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--resume",     action="store_true")
    parser.add_argument("--compile",    action="store_true",
                        help="Use torch.compile() for faster CUDA training")
    args = parser.parse_args()

    train(args)


if __name__ == "__main__":
    main()
