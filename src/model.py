"""
Phase 4: GPT-2 style causal transformer.

nanoGPT-inspired implementation — standard PyTorch, no external deps.
Two pre-configured tiers:

    small  : 6 layers, 512 hidden, 8 heads  (~19M params)  — default
    gpt2   : 12 layers, 768 hidden, 12 heads (~85M params)  — headline model

Usage:
    from src.model import GPT, GPTConfig
    config = GPTConfig.small(vocab_size=976, seq_len=255)
    model  = GPT(config)
"""

import math
import torch
import torch.nn as nn
from torch.nn import functional as F
from dataclasses import dataclass


@dataclass
class GPTConfig:
    vocab_size: int = 976
    seq_len:    int = 255    # max input sequence length (window - 1)
    n_layer:    int = 6
    n_head:     int = 8
    d_model:    int = 512
    d_ff:       int = 2048   # 4 × d_model
    dropout:    float = 0.1
    bias:       bool = False  # no bias → fewer params, often better

    # ── named constructors ──────────────────────────────────────────────────
    @classmethod
    def small(cls, vocab_size: int = 976, seq_len: int = 255) -> "GPTConfig":
        """~19M params — trains in minutes on CUDA."""
        return cls(vocab_size=vocab_size, seq_len=seq_len,
                   n_layer=6, n_head=8, d_model=512, d_ff=2048, dropout=0.1)

    @classmethod
    def gpt2(cls, vocab_size: int = 976, seq_len: int = 255) -> "GPTConfig":
        """~85M params — GPT-2 small scale."""
        return cls(vocab_size=vocab_size, seq_len=seq_len,
                   n_layer=12, n_head=12, d_model=768, d_ff=3072, dropout=0.1)

    @classmethod
    def nano(cls, vocab_size: int = 976, seq_len: int = 255) -> "GPTConfig":
        """~3M params — CPU-viable for testing."""
        return cls(vocab_size=vocab_size, seq_len=seq_len,
                   n_layer=4, n_head=4, d_model=128, d_ff=512, dropout=0.1)

    @property
    def n_params(self) -> int:
        cfg = self
        return (
            cfg.vocab_size * cfg.d_model           # token embedding
            + cfg.seq_len  * cfg.d_model           # positional embedding
            + cfg.n_layer  * (
                4 * cfg.d_model ** 2               # attention (Q,K,V,O)
                + 2 * cfg.d_model * cfg.d_ff       # FFN
                + 4 * cfg.d_model                  # LayerNorm params
            )
        )


# ── Building blocks ────────────────────────────────────────────────────────────

class CausalSelfAttention(nn.Module):
    def __init__(self, cfg: GPTConfig):
        super().__init__()
        assert cfg.d_model % cfg.n_head == 0

        self.n_head  = cfg.n_head
        self.d_model = cfg.d_model
        self.head_dim = cfg.d_model // cfg.n_head
        self.dropout  = cfg.dropout

        # Fused QKV projection
        self.c_attn = nn.Linear(cfg.d_model, 3 * cfg.d_model, bias=cfg.bias)
        self.c_proj = nn.Linear(cfg.d_model, cfg.d_model,     bias=cfg.bias)
        self.attn_drop = nn.Dropout(cfg.dropout)
        self.resid_drop = nn.Dropout(cfg.dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        B, T, C = x.shape

        q, k, v = self.c_attn(x).split(self.d_model, dim=2)
        # Reshape to (B, n_head, T, head_dim)
        q = q.view(B, T, self.n_head, self.head_dim).transpose(1, 2)
        k = k.view(B, T, self.n_head, self.head_dim).transpose(1, 2)
        v = v.view(B, T, self.n_head, self.head_dim).transpose(1, 2)

        # Flash attention (PyTorch 2.0+) — causal mask applied automatically
        y = F.scaled_dot_product_attention(
            q, k, v,
            attn_mask=None,
            dropout_p=self.dropout if self.training else 0.0,
            is_causal=True,
        )
        y = y.transpose(1, 2).contiguous().view(B, T, C)
        return self.resid_drop(self.c_proj(y))


class MLP(nn.Module):
    def __init__(self, cfg: GPTConfig):
        super().__init__()
        self.fc1  = nn.Linear(cfg.d_model, cfg.d_ff,    bias=cfg.bias)
        self.fc2  = nn.Linear(cfg.d_ff,    cfg.d_model, bias=cfg.bias)
        self.drop = nn.Dropout(cfg.dropout)
        self.act  = nn.GELU()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.drop(self.fc2(self.act(self.fc1(x))))


class Block(nn.Module):
    def __init__(self, cfg: GPTConfig):
        super().__init__()
        self.ln1  = nn.LayerNorm(cfg.d_model, bias=cfg.bias)
        self.attn = CausalSelfAttention(cfg)
        self.ln2  = nn.LayerNorm(cfg.d_model, bias=cfg.bias)
        self.mlp  = MLP(cfg)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x + self.attn(self.ln1(x))   # pre-norm residual
        x = x + self.mlp(self.ln2(x))
        return x


# ── GPT model ─────────────────────────────────────────────────────────────────

class GPT(nn.Module):
    def __init__(self, cfg: GPTConfig):
        super().__init__()
        self.cfg = cfg

        self.transformer = nn.ModuleDict(dict(
            wte  = nn.Embedding(cfg.vocab_size, cfg.d_model),   # token embeddings
            wpe  = nn.Embedding(cfg.seq_len,    cfg.d_model),   # position embeddings
            drop = nn.Dropout(cfg.dropout),
            h    = nn.ModuleList([Block(cfg) for _ in range(cfg.n_layer)]),
            ln_f = nn.LayerNorm(cfg.d_model, bias=cfg.bias),
        ))
        self.lm_head = nn.Linear(cfg.d_model, cfg.vocab_size, bias=False)

        # Weight tying: share token embedding and output projection weights
        self.transformer.wte.weight = self.lm_head.weight

        # Init weights
        self.apply(self._init_weights)
        # Scale residual projections (GPT-2 paper §2.3)
        for name, p in self.named_parameters():
            if name.endswith("c_proj.weight"):
                nn.init.normal_(p, mean=0.0, std=0.02 / math.sqrt(2 * cfg.n_layer))

    def _init_weights(self, module):
        if isinstance(module, nn.Linear):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def forward(
        self,
        idx:     torch.Tensor,
        targets: torch.Tensor | None = None,
    ) -> tuple[torch.Tensor, torch.Tensor | None]:
        """
        idx     : (B, T)  token indices
        targets : (B, T)  target token indices for loss computation

        Returns (logits, loss).  loss is None if targets not provided.
        """
        B, T = idx.shape
        assert T <= self.cfg.seq_len, \
            f"Sequence length {T} exceeds model max {self.cfg.seq_len}"

        pos = torch.arange(T, device=idx.device).unsqueeze(0)  # (1, T)
        x = self.transformer.drop(
            self.transformer.wte(idx) + self.transformer.wpe(pos)
        )
        for block in self.transformer.h:
            x = block(x)
        x = self.transformer.ln_f(x)
        logits = self.lm_head(x)   # (B, T, vocab_size)

        loss = None
        if targets is not None:
            loss = F.cross_entropy(
                logits.view(-1, self.cfg.vocab_size),
                targets.view(-1),
                ignore_index=0,   # PAD token id
            )
        return logits, loss

    # ── Inference helpers ──────────────────────────────────────────────────────

    @torch.no_grad()
    def generate(
        self,
        idx:            torch.Tensor,
        max_new_tokens: int,
        temperature:    float = 1.0,
        top_k:          int | None = 50,
    ) -> torch.Tensor:
        """
        Autoregressive generation from a prompt idx of shape (1, T).
        Returns (1, T + max_new_tokens).
        """
        for _ in range(max_new_tokens):
            ctx = idx if idx.size(1) <= self.cfg.seq_len else idx[:, -self.cfg.seq_len:]
            logits, _ = self(ctx)
            logits = logits[:, -1, :] / temperature

            if top_k is not None:
                v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                logits[logits < v[:, [-1]]] = float("-inf")

            probs  = F.softmax(logits, dim=-1)
            next_t = torch.multinomial(probs, num_samples=1)
            idx    = torch.cat([idx, next_t], dim=1)

        return idx

    # ── Optimiser factory ──────────────────────────────────────────────────────

    def configure_optimizer(
        self,
        lr:           float = 3e-4,
        weight_decay: float = 0.1,
        betas:        tuple = (0.9, 0.95),
        device_type:  str = "cuda",
    ) -> torch.optim.AdamW:
        # Separate weight-decay and no-decay parameter groups
        decay_params     = [p for n, p in self.named_parameters()
                            if p.dim() >= 2 and p.requires_grad]
        no_decay_params  = [p for n, p in self.named_parameters()
                            if p.dim() < 2  and p.requires_grad]
        optim_groups = [
            {"params": decay_params,    "weight_decay": weight_decay},
            {"params": no_decay_params, "weight_decay": 0.0},
        ]
        fused = device_type == "cuda" and hasattr(torch.optim, "AdamW")
        return torch.optim.AdamW(optim_groups, lr=lr, betas=betas,
                                 fused=fused if fused else False)

    def n_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters())
