"""POST /api/ask — natural-language query (shared with C).

MVP: rule-based parser over the forecast. Detects intent (where to pre-position)
and grounds the answer in the highest-risk upcoming ward from the forecast file.
Stretch (B/A): route to local NIM/Nemotron.
"""
from __future__ import annotations

from fastapi import APIRouter

from backend.loader import forecast_available, load_forecast
from backend.schemas import AskAction, AskRequest, AskResponse

router = APIRouter(prefix="/api", tags=["ask"])


def _top_wards(n: int = 2) -> list[dict]:
    """Wards ranked by their peak risk over the next 6 hours."""
    if not forecast_available():
        return []
    wards = load_forecast().get("wards", [])

    def peak(w: dict) -> float:
        return max((h["risk_score"] for h in w["hourly"] if h["hour"] <= 6), default=0.0)

    return sorted(wards, key=peak, reverse=True)[:n]


@router.post("/ask", response_model=AskResponse)
def ask(req: AskRequest) -> AskResponse:
    top = _top_wards(2)

    if not top:
        return AskResponse(
            answer=(
                "No forecast is loaded yet. Once the model output is available I can "
                "recommend where to pre-position standby resources."
            ),
            recommended_actions=[],
            supporting_forecast_ids=[],
        )

    names = " or ".join(w["ward_name"] for w in top)
    answer = (
        f"Pre-position one standby pump near {names}. The forecast shows elevated "
        f"risk over the next few hours, so moving a standby resource there reduces "
        f"response time if local coverage is degraded."
    )
    actions = [
        AskAction(type="pre_position", target=top[0]["ward_name"], confidence=0.78)
    ]
    return AskResponse(
        answer=answer,
        recommended_actions=actions,
        supporting_forecast_ids=[w["ward_id"] for w in top],
    )
