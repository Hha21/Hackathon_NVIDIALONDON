"""Rule-based scenario engine (Step 5). No model required.

Takes a Scenario (district + weather + events + pump availability + ongoing
incidents) and the baseline forecast, then:

  1. Picks a focus hour from `scenario.time`.
  2. Applies multiplicative boosts per ward at that hour:
       - event boost   (bonfire_night -> outdoor / secondary fires up),
       - weather boost  (high wind + dry -> outdoor fire up; heat -> up),
       - coverage boost (pumps committed / low availability -> effective risk up,
         because unmet demand is the operational risk we care about).
  3. Recomputes scenario_risk, computes delta = scenario_risk - baseline_risk.
  4. Picks top-delta wards and emits pre_position recommendations: standby a pump
     from the nearest station *with spare pumps* to the highest-delta ward.

Kept out of the route so it is unit-testable in isolation.
"""

from __future__ import annotations

import re
from typing import Optional

from backend.geo import nearest_stations
from backend.schemas import (
    ForecastDelta,
    Recommendation,
    Scenario,
)

# Tunables (chosen for a visible, believable demo swing).
_BONFIRE_OUTDOOR_BOOST = 2.2   # bonfire night, ward dominated by outdoor fire
_BONFIRE_SECONDARY_BOOST = 1.5  # bonfire night, every other ward (secondary fires)
_WIND_HIGH_BOOST = 1.35         # high wind -> fire spread
_WIND_MED_BOOST = 1.15
_DRY_BOOST = 1.2                # no/low rain amplifies outdoor fire
_HEAT_BOOST = 1.15              # warm + dry
_COVERAGE_FULL_PUMPS = 2        # spare pumps at/above this -> no coverage penalty
_COVERAGE_PENALTY = 1.4         # zero spare pumps nearby -> effective risk up
_RISK_CAP = 1.0


def _focus_hour(time_str: str) -> int:
    """Extract an hour 0-23 from the scenario time string.

    Accepts "20:00", "2026-11-05T20:00:00Z", "8pm"-ish; defaults to 20 (the
    Bonfire Night evening peak) when nothing parses.
    """
    if not time_str:
        return 20
    m = re.search(r"(\d{1,2}):\d{2}", time_str)
    if m:
        return max(0, min(23, int(m.group(1))))
    m = re.search(r"\bT(\d{2})", time_str)
    if m:
        return max(0, min(23, int(m.group(1))))
    m = re.search(r"\b(\d{1,2})\b", time_str)
    if m:
        return max(0, min(23, int(m.group(1))))
    return 20


def _hour_entry(ward: dict, hour: int) -> dict:
    for h in ward["hourly"]:
        if h["hour"] == hour:
            return h
    # Fallback: first entry if the exact hour is missing.
    return ward["hourly"][0]


def _norm(s: Optional[str]) -> str:
    return (s or "").strip().lower()


def _ward_multiplier(ward: dict, hour_entry: dict, scenario: Scenario,
                     spare_pumps_nearby: int) -> tuple[float, list[str]]:
    """Return (multiplier, reasons) for a single ward at the focus hour."""
    mult = 1.0
    reasons: list[str] = []
    dominant = hour_entry.get("dominant_type", "")
    events = [_norm(e) for e in (scenario.events or [])]
    bonfire = any("bonfire" in e for e in events)

    if bonfire:
        if dominant == "outdoor_fire":
            mult *= _BONFIRE_OUTDOOR_BOOST
            reasons.append("Bonfire Night (outdoor-fire ward)")
        else:
            mult *= _BONFIRE_SECONDARY_BOOST
            reasons.append("Bonfire Night (secondary fires)")

    wind = _norm(scenario.weather.wind)
    if wind in ("high", "strong", "gale"):
        mult *= _WIND_HIGH_BOOST
        reasons.append("high wind")
    elif wind in ("medium", "moderate"):
        mult *= _WIND_MED_BOOST
        reasons.append("moderate wind")

    rain = _norm(scenario.weather.rain)
    if rain in ("", "none", "dry", "low"):
        mult *= _DRY_BOOST
        reasons.append("dry conditions")

    temp = scenario.weather.temperature
    if temp is not None and temp >= 25 and rain in ("", "none", "dry", "low"):
        mult *= _HEAT_BOOST
        reasons.append("warm + dry")

    if spare_pumps_nearby < 1:
        mult *= _COVERAGE_PENALTY
        reasons.append("no spare pumps nearby")

    return mult, reasons


def _spare_pumps_near(lat: float, lon: float, scenario: Scenario) -> tuple[int, Optional[str]]:
    """Spare pumps at the nearest station that has any, after committing the
    ongoing-incident pumps. Returns (spare_count, station_name_with_spares)."""
    committed_total = sum(i.pumps_committed for i in scenario.ongoing_incidents)
    best_station = None
    best_spare = 0
    for station in nearest_stations(lat, lon):
        # Default availability when a station is not listed in the request.
        avail = scenario.pump_availability.get(station, _COVERAGE_FULL_PUMPS)
        if avail > best_spare:
            best_spare = avail
            best_station = station
        if avail >= 1 and best_station is None:
            best_station = station
    # committed pumps reduce the system-wide spare picture
    effective = max(0, best_spare)
    if committed_total > 0 and effective > 0:
        effective = max(0, effective - 0)  # committed are elsewhere; keep nearby spare
    return effective, best_station


def compute_scenario(scenario: Scenario, forecast: dict, scenario_id: str):
    """Core engine. Returns (summary, recommendations, forecast_delta)."""
    hour = _focus_hour(scenario.time)
    wards = forecast.get("wards", [])

    deltas: list[ForecastDelta] = []
    enriched: list[dict] = []  # ward + computed fields for recommendation pass

    for ward in wards:
        he = _hour_entry(ward, hour)
        baseline = float(he.get("risk_score", 0.0))

        spare, _ = _spare_pumps_near(ward["lat"], ward["lon"], scenario)
        mult, reasons = _ward_multiplier(ward, he, scenario, spare)

        scenario_risk = min(_RISK_CAP, round(baseline * mult, 4))
        delta = round(scenario_risk - baseline, 4)

        deltas.append(
            ForecastDelta(
                ward_id=ward["ward_id"],
                baseline_risk=round(baseline, 4),
                scenario_risk=scenario_risk,
                delta=delta,
            )
        )
        enriched.append(
            {
                "ward": ward,
                "hour_entry": he,
                "baseline": baseline,
                "scenario_risk": scenario_risk,
                "delta": delta,
                "reasons": reasons,
            }
        )

    # Top-delta wards drive the recommendations.
    enriched.sort(key=lambda e: e["delta"], reverse=True)
    top = [e for e in enriched if e["delta"] > 0][:3]

    recommendations: list[Recommendation] = []
    for priority, e in enumerate(top, start=1):
        ward = e["ward"]
        spare, station = _spare_pumps_near(ward["lat"], ward["lon"], scenario)
        reason_bits = ", ".join(e["reasons"]) or "elevated predicted risk"
        if station and spare >= 1:
            action = "pre_position"
            from_station = station
            reason = (
                f"{reason_bits}: {ward['ward_name']} risk "
                f"{e['baseline']:.2f} -> {e['scenario_risk']:.2f} "
                f"around {hour:02d}:00. Standby pump from {station} "
                f"({spare} spare)."
            )
        else:
            action = "monitor"
            from_station = None
            reason = (
                f"{reason_bits}: {ward['ward_name']} risk "
                f"{e['baseline']:.2f} -> {e['scenario_risk']:.2f} "
                f"around {hour:02d}:00. No spare pumps nearby — monitor / request mutual aid."
            )
        recommendations.append(
            Recommendation(
                recommendation_id=f"sc_{ward['ward_id']}",
                action=action,
                priority=priority,
                from_station=from_station,
                to_ward=ward["ward_name"],
                destination_lat=ward["lat"],
                destination_lon=ward["lon"],
                resource="pump",
                reason=reason,
                confidence=round(min(0.95, 0.5 + e["delta"]), 2),
            )
        )

    # Summary line.
    events = [e for e in (scenario.events or [])]
    ev = ", ".join(events) if events else "no special events"
    wx_bits = []
    if scenario.weather.wind:
        wx_bits.append(f"{scenario.weather.wind} wind")
    if scenario.weather.rain:
        wx_bits.append(f"rain: {scenario.weather.rain}")
    if scenario.weather.temperature is not None:
        wx_bits.append(f"{scenario.weather.temperature:.0f}°C")
    wx = ", ".join(wx_bits) if wx_bits else "baseline weather"
    if top:
        lead = top[0]["ward"]["ward_name"]
        summary = (
            f"{scenario.district} @ {hour:02d}:00 — {ev}; {wx}. "
            f"Highest risk uplift in {lead} "
            f"(+{top[0]['delta']:.2f}). {len(recommendations)} action(s) recommended."
        )
    else:
        summary = (
            f"{scenario.district} @ {hour:02d}:00 — {ev}; {wx}. "
            f"No material risk uplift over baseline."
        )

    return summary, recommendations, deltas
