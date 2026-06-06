"""Re-fetch specific all_london grid cells that failed (Overpass 429 -> 0 results)
and merge them into the existing buildings.json without re-downloading everything.

The big build occasionally loses a cell to rate-limiting, leaving a clean
grid-aligned hole in the 3D city. This patches those cells in place.

Run:  REGION=all_london python -m backend.fill_cells 5,3 7,4
"""
from __future__ import annotations

import json
import math
import sys
import time

from backend.build_buildings import (
    BBOX, GRID, MAX_BUILDINGS, MIN_AREA_M2, OUT, fetch_cell, levels_to_h,
)
from backend.coverage import is_covered_fn, load_bounds


def main(cells: list[tuple[int, int]]) -> None:
    s0, w0, n0, e0 = BBOX
    latC = (n0 + s0) / 2
    m_lat = 111_130.0
    m_lon = 111_320.0 * math.cos(math.radians(latC))
    dlat = (n0 - s0) / GRID
    dlon = (e0 - w0) / GRID
    covered = is_covered_fn(load_bounds())

    new_rows: list[list] = []
    for i, j in cells:
        cs = s0 + i * dlat
        cn = cs + dlat
        cw = w0 + j * dlon
        ce = cw + dlon
        print(f"fetch cell [{i},{j}] bbox=({cs:.3f},{cw:.3f},{cn:.3f},{ce:.3f})")
        els = fetch_cell(cs, cw, cn, ce)
        print(f"  got {len(els)} ways")
        for el in els:
            geom = el.get("geometry")
            if not geom:
                continue
            lats = [g["lat"] for g in geom]
            lons = [g["lon"] for g in geom]
            w_m = (max(lons) - min(lons)) * m_lon
            d_m = (max(lats) - min(lats)) * m_lat
            if w_m * d_m < MIN_AREA_M2:
                continue
            clat = sum(lats) / len(lats)
            clon = sum(lons) / len(lons)
            if not covered(clat, clon):
                continue
            new_rows.append([round(clat, 6), round(clon, 6),
                             round(w_m, 1), round(d_m, 1),
                             round(levels_to_h(el.get("tags", {})), 1)])
        time.sleep(2)

    existing = json.loads(OUT.read_text())
    print(f"existing {len(existing)} + new {len(new_rows)}")
    merged = existing + new_rows
    if len(merged) > MAX_BUILDINGS:
        merged.sort(key=lambda r: r[2] * r[3], reverse=True)  # keep largest by area
        merged = merged[:MAX_BUILDINGS]
        print(f"capped to {MAX_BUILDINGS} largest")
    OUT.write_text(json.dumps(merged, separators=(",", ":")))
    print(f"wrote {len(merged)} -> {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    cells = [tuple(int(x) for x in a.split(",")) for a in sys.argv[1:]]
    main(cells or [(5, 3), (7, 4)])
