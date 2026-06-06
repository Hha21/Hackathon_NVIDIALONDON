# Person A — Model / Data Lead

**Mission:** turn raw London Fire Brigade data into a 24-hour ward-level risk forecast, exported as `forecast_24h.json` against the agreed schema. You are the only person who touches the model. Nobody is allowed to block on you, and you are not allowed to block anyone — Person B ships fake forecast data at Hour 2, and you swap in the real thing later.

> See the root [`README.md`](../README.md) for shared data contracts, the GPT-2-on-Spark feasibility analysis, and the full execution timeline.

---

## What you own

- Data ingestion, cleaning, feature engineering.
- Ward / station / time aggregation.
- Weather + calendar context joining.
- Both models (baseline + GPT-2 transformer).
- Forecast generation and the model card.
- The NVIDIA/Spark technical note.

## What you do NOT own

- Web visualisation, Android UI, voice frontend (those are B and C).

---

## Deliverables

```text
data/processed/incidents.parquet
data/processed/station_hour_sequences.parquet
models/fire_risk_model.pt   (or .pkl for the baseline)
outputs/forecast_24h.json    <-- the contract artifact everyone consumes
outputs/forecast_24h.parquet
model/train_baseline.py
model/model.py               (GPT-2 config + training)
model/generate_forecast.py   (runnable from CLI, writes forecast_24h.json)
model/eval.py
model/model_card.md
```

**Your one hard promise:** `forecast_24h.json` exists, matches the schema below, and `generate_forecast.py` runs from the command line for the demo district.

---

## The contract artifact

Every `forecast_24h.json` entry must be a `ForecastPoint` (see README). Minimum shape:

```json
{
  "generated_at": "2026-06-05T18:00:00Z",
  "horizon_hours": 24,
  "predictions": [
    {
      "ward_id": "E05009317",
      "ward_name": "Lewisham Central",
      "hour": 1,
      "incident_type": "dwelling_fire",
      "risk_score": 0.73,
      "expected_count": 1.24,
      "lat": 51.462,
      "lon": -0.010
    }
  ]
}
```

`risk_score` is normalised 0–1. `expected_count` is the raw predicted count. Both are needed: the dashboard colours/elevates on `risk_score`, the recommendation logic reasons on `expected_count`.

---

## Build order (do these strictly in sequence)

### Phase 1 — Data cleaning (~1.5 hr)

Already specced in the README §"Phase 1: Data Cleaning". Follow it exactly — the 11 steps with their `assert` checks. Output: `lfb_train_clean.parquet` (pre-2025) and `lfb_test_clean.parquet` (2025+). **Do not skip the validation checklist** — silent errors here corrupt everything downstream.

### Level 1 — Baseline risk model (build FIRST, this is the demo fallback)

Tabular, fast, reliable. One row per (ward, hour, incident_type).

**Features:**
```text
ward_id, station_id, hour_of_day, day_of_week, month,
is_weekend, is_holiday_or_event, incident_type,
recent_1h_count, recent_3h_count, recent_24h_count,
weather_temperature, weather_rain, weather_wind, weather_condition
```

**Target:** `incident_count_next_hour`.

**Model options (pick by what's installed):**
- LightGBM / XGBoost — fastest to a good number.
- RAPIDS cuML RandomForest / XGBoost — the NVIDIA-scoring choice.
- PyTorch MLP — if you want everything in torch.
- Poisson / negative-binomial count model — most statistically honest for counts.

**Even-simpler fallback** if modelling stalls (Phase 3 acceptable minimum):
```text
risk = historical_ward_hour_incident_rate
     + recent_activity_boost
     + weather_boost
     + event_boost
```
…then normalise to 0–1. An end-to-end pipeline with this beats a fancy model that doesn't emit JSON.

### Level 2 — GPT-2 token-sequence model (build SECOND, the headline)

Only start once Level 1 emits valid JSON.

**Tokenisation (Phase 2).** Five token families plus context prefixes. Each incident → ~10–15 tokens; full corpus ≈ 35M tokens.

```text
<WEATHER_RAIN_HEAVY> <TEMP_COLD> <DOW_FRI> <HOUR_18>     # context prefix
<STATION_LEWISHAM> <WARD_E05009317> <TYPE_DWELLING_FIRE> <DT_30MIN>
<STATION_LEWISHAM> <WARD_E05009321> <TYPE_FALSE_ALARM> <DT_2H>
...
```

Token families: `GAP` (time delta buckets `<DT_30MIN>` …), `GROUP`, `STOP`, `PROP`, `WARD`, plus weather/calendar prefixes and the regime flags (`post_station_remap`, `post_grenfell`) as static prefix tokens.

**Windowing (Phase 3).** Sequence key is `IncidentStationGround` (the "patient ID", 102 stations). Build per-station streams sorted by datetime, window to seq len 128–512, batch by station.

**Model config (Phase 4).** Two tiers — both fit the time budget (see README feasibility table):

| Tier | Layers | Hidden | Seq len | Time/epoch on Spark | Use when |
|---|---|---|---|---|---|
| Small (default) | 4–6 | 256–512 | 128–512 | ~1–3 min | system not yet green |
| GPT-2 small | 12 | 768 | 1024 | ~5–9 min | end-to-end demo already works |

Train with `nanoGPT`-style loop or HF `transformers` `GPT2LMHeadModel` with a custom tokenizer. **35M tokens is small for 124M params** — you are data-limited, so train 15–20 epochs and watch validation loss for overfit. Full GPT-2 training ≈ 1.5–3 hr; the small tier ≈ 30–60 min total. Kick training off early and let it run in the background while you build inference.

**Objective:** next-token prediction (causal LM).

### Phase 5 — Inference & risk surface (~1 hr)

Sample many forward rollouts per station from a "now" context (current time/weather/calendar prefix). Aggregate sampled incidents into ward × hour × type counts → normalise to `risk_score` → write `forecast_24h.json`. If the transformer rollout is shaky, **fall back to the baseline forecast** — the JSON contract is identical, so B and C never notice.

### Phase 6 — Evaluation (~30 min)

Produce `model_card.md`:

```text
Temporal split:  Train 2009–2022 | Val 2023 | Test/demo 2024–2025
Metrics:
- MAE for hourly incident count
- Top-k ward recall
- Calibration by risk decile
- Per-incident-type error
```

**The metric judges actually understand:**
```text
Top 10 high-risk wards contain X% of next-hour incidents.
```
Lead the model card with that, not loss.

---

## Phase 4 (Hours 14–18) — NVIDIA / Spark depth

Add at least one NVIDIA-strong component, in order of safety:

```python
# Option A (safest): RAPIDS/cuDF for preprocessing
import cudf
df = cudf.read_csv("lfb_incidents.csv")
```

- **Option B:** train/infer the PyTorch model on CUDA (you're already doing this).
- **Option C:** wire a local NIM/Nemotron model behind `/api/ask` (coordinate with B/C).

Write a short **Spark note** for the pitch:
> The open LFB dataset trains the model, but the high-value use case is conditioning forecasts on live pump availability and active incidents — data that must not leave the operational environment. DGX Spark runs preprocessing, inference, and the assistant locally, using 128GB unified memory to keep the forecast model, geospatial data, and agent context resident on one machine.

---

## Coordination checklist

- [ ] Hour 2: confirm `forecast_24h.json` schema with B and C. **Do not change it after Hour 2.**
- [ ] Give B a real `forecast_24h.json` the moment Level 1 works (Phase 3).
- [ ] Keep the baseline as a live fallback even after the transformer works.
- [ ] Hand B/C the list of valid `incident_type` values and `ward_id`s so filters match.
- [ ] Deliver `model_card.md` + Spark note before Hour 21.
