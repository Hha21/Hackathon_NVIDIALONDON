# Inference Performance — Known Issue & Fix Path

## Current state

`python3 -m src.infer` (5100 rollouts: ~102 stations × 50) takes **~4–5 min** on the
DGX Spark (NVIDIA GB10). Generating a forecast is *not* a single inference call — it's a
Monte-Carlo over the whole city.

## What was already fixed: batch the rollouts

Original `src/infer.py` looped **batch size 1**:

```python
for stn in stations:            # ~102
    prompt = seed.unsqueeze(0)   # batch = 1
    for _ in range(n_rollouts):  # 50
        out = model.generate(prompt, ...)   # 5100 serial batch-1 calls
```

That issues 5100 separate `generate()` calls, each decoding 150 tokens at batch 1 — the GB10
sits nearly idle per call and pays Python + kernel-launch overhead 5100×. Fixed by batching all
rollouts for a station into one call:

```python
prompt = seed.unsqueeze(0).repeat(n_rollouts, 1)   # (50, T)
out = model.generate(prompt, ...)                  # 102 batched calls total
```

`generate()` was already batch-agnostic (all ops over `(B, T)`), so this was a drop-in change.
~50× fewer launches; this is the big win that took runtime from "heading toward hours" to ~5 min.

## Remaining bottleneck: no KV cache (O(T²) decode)

`GPT.generate` in `src/model.py` re-encodes the **entire growing sequence every token**:

```python
for _ in range(max_new_tokens):
    ctx = idx if idx.size(1) <= seq_len else idx[:, -seq_len:]
    logits, _ = self(ctx)          # full forward over all T tokens, every step
    ...
    idx = torch.cat([idx, next_t], dim=1)
```

Generating 150 tokens does ~150 forward passes whose cost grows with sequence length →
**quadratic** total work per rollout. This, not batch size, is now the dominant cost.

### Fix (not yet done — model-code change)

Add a **KV cache**: each attention layer keeps past keys/values, so each decode step is a
forward over **one** new token (the appended position) instead of the whole prefix. Turns
O(T²) into O(T). Expected: minutes → **single-digit seconds** for the same 5100 rollouts.

Scope: thread a `past_kv` through `GPT.forward` and each attention block, append per step in
`generate`, and skip the causal recompute for cached positions. Medium effort, well understood,
but touches the model definition — deferred so it doesn't risk the working demo.

### Cheap interim knobs (no code change)

- `--n-rollouts 20` — fewer samples, noisier risk surface, proportionally faster.
- `--max-new-tokens 100` — shorter rollouts (most incidents land in the first tokens anyway).
- Baseline model (`python src/generate_forecast.py`) — seconds, identical JSON schema, demo
  fallback.

## TODO

- [ ] Implement KV cache in `src/model.py` `GPT.forward` + attention + `generate`.
- [ ] Benchmark 5100-rollout wall-clock before/after.
