# Person B — Backend + Web Frontend Lead

**Mission:** make the system visible, interactive, and impressive. You own the FastAPI backend and the Three.js dashboard. You are the integration hub — **your first job is to unblock everyone** by shipping fake forecast data at Hour 2 so Person A (model) and Person C (Android) can build in parallel.

> See the root [`README.md`](../README.md) for shared data contracts, the system diagrams, and the full execution timeline.

---

## What you own

- FastAPI backend + all HTTP routes.
- Forecast API, scenario API, mobile-state API (the route, even though C drives the client).
- React + Three.js frontend: 3D ward risk surface, timeline scrubber, scenario panel.
- Connection from frontend to model outputs.
- The one-command local launch script.

## What you do NOT own

- Training the model (Person A). Android implementation (Person C).

---

## Deliverables

```text
backend/main.py
backend/schemas.py            (Pydantic mirrors of the shared contracts)
backend/routes/forecast.py
backend/routes/scenario.py
backend/routes/mobile.py
backend/routes/ask.py
frontend/src/App.tsx
frontend/src/api.ts
frontend/src/components/RiskMap3D.tsx
frontend/src/components/TimelineScrubber.tsx
frontend/src/components/ScenarioPanel.tsx
run_all.sh                    (or docker-compose.yml)
outputs/forecast_24h.json     <-- you create the FAKE version first
```

**Your one hard promise:** `run_all.sh` boots backend + frontend with one command, and the dashboard renders a risk surface — first on fake data, later on A's real data, with **no code change needed** when the data swaps (same schema).

---

## CRITICAL FIRST TASK (Hour 0–2)

Before anything else, write `outputs/forecast_24h.json` with **fake but schema-valid** data covering the demo district (Lewisham), all 24 hours, a few wards, all incident types. This single file unblocks both A's downstream consumers and your own frontend. Hand the schema to A and C and freeze it.

---

## API contract

Pydantic schemas in `backend/schemas.py` must mirror the README `ForecastPoint` / `Recommendation` / `Scenario` types exactly.

### 1. Health
```http
GET /health
```
```json
{ "status": "ok", "model_loaded": true, "forecast_available": true, "device": "DGX Spark local" }
```

### 2. Forecast
```http
GET /api/forecast?district=Lewisham&incident_type=all
```
```json
{
  "district": "Lewisham",
  "generated_at": "2026-06-05T18:00:00Z",
  "horizon_hours": 24,
  "wards": [
    {
      "ward_id": "E05009317",
      "ward_name": "Lewisham Central",
      "geometry_id": "E05009317",
      "lat": 51.462, "lon": -0.010,
      "hourly": [
        { "hour": 0, "risk_score": 0.42, "expected_count": 0.31, "dominant_type": "false_alarm" },
        { "hour": 1, "risk_score": 0.57, "expected_count": 0.48, "dominant_type": "dwelling_fire" }
      ]
    }
  ]
}
```

### 3. Scenario
```http
POST /api/scenario
```
Request:
```json
{
  "district": "Lewisham",
  "time": "2026-11-05T19:00:00",
  "weather": { "rain": "none", "wind": "high", "temperature": 7 },
  "events": ["bonfire_night"],
  "pump_availability": { "Lewisham": 1, "Deptford": 2, "New Cross": 0 },
  "ongoing_incidents": [ { "ward": "Lewisham Central", "type": "outdoor_fire", "pumps_committed": 2 } ]
}
```
Response:
```json
{
  "scenario_id": "scenario_001",
  "summary": "Elevated outdoor fire and secondary fire risk around Lewisham Central and Brockley over the next 3 hours.",
  "recommendations": [
    {
      "action": "pre_position", "resource": "standby_pump",
      "from_station": "Deptford", "to_ward": "Lewisham Central",
      "reason": "High expected outdoor fire risk and reduced Lewisham pump availability.",
      "priority": 1
    }
  ],
  "forecast_delta": [
    { "ward_id": "E05009317", "baseline_risk": 0.44, "scenario_risk": 0.72, "delta": 0.28 }
  ]
}
```

**Scenario logic can be simple and rule-based** — you do not need A's model for this. Apply multiplicative boosts to the baseline forecast (event boost, weather boost, reduce coverage where pumps committed), recompute deltas, pick top wards, emit a pre-position recommendation toward the highest-delta ward from the nearest station with spare pumps.

### 4. Natural language (shared with C)
```http
POST /api/ask
```
Request: `{ "query": "Two pumps committed in Lewisham and it's Bonfire Night, where should I pre-position the standby?" }`
Response:
```json
{
  "answer": "Pre-position one standby pump near Lewisham Central or Brockley. The model predicts elevated outdoor fire risk over the next 3 hours, while local pump availability is reduced.",
  "recommended_actions": [ { "type": "pre_position", "target": "Lewisham Central", "confidence": 0.78 } ],
  "supporting_forecast_ids": ["E05009317", "E05009322"]
}
```
MVP: structured rule-based parser over the scenario logic. Stretch: route to local NIM/Nemotron (coordinate with A/C).

### 5 & 6. Mobile routes
`GET /api/mobile/state?station=` and `POST /api/mobile/accept` — you build the routes, Person C drives them. Full request/response in [`PERSON_C_android_voice.md`](PERSON_C_android_voice.md).

---

## Web frontend

### Must-have
- London ward map in **Three.js**: each ward polygon is a raised surface — `height = risk_score * max_height`, colour from low→high risk, tooltip on hover.
- **Timeline scrubber:** hour 0 → 23, animates the surface.
- **Incident type filter:** all / dwelling_fire / outdoor_fire / false_alarm / road_traffic_collision.
- **Scenario panel:** select district, change weather, set pump availability, add ongoing incident, submit → calls `/api/scenario`.
- **Recommendation card:** "Move standby pump from X to Y", "High-risk wards in next 3h", "Reason".

### Three.js metaphor
```text
height    = risk_score * max_height
colour    = low risk → high risk gradient
animation = hour index (driven by scrubber)
```
Even with simplified geometry, a clearly dynamic city risk surface scores well.

### Stretch
- Animated 24h risk wave.
- Before/after scenario comparison (split or toggle).
- Natural-language chat box hitting `/api/ask`.

### Phase 4 — Spark status panel
Add a visible panel for the NVIDIA judging criterion:
```text
Running locally on DGX Spark
Model:         local forecast model
Preprocessing: RAPIDS/cuDF
Inference:     CUDA/PyTorch
Cloud calls:   none
```

---

## Build order

| Phase | Hours | Your tasks |
|---|---|---|
| 1 | 0–2 | Write fake `forecast_24h.json`; scaffold FastAPI + Vite/React; freeze schema with A & C. |
| 2 | 2–8 | `/health` works → `/api/forecast` returns fake data → 3D surface renders → scrubber works → scenario panel posts. |
| 3 | 8–14 | Point `/api/forecast` at A's real JSON; add scenario delta display (baseline vs scenario). |
| 4 | 14–18 | Spark status panel; wire `/api/ask`; polish visuals. |
| 5–6 | 18–24 | Demo path, one-command startup, pre-generated forecast fallback, no crashes. |

---

## Coordination checklist

- [ ] Hour 2: fake `forecast_24h.json` published, schema frozen with A & C.
- [ ] Mobile routes stubbed early so C is never blocked.
- [ ] When A delivers real JSON, confirm `incident_type` + `ward_id` values match your filters.
- [ ] `run_all.sh` is the single demo entrypoint; test it works with no internet.
