"""Clip the rectangular basemap to the real London data silhouette.

Loads frontend/public/basemap.png, builds a coverage alpha channel from the
incident-density mask (coverage.coverage_grid), upscales it to the basemap
resolution with a bilinear/blur soft edge, and rewrites basemap.png as RGBA so
the empty Surrey/Kent corners are transparent. The frontend renders the plane
with alphaTest, so the map shows an irregular city silhouette instead of a
rectangle.

Run AFTER build_map_tile.py:
  python -m backend.clip_basemap
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from backend.coverage import coverage_grid, load_bounds

ROOT = Path(__file__).resolve().parents[1]
PNG = ROOT / "frontend" / "public" / "basemap.png"

FEATHER = 6  # gaussian blur radius (px) on the upscaled alpha for a soft edge


def main() -> None:
    bounds = load_bounds()
    img = Image.open(PNG).convert("RGBA")
    W, H = img.size
    print(f"basemap {W}x{H}")

    grid = coverage_grid(bounds)  # bool [ny, nx], row 0 = north
    alpha_small = Image.fromarray((grid * 255).astype("uint8"))  # nx wide, ny tall
    # upscale to basemap resolution (BILINEAR = soft ramp at the boundary)
    alpha = alpha_small.resize((W, H), Image.BILINEAR)
    alpha = alpha.filter(ImageFilter.GaussianBlur(FEATHER))

    img.putalpha(alpha)
    img.save(PNG, "PNG", optimize=True)

    covered = (np.array(alpha) > 127).mean() * 100
    print(f"wrote {PNG} RGBA, ~{covered:.0f}% of frame covered")


if __name__ == "__main__":
    main()
