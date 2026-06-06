# Spike — flip the voice agent brain to Nemotron on DGX Spark

> Time-boxed (~60–90 min), abort-friendly spike with hard go/no-go gates.
> Question: does the Spark brain work end-to-end? If yes → continue agent dev on
> Spark. If no → revert, keep the cloud (gemini) agent + already-shipped tools.
>
> Context docs: [`PLAN_VOICE_AGENT.md`](./PLAN_VOICE_AGENT.md) §"Phase 2" (the
> config shape) and [`AGENT_EXPANSION_PLAN.md`](./AGENT_EXPANSION_PLAN.md) (the
> tools that ride along on either brain).

---

## What's already done (don't redo)

- **Phase 2b ("give the agent ward knowledge") is already shipped.** Group A
  added `get_ward_info`, `compare_wards`, `rank_hotspots`, `ward_trend` as
  **client** tools (commits `bf89b6a`, `e195632` on `main`). Tool definitions are
  sent to the brain in every request, so they work on the gemini brain today and
  will work on Nemotron unchanged. **No new code needed for this spike.**
- The spike validates only three things: Nemotron **serves**, it **tool-calls
  correctly**, and **latency** is bearable for voice.

## Definition of "works" (the bar)

- The agent **picks a tool** from a voice command (not prose), AND
- **first-audio latency is conversational** — target < ~1.5 s to first spoken token.

Anything less → no-go → revert → stay on cloud features.

## Guiding principle

**Do not touch ElevenLabs until a raw `curl` passes.** The cloud agent stays live
the entire spike; the EL flip is the last and most reversible step.

---

## Gate 0 — box + model (≈5 min, before anything)

- SSH the Spark. Confirm **which box**: memory says `scan-02.local` (GB10) runs
  the GPT-2 forecast. Nemotron vLLM wants the GPU too.
- `nvidia-smi` → is there VRAM headroom alongside the forecast job? If not:
  - stop the forecast job for the duration of the spike, **or**
  - use a second box.
- Confirm the **exact model id** is real / pullable. `nvidia/NVIDIA-Nemotron-3-Nano-NVFP4`
  in the plan is a placeholder — verify against NVIDIA's Spark deployment guide,
  along with the correct vLLM image tag for GB10 / ARM.
- **STOP (no-go) if:** no GPU headroom and no second box, or no working Nano build
  for Spark.

## Step 1 — serve + curl a tool-call (≈20 min) → GATE A

On the Spark:

```bash
docker run --rm --gpus all -p 8000:8000 \
  vllm/vllm-openai:cu130-nightly \
  --model nvidia/NVIDIA-Nemotron-3-Nano-NVFP4 \
  --enable-auto-tool-choice \
  --tool-call-parser nemotron \
  --served-model-name foresight-nemotron
# (exact model id + Spark runtime flags: follow NVIDIA's Spark deploy guide)
```

Two local curls on the Spark:

1. `GET /v1/models` → lists `foresight-nemotron`.
2. `POST /v1/chat/completions` with **one tool def** (copy the `focus_ward` shape
   from `elevenlabs/tool_configs/focus_ward.json`), `stream: true`, and a user
   message "show me West End".

```bash
curl -N http://localhost:8000/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "model": "foresight-nemotron",
    "stream": true,
    "messages": [
      {"role":"system","content":"You control a map. Call a tool, do not reply in prose."},
      {"role":"user","content":"show me West End"}
    ],
    "tools": [{
      "type":"function",
      "function":{
        "name":"focus_ward",
        "description":"Zoom the map to a named London ward.",
        "parameters":{
          "type":"object",
          "properties":{"wardName":{"type":"string"}},
          "required":["wardName"]
        }
      }
    }]
  }'
```

**GATE A passes if:** the stream contains a `tool_calls` entry for
`focus_ward` with `wardName:"West End"`, AND it streams as SSE
(`Content-Type: text/event-stream`).

This is the make-or-break — tool-call **format drift** is the #1 risk. If it
returns prose instead of a tool call: try one or two `--tool-call-parser` /
chat-template variants, then **STOP (no-go)**.

## Step 2 — tunnel (≈10 min) → GATE B

```bash
cloudflared tunnel --url http://localhost:8000
# → https://<random>.trycloudflare.com
```

Re-run the Step-1 curl from your **laptop** (off-LAN) against
`https://<random>.trycloudflare.com/v1/chat/completions`.

**GATE B passes if:** same `tool_calls` result + SSE intact over the tunnel.
Note the added latency.

## Step 3 — flip EL, voice test (≈15 min) → GATE C

Current `elevenlabs/agent_configs/Foresight-Map.json` has `"custom_llm": null`.
git tracks it, so revert is trivial (see below). Add the block:

```jsonc
"prompt": {
  "llm": "gemini-2.5-flash",          // ignored once custom_llm is set
  "custom_llm": {
    "url": "https://<random>.trycloudflare.com/v1",
    "model_id": "foresight-nemotron",
    "api_key": { "secret_id": "<workspace-secret-with-any-value>" }
  }
}
```

```bash
cd elevenlabs && elevenlabs agents push     # flip the brain to Spark
```

Reload http://localhost:5174 (NOT 5173 — Docker), connect, and say:

- "show me West End"            (focus_ward — camera moves)
- "top 5 hotspots"             (rank_hotspots — rings appear)
- "compare Soho and Whitechapel" (compare_wards — numbers spoken)

**GATE C passes if:** tools fire (camera / rings / spoken numbers) AND first-audio
latency feels conversational. Existing Group A client tools should just work — no
rewrite.

---

## Decision

- **All gates green** → keep `custom_llm`; continue Group B/C/E dev on the Spark
  brain. Then convert the tunnel to a **named** cloudflared tunnel — the random
  `trycloudflare.com` URL dies on restart — before relying on it. Commit the
  agent config.
- **Any gate red** → revert and stay on cloud features:

```bash
git checkout elevenlabs/agent_configs/Foresight-Map.json
cd elevenlabs && elevenlabs agents push      # brain back to gemini
# then kill the vLLM container + cloudflared on the Spark
```

The cloud (gemini) agent + Group A tools are already shipped and working — a
red spike loses nothing.

## Risks (plan §"Requirements for Phase 2" + memory)

| Risk | Caught by |
| --- | --- |
| Nemotron tool-call format drift | Gate A (before any EL change) |
| GPU contention with the GPT-2 forecast box | Gate 0 |
| Tunnel latency on voice turns | Gate C; mitigate w/ Nano + `optimize_streaming_latency` (already 3) + short prompt |
| Endpoint must stream SSE | Gate A / B (vLLM's OpenAI server does) |
| Random tunnel URL dies on restart | fix (named tunnel) only after go |
