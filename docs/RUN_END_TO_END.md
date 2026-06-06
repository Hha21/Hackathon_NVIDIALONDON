# Run End-to-End — Foresight for Fires

How to go from raw model → live 3D risk dashboard. Three stages: **(1) generate the
forecast on the DGX Spark, (2) run the backend, (3) run the frontend.**

The forecast is the single contract artifact: `outputs/forecast_24h.json`. Everything
downstream just consumes it. The backend hot-reloads it on file change — no restart needed
when you drop in a fresh one.

---

## 0. Prereqs (one-time)

- **Local (this Mac):** Python venv at repo `.venv`, Node for the frontend.
  ```bash
  source .venv/bin/activate          # pandas/pyarrow/fastapi/uvicorn
  cd frontend && npm install         # first run only
  ```
- **DGX Spark (`scan-02`):** repo at `~/Hackathon_NVIDIALONDON`, trained checkpoints in
  `models/` (`gpt2_best.pt`, `fire_risk_model.pkl`), torch 2.12 cu130, CUDA available
  (NVIDIA GB10). SSH key auth set up:
  ```bash
  ssh-copy-id nvidia@scan-02.local   # one-time; enter the box password once
  ssh nvidia@scan-02.local 'hostname && nvidia-smi -L'   # verify
  ```
  > Do **not** commit the box password. Key auth means no secret lives in the repo.

---

## 1. Generate the forecast on the Spark

Inference is GPT-2 token-rollout Monte-Carlo: ~102 stations × 50 rollouts × 150 tokens.
Rollouts are **batched per station** (one `generate()` call of shape `(n_rollouts, T)`), so
the GB10 is saturated rather than issuing thousands of batch-1 calls.

```bash
# On the Spark, regenerate the contract artifact:
ssh nvidia@scan-02.local 'cd ~/Hackathon_NVIDIALONDON && python3 -m src.infer'

# Useful flags:
#   --n-rollouts 100      more samples → smoother risk surface (slower)
#   --date 2025-11-05     forecast a specific date (e.g. Bonfire Night)
#   --hour 18             start hour 0-23
#   --temp / --rain / --wind   weather overrides

# Then pull it back to this machine:
scp nvidia@scan-02.local:~/Hackathon_NVIDIALONDON/outputs/forecast_24h.json outputs/forecast_24h.json
```

Runtime today: ~4–5 min for 5100 rollouts. The dominant cost is that `generate()` has **no
KV cache** — it reprocesses the growing sequence each token (O(T²)). Adding a KV cache is the
next big speedup (→ seconds) but is a model-code change.

**Fallback (no GPU / Spark unreachable):** the tabular baseline runs anywhere in seconds and
emits the identical schema:
```bash
python src/generate_forecast.py        # uses models/fire_risk_model.pkl
```

### What "valid" looks like
`outputs/forecast_24h.json` must carry: `generated_at`, `horizon_hours`, `model`, `device`,
`n_rollouts`, and `wards[]`, where each ward has `ward_id, ward_name, geometry_id, lat, lon,
hourly[24]` and each hour has `hour, risk_score (0–1), expected_count (≥0), dominant_type`.
`dominant_type` ∈ `{dwelling_fire, outdoor_fire, false_alarm, special_service}`. All-London
forecasts omit a top-level `district` (the backend then serves every ward). The `device` field
is stamped by `src/infer.py` (`torch.cuda.get_device_name`) and surfaced on `/health`.

---

## 2. Backend (FastAPI on :8008)

> Docker containers squat on :8000/:5173 — this stack uses **:8008 / :5174**.

```bash
source .venv/bin/activate
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8008 --reload
```

Check it:
```bash
curl -s localhost:8008/health
#   {"status":"ok","model_loaded":true,"forecast_available":true,"device":"NVIDIA GB10"}

curl -s "localhost:8008/api/forecast?district=Greater%20London&incident_type=all" | head -c 300
```

Routes: `/api/forecast` (district + incident_type filter), `/api/scenario`, `/api/mobile/*`,
`/api/ask`, `/health`. The forecast loader hot-reloads `outputs/forecast_24h.json` on mtime
change — drop a new file in and the next request serves it, no restart.

---

## 3. Frontend (Vite on :5174)

```bash
cd frontend
npm run dev          # → http://localhost:5174
```

Vite proxies `/api` + `/health` → :8008 (relative URLs, no CORS). The dashboard shows the 3D
London risk surface, an incident-type filter, the 24h timeline scrubber, the scenario panel,
and the **⚡ Spark inference** chip (reads `device`/`model_loaded` from `/health`). If the
backend is down it falls back to the bundled `src/fallback_forecast.json` so the demo never
blanks.

---

## One-shot

`./run_all.sh` starts backend (:8008) + frontend (:5174) together. Basemap and buildings are
bundled in `frontend/public`, so it runs fully offline once data is generated.

---

## Demo path

1. (Optional) regenerate on the Spark for a fresh `generated_at` and the GB10 device stamp.
2. Start backend + frontend (or `./run_all.sh`).
3. Open http://localhost:5174 → confirm the Spark chip shows `NVIDIA GB10`.
4. Filter incident types, scrub the timeline, run the Bonfire Night scenario in the panel.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Map blank, 0 wards | forecast file missing or empty `wards` | check `curl localhost:8008/api/forecast`; regenerate / re-pull |
| `/health` device `unknown` | forecast generated before `device` stamp was added | regenerate with current `src/infer.py`, or it ran on CPU |
| Chip absent | `model_loaded:false` → no forecast file | ensure `outputs/forecast_24h.json` exists |
| Port in use | Docker on :8000/:5173 | this stack is :8008/:5174 — don't switch back |
| SSH asks for password | key not installed | `ssh-copy-id nvidia@scan-02.local` |
