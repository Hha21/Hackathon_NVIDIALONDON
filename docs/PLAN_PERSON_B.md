# Person B — Implementation Plan (Backend + Web)

Derived from `docs/PERSON_B_backend_web.md`, `docs/PERSON_C_android_voice.md`, and root `README.md`.
Role: FastAPI backend + React/Three.js dashboard. **Integration hub — unblock A and C first.**

Guiding rule: **schema-first, fake-data-first**. Backend serves the same JSON whether data is fake or A's real model. No frontend/Android code changes when data swaps.

---

## Step 0 — Repo scaffold + folder contract (Hour 0, ~20 min)

Create the directory skeleton from the README repo structure so all three people commit without collisions.

```
backend/
  main.py
  schemas.py
  scenario_logic.py        # rule engine, kept out of routes for testability
  fake_forecast.py         # generates outputs/forecast_24h.json
  geo.py                   # ward list + lat/lon + nearest-station table
  routes/
    forecast.py
    scenario.py
    mobile.py
    ask.py
  requirements.txt
frontend/                  # Vite + React + TS scaffold
outputs/
  forecast_24h.json        # fake first, real later
run_all.sh
```

Decisions to lock now:
- Python 3.10+, FastAPI + Uvicorn + Pydantic v2, no DB for MVP (read JSON from `outputs/`).
- Frontend: Vite + React + TypeScript, `three` + `@react-three/fiber` + `@react-three/drei`.
- Demo district = **Lewisham**. Demo scenario = **Bonfire Night + pump shortage + high wind**.
- CORS open to `localhost:5173` (Vite default).

Deliverable: empty files committed, `requirements.txt` + `frontend/package.json` present.

---

## Step 1 — CRITICAL: fake `forecast_24h.json` + freeze schema (Hour 0–2)

**This is the one task that unblocks A and C. Do it before backend or frontend logic.**

### 1a. Ward + geo table (`backend/geo.py`)
Hardcode ~6–8 Lewisham wards with `ward_id` (ONS code), `ward_name`, `lat`, `lon`. Also a small station table (Lewisham, Deptford, New Cross, Brockley) with lat/lon + a `nearest_stations` adjacency used by scenario logic.

Example wards (verify codes against A's `ward_canonical` later — see Step 6):
```
E05009317 Lewisham Central   51.462 -0.010
E05009322 Brockley           51.464 -0.036
E05009320 Blackheath         51.466  0.009
... (Deptford, New Cross, Forest Hill, Sydenham, Telegraph Hill)
```

### 1b. Generator (`backend/fake_forecast.py`)
Produce schema-valid data: for each ward × 24 hours, emit `risk_score` (0–1), `expected_count`, `dominant_type`. Use a believable shape:
- diurnal curve (low 03:00, peaks ~18:00–21:00),
- per-ward base multiplier,
- random dominant_type weighted by hour (false_alarm daytime, dwelling_fire evening),
- deterministic seed so demo is reproducible.

Write to `outputs/forecast_24h.json` matching the **Forecast response** shape in the brief (nested `wards[].hourly[]`).

### 1c. Freeze the contract
Mirror README TS types in `backend/schemas.py` (Pydantic). Publish the JSON + schema to A and C. **Locked at Hour 2 — no changes without all three agreeing.**

Coordination output: message A ("emit exactly this `forecast_24h.json` shape; these `ward_id` + `incident_type` values") and C ("mobile routes return exactly these shapes").

Checklist:
- [ ] `outputs/forecast_24h.json` exists, validates against `schemas.py`.
- [ ] Covers Lewisham, 24 hours, all wards, all incident types appear.
- [ ] Schema handed to A & C, frozen.

---

## Step 2 — FastAPI skeleton + `/health` + `/api/forecast` (Hour 2–4)

### 2a. `backend/schemas.py`
Pydantic v2 models mirroring README contracts exactly:
- `ForecastHourly` (`hour, risk_score, expected_count, dominant_type`)
- `WardForecast` (`ward_id, ward_name, geometry_id, lat, lon, hourly[]`)
- `ForecastResponse` (`district, generated_at, horizon_hours, wards[]`)
- `Scenario` (request), `Recommendation`, `ScenarioResponse`, `ForecastDelta`
- `MobileState`, `AcceptRequest`, `AcceptResponse`
- `AskRequest`, `AskResponse`
- `Health`

### 2b. `backend/main.py`
- Create app, add CORS middleware.
- Mount routers from `routes/`.
- A loader function `load_forecast()` that reads `outputs/forecast_24h.json` once, caches in memory, with mtime check so swapping the file (A's real data) is picked up without restart.

### 2c. Routes
- `GET /health` → `{status, model_loaded, forecast_available, device:"DGX Spark local"}`. `forecast_available` = file exists + parses.
- `GET /api/forecast?district=Lewisham&incident_type=all` → load JSON, filter by district; if `incident_type != all`, filter each ward's hourly to that dominant_type (or recompute risk for that type — MVP: filter on dominant_type, keep others at 0). Return `ForecastResponse`.

Deliverable: `uvicorn backend.main:app --reload`, `curl /health` and `/api/forecast` return valid JSON.

---

## Step 3 — Mobile route stubs (Hour 2–4, do alongside Step 2 so C is never blocked)

`backend/routes/mobile.py`:
- `GET /api/mobile/state?station=Lewisham` → derive from forecast: pick top-risk ward in next 3h as a recommendation, fabricate `ongoing_incidents`, `available_pumps`. Return the exact shape in Person C's doc.
- `POST /api/mobile/accept` → echo `{status:"accepted", routing_uri:"geo:<lat>,<lon>?q=<lat>,<lon>(<label> standby position)"}`. Build `routing_uri` from the recommendation's lat/lon (use geo table).

Hard promise to C: these return fake-but-valid data **today** so the Android app builds against them immediately.

Checklist:
- [ ] `/api/mobile/state` + `/api/mobile/accept` return locked shapes.
- [ ] `routing_uri` is a valid `geo:` URI.

---

## Step 4 — Frontend scaffold + API client + 3D surface (Hour 2–8)

### 4a. Scaffold + `api.ts`
Vite React TS app. `frontend/src/api.ts` typed against the shared contracts: `getForecast`, `postScenario`, `postAsk`. Base URL from env (`VITE_API_URL`, default `http://localhost:8000`).

### 4b. `RiskMap3D.tsx` (the headline visual)
Three.js via react-three-fiber. Each ward = a raised box/extruded polygon:
- `height = risk_score(hour) * MAX_HEIGHT`
- `color` = low→high gradient (e.g. blue→yellow→red via lerp).
- Tooltip on hover: ward name, risk, expected_count, dominant_type.
- Layout: place wards by `(lat, lon)` projected to a local XZ plane (simple linear projection around Lewisham centroid is fine — no MapLibre needed for MVP).
- Reads current `hour` from app state (driven by scrubber).

### 4c. `App.tsx`
Fetch forecast on load, hold `hour` + `incidentType` + `scenarioResult` state, compose RiskMap3D + TimelineScrubber + ScenarioPanel + recommendation card.

Deliverable: dashboard renders a dynamic 3D risk surface from fake data.

---

## Step 5 — Timeline scrubber + incident filter + scenario panel (Hour 4–8)

### 5a. `TimelineScrubber.tsx`
Slider hour 0→23 + play/pause that animates the surface (interval steps hour, loops). Updates app `hour` → RiskMap3D re-heights.

### 5b. Incident type filter
Dropdown: all / dwelling_fire / outdoor_fire / false_alarm / road_traffic_collision. Re-calls `/api/forecast?incident_type=` or filters client-side.

### 5c. `ScenarioPanel.tsx` + scenario logic
- UI: district select, weather (rain/wind/temperature), events (Bonfire Night toggle), pump availability per station, add ongoing incident → submit → `POST /api/scenario`.
- Backend `backend/scenario_logic.py` (rule-based, **no model needed**):
  1. Start from baseline forecast.
  2. Apply multiplicative boosts: event boost (bonfire_night → outdoor_fire/secondary ×N), weather boost (high wind, dry → outdoor fire up), time-of-day.
  3. Reduce effective coverage where pumps committed / low availability.
  4. Recompute per-ward `scenario_risk`, compute `delta = scenario_risk − baseline_risk`.
  5. Pick top-delta wards. Emit `pre_position` recommendation: standby pump from nearest station **with spare pumps** → highest-delta ward, with reason string + priority.
- `routes/scenario.py` returns `{scenario_id, summary, recommendations[], forecast_delta[]}`.
- Recommendation card in UI: "Move standby pump from X to Y", high-risk wards next 3h, reason.

Deliverable: scenario submit changes the surface + shows a recommendation. **End of Phase 2 MVP.**

---

## Step 6 — Integration with A's real forecast (Hour 8–14)

- A drops a real `outputs/forecast_24h.json` (same schema). Loader (Step 2b) picks it up — **zero code change** if schema held.
- Verify: `incident_type` values and `ward_id` values match the frontend filter list and the geo table. If A's ward codes differ, update `geo.py` lat/lon mapping (the one place that needs ward→coords). Log mismatches.
- Add scenario **delta display**: before/after on the surface (toggle baseline vs scenario, or color the delta).

Checklist:
- [ ] Real JSON renders identically to fake (no UI change).
- [ ] `incident_type` + `ward_id` reconciled with A.
- [ ] Scenario delta visible.

---

## Step 7 — `/api/ask` + Spark status panel + polish (Hour 14–18)

### 7a. `routes/ask.py`
MVP: rule-based parser over scenario logic. Extract entities from query (station names, "bonfire", "wind", "pumps committed", "pre-position") → run scenario logic → format `answer` + `recommended_actions[]` + `supporting_forecast_ids[]`. Return the doc's `AskResponse` shape. Shared with C's voice flow.
Stretch: route to local NIM/Nemotron (coordinate with A/C) — keep behind a flag, rule-based stays the fallback.

### 7b. Spark status panel (frontend)
Static panel for the NVIDIA judging criterion:
```
Running locally on DGX Spark
Model:         local forecast model
Preprocessing: RAPIDS/cuDF
Inference:     CUDA/PyTorch
Cloud calls:   none
```
Pull live bits from `/health` where possible (`device`, `model_loaded`).

### 7c. Stretch visuals
Animated 24h risk wave; before/after scenario split/toggle; NL chat box → `/api/ask`.

---

## Step 8 — `run_all.sh` + demo stability (Hour 18–24)

### 8a. `run_all.sh` (the one hard promise)
One command boots backend + frontend:
- start `uvicorn backend.main:app --host 0.0.0.0 --port 8000` in background,
- `cd frontend && npm run dev`,
- trap to kill backend on exit.
- Must work **with no internet** (no CDN deps at runtime; bundle Three.js via npm, no external tile server).

### 8b. Fallbacks
- Pre-generated `outputs/forecast_24h.json` committed so the dashboard always renders even if A's pipeline isn't running.
- `outputs/scenario_demo.json` for a canned scenario.
- Frontend: if `/api/forecast` fails, load a bundled fallback JSON.

### 8c. Demo path
Walk the scripted run (open dashboard → scrub → filter → submit Bonfire Night scenario → show recommendation → C's Android accepts → Maps intent). Capture screenshots + backup video.

Final checklist (from README MVP list, B-owned rows):
- [ ] Backend serves forecast
- [ ] Dashboard renders risk surface
- [ ] Timeline scrubber works
- [ ] Scenario panel changes forecast/recommendation
- [ ] Spark/local-inference panel visible
- [ ] `run_all.sh` works offline
- [ ] Backup forecast JSON + screenshots exist

---

## Critical path summary

```
Step 1 (fake JSON + freeze schema)  ──► unblocks A & C
   │
   ├─► Step 2 (FastAPI + forecast)  ─┐
   ├─► Step 3 (mobile stubs)         ├─► Step 4–5 (frontend + scenario) = Phase 2 MVP
   │                                 │
Step 6 (real data swap, no code change)
   │
Step 7 (/api/ask + Spark panel)
   │
Step 8 (run_all.sh + fallbacks + demo)
```

**Never-block rule:** Steps 1 and 3 are the unblock-others tasks — ship them first and fast, even rough.
