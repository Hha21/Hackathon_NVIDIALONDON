"""Generate a fake-but-schema-valid outputs/forecast_24h.json.

CRITICAL FIRST TASK (Hour 0-2): this single file unblocks Person A's downstream
consumers and Person B's frontend. It validates against backend.schemas and uses
the real Lewisham ward NAMES from A's clean data, so when A drops the real
forecast (same schema, same ward_name join key) the swap needs zero code change.

Deterministic (fixed seed) so the demo is reproducible.

Run:  python -m backend.fake_forecast
"""

from __future__ import annotations

import json
import math
import random
from datetime import datetime, timezone
from pathlib import Path

from backend.geo import WARDS, INCIDENT_TYPES, DEMO_DISTRICT
from backend.schemas import (
    ForecastHourly,
    WardForecast,
    ForecastResponse,
)

SEED = 20261105  # Bonfire Night demo date, for luck
OUTPUT = Path(__file__).resolve().parents[1] / "outputs" / "forecast_24h.json"


def _diurnal(hour: int) -> float:
    """Base risk shape over the day: low ~03:00, evening peak ~19:00-21:00."""
    # two cosine bumps: morning commute + evening peak (evening weighted higher)
    morning = 0.25 * math.exp(-((hour - 8) ** 2) / 8)
    evening = 0.55 * math.exp(-((hour - 20) ** 2) / 10)
    floor = 0.12
    return floor + morning + evening


def _dominant_type(hour: int, rng: random.Random) -> str:
    """Weight dominant incident type by time of day."""
    if 9 <= hour <= 17:
        weights = {"false_alarm": 0.55, "road_traffic_collision": 0.25,
                   "outdoor_fire": 0.12, "dwelling_fire": 0.08}
    elif 18 <= hour <= 23:
        weights = {"dwelling_fire": 0.40, "outdoor_fire": 0.30,
                   "false_alarm": 0.20, "road_traffic_collision": 0.10}
    else:  # overnight
        weights = {"dwelling_fire": 0.45, "false_alarm": 0.30,
                   "outdoor_fire": 0.15, "road_traffic_collision": 0.10}
    types = list(weights.keys())
    return rng.choices(types, weights=[weights[t] for t in types])[0]


def build() -> ForecastResponse:
    rng = random.Random(SEED)
    wards: list[WardForecast] = []

    for ward_name, (ward_id, lat, lon) in WARDS.items():
        ward_base = rng.uniform(0.6, 1.25)  # per-ward intensity multiplier
        hourly: list[ForecastHourly] = []
        for hour in range(24):
            noise = rng.uniform(-0.06, 0.06)
            risk = _diurnal(hour) * ward_base + noise
            risk = max(0.0, min(1.0, risk))
            # expected count loosely tracks risk
            expected = round(risk * rng.uniform(0.4, 0.9), 3)
            hourly.append(ForecastHourly(
                hour=hour,
                risk_score=round(risk, 3),
                expected_count=expected,
                dominant_type=_dominant_type(hour, rng),
            ))
        wards.append(WardForecast(
            ward_id=ward_id,
            ward_name=ward_name,
            geometry_id=ward_id,
            lat=lat,
            lon=lon,
            hourly=hourly,
        ))

    return ForecastResponse(
        district=DEMO_DISTRICT,
        generated_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        horizon_hours=24,
        wards=wards,
    )


def main() -> None:
    forecast = build()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(forecast.model_dump(), indent=2))
    # sanity: every incident type appears at least once across the surface
    seen = {h["dominant_type"]
            for w in forecast.model_dump()["wards"] for h in w["hourly"]}
    missing = set(INCIDENT_TYPES) - seen
    print(f"Wrote {OUTPUT} : {len(forecast.wards)} wards x 24h")
    print(f"Incident types present: {sorted(seen)}")
    if missing:
        print(f"WARNING: types never dominant: {sorted(missing)}")


if __name__ == "__main__":
    main()
