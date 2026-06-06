"""GET /api/forecast — 24h ward risk surface.

Serves outputs/forecast_24h.json (fake now, A's real data later — same schema,
zero code change). Supports a district match and an incident_type filter.

When incident_type != "all", each hour that is NOT dominated by the requested
type is zeroed (risk_score / expected_count -> 0) rather than dropped, so the
frontend surface keeps its ward x hour grid and just flattens the off-type wards.
"""

from __future__ import annotations

import copy

from fastapi import APIRouter, HTTPException

from backend.loader import forecast_available, load_forecast
from backend.schemas import ForecastResponse

router = APIRouter(prefix="/api", tags=["forecast"])


@router.get("/forecast", response_model=ForecastResponse)
def get_forecast(district: str = "Lewisham", incident_type: str = "all") -> ForecastResponse:
    if not forecast_available():
        raise HTTPException(status_code=503, detail="forecast not available")

    data = load_forecast()

    # District match (single-district demo: top-level field). Mismatch -> empty.
    if district and data.get("district", "").lower() != district.lower():
        data = {**data, "district": district, "wards": []}

    if incident_type and incident_type != "all":
        data = copy.deepcopy(data)
        for ward in data.get("wards", []):
            for h in ward["hourly"]:
                if h["dominant_type"] != incident_type:
                    h["risk_score"] = 0.0
                    h["expected_count"] = 0.0

    return ForecastResponse(**data)
