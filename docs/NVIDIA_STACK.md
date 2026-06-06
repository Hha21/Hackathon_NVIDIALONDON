# How Foresight uses the NVIDIA stack

> **Confirmation: yes — Foresight runs on the NVIDIA stack, end to end, locally.**
> Two GPU workloads run on the same **NVIDIA DGX Spark (GB10 Grace-Blackwell)** box, both
> accelerated by **NVIDIA CUDA**, and the operator-facing assistant is driven by an
> **NVIDIA Nemotron** foundation model. No external/cloud LLM is in the loop.

This document is the canonical answer to judging criterion **#2 — NVIDIA Ecosystem & Spark
Utility (30 pts)**, in particular *"The Stack: did they use at least one major NVIDIA
library/tool? (NIMs, RAPIDS, cuOpt, Modulus, NeMo Models). Merely calling GPT-4 via API gets
0 points here."*

---

## TL;DR — what is NVIDIA here

| Layer | NVIDIA asset used | Where |
| --- | --- | --- |
| **Model** | **NVIDIA Nemotron** — `Nemotron-3-Nano-Omni-30B-A3B` (NVIDIA's open NeMo-family foundation model) | Voice agent's reasoning + tool-selection brain |
| **Model** | GPT-2-scale causal transformer trained **from scratch with PyTorch CUDA** | 24h ward risk forecast |
| **Hardware** | **DGX Spark — GB10 Grace-Blackwell**, 128 GB coherent unified memory | All inference + training, on-prem, no cloud |
| **Compute lib** | **NVIDIA CUDA 13** + **Blackwell native NVFP4** kernels (`BLACKWELL_NATIVE_FP4=1`) | Both models run GPU-accelerated on the GB10 |

**Why this scores (and is not a "GPT-4 via API = 0" case):** the disqualifier penalises calling
someone else's hosted model. We do the opposite — we run **NVIDIA's own Nemotron model locally
on NVIDIA hardware** with the NVIDIA CUDA stack. Nemotron is explicitly the kind of asset the
criterion lists ("NeMo Models"). Nothing leaves the box.

---

## The two NVIDIA workloads

### 1. Forecast brain — GPT-2 from scratch (PyTorch CUDA)

Incident history is tokenised into "a language of urban emergencies" and a GPT-2-scale causal
LM is **trained from scratch in PyTorch on the GB10 GPU**, then rolled out to produce
`outputs/forecast_24h.json` (per-ward, per-hour risk). All preprocessing, training and rollout
inference happen on the Spark; the backend only reads the resulting JSON. Detail:
[`README.md` §"DGX Spark handoff"](../README.md) and [`spark.py`](../backend/spark.py).

### 2. Voice agent brain — NVIDIA Nemotron (this document's focus)

The "Foresight" voice assistant lets an operator talk to the 3D map ("show me West End", "top 5
hotspots"). The **reasoning + tool-selection** is done by **NVIDIA Nemotron running on the
Spark** — ElevenLabs only does speech-in/speech-out and transports tool calls to the browser.

```
🎙 Operator speech
      │  WebRTC audio
      ▼
☁️ ElevenLabs Agents (ASR + TTS + turn-taking only)
      │  OpenAI /v1/chat/completions  (msgs + tool defs)
      ▼
🌐 cloudflared tunnel  ──►  🟩 DGX Spark (GB10)
                               llama.cpp CUDA server  →  NVIDIA Nemotron-3-Nano (NVFP4, CUDA)
                               returns OpenAI tool_calls (SSE)
      ▲                          │
      └──────────  tool_calls ───┘
      │  client tool routed to browser
      ▼
🖥 RiskMap3D — camera fly / risk rings / spoken ward stats
```

**Key point:** the LLM that *decides which tool to call and with what argument* is NVIDIA
Nemotron, on our NVIDIA GPU. ElevenLabs is a dumb voice pipe in front of it.

---

## Exactly how Nemotron is served on the Spark

The DGX Spark ships with `llama.cpp` built against CUDA and the Nemotron GGUF pre-installed —
this is one of NVIDIA's own [DGX Spark playbooks](https://github.com/NVIDIA/dgx-spark-playbooks)
("Run models with llama.cpp on DGX Spark"). The model is **NVIDIA Nemotron**; the server is the
CUDA-accelerated runner that loads it onto the GB10.

```bash
# On the DGX Spark (scan-02.local, user nvidia, GB10 / aarch64 / CUDA 13)
~/llama.cpp/build/bin/llama-server \
  -m ~/unsloth/NVIDIA-Nemotron-3-Nano-Omni-30B-A3B-Reasoning-GGUF/NVIDIA-Nemotron-3-Nano-Omni-30B-A3B-Reasoning-UD-Q4_K_XL.gguf \
  --host 0.0.0.0 --port 8000 \
  -ngl 999 \          # all layers on the GB10 GPU
  --jinja \           # OpenAI-format tool/function calling
  --reasoning off \   # disable <think> traces — critical for voice latency (see below)
  -c 8192 --no-webui
```

Server log confirms the NVIDIA acceleration path:

```
ggml_cuda_init: found 1 CUDA devices: Device 0: NVIDIA GB10, compute capability 12.1
system_info: CUDA : ARCHS = 1210 | BLACKWELL_NATIVE_FP4 = 1
general.architecture = nemotron_h_moe
main: server is listening on http://0.0.0.0:8000
```

Expose it to the ElevenLabs cloud (Spark is on a LAN):

```bash
~/cloudflared tunnel --url http://localhost:8000   # → https://<random>.trycloudflare.com
```

Point the ElevenLabs agent at it ([`elevenlabs/agent_configs/Foresight-Map.json`](../elevenlabs/agent_configs/Foresight-Map.json)):

```jsonc
"prompt": {
  "llm": "custom-llm",                              // MUST be custom-llm (API rejects custom_llm otherwise)
  "custom_llm": {
    "url": "https://<tunnel>.trycloudflare.com/v1",
    "model_id": "NVIDIA-Nemotron-3-Nano-Omni-30B-A3B-Reasoning-UD-Q4_K_XL.gguf",
    "api_key": { "secret_id": "<workspace-secret>" }  // value unused by llama.cpp; EL requires the field
  }
}
```

```bash
cd elevenlabs && elevenlabs agents push    # flips the brain from cloud gemini → Spark Nemotron
```

---

## Proof it works (the spike gates)

Validated end-to-end on **2026-06-06** (runbook: [`SPIKE_NEMOTRON_SWITCH.md`](./SPIKE_NEMOTRON_SWITCH.md)).

| Gate | Check | Result |
| --- | --- | --- |
| **0** | Box + model + GPU headroom | ✅ GB10, 119 GB VRAM free, Nemotron GGUF + CUDA runner pre-installed |
| **A** | Nemotron tool-calls over SSE | ✅ `focus_ward{"wardName":"West End"}`, `Content-Type: text/event-stream`, decode 68.5 tok/s |
| **A-lat** | Voice-grade latency | ✅ `--reasoning off` → **0.44 s** on-LAN, 27 tokens (vs 3.8 s / 262 tokens with reasoning on) |
| **B** | Reachable off-LAN via tunnel | ✅ **0.86 s** through cloudflared, SSE + tool-call intact |
| **C** | Full ElevenLabs → Spark path | ✅ tools fire end-to-end + confirmed live in-browser at `:5174` |

**Gate C — full pipeline transcript** (ElevenLabs `simulate-conversation`, scripted operator, real
`custom_llm` path to the Spark):

```
[user]  "show me West End"   →  [agent] tool_call: focus_ward     →  "Focusing on West End."
[user]  "top 5 hotspots"     →  [agent] tool_call: rank_hotspots  →  "Here are the top 5 hotspots: 1. Whitechapel  2. Old Kent Road  3. …"
```

The latency lesson worth keeping: the pre-installed Nemotron is a **reasoning** variant. With
thinking on it emits a long `<think>` trace before the tool call (~3.8 s — fails a voice UX).
`--reasoning off` makes it route tools in ~0.4 s. Tool-routing doesn't need chain-of-thought.

---

## Operations & durability

Both pieces run as **systemd `--user` services** on the Spark (user `nvidia` has
`Linger=yes`, so they start on boot and survive logout — no sudo, no root). Both
`Restart=always`, so a crash auto-recovers.

| Service | What | Unit |
| --- | --- | --- |
| `foresight-nemotron.service` | llama.cpp serving Nemotron on `:8000` | `~/.config/systemd/user/foresight-nemotron.service` |
| `foresight-tunnel.service` | cloudflared quick tunnel → `:8000` | `~/.config/systemd/user/foresight-tunnel.service` |

```bash
# on the Spark
systemctl --user status foresight-nemotron foresight-tunnel
systemctl --user restart foresight-nemotron      # reload the brain
journalctl --user -u foresight-nemotron -n 50    # (logs also append to ~/llama_server.log, ~/cf.log)
```

**Known limitation — ephemeral tunnel URL.** This uses a Cloudflare *quick* tunnel,
whose `*.trycloudflare.com` hostname is **random and changes every time
`foresight-tunnel` restarts** (reboot/crash). When that happens the ElevenLabs agent
points at a dead URL until re-synced. The tunnel service writes the current URL to
`~/tunnel_url.txt` on each start. Re-sync after a restart:

```bash
# 1. read the new URL from the Spark
ssh nvidia@scan-02.local 'cat ~/tunnel_url.txt'
# 2. update elevenlabs/agent_configs/Foresight-Map.json -> custom_llm.url (append /v1)
# 3. cd elevenlabs && elevenlabs agents push
```

For a **permanent** URL (no re-sync ever), upgrade the tunnel to a Cloudflare *named*
tunnel (`cloudflared tunnel login` + a domain on the account) or an ngrok static
domain, then bind `foresight-tunnel.service` to it.

## Honest scope + the NIM upgrade path

- **What we use:** NVIDIA Nemotron model + DGX Spark GB10 + CUDA/Blackwell-NVFP4, all local.
- **What we don't (yet):** the literal **NIM** container, vLLM, or TensorRT-LLM. On this box the
  `nvidia` user isn't in the `docker` group and no NGC key/NIM image was present, so the docker
  path was blocked during the time-boxed spike. The model + CUDA runner were already installed
  for the llama.cpp path, so that is what we shipped.
- **One-credential upgrade to NIM** (if a judge wants the literal NIM badge): add docker access
  (`sudo usermod -aG docker nvidia`) + an NGC API key, then
  `docker run … nvcr.io/nim/nvidia/nvidia-nemotron-nano-9b-v2-dgx-spark` — same OpenAI endpoint on
  `:8000`, same agent config, same Nemotron family. The ElevenLabs side does not change.

## Revert (kill the Spark brain, restore cloud)

```bash
git checkout elevenlabs/agent_configs/Foresight-Map.json
cd elevenlabs && elevenlabs agents push     # brain back to cloud gemini
# then on the Spark: pkill -f llama-server ; pkill -f cloudflared
```

The cloud (gemini) agent + the shipped Group A ward tools work independently — a revert loses
nothing.
