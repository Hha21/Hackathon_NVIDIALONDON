"""Data-coverage mask: where do LFB incidents actually occur?

Used to (a) clip the basemap to a non-rectangular London silhouette and (b) skip
empty areas when fetching buildings. The mask is an incident-density occupancy
grid over the basemap bounds, dilated so the city is solid and the boundary is
smooth.

Shared by clip_basemap.py and build_buildings.py.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
TRAIN = ROOT / "data" / "lfb_train_clean.parquet"
BOUNDS_PATH = ROOT / "frontend" / "src" / "basemap_bounds.json"

GRID_NX = 200          # mask resolution (cols, west->east)
GRID_NY = 180          # rows (north->south)
DILATE = 2             # grow the mask by this many cells (fill gaps, smooth edge)
MIN_COUNT = 1          # cell covered if it has >= this many incidents


def load_bounds() -> dict:
    return json.loads(BOUNDS_PATH.read_text())


def incident_points() -> tuple[np.ndarray, np.ndarray]:
    df = pd.read_parquet(TRAIN, columns=["Latitude", "Longitude"])
    lat = pd.to_numeric(df["Latitude"], errors="coerce").to_numpy()
    lon = pd.to_numeric(df["Longitude"], errors="coerce").to_numpy()
    m = (lat > 50.5) & (lat < 52.5) & (lon > -1.5) & (lon < 1.0) & ~np.isnan(lat) & ~np.isnan(lon)
    return lat[m], lon[m]


def coverage_grid(bounds: dict, nx: int = GRID_NX, ny: int = GRID_NY) -> np.ndarray:
    """Return a bool [ny, nx] grid (row 0 = north) of covered cells."""
    lat, lon = incident_points()
    col = ((lon - bounds["west"]) / (bounds["east"] - bounds["west"]) * nx).astype(int)
    row = ((bounds["north"] - lat) / (bounds["north"] - bounds["south"]) * ny).astype(int)
    ok = (col >= 0) & (col < nx) & (row >= 0) & (row < ny)
    grid = np.zeros((ny, nx), dtype=np.int32)
    np.add.at(grid, (row[ok], col[ok]), 1)
    mask = grid >= MIN_COUNT

    # dilate via PIL MaxFilter for solid fill + smooth boundary
    img = Image.fromarray((mask * 255).astype("uint8"))
    for _ in range(DILATE):
        img = img.filter(ImageFilter.MaxFilter(3))
    return np.array(img) > 127


def is_covered_fn(bounds: dict, nx: int = GRID_NX, ny: int = GRID_NY):
    """Return a function (lat, lon) -> bool against the (dilated) coverage grid."""
    grid = coverage_grid(bounds, nx, ny)
    w, e, n, s = bounds["west"], bounds["east"], bounds["north"], bounds["south"]

    def covered(lat: float, lon: float) -> bool:
        c = int((lon - w) / (e - w) * nx)
        r = int((n - lat) / (n - s) * ny)
        if 0 <= r < ny and 0 <= c < nx:
            return bool(grid[r, c])
        return False

    return covered
