"""FastAPI app entrypoint.

Step 0/1 scaffold: app + CORS + /health + forecast loader wired.
Routes for forecast / scenario / mobile / ask are mounted as stubs and filled
in Steps 2-7.

Run:  uvicorn backend.main:app --reload --port 8000
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.loader import forecast_available, load_forecast
from backend.schemas import Health
from backend.routes import forecast, scenario, mobile, ask, generate

app = FastAPI(title="Foresight for Fires — Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(forecast.router)
app.include_router(generate.router)
app.include_router(scenario.router)
app.include_router(mobile.router)
app.include_router(ask.router)


@app.get("/health", response_model=Health)
def health() -> Health:
    avail = forecast_available()
    # Report the real inference device recorded by the model at generation time
    # (src/infer.py stamps torch.cuda.get_device_name). Fall back gracefully so
    # the panel never claims hardware that wasn't used.
    device = "unknown"
    if avail:
        try:
            device = load_forecast().get("device", "unknown")
        except Exception:
            device = "unknown"
    return Health(
        status="ok",
        model_loaded=avail,          # MVP: forecast file present == model output ready
        forecast_available=avail,
        device=device,
    )
