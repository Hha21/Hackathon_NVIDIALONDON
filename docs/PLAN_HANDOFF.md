# Person B — Handoff / Resume Plan

Self-contained state so a fresh session can continue without prior chat context.

## Environment (IMPORTANT — non-default ports)
Docker containers (`essential-apps-backend`, `essential-apps-web`) squat on **:8000 and :5173**. Our stack moved off them:
- **Backend**: FastAPI on **:8008** — `cd <repo> && source .venv/bin/activate && python -m uvicorn backend.main:app --host 0.0.0.0 --port 8008 --reload`
- **Frontend**: Vite on **:5174** — `cd frontend && npm run dev` → open http://localhost:5174
- Vite proxies `/api` + `/health` → :8008 (see `frontend/vite.config.ts`). Client uses relative URLs (no CORS).
- Python venv at repo `.venv`. Pillow + pandas + pyarrow installed for the data/map scripts.

## Done
- **Steps 0–3** (backend): scaffold, fake `outputs/forecast_24h.json`, `/health`, `/api/forecast` (district + incident_type filter), mobile stubs (`/api/mobile/state`, `/accept`). Loader hot-reloads the forecast file (zero-code swap for A's real data).
- **Steps 4–5**: full frontend + scenario engine.
  - `backend/scenario_logic.py` (rule-based) + `backend/routes/scenario.py` → `POST /api/scenario` returns summary, ranked `pre_position` recommendations, `forecast_delta`.
  - Frontend (`frontend/src/`): `App.tsx` (grid layout, incident filter, offline fallback via bundled `fallback_forecast.json`), `components/RiskMap3D.tsx`, `TimelineScrubber.tsx`, `ScenarioPanel.tsx` (preloaded Bonfire Night demo + **live weather** via Open-Meteo keyless API).
- **Map visuals** (`RiskMap3D.tsx`):
  - Real basemap: `backend/build_map_tile.py` stitches CartoDB **dark** tiles → `frontend/public/basemap.png` + `frontend/src/basemap_bounds.json`. `REGION` env: `greater_london` (zoom 12, current) or `lewisham` (zoom 14).
  - Real OSM buildings: `backend/build_buildings.py` → `frontend/public/buildings.json` (one InstancedMesh). Currently **central/SE London** (`extended` bbox), 283k footprints.
  - `backend/gap_fill_buildings.py`: densifies sparse urban cells (was for Lewisham; optional).
  - Risk **columns** placed from forecast `ward.lat/lon` (data-driven, NOT geo.py). Blue→yellow→red, glow.
  - Bloom (`@react-three/postprocessing` v2.16.3 — pinned for r3f8), procedural lit-window facade texture, offline `Environment` (Lightformers) + dark night scene, pedestal slab, idle auto-rotate (pauses on drag, resumes 2.5s), billboarded labels (top-12 risk + hovered only), zoom bounds, **fixed metres→units scale** (`UNITS_PER_M`) so Lewisham stays readable while GL is a big plane.

## KEY DATA FACTS
- A's training data (`data/lfb_train_clean.parquet`, 1.79M rows) covers **ALL Greater London**: 33 boroughs, ~1486 wards. Incident extent lat **51.287–51.692**, lon **−0.510–0.322** (≈ GLA boundary). 99% within lat 51.35–51.66 / lon −0.47–0.22.
- A's forecast schema has **per-ward lat/lon** → if A emits all-London, every ward column auto-appears, camera re-frames to centroid, labels stay capped. **Zero frontend change.**
- `backend/geo.py` only has 12 Lewisham wards — used **backend-only** (scenario station logic, mobile routes). Not the frontend join key.

## IN PROGRESS — extend buildings to full GL + clip map non-rectangular
User wants: buildings across the whole data area (all GL), small buildings filtered out (GPU), and the **map clipped to where data exists** (cut empty Surrey/Kent corners; map need not be rectangular).

Done so far: `backend/coverage.py` written (incident-density mask over basemap bounds; `coverage_grid()` + `is_covered_fn()`). **Untested.**

Remaining steps:
1. **`backend/clip_basemap.py`** (new): load `basemap.png`, build coverage alpha from `coverage.coverage_grid()` (resize grid → basemap WxH, bilinear for soft edge), write RGBA `basemap.png` transparent outside the mask. Run it after `build_map_tile.py`.
2. **`backend/build_buildings.py`**: add an `all_london` region (bbox = GL data extent ~ `(51.287,-0.510,51.692,0.322)`), grid e.g. 8×8, **skip cells with no coverage** (use `coverage.is_covered_fn`), raise `MIN_AREA_M2` (~100–120 to cut count), drop buildings whose centroid isn't covered, keep `MAX_BUILDINGS` cap (~400k, largest by area). Run (long; background it — Overpass 429s auto-retry).
3. **Frontend `RiskMap3D.tsx` `Basemap`**: material needs `transparent` + `alphaTest={0.5}` + `side={THREE.DoubleSide}` so the clipped (transparent) basemap shows the irregular silhouette. Verify pedestal still looks OK under a non-rectangular map (it's a rectangular slab — acceptable as a "mounted board", or shrink/clip later).
4. Verify: overlay sample buildings on basemap (PIL) to confirm alignment; check FPS with ~400k instances; confirm dev serves new files.

Regen commands:
```
source .venv/bin/activate
REGION=greater_london python -m backend.build_map_tile
python -m backend.clip_basemap            # (to write)
REGION=all_london python -m backend.build_buildings   # (to add region)
```

## Remaining plan (PLAN_PERSON_B.md)
- **Step 6** — swap in A's real forecast. Blocked on A. Loader already hot-reloads; columns auto-place. Optional prep: scenario before/after **delta toggle** on surface (backend returns `forecast_delta`).
- **Step 7** — `/api/ask` (rule-based NL → scenario_logic; `routes/ask.py` is a stub) + **Spark status panel** (frontend, pulls `device`/`model_loaded` from `/health`; NVIDIA judging point). Unblocked, independent, parallelizable.
- **Step 8** — `run_all.sh` offline hardening (already starts both, port 8008; basemap/buildings bundled so no runtime CDN), `outputs/scenario_demo.json`, demo path + screenshots. Attribution line (© OSM / © CARTO).

## Tunables (RiskMap3D.tsx)
`UNITS_PER_M` (scale), `MAX_HEIGHT` (columns), `BLDG_EXAG`/`BLDG_MIN_W`/`BLDG_MAX_H_M` (buildings), `LABEL_TOP_N`, Bloom `intensity`/`luminanceThreshold`, OrbitControls `min/maxDistance` + `autoRotateSpeed`, fog range.
