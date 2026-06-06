"""GET /api/forecast — 24h ward risk surface. Filled in Step 2."""
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["forecast"])

# TODO Step 2: GET /api/forecast?district=&incident_type= -> ForecastResponse
