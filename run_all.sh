#!/usr/bin/env bash
# One-command local launch: backend (FastAPI) + frontend (Vite).
# Works offline once deps are installed. Step 8 hardens fallbacks.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# --- backend ---
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q -r backend/requirements.txt

# Ensure a forecast exists (fake fallback) so the dashboard always renders.
if [ ! -f "outputs/forecast_24h.json" ]; then
  python -m backend.fake_forecast
fi

# Port 8008 (8000 is taken by the essential-apps Docker container). Vite proxies
# /api + /health to this port — see frontend/vite.config.ts.
uvicorn backend.main:app --host 0.0.0.0 --port 8008 &
BACKEND_PID=$!
trap 'kill $BACKEND_PID 2>/dev/null || true' EXIT

# --- frontend ---
cd frontend
if [ ! -d "node_modules" ]; then
  npm install
fi
npm run dev
