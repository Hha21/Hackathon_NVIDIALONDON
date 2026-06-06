"""Densify the bundled buildings by filling sparse *urban* gaps with jittered
clones of real footprints — so the 3D city has no bald patches — while leaving
water and parks empty (classified from the basemap pixels).

Reads frontend/public/buildings.json + basemap, appends fill buildings, writes
back. Re-runnable: it strips any prior fill (flagged with a 6th element = 1).

Run:  python -m backend.gap_fill_buildings
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BOUNDS = json.loads((ROOT / "frontend" / "src" / "basemap_bounds.json").read_text())
BLD = ROOT / "frontend" / "public" / "buildings.json"
MAP = ROOT / "frontend" / "public" / "basemap.png"

CELL_PX = 13         # grid cell size in basemap pixels
TARGET = 4           # desired buildings per buildable cell
MAX_ADD = 80_000
SEED = 20260605


def classify(px):
    r, g, b = px[0], px[1], px[2]
    if b > 200 and b > r + 10 and g > r:      # water
        return "water"
    if g > r and g > b + 10:                  # park / grass / forest
        return "green"
    return "urban"


def main() -> None:
    rng = random.Random(SEED)
    data = json.loads(BLD.read_text())
    # strip prior fill (6th element flag)
    base = [b for b in data if len(b) < 6]
    print("base buildings:", len(base))

    img = Image.open(MAP).convert("RGB")
    W, H = img.size
    px = img.load()
    w_deg = BOUNDS["east"] - BOUNDS["west"]
    h_deg = BOUNDS["north"] - BOUNDS["south"]

    def to_px(lat, lon):
        return (lon - BOUNDS["west"]) / w_deg * W, (BOUNDS["north"] - lat) / h_deg * H

    # bucket existing buildings into cells
    cols = math.ceil(W / CELL_PX)
    rows = math.ceil(H / CELL_PX)
    counts = [[0] * cols for _ in range(rows)]
    footprints = [(b[2], b[3], b[4]) for b in base]  # w,d,h pool to clone
    for b in base:
        x, y = to_px(b[0], b[1])
        ci = min(cols - 1, int(x // CELL_PX))
        ri = min(rows - 1, int(y // CELL_PX))
        counts[ri][ci] += 1

    added = []
    for ri in range(rows):
        for ci in range(cols):
            if counts[ri][ci] >= TARGET:
                continue
            cx = ci * CELL_PX + CELL_PX // 2
            cy = ri * CELL_PX + CELL_PX // 2
            if cx >= W or cy >= H:
                continue
            if classify(px[cx, cy]) != "urban":
                continue
            need = TARGET - counts[ri][ci]
            for _ in range(need):
                # random point inside the cell -> lat/lon
                jx = (ci * CELL_PX + rng.uniform(1, CELL_PX - 1)) / W
                jy = (ri * CELL_PX + rng.uniform(1, CELL_PX - 1)) / H
                lon = BOUNDS["west"] + jx * w_deg
                lat = BOUNDS["north"] - jy * h_deg
                w, d, h = rng.choice(footprints)
                # mild variation + fill flag (1)
                added.append([
                    round(lat, 6), round(lon, 6),
                    round(w * rng.uniform(0.8, 1.2), 1),
                    round(d * rng.uniform(0.8, 1.2), 1),
                    round(h * rng.uniform(0.8, 1.3), 1),
                    1,
                ])
            if len(added) >= MAX_ADD:
                break
        if len(added) >= MAX_ADD:
            break

    out = base + added
    BLD.write_text(json.dumps(out, separators=(",", ":")))
    print(f"added {len(added)} fill buildings -> total {len(out)} "
          f"({BLD.stat().st_size//1024} KB)")


if __name__ == "__main__":
    main()
