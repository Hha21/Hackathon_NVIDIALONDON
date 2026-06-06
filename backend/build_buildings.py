"""Fetch real OSM building footprints for a London area and compact them for the
3D dashboard (run once; offline after).

For each building way we keep: centroid lat/lon, footprint width/depth (metres,
from the node bbox), and height (from building:levels, else a default). The
frontend extrudes these as an InstancedMesh (one draw call) positioned with the
same projection as the basemap, so the buildings sit on the right streets.

The bbox can be much larger than the demo borough, so the query is split into a
grid of sub-bbox Overpass requests (avoids server timeouts / size caps), then
deduped by way id. A min-area filter and a hard cap (keep the largest) keep the
instance count renderable.

Run:  python -m backend.build_buildings           # default EXTENDED bbox
      REGION=lewisham python -m backend.build_buildings
Output: frontend/public/buildings.json  [[lat, lon, w_m, d_m, h_m], ...]
"""
from __future__ import annotations

import json
import math
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "public" / "buildings.json"

# Region bboxes (south, west, north, east).
REGION = os.environ.get("REGION", "extended")
BBOX = {
    # tight demo borough
    "lewisham": (51.413, -0.066, 51.509, 0.022),
    # central + SE London: City fringe, Southwark, Lambeth E, Greenwich,
    # Lewisham, Catford — fills the visible part of the Greater-London basemap.
    "extended": (51.40, -0.13, 51.56, 0.09),
}[REGION]

GRID = {"lewisham": 2, "extended": 6}[REGION]  # NxN sub-queries
MIN_AREA_M2 = 45.0          # drop sheds / tiny footprints
MAX_BUILDINGS = 380_000     # cap instances (keep largest by area)
DEFAULT_LEVELS = 3
M_PER_LEVEL = 3.1
UA = "foresight-for-fires-hackathon/1.0 (demo)"
OVERPASS = "https://overpass-api.de/api/interpreter"


def levels_to_h(tags: dict) -> float:
    for k in ("building:levels", "levels"):
        v = tags.get(k)
        if v:
            try:
                return max(1, float(str(v).split(";")[0])) * M_PER_LEVEL
            except ValueError:
                pass
    h = tags.get("height")
    if h:
        try:
            return float(str(h).replace("m", "").strip())
        except ValueError:
            pass
    return DEFAULT_LEVELS * M_PER_LEVEL


def fetch_cell(s: float, w: float, n: float, e: float) -> list:
    q = f'[out:json][timeout:180];(way["building"]({s},{w},{n},{e}););out geom;'
    req = urllib.request.Request(
        OVERPASS, data=urllib.parse.urlencode({"data": q}).encode(),
        headers={"User-Agent": UA},
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.loads(r.read()).get("elements", [])
        except Exception as ex:  # noqa: BLE001 - retry transient overpass errors
            print(f"  cell retry {attempt + 1}: {ex}")
            time.sleep(5)
    return []


def main() -> None:
    s0, w0, n0, e0 = BBOX
    latC = (n0 + s0) / 2
    m_lat = 111_130.0
    m_lon = 111_320.0 * math.cos(math.radians(latC))

    seen: dict[int, list] = {}
    dlat = (n0 - s0) / GRID
    dlon = (e0 - w0) / GRID
    print(f"region={REGION} bbox={BBOX} grid={GRID}x{GRID}")
    for i in range(GRID):
        for j in range(GRID):
            cs = s0 + i * dlat
            cn = cs + dlat
            cw = w0 + j * dlon
            ce = cw + dlon
            els = fetch_cell(cs, cw, cn, ce)
            for el in els:
                seen.setdefault(el["id"], el)
            print(f"  cell [{i},{j}] +{len(els)} (total unique {len(seen)})")
            time.sleep(1)  # be polite to overpass

    out = []
    for el in seen.values():
        geom = el.get("geometry")
        if not geom:
            continue
        lats = [g["lat"] for g in geom]
        lons = [g["lon"] for g in geom]
        w_m = (max(lons) - min(lons)) * m_lon
        d_m = (max(lats) - min(lats)) * m_lat
        area = w_m * d_m
        if area < MIN_AREA_M2:
            continue
        out.append((
            area,
            [round(sum(lats) / len(lats), 6), round(sum(lons) / len(lons), 6),
             round(w_m, 1), round(d_m, 1), round(levels_to_h(el.get("tags", {})), 1)],
        ))

    if len(out) > MAX_BUILDINGS:
        out.sort(key=lambda t: t[0], reverse=True)  # keep largest
        out = out[:MAX_BUILDINGS]
        print(f"capped to {MAX_BUILDINGS} largest")

    rows = [r for _, r in out]
    OUT.write_text(json.dumps(rows, separators=(",", ":")))
    print(f"kept {len(rows)} buildings -> {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
