"""Pydantic mirrors of the shared data contracts (README "Shared Data Contracts").

FROZEN AT HOUR 2. Do not change without agreement from Person A and Person C.
These are the single source of truth the backend serves; fake and real data
must both validate against them so the data swap needs no frontend/Android change.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Forecast
# ---------------------------------------------------------------------------
class ForecastHourly(BaseModel):
    hour: int = Field(ge=0, le=23)
    risk_score: float = Field(ge=0.0, le=1.0)
    expected_count: float = Field(ge=0.0)
    dominant_type: str


class WardForecast(BaseModel):
    ward_id: str
    ward_name: str
    geometry_id: str
    lat: float
    lon: float
    hourly: list[ForecastHourly]


class ForecastResponse(BaseModel):
    district: str
    generated_at: str
    horizon_hours: int = 24
    wards: list[WardForecast]


# ---------------------------------------------------------------------------
# Scenario
# ---------------------------------------------------------------------------
class Weather(BaseModel):
    rain: Optional[str] = None
    wind: Optional[str] = None
    temperature: Optional[float] = None


class OngoingIncident(BaseModel):
    ward: str
    type: str
    pumps_committed: int


class Scenario(BaseModel):
    district: str
    time: str
    weather: Weather = Field(default_factory=Weather)
    events: Optional[list[str]] = None
    pump_availability: dict[str, int] = Field(default_factory=dict)
    ongoing_incidents: list[OngoingIncident] = Field(default_factory=list)


class Recommendation(BaseModel):
    action: str  # pre_position | hold | dispatch | monitor
    priority: int
    from_station: Optional[str] = None
    to_ward: Optional[str] = None
    destination_lat: Optional[float] = None
    destination_lon: Optional[float] = None
    resource: Optional[str] = None
    reason: str
    confidence: Optional[float] = None
    recommendation_id: Optional[str] = None


class ForecastDelta(BaseModel):
    ward_id: str
    baseline_risk: float
    scenario_risk: float
    delta: float


class ScenarioResponse(BaseModel):
    scenario_id: str
    summary: str
    recommendations: list[Recommendation]
    forecast_delta: list[ForecastDelta]


# ---------------------------------------------------------------------------
# Mobile (routes owned by B, driven by C)
# ---------------------------------------------------------------------------
class MobileIncident(BaseModel):
    incident_id: str
    type: str
    location: str
    status: str


class MobileRecommendation(BaseModel):
    recommendation_id: str
    action: str
    destination: str
    lat: float
    lon: float
    reason: str


class MobileState(BaseModel):
    station: str
    available_pumps: int
    ongoing_incidents: list[MobileIncident]
    recommendations: list[MobileRecommendation]


class AcceptRequest(BaseModel):
    recommendation_id: str
    station: str
    unit: str
    accepted: bool


class AcceptResponse(BaseModel):
    status: str
    routing_uri: str


# ---------------------------------------------------------------------------
# Natural language
# ---------------------------------------------------------------------------
class AskRequest(BaseModel):
    query: str


class AskAction(BaseModel):
    type: str
    target: str
    confidence: float


class AskResponse(BaseModel):
    answer: str
    recommended_actions: list[AskAction]
    supporting_forecast_ids: list[str]


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
class Health(BaseModel):
    status: str
    model_loaded: bool
    forecast_available: bool
    device: str


# ---------------------------------------------------------------------------
# Spark forecast generation (POST /api/forecast/generate)
# ---------------------------------------------------------------------------
# Only the fields the GPT-2 model actually conditions on (see src/dataset.py
# build_prefix: TEMP/RAIN/WIND buckets + DOW/HOUR/MONTH from the date). Bonfire
# Night, pumps and incidents are NOT model inputs, so they are intentionally
# absent here.
class GenerateRequest(BaseModel):
    date: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    hour: int = Field(default=18, ge=0, le=23)
    temp: Optional[float] = Field(default=None, ge=-20, le=45)   # °C
    rain: Optional[float] = Field(default=None, ge=0, le=100)    # mm/h
    wind: Optional[float] = Field(default=None, ge=0, le=200)    # km/h
    n_rollouts: int = Field(default=10, ge=1, le=100)            # per station


class GenerateJob(BaseModel):
    job_id: str
    status: str                          # queued | running | done | error
    message: str = ""
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    device: Optional[str] = None
    forecast_generated_at: Optional[str] = None
    n_rollouts: Optional[int] = None
    error: Optional[str] = None
