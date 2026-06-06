"""
Level 1 baseline risk model.

Pipeline:
  1. Load cleaned incident data (weather-enriched if available)
  2. Vectorised incident-type mapping → 4 canonical types
  3. Aggregate to sparse hourly counts per (floor_hour, ward, incident_type)
  4. Compute true historical base rate (incidents / total hours in training window)
  5. Add temporal + weather features
  6. Train LightGBM with Poisson objective (train on ≤2022, validate on 2023)
  7. Print MAE + top-k ward recall
  8. Save model artefact → models/fire_risk_model.pkl

Usage:
    python src/train_baseline.py
"""

import pickle
import warnings
import numpy as np
import pandas as pd
import lightgbm as lgb
import holidays
from pathlib import Path

warnings.filterwarnings("ignore", category=UserWarning)

# ── Config ─────────────────────────────────────────────────────────────────────

DATA_DIR  = Path("data")
MODEL_DIR = Path("models")
MODEL_DIR.mkdir(exist_ok=True)

TRAIN_END_YEAR = 2022
VAL_YEAR       = 2023

INCIDENT_TYPES = ["dwelling_fire", "outdoor_fire", "false_alarm", "special_service"]
WEATHER_CONDS  = ["clear", "cloudy", "drizzle", "rain", "heavy_rain",
                  "snow", "fog", "thunder", "unknown"]

DWELLING_PROPS = {
    "Dwelling", "House - single occupancy", "Flat/Maisonette",
    "Purpose Built Flat/Maisonette", "Converted Flat/Maisonette",
    "Sheltered Housing", "Hotel/Motel", "Hostel",
}

# ── 1. Load data ───────────────────────────────────────────────────────────────

weather_path = DATA_DIR / "lfb_train_clean_weather.parquet"
plain_path   = DATA_DIR / "lfb_train_clean.parquet"

if weather_path.exists():
    print("Loading weather-enriched training data...")
    df = pd.read_parquet(weather_path)
    HAS_WEATHER = True
else:
    print("Loading training data (no weather enrichment — run backend/fetch_weather.py for better accuracy)...")
    df = pd.read_parquet(plain_path)
    HAS_WEATHER = False

print(f"  {len(df):,} incidents  |  {df['datetime'].min().date()} → {df['datetime'].max().date()}")

# ── 2. Vectorised incident-type mapping ────────────────────────────────────────

is_false_alarm = df["IncidentGroup"] == "False Alarm"
is_special     = df["IncidentGroup"] == "Special Service"
is_secondary   = df["StopCodeDescription"] == "Secondary Fire"
is_dwelling    = df["PropertyCategory"].isin(DWELLING_PROPS)

df["incident_type"] = np.where(
    is_false_alarm, "false_alarm",
    np.where(is_special, "special_service",
    np.where(is_secondary, "outdoor_fire",
    np.where(is_dwelling,  "dwelling_fire",
                           "outdoor_fire"))))

print("Incident type distribution:")
for t, n in df["incident_type"].value_counts().items():
    print(f"  {t:22s}: {n:>8,}")

# ── 3. Ward coordinates ────────────────────────────────────────────────────────

# Coerce lat/lon to float (stored as string in parquet from clean.py)
df["Latitude"]  = pd.to_numeric(df["Latitude"],  errors="coerce")
df["Longitude"] = pd.to_numeric(df["Longitude"], errors="coerce")

# Prefer actual lat/lon (present for ~50% of rows); approximate rest from BNG
ward_latlon = (
    df[df["Latitude"].notna()]
    .groupby("ward_canonical")
    .agg(lat=("Latitude", "median"), lon=("Longitude", "median"))
    .reset_index()
)

missing = set(df["ward_canonical"].dropna().unique()) - set(ward_latlon["ward_canonical"])
if missing:
    bng = (
        df[df["ward_canonical"].isin(missing) & df["Easting_rounded"].notna()]
        .groupby("ward_canonical")
        .agg(e=("Easting_rounded", "median"), n=("Northing_rounded", "median"))
        .reset_index()
    )
    # Simple affine approximation for London (±0.01° accuracy)
    bng["lat"] = (bng["n"] - 286400) / 111_320 + 51.5
    bng["lon"] = (bng["e"] - 530_000) / (111_320 * np.cos(np.radians(51.5))) - 0.12
    ward_latlon = pd.concat(
        [ward_latlon, bng[["ward_canonical", "lat", "lon"]]], ignore_index=True
    )

# ── 4. Hourly counts (sparse) ──────────────────────────────────────────────────

df["floor_hour"] = df["datetime"].dt.floor("h")

# Grab one weather reading per hour before groupby drops those columns
if HAS_WEATHER:
    hourly_weather = (
        df[["floor_hour", "weather_temperature", "weather_rain",
            "weather_wind", "weather_condition"]]
        .drop_duplicates("floor_hour")
        .set_index("floor_hour")
    )

counts = (
    df.groupby(["floor_hour", "ward_canonical", "incident_type"])
    .size()
    .reset_index(name="count")
)
print(f"\nHourly count cells (non-zero): {len(counts):,}")

# ── 5. Temporal features ───────────────────────────────────────────────────────

uk_hols = set(
    holidays.country_holidays("GB", subdiv="ENG", years=range(2009, 2027)).keys()
)

counts["year"]        = counts["floor_hour"].dt.year
counts["month"]       = counts["floor_hour"].dt.month
counts["day_of_week"] = counts["floor_hour"].dt.dayofweek
counts["hour_of_day"] = counts["floor_hour"].dt.hour
counts["is_weekend"]  = (counts["day_of_week"] >= 5).astype(np.int8)
counts["is_holiday"]  = (
    counts["floor_hour"].dt.normalize().isin(uk_hols).astype(np.int8)
)

# ── 6. Weather features ────────────────────────────────────────────────────────

if HAS_WEATHER:
    counts = counts.join(hourly_weather, on="floor_hour")
    counts["weather_temperature"] = counts["weather_temperature"].fillna(12.0)
    counts["weather_rain"]        = counts["weather_rain"].fillna(0.0)
    counts["weather_wind"]        = counts["weather_wind"].fillna(15.0)
    counts["weather_condition"]   = counts["weather_condition"].fillna("cloudy")
else:
    # Seasonal approximation when weather data is absent
    _month_temp = {1:5,2:6,3:8,4:11,5:14,6:17,7:19,8:19,9:16,10:13,11:9,12:6}
    counts["weather_temperature"] = counts["month"].map(_month_temp).astype(float)
    counts["weather_rain"]        = 0.0
    counts["weather_wind"]        = 15.0
    counts["weather_condition"]   = "cloudy"

# ── 7. Encodings ───────────────────────────────────────────────────────────────

wards    = sorted(counts["ward_canonical"].unique())
ward_enc = {w: i for i, w in enumerate(wards)}
type_enc = {t: i for i, t in enumerate(INCIDENT_TYPES)}
cond_enc = {c: i for i, c in enumerate(WEATHER_CONDS)}

counts["ward_id"]      = counts["ward_canonical"].map(ward_enc).fillna(-1).astype(int)
counts["type_id"]      = counts["incident_type"].map(type_enc).fillna(0).astype(int)
counts["condition_id"] = counts["weather_condition"].map(cond_enc).fillna(0).astype(int)

# ── 8. True historical base rate ───────────────────────────────────────────────
# base_rate = total incidents / total possible hours in training window
# This properly accounts for zero-count hours in the denominator.

train_hours = pd.date_range("2009-01-01", f"{TRAIN_END_YEAR}-12-31 23:00", freq="h")
hod_dow_n = (
    pd.DataFrame({"hour_of_day": train_hours.hour, "day_of_week": train_hours.dayofweek})
    .groupby(["hour_of_day", "day_of_week"])
    .size()
    .reset_index(name="n_hours")
)

incident_totals = (
    counts[counts["year"] <= TRAIN_END_YEAR]
    .groupby(["ward_id", "type_id", "hour_of_day", "day_of_week"])["count"]
    .sum()
    .reset_index(name="total_count")
)
base_rate = incident_totals.merge(hod_dow_n, on=["hour_of_day", "day_of_week"])
base_rate["base_rate"] = base_rate["total_count"] / base_rate["n_hours"]
base_rate = base_rate[["ward_id", "type_id", "hour_of_day", "day_of_week", "base_rate"]]

counts = counts.merge(
    base_rate, on=["ward_id", "type_id", "hour_of_day", "day_of_week"], how="left"
)
counts["base_rate"] = counts["base_rate"].fillna(0.0)

# ── 9. Train / validation split ────────────────────────────────────────────────

FEATURES = [
    "ward_id", "type_id",
    "hour_of_day", "day_of_week", "month",
    "is_weekend", "is_holiday",
    "weather_temperature", "weather_rain", "weather_wind", "condition_id",
    "base_rate",
]

mask_train = counts["year"] <= TRAIN_END_YEAR
mask_val   = counts["year"] == VAL_YEAR

X_train, y_train = counts.loc[mask_train, FEATURES], counts.loc[mask_train, "count"]
X_val,   y_val   = counts.loc[mask_val,   FEATURES], counts.loc[mask_val,   "count"]

print(f"\nTrain: {len(X_train):,} rows  |  Val: {len(X_val):,} rows")

# ── 10. LightGBM training ──────────────────────────────────────────────────────

cat_features = ["ward_id", "type_id", "condition_id"]

dtrain = lgb.Dataset(
    X_train, label=y_train,
    categorical_feature=cat_features, free_raw_data=False
)
dval = lgb.Dataset(
    X_val, label=y_val,
    categorical_feature=cat_features, free_raw_data=False, reference=dtrain
)

params = {
    "objective":        "poisson",
    "metric":           "mae",
    "num_leaves":       127,
    "learning_rate":    0.05,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq":     5,
    "min_data_in_leaf": 20,
    "verbose":          -1,
    "n_jobs":           -1,
}

print("Training LightGBM (Poisson objective)...")
model = lgb.train(
    params,
    dtrain,
    num_boost_round=800,
    valid_sets=[dval],
    callbacks=[lgb.early_stopping(50, verbose=False), lgb.log_evaluation(100)],
)
print(f"Best iteration: {model.best_iteration}")

# ── 11. Validation metrics ─────────────────────────────────────────────────────

y_pred = model.predict(X_val)
mae = float(np.mean(np.abs(y_pred - y_val.values)))
print(f"\nValidation MAE (count/hr): {mae:.4f}")

# Top-10 ward recall
val_df = counts.loc[mask_val].copy()
val_df["pred"] = y_pred
ward_pred_total = val_df.groupby("ward_id")["pred"].sum()
ward_true_total = val_df.groupby("ward_id")["count"].sum()
top10_pred = set(ward_pred_total.nlargest(10).index)
top10_true = set(ward_true_total.nlargest(10).index)
overlap = len(top10_pred & top10_true)
pct_in_top10 = ward_true_total[list(top10_pred)].sum() / ward_true_total.sum()
print(f"Top-10 ward overlap: {overlap}/10")
print(f"Incidents captured in top-10 predicted wards: {pct_in_top10:.1%}")

# Feature importance
print("\nTop feature importances:")
fi = pd.Series(model.feature_importance(importance_type="gain"), index=FEATURES)
for feat, imp in fi.sort_values(ascending=False).head(8).items():
    print(f"  {feat:25s}: {imp:.0f}")

# ── 12. Save artefact ──────────────────────────────────────────────────────────

# Ward → borough mapping (for district filtering in forecast)
ward_to_borough = (
    df[df["IncGeo_BoroughName"].notna()]
    .groupby("ward_canonical")["IncGeo_BoroughName"]
    .agg(lambda x: x.mode()[0])
    .to_dict()
)

artefact = {
    "model":           model,
    "features":        FEATURES,
    "ward_enc":        ward_enc,
    "type_enc":        type_enc,
    "cond_enc":        cond_enc,
    "base_rate":       base_rate,
    "ward_coords":     ward_latlon,
    "ward_to_borough": ward_to_borough,
    "has_weather":     HAS_WEATHER,
    "val_mae":         mae,
    "incident_types":  INCIDENT_TYPES,
}
out_path = MODEL_DIR / "fire_risk_model.pkl"
with open(out_path, "wb") as f:
    pickle.dump(artefact, f)

print(f"\nSaved → {out_path}")
