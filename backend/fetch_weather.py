"""
fetch_weather.py

Fetches historical hourly weather for London from the Open-Meteo Archive API
(free, no API key required) and joins it to the cleaned LFB incident parquet files.

Usage:
    python backend/fetch_weather.py

Outputs:
    data/weather_london_hourly.parquet        raw hourly weather cache
    data/lfb_train_clean_weather.parquet      train set with weather columns added
    data/lfb_test_clean_weather.parquet       test set with weather columns added

New columns added to each parquet:
    weather_temperature   float   °C at 2m
    weather_rain          float   precipitation mm/hr
    weather_wind          float   wind speed km/h at 10m
    weather_condition     str     clear / cloudy / drizzle / rain / heavy_rain /
                                  snow / fog / thunder / unknown

Note on timezones: Open-Meteo is queried in UTC. LFB incident datetimes are
London local time (a mix of GMT in winter and BST=UTC+1 in summer). The join
is done on floored hours, so summer incidents will be off by ~1 hour vs UTC
weather. This is an acceptable approximation for a hackathon risk model.
"""

import time
import requests
import pandas as pd
from pathlib import Path

LAT = 51.5074
LON = -0.1278
BASE_URL = "https://archive-api.open-meteo.com/v1/archive"

# WMO weathercode → plain-English condition bucket
WEATHERCODE_MAP = {
    0: "clear",
    1: "clear",   2: "cloudy",  3: "cloudy",
    45: "fog",    48: "fog",
    51: "drizzle", 53: "drizzle", 55: "drizzle",
    56: "drizzle", 57: "drizzle",
    61: "rain",   63: "rain",   65: "heavy_rain",
    66: "rain",   67: "heavy_rain",
    71: "snow",   73: "snow",   75: "snow",   77: "snow",
    80: "rain",   81: "rain",   82: "heavy_rain",
    85: "snow",   86: "snow",
    95: "thunder", 96: "thunder", 99: "thunder",
}


def fetch_year(year: int) -> pd.DataFrame:
    """Fetch one calendar year of hourly London weather from Open-Meteo."""
    params = {
        "latitude": LAT,
        "longitude": LON,
        "start_date": f"{year}-01-01",
        "end_date": f"{year}-12-31",
        "hourly": "temperature_2m,precipitation,windspeed_10m,weathercode",
        "timezone": "UTC",
        "wind_speed_unit": "kmh",
    }
    resp = requests.get(BASE_URL, params=params, timeout=60)
    resp.raise_for_status()
    hourly = resp.json()["hourly"]
    df = pd.DataFrame(hourly)
    df["time"] = pd.to_datetime(df["time"])
    return df


def fetch_all_weather(start_year: int, end_year: int) -> pd.DataFrame:
    """Fetch and concatenate weather for a range of years."""
    frames = []
    for year in range(start_year, end_year + 1):
        print(f"  {year}...", end=" ", flush=True)
        try:
            df = fetch_year(year)
            frames.append(df)
            print(f"{len(df):,} rows")
        except Exception as exc:
            print(f"FAILED: {exc}")
        time.sleep(0.4)  # polite rate-limiting
    return pd.concat(frames, ignore_index=True)


def map_condition(code) -> str:
    if pd.isna(code):
        return "unknown"
    return WEATHERCODE_MAP.get(int(code), "cloudy")


def build_weather_cache(cache_path: Path, start_year: int, end_year: int) -> pd.DataFrame:
    if cache_path.exists():
        print(f"Loading cached weather ({cache_path})...")
        return pd.read_parquet(cache_path)

    print(f"Fetching hourly London weather {start_year}–{end_year} from Open-Meteo...")
    raw = fetch_all_weather(start_year, end_year)

    raw.rename(columns={
        "time":           "hour_utc",
        "temperature_2m": "weather_temperature",
        "precipitation":  "weather_rain",
        "windspeed_10m":  "weather_wind",
        "weathercode":    "_wcode",
    }, inplace=True)

    raw["weather_condition"] = raw["_wcode"].apply(map_condition)
    raw.drop(columns=["_wcode"], inplace=True)

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    raw.to_parquet(cache_path, index=False)
    print(f"Cached {len(raw):,} rows → {cache_path}")
    return raw


def join_weather(incidents: pd.DataFrame, weather: pd.DataFrame) -> pd.DataFrame:
    """Left-join hourly weather onto incidents by flooring datetime to the hour."""
    weather_cols = ["hour_utc", "weather_temperature", "weather_rain",
                    "weather_wind", "weather_condition"]

    df = incidents.copy()
    df["_join_hour"] = df["datetime"].dt.floor("h")

    df = df.merge(
        weather[weather_cols].rename(columns={"hour_utc": "_join_hour"}),
        on="_join_hour",
        how="left",
    )
    df.drop(columns=["_join_hour"], inplace=True)
    return df


def main():
    data_dir = Path("data")
    cache_path = data_dir / "weather_london_hourly.parquet"

    weather = build_weather_cache(cache_path, start_year=2009, end_year=2026)

    for split in ("train", "test"):
        src = data_dir / f"lfb_{split}_clean.parquet"
        dst = data_dir / f"lfb_{split}_clean_weather.parquet"

        if not src.exists():
            print(f"\nSkipping {src.name} (not found)")
            continue

        print(f"\nJoining weather onto {src.name}...")
        df = pd.read_parquet(src)
        df = join_weather(df, weather)

        match_rate = df["weather_temperature"].notna().mean()
        print(f"  Rows: {len(df):,}  |  Weather match rate: {match_rate:.1%}")
        print(f"  Columns: {df.shape[1]}  (was {pd.read_parquet(src).shape[1]})")
        df.to_parquet(dst, index=False)
        print(f"  Saved → {dst}")

    print("\nAll done. Weather columns: weather_temperature, weather_rain, weather_wind, weather_condition")


if __name__ == "__main__":
    main()
