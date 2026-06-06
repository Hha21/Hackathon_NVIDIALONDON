"""Forecast loader: reads outputs/forecast_24h.json, caches in memory, and
hot-reloads when the file changes on disk (mtime check).

This is the seam that makes the fake -> real data swap zero-code: Person A
overwrites outputs/forecast_24h.json with the same schema, and the next request
picks it up. No restart, no frontend change.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

FORECAST_PATH = Path(__file__).resolve().parents[1] / "outputs" / "forecast_24h.json"

_cache: Optional[dict] = None
_cache_mtime: Optional[float] = None


def forecast_available() -> bool:
    return FORECAST_PATH.exists()


def load_forecast() -> dict:
    """Return the parsed forecast dict, reloading if the file changed."""
    global _cache, _cache_mtime
    if not FORECAST_PATH.exists():
        raise FileNotFoundError(f"forecast not found: {FORECAST_PATH}")
    mtime = FORECAST_PATH.stat().st_mtime
    if _cache is None or mtime != _cache_mtime:
        _cache = json.loads(FORECAST_PATH.read_text())
        _cache_mtime = mtime
    return _cache
