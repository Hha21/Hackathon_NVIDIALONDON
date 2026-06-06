"""POST /api/scenario — scenario-adjusted forecast + recommendations. Step 5."""
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["scenario"])

# TODO Step 5: POST /api/scenario -> ScenarioResponse (rule-based, see scenario_logic.py)
