"""Mobile routes (owned by B, driven by C).

  GET  /api/mobile/state?station=Lewisham
  POST /api/mobile/accept

State is synthesised from the shared forecast file so the Android demo lines up
with the web dashboard: the recommended pre-position destination is the ward
with the highest risk in the next few hours. Falls back to a static mock if the
forecast file is missing, so the app is never blocked.
"""
from __future__ import annotations

from fastapi import APIRouter

from backend.loader import forecast_available, load_forecast
from backend.schemas import (
    AcceptRequest,
    AcceptResponse,
    MobileHeatmap,
    MobileHeatWard,
    MobileIncident,
    MobileRecommendation,
    MobileState,
)

router = APIRouter(prefix="/api/mobile", tags=["mobile"])

# Window used to pick the "next risk spike" ward for the recommendation.
_LOOKAHEAD_START = 1
_LOOKAHEAD_END = 6

# How many of the highest-risk wards to surface on the mobile globe.
_HEATMAP_TOP_N = 60


def _static_state(station: str) -> MobileState:
    """Fallback when no forecast file is present — keeps the app demoable."""
    return MobileState(
        station=station,
        available_pumps=1,
        ongoing_incidents=[
            MobileIncident(
                incident_id="mock_001",
                type="outdoor_fire",
                location=f"{station} Central",
                status="active",
            )
        ],
        recommendations=[
            MobileRecommendation(
                recommendation_id="rec_001",
                action="pre_position",
                destination="Brockley",
                lat=51.464,
                lon=-0.036,
                reason="Predicted risk spike between 19:00 and 21:00.",
            )
        ],
    )


def _peak_ward(wards: list[dict]) -> tuple[dict, dict]:
    """Return (ward, hourly) with the highest risk in the lookahead window."""
    best_ward = wards[0]
    best_hour = wards[0]["hourly"][0]
    best_risk = -1.0
    for ward in wards:
        for h in ward["hourly"]:
            if _LOOKAHEAD_START <= h["hour"] <= _LOOKAHEAD_END and h["risk_score"] > best_risk:
                best_risk = h["risk_score"]
                best_ward = ward
                best_hour = h
    return best_ward, best_hour


@router.get("/state", response_model=MobileState)
def get_state(station: str = "Lewisham") -> MobileState:
    if not forecast_available():
        return _static_state(station)

    data = load_forecast()
    wards = data.get("wards", [])
    if not wards:
        return _static_state(station)

    peak_ward, peak_hour = _peak_ward(wards)

    # Current ongoing incident: highest risk *right now* (hour 0).
    now_ward = max(
        wards, key=lambda w: w["hourly"][0]["risk_score"] if w["hourly"] else 0.0
    )
    now_hour = now_ward["hourly"][0]

    return MobileState(
        station=station,
        available_pumps=1,
        ongoing_incidents=[
            MobileIncident(
                incident_id="inc_001",
                type=now_hour["dominant_type"],
                location=now_ward["ward_name"],
                status="active",
            )
        ],
        recommendations=[
            MobileRecommendation(
                recommendation_id=f"rec_{peak_ward['ward_id']}",
                action="pre_position",
                destination=peak_ward["ward_name"],
                lat=peak_ward["lat"],
                lon=peak_ward["lon"],
                reason=(
                    f"Predicted {peak_hour['dominant_type'].replace('_', ' ')} risk spike "
                    f"around {peak_hour['hour']:02d}:00 "
                    f"(risk {peak_hour['risk_score']:.2f})."
                ),
            )
        ],
    )


@router.get("/heatmap", response_model=MobileHeatmap)
def get_heatmap(top: int = _HEATMAP_TOP_N) -> MobileHeatmap:
    """Top-risk wards with their full 24h risk curves, for the mobile globe.

    Returns the `top` wards ranked by peak hourly risk so the phone renders the
    real Spark forecast instead of hardcoded demo wards. Empty list if no
    forecast file is present (app falls back to its built-in demo data)."""
    if not forecast_available():
        return MobileHeatmap(forecast_from="", horizon_hours=24, wards=[])

    data = load_forecast()
    wards = data.get("wards", [])

    def peak(w: dict) -> float:
        return max((h["risk_score"] for h in w["hourly"]), default=0.0)

    ranked = sorted(wards, key=peak, reverse=True)[: max(1, top)]

    out: list[MobileHeatWard] = []
    for w in ranked:
        hourly = sorted(w["hourly"], key=lambda h: h["hour"])
        risk = [round(h["risk_score"], 4) for h in hourly]
        peak_h = max(hourly, key=lambda h: h["risk_score"])
        out.append(
            MobileHeatWard(
                ward_id=w["ward_id"],
                name=w["ward_name"],
                lat=w["lat"],
                lon=w["lon"],
                peak_hour=peak_h["hour"],
                type=peak_h["dominant_type"],
                expected=round(peak_h.get("expected_count", 0.0), 2),
                risk=risk,
            )
        )

    return MobileHeatmap(
        forecast_from=data.get("forecast_from", ""),
        horizon_hours=data.get("horizon_hours", 24),
        wards=out,
    )


@router.post("/accept", response_model=AcceptResponse)
def accept(req: AcceptRequest) -> AcceptResponse:
    if not req.accepted:
        return AcceptResponse(status="rejected", routing_uri="")

    # Recover the destination ward from the recommendation id when possible so
    # the routing_uri points at the right coordinates.
    lat, lon, label = 51.464, -0.036, "standby position"
    if forecast_available():
        data = load_forecast()
        ward_id = req.recommendation_id.replace("rec_", "")
        for w in data.get("wards", []):
            if w["ward_id"] == ward_id:
                lat, lon, label = w["lat"], w["lon"], f"{w['ward_name']} standby position"
                break

    routing_uri = f"geo:{lat},{lon}?q={lat},{lon}({label})"
    return AcceptResponse(status="accepted", routing_uri=routing_uri)
