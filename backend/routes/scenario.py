"""POST /api/scenario — scenario-adjusted forecast + recommendations. Step 5.

Thin route over backend.scenario_logic (the rule engine), so the logic stays
unit-testable. Reads the baseline forecast from the shared loader; falls back to
503 if no forecast is available.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.loader import forecast_available, load_forecast
from backend.scenario_logic import compute_scenario
from backend.schemas import Scenario, ScenarioResponse

router = APIRouter(prefix="/api", tags=["scenario"])

_counter = {"n": 0}


@router.post("/scenario", response_model=ScenarioResponse)
def post_scenario(scenario: Scenario) -> ScenarioResponse:
    if not forecast_available():
        raise HTTPException(status_code=503, detail="forecast not available")

    forecast = load_forecast()
    _counter["n"] += 1
    scenario_id = f"scn_{_counter['n']:04d}"

    summary, recommendations, forecast_delta = compute_scenario(
        scenario, forecast, scenario_id
    )

    return ScenarioResponse(
        scenario_id=scenario_id,
        summary=summary,
        recommendations=recommendations,
        forecast_delta=forecast_delta,
    )
