"""Query-aware natural-language engine for /api/ask.

Two layers, offline-safe:

  1. **Local Nemotron brain (optional).** If NEMOTRON_URL is set, ask the NVIDIA
     Nemotron model served locally on the DGX Spark (llama.cpp OpenAI-compatible
     chat endpoint) with the live forecast as grounding context. Real on-box LLM
     reasoning — no cloud, operational data never leaves the Spark.
  2. **Rule-based fallback (always).** On any error / timeout / unset URL, a
     rule engine parses intent + incident type from the query and grounds the
     answer in the forecast file.

Either way the structured `recommended_actions` / `supporting_forecast_ids` are
derived from the forecast by the rule engine, so the answer is always grounded
in real numbers. The rule engine alone already differentiates the demo's canned
probes (Bonfire Night vs pump-shortage vs high-wind) instead of returning one
identical answer for every question.

Kept out of the route so it is unit-testable in isolation (see scenario_logic).
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from backend.geo import WARDS, nearest_stations
from backend.schemas import AskAction, AskResponse

# Lewisham borough wards (geo.WARDS) — the demo district. A query naming the
# borough or one of its wards scopes the ranking here instead of all 625 wards.
_LOCAL_WARDS = {n.lower() for n in WARDS}

# ── Nemotron brain (override via env; unset => rule engine only) ────────────────
NEMOTRON_URL = os.getenv("NEMOTRON_URL")  # e.g. http://localhost:8080/v1/chat/completions
NEMOTRON_MODEL = os.getenv("NEMOTRON_MODEL", "nemotron")
NEMOTRON_TIMEOUT_S = float(os.getenv("NEMOTRON_TIMEOUT", "8"))

_HORIZON = 6  # "next few hours" the forecast question is about

# Query keyword -> forecast dominant_type. First hit wins.
_TYPE_KEYWORDS: list[tuple[tuple[str, ...], str]] = [
    (("outdoor", "outside", "grass", "rubbish", "bonfire", "firework", "secondary"), "outdoor_fire"),
    (("dwelling", "home", "house", "flat", "residential", "domestic"), "dwelling_fire"),
    (("false alarm", "afa", "automatic alarm"), "false_alarm"),
    (("special service", "rescue", "rtc", "collision", "flood", "road traffic"), "special_service"),
]

_PRETTY = {
    "outdoor_fire": "outdoor fire",
    "dwelling_fire": "dwelling fire",
    "false_alarm": "false alarm",
    "special_service": "special service",
}


def _detect_type(q: str) -> str | None:
    for keys, itype in _TYPE_KEYWORDS:
        if any(k in q for k in keys):
            return itype
    return None


def _wants_lowest(q: str) -> bool:
    return any(k in q for k in ("safest", "lowest", "quiet", "calmest", "least"))


def _wants_time(q: str) -> bool:
    return any(k in q for k in ("when", "what time", "what hour", "peak time", "busiest time"))


def _scope_wards(q: str, wards: list[dict]) -> list[dict]:
    """If the query names the demo borough or one of its wards, restrict the
    candidate set to Lewisham; otherwise rank across all wards."""
    if "lewisham" in q or any(n in q for n in _LOCAL_WARDS):
        local = [w for w in wards if w["ward_name"].lower() in _LOCAL_WARDS]
        if local:
            return local
    return wards


def _ward_peak(ward: dict, itype: str | None) -> tuple[float, int, bool]:
    """(peak_risk, hour, type_matched) over the horizon. If itype is given,
    restrict to hours whose dominant_type matches; type_matched flags whether
    any such hour existed (so the caller can note it fell back to all types)."""
    best_risk, best_hour, matched = -1.0, 0, False
    for h in ward.get("hourly", []):
        if h["hour"] > _HORIZON:
            continue
        if itype is not None:
            if h.get("dominant_type") != itype:
                continue
            matched = True
        if h["risk_score"] >= best_risk:
            best_risk, best_hour = h["risk_score"], h["hour"]
    if best_risk < 0:  # no hour matched the type filter -> rank on all types
        return _ward_peak(ward, None)[:2] + (False,)
    return best_risk, best_hour, matched


def _rank(wards: list[dict], itype: str | None, lowest: bool) -> list[dict]:
    scored = []
    for w in wards:
        risk, hour, matched = _ward_peak(w, itype)
        scored.append({"ward": w, "risk": risk, "hour": hour, "matched": matched})
    scored.sort(key=lambda e: e["risk"], reverse=not lowest)
    return scored


def _rule_answer(query: str, forecast: dict) -> AskResponse:
    q = query.lower()
    wards = forecast.get("wards", [])
    if not wards:
        return AskResponse(
            answer=(
                "No forecast is loaded yet. Once the model output is available I can "
                "recommend where to pre-position standby resources."
            ),
            recommended_actions=[],
            supporting_forecast_ids=[],
        )

    itype = _detect_type(q)
    lowest = _wants_lowest(q)
    timing = _wants_time(q)
    ranked = _rank(_scope_wards(q, wards), itype, lowest)
    top = ranked[0]
    w = top["ward"]
    type_phrase = f" {_PRETTY[itype]}" if itype else ""

    # When the query asks WHEN, lead with the peak hour.
    if timing:
        answer = (
            f"{w['ward_name']} carries the highest{type_phrase} risk over the next "
            f"{_HORIZON} hours, peaking around {top['hour']:02d}:00 "
            f"(risk {top['risk']:.2f}). Pre-position a standby pump ahead of that window."
        )
    elif lowest:
        answer = (
            f"{w['ward_name']} is the lowest{type_phrase}-risk ward over the next "
            f"{_HORIZON} hours (risk {top['risk']:.2f} around {top['hour']:02d}:00) — "
            f"the safest place to pull cover from if you need to reinforce elsewhere."
        )
    else:
        station = nearest_stations(w["lat"], w["lon"])[0]
        runner = ranked[1]["ward"]["ward_name"] if len(ranked) > 1 else None
        also = f" {runner} is next-highest." if runner else ""
        answer = (
            f"Pre-position one standby pump near {w['ward_name']}: it shows the highest"
            f"{type_phrase} risk over the next {_HORIZON} hours "
            f"(risk {top['risk']:.2f}, peaking {top['hour']:02d}:00). "
            f"Nearest cover is {station}.{also} Moving a standby resource there cuts "
            f"response time if local coverage is degraded."
        )

    action_type = "monitor" if lowest else "pre_position"
    actions = [
        AskAction(type=action_type, target=w["ward_name"], confidence=round(min(0.95, 0.55 + top["risk"]), 2))
    ]
    support = [e["ward"]["ward_id"] for e in ranked[:2]]
    return AskResponse(answer=answer, recommended_actions=actions, supporting_forecast_ids=support)


def _nemotron_prose(query: str, forecast: dict, ranked: list[dict]) -> str | None:
    """Ask the local Nemotron brain for the prose answer, grounded in the top
    forecast wards. Returns None on any failure so the caller uses the rule text."""
    if not NEMOTRON_URL:
        return None
    lines = [
        f"- {e['ward']['ward_name']}: risk {e['risk']:.2f} peaking {e['hour']:02d}:00"
        for e in ranked[:5]
    ]
    context = "Forecast — highest-risk wards over the next 6 hours:\n" + "\n".join(lines)
    payload = {
        "model": NEMOTRON_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a London Fire Brigade dispatch assistant. Answer in 1-2 "
                    "sentences. Recommend where to pre-position scarce standby pumps. "
                    "Use ONLY the forecast numbers provided; never invent wards or figures."
                ),
            },
            {"role": "user", "content": f"{context}\n\nQuestion: {query}"},
        ],
        "temperature": 0.3,
        "max_tokens": 160,
    }
    try:
        req = urllib.request.Request(
            NEMOTRON_URL,
            data=json.dumps(payload).encode(),
            headers={"content-type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=NEMOTRON_TIMEOUT_S) as r:
            body = json.loads(r.read())
        text = body["choices"][0]["message"]["content"].strip()
        return text or None
    except (urllib.error.URLError, KeyError, IndexError, ValueError, TimeoutError, OSError):
        return None


def answer_query(query: str, forecast: dict) -> AskResponse:
    """Public entrypoint: grounded rule answer, with Nemotron prose when reachable."""
    base = _rule_answer(query, forecast)
    wards = forecast.get("wards", [])
    if not wards:
        return base
    q = query.lower()
    ranked = _rank(_scope_wards(q, wards), _detect_type(q), _wants_lowest(q))
    prose = _nemotron_prose(query, forecast, ranked)
    if prose:
        # LLM prose, but keep the structured actions/ids grounded by the rule engine.
        return AskResponse(
            answer=prose,
            recommended_actions=base.recommended_actions,
            supporting_forecast_ids=base.supporting_forecast_ids,
        )
    return base
