"""POST /api/ask — natural-language query (shared with C).

Thin route: parses the query and grounds the answer in the live forecast via
backend.ask_logic. If NEMOTRON_URL is set the prose comes from the local NVIDIA
Nemotron brain on the DGX Spark; otherwise a rule engine answers offline. Either
way the answer is query-aware and grounded in real forecast numbers.
"""
from __future__ import annotations

from fastapi import APIRouter

from backend.ask_logic import answer_query
from backend.loader import forecast_available, load_forecast
from backend.schemas import AskRequest, AskResponse

router = APIRouter(prefix="/api", tags=["ask"])


@router.post("/ask", response_model=AskResponse)
def ask(req: AskRequest) -> AskResponse:
    forecast = load_forecast() if forecast_available() else {"wards": []}
    return answer_query(req.query, forecast)
