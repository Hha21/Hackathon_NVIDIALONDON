"""
Generate a 24-hour ward-level risk forecast.

Usage:
    python src/generate_forecast.py                    # current time, live weather
    python src/generate_forecast.py --demo             # Bonfire Night scenario
    python src/generate_forecast.py --date 2025-03-15  # specific date, live weather
    python src/generate_forecast.py --district Lewisham  # filter output to one district

Output:
    outputs/forecast_24h.json   (matches ForecastPoint contract)
"""

import json
import pickle
import argparse
import itertools
import warnings
import requests
import holidays
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from pathlib import Path

warnings.filterwarnings("ignore")

DATA_DIR   = Path("data")
MODEL_DIR  = Path("models")
OUTPUT_DIR = Path("outputs")
OUTPUT_DIR.mkdir(exist_ok=True)

WEATHERCODE_MAP = {
    0:"clear",  1:"clear",  2:"cloudy", 3:"cloudy",
    45:"fog",   48:"fog",
    51:"drizzle",53:"drizzle",55:"drizzle",56:"drizzle",57:"drizzle",
    61:"rain",  63:"rain",  65:"heavy_rain",66:"rain",67:"heavy_rain",
    71:"snow",  73:"snow",  75:"snow",  77:"snow",
    80:"rain",  81:"rain",  82:"heavy_rain",85:"snow",86:"snow",
    95:"thunder",96:"thunder",99:"thunder",
}

# ── Load model artefact ────────────────────────────────────────────────────────

model_path = MODEL_DIR / "fire_risk_model.pkl"
if not model_path.exists():
    raise FileNotFoundError(
        "Model not found. Run:  python src/train_baseline.py"
    )

with open(model_path, "rb") as f:
    art = pickle.load(f)

model          = art["model"]
FEATURES       = art["features"]
ward_enc       = art["ward_enc"]
type_enc       = art["type_enc"]
cond_enc       = art["cond_enc"]
base_rate      = art["base_rate"]   # DataFrame: ward_id, type_id, hour_of_day, day_of_week, base_rate
ward_coords    = art["ward_coords"] # DataFrame: ward_canonical, lat, lon
INCIDENT_TYPES = art["incident_types"]

ward_dec        = {v: k for k, v in ward_enc.items()}
type_dec        = {v: k for k, v in type_enc.items()}
ward_to_borough = art.get("ward_to_borough", {})

# ── Weather helpers ────────────────────────────────────────────────────────────

def fetch_live_weather(start_dt: datetime) -> pd.DataFrame:
    """24 hourly rows from Open-Meteo forecast API, from start_dt onward."""
    resp = requests.get(
        "https://api.open-meteo.com/v1/forecast",
        params={
            "latitude": 51.5074, "longitude": -0.1278,
            "hourly": "temperature_2m,precipitation,windspeed_10m,weathercode",
            "timezone": "UTC", "forecast_days": 2, "wind_speed_unit": "kmh",
        },
        timeout=15,
    )
    resp.raise_for_status()
    h = resp.json()["hourly"]
    df = pd.DataFrame(h)
    df["time"] = pd.to_datetime(df["time"])
    start_ts = pd.Timestamp(start_dt).floor("h")
    df = df[df["time"] >= start_ts].head(24).reset_index(drop=True)
    df["condition"] = df["weathercode"].apply(
        lambda c: WEATHERCODE_MAP.get(int(c), "cloudy") if pd.notna(c) else "cloudy"
    )
    df.rename(columns={
        "temperature_2m": "weather_temperature",
        "precipitation":  "weather_rain",
        "windspeed_10m":  "weather_wind",
    }, inplace=True)
    return df[["time", "weather_temperature", "weather_rain", "weather_wind", "condition"]]


def make_synthetic_weather(
    start_dt: datetime,
    temperature: float = None,
    rain: float = 0.0,
    wind: float = 15.0,
    condition: str = None,
) -> pd.DataFrame:
    """Return a 24-row weather DataFrame with constant conditions."""
    _month_temp = {1:5,2:6,3:8,4:11,5:14,6:17,7:19,8:19,9:16,10:13,11:9,12:6}
    temp = temperature if temperature is not None else _month_temp.get(start_dt.month, 12)
    cond = condition or ("rain" if rain > 1.0 else "cloudy" if wind > 25 else "clear")
    hours = pd.date_range(start=start_dt, periods=24, freq="h")
    return pd.DataFrame({
        "time":                hours,
        "weather_temperature": float(temp),
        "weather_rain":        float(rain),
        "weather_wind":        float(wind),
        "condition":           cond,
    })


# ── Feature grid construction ──────────────────────────────────────────────────

def build_grid(start_dt: datetime, weather_df: pd.DataFrame) -> pd.DataFrame:
    """
    Build a (n_wards × n_types × 24) feature table for model inference.
    Returns ~142K rows for all London wards.
    """
    n_wards = len(ward_enc)
    n_types = len(INCIDENT_TYPES)

    # expand: ward_id × type_id × hour_offset
    ward_ids  = np.arange(n_wards, dtype=np.int32)
    type_ids  = np.arange(n_types, dtype=np.int32)
    h_offsets = np.arange(24,      dtype=np.int32)

    w, t, h = np.meshgrid(ward_ids, type_ids, h_offsets, indexing="ij")
    grid = pd.DataFrame({
        "ward_id":  w.ravel(),
        "type_id":  t.ravel(),
        "h_offset": h.ravel(),
    })

    # timestamps per hour offset
    dt_hours = pd.date_range(start=start_dt, periods=24, freq="h")
    grid["floor_hour"]  = dt_hours[grid["h_offset"].values]
    grid["hour_of_day"] = grid["floor_hour"].dt.hour.astype(np.int8)
    grid["day_of_week"] = grid["floor_hour"].dt.dayofweek.astype(np.int8)
    grid["month"]       = grid["floor_hour"].dt.month.astype(np.int8)
    grid["is_weekend"]  = (grid["day_of_week"] >= 5).astype(np.int8)

    uk_hols = set(
        holidays.country_holidays("GB", subdiv="ENG", years=range(2024, 2028)).keys()
    )
    grid["is_holiday"] = (
        grid["floor_hour"].dt.normalize().isin(uk_hols).astype(np.int8)
    )

    # vectorised weather join (weather_df has 24 rows indexed 0–23)
    weather_arr = weather_df[
        ["weather_temperature", "weather_rain", "weather_wind", "condition"]
    ].values  # shape (24, 4)

    h = grid["h_offset"].values
    grid["weather_temperature"] = weather_arr[h, 0].astype(float)
    grid["weather_rain"]        = weather_arr[h, 1].astype(float)
    grid["weather_wind"]        = weather_arr[h, 2].astype(float)
    grid["condition"]           = weather_arr[h, 3]

    grid["condition_id"] = (
        pd.Series(grid["condition"]).map(cond_enc).fillna(0).astype(int).values
    )

    # historical base rate feature
    grid = grid.merge(
        base_rate,
        on=["ward_id", "type_id", "hour_of_day", "day_of_week"],
        how="left",
    )
    grid["base_rate"] = grid["base_rate"].fillna(0.0)

    return grid


# ── Predict and normalise ──────────────────────────────────────────────────────

def predict(grid: pd.DataFrame) -> pd.DataFrame:
    """
    Add expected_count and risk_score columns to grid.

    The model was trained on non-zero count cells only, so raw predictions are
    biased toward ≥1.  We correct by treating the raw output as a relative
    multiplier on top of the historical base rate:

        expected_count = base_rate × (raw_pred / mean_raw_pred_for_this_type)

    This gives ~0 for wards with no historical incidents and properly scales
    high-frequency wards up relative to low-frequency ones.
    """
    raw = model.predict(grid[FEATURES]).clip(0)
    grid["expected_count"] = 0.0

    for tid in range(len(INCIDENT_TYPES)):
        mask = (grid["type_id"] == tid).values
        type_raw = raw[mask]
        type_mean = type_raw.mean() if type_raw.size > 0 else 1.0
        # relative multiplier: >1 means conditions elevate risk above average
        correction = type_raw / (type_mean + 1e-8)
        base = grid.loc[mask, "base_rate"].values
        grid.loc[mask, "expected_count"] = base * correction

    grid["expected_count"] = grid["expected_count"].clip(0)

    # Global normalisation: risk_score=1.0 for the single highest ward-type-hour
    global_max = grid["expected_count"].max()
    grid["risk_score"] = (
        grid["expected_count"] / global_max if global_max > 0 else 0.0
    )

    return grid


# ── Assemble JSON ──────────────────────────────────────────────────────────────

def to_forecast_json(
    grid: pd.DataFrame,
    generated_at: datetime,
    district_filter: str = None,
) -> dict:
    coord_lut = ward_coords.set_index("ward_canonical")[["lat", "lon"]].to_dict("index")

    # Optional district/borough filter
    if district_filter:
        dl = district_filter.lower()
        # Match wards by borough name first, fall back to ward name substring
        allowed_wards = {
            wid for wname, wid in ward_enc.items()
            if dl in ward_to_borough.get(wname, "").lower() or dl in wname.lower()
        }
        grid = grid[grid["ward_id"].isin(allowed_wards)]

    preds = []
    for row in grid.itertuples(index=False):
        ward_name = ward_dec.get(int(row.ward_id), "unknown")
        coords    = coord_lut.get(ward_name, {"lat": 51.5, "lon": -0.1})
        preds.append({
            "ward_id":        ward_name,
            "ward_name":      ward_name,
            "hour":           int(row.h_offset),
            "incident_type":  type_dec.get(int(row.type_id), "unknown"),
            "risk_score":     round(float(row.risk_score), 4),
            "expected_count": round(float(row.expected_count), 4),
            "lat":            round(float(coords["lat"]), 5),
            "lon":            round(float(coords["lon"]), 5),
        })

    return {
        "generated_at":  generated_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "horizon_hours": 24,
        "predictions":   preds,
    }


# ── CLI ────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Generate 24h ward-level risk forecast")
    parser.add_argument("--demo",       action="store_true",
                        help="Bonfire Night scenario: 2024-11-05 18:00, rain + high wind")
    parser.add_argument("--date",       type=str, default=None,
                        help="Start datetime YYYY-MM-DD[THH] (default: now)")
    parser.add_argument("--district",   type=str, default=None,
                        help="Filter output to a single district/borough")
    parser.add_argument("--rain",       type=float, default=None)
    parser.add_argument("--wind",       type=float, default=None)
    parser.add_argument("--temp",       type=float, default=None)
    args = parser.parse_args()

    # ── Determine start time ──
    if args.demo:
        start_dt   = datetime(2024, 11, 5, 18, 0, 0)
        weather_df = make_synthetic_weather(start_dt, temperature=8, rain=1.5, wind=38.0,
                                             condition="rain")
        print("Demo mode: Bonfire Night 2024-11-05 18:00 | rain + high wind")
    elif args.date:
        start_dt = pd.to_datetime(args.date).to_pydatetime().replace(
            minute=0, second=0, microsecond=0
        )
        weather_df = _get_weather(start_dt, args)
    else:
        start_dt = datetime.now(timezone.utc).replace(
            tzinfo=None, minute=0, second=0, microsecond=0
        )
        weather_df = _get_weather(start_dt, args)

    print(f"Forecast start: {start_dt}  |  district: {args.district or 'all London'}")

    grid     = build_grid(start_dt, weather_df)
    grid     = predict(grid)
    forecast = to_forecast_json(grid, start_dt, district_filter=args.district)

    out_path = OUTPUT_DIR / "forecast_24h.json"
    with open(out_path, "w") as fh:
        json.dump(forecast, fh, indent=2)

    n = len(forecast["predictions"])
    risks = [p["risk_score"] for p in forecast["predictions"]]
    print(f"Wrote {n:,} predictions → {out_path}")
    print(f"Risk score: min={min(risks):.3f}  mean={np.mean(risks):.3f}  max={max(risks):.3f}")

    print("\nTop 5 by risk score:")
    top5 = sorted(forecast["predictions"], key=lambda p: p["risk_score"], reverse=True)[:5]
    for p in top5:
        print(f"  {p['ward_name'][:32]:32s}  {p['incident_type']:18s}  "
              f"h={p['hour']:2d}  risk={p['risk_score']:.3f}  E[n]={p['expected_count']:.2f}")


def _get_weather(start_dt: datetime, args) -> pd.DataFrame:
    if args.rain is not None or args.wind is not None or args.temp is not None:
        return make_synthetic_weather(
            start_dt,
            temperature=args.temp,
            rain=args.rain or 0.0,
            wind=args.wind or 15.0,
        )
    try:
        df = fetch_live_weather(start_dt)
        print("Live weather fetched from Open-Meteo")
        return df
    except Exception as exc:
        print(f"Weather fetch failed ({exc}), falling back to synthetic")
        return make_synthetic_weather(start_dt)


if __name__ == "__main__":
    main()
