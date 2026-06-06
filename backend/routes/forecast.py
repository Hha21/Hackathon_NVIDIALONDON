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
    data_district = data.get("district")  # A's real all-London forecast omits this

    # District match only when the forecast is scoped to a single district.
    # A's all-London forecast has no top-level district -> serve every ward.
    if district and data_district and data_district.lower() != district.lower():
        return ForecastResponse(**{**data, "district": district, "wards": []})

    # Ensure the required `district` field is always present for the response.
    data = {**data, "district": data_district or district or "Greater London"}

    if incident_type and incident_type != "all":
        data = copy.deepcopy(data)
        for ward in data.get("wards", []):
            for h in ward["hourly"]:
                if h["dominant_type"] != incident_type:
                    h["risk_score"] = 0.0
                    h["expected_count"] = 0.0

    return ForecastResponse(**data)
