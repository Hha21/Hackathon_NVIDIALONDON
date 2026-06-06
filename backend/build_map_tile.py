"""Build a bundled OSM basemap for the dashboard (run once, offline-safe after).

Downloads OpenStreetMap raster tiles covering the Lewisham ward bbox, stitches
them into one PNG, and writes the exact lat/lon bounds the image spans. The
frontend uses those bounds to project ward risk columns onto the same plane, so
the columns sit at their true geographic position over the map.

Run:  python -m backend.build_map_tile
Outputs:
  frontend/public/basemap.png
  frontend/src/basemap_bounds.json   {north,south,east,west}
"""
from __future__ import annotations

import json
import math
import time
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image

import os

from backend.geo import WARDS

TILE = 256
MARGIN_DEG = 0.012  # padding around the ward bbox (lewisham region)
UA = "foresight-for-fires-hackathon/1.0 (demo)"

# Region presets. REGION env var picks one (default greater_london).
#   greater_london: whole GLA bbox, low zoom -> context for all-London data.
#   lewisham:       tight ward bbox, high zoom -> detailed demo borough.
REGION = os.environ.get("REGION", "greater_london")
GREATER_LONDON_BBOX = {  # (south, west, north, east)
    "south": 51.286, "west": -0.510, "north": 51.692, "east": 0.334,
}
ZOOM = {"greater_london": 12, "lewisham": 14}[REGION]

ROOT = Path(__file__).resolve().parents[1]
OUT_PNG = ROOT / "frontend" / "public" / "basemap.png"
OUT_BOUNDS = ROOT / "frontend" / "src" / "basemap_bounds.json"


def lon2x(lon: float, z: int) -> float:
    return (lon + 180.0) / 360.0 * (2 ** z)


def lat2y(lat: float, z: int) -> float:
    r = math.radians(lat)
    return (1.0 - math.log(math.tan(r) + 1.0 / math.cos(r)) / math.pi) / 2.0 * (2 ** z)


def x2lon(x: float, z: int) -> float:
    return x / (2 ** z) * 360.0 - 180.0


def y2lat(y: float, z: int) -> float:
    n = math.pi - 2.0 * math.pi * y / (2 ** z)
    return math.degrees(math.atan(math.sinh(n)))


def main() -> None:
    if REGION == "greater_london":
        north = GREATER_LONDON_BBOX["north"]
        south = GREATER_LONDON_BBOX["south"]
        east = GREATER_LONDON_BBOX["east"]
        west = GREATER_LONDON_BBOX["west"]
    else:
        lats = [v[1] for v in WARDS.values()]
        lons = [v[2] for v in WARDS.values()]
        north = max(lats) + MARGIN_DEG
        south = min(lats) - MARGIN_DEG
        east = max(lons) + MARGIN_DEG
        west = min(lons) - MARGIN_DEG
    print(f"region={REGION} zoom={ZOOM}")

    x_min = int(math.floor(lon2x(west, ZOOM)))
    x_max = int(math.floor(lon2x(east, ZOOM)))
    y_min = int(math.floor(lat2y(north, ZOOM)))  # north = smaller y
    y_max = int(math.floor(lat2y(south, ZOOM)))

    cols = x_max - x_min + 1
    rows = y_max - y_min + 1
    print(f"zoom {ZOOM}: {cols}x{rows} tiles ({cols*rows} total)")

    canvas = Image.new("RGB", (cols * TILE, rows * TILE))
    for xi, x in enumerate(range(x_min, x_max + 1)):
        for yi, y in enumerate(range(y_min, y_max + 1)):
            # CartoDB dark-matter basemap (no key) — dark streets so the city
            # and glowing risk columns pop. Swap to tile.openstreetmap.org for light.
            url = f"https://basemaps.cartocdn.com/dark_all/{ZOOM}/{x}/{y}.png"
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=20) as resp:
                img = Image.open(BytesIO(resp.read())).convert("RGB")
            canvas.paste(img, (xi * TILE, yi * TILE))
            time.sleep(0.05)  # be polite to the tile server

    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT_PNG, "PNG", optimize=True)

    # Exact bounds the stitched image spans (tile edges, not the ward bbox).
    bounds = {
        "north": y2lat(y_min, ZOOM),
        "south": y2lat(y_max + 1, ZOOM),
        "west": x2lon(x_min, ZOOM),
        "east": x2lon(x_max + 1, ZOOM),
        "zoom": ZOOM,
        "width": cols * TILE,
        "height": rows * TILE,
    }
    OUT_BOUNDS.write_text(json.dumps(bounds, indent=2))
    print("wrote", OUT_PNG, f"({canvas.size[0]}x{canvas.size[1]})")
    print("bounds", bounds)


if __name__ == "__main__":
    main()
