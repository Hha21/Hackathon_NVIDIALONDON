"""
Phase 1: Data cleaning pipeline.

Loads the three raw LFB incident files (2009-2017 CSV, 2018-2023 XLSX,
2024+ XLSX), cleans and merges them, and writes train/test parquet files.
"""

import sys
import pandas as pd

DATA_DIR = "data"

# ── 1. Load & concatenate ─────────────────────────────────────────────────────

print("Loading raw files...")

df_csv = pd.read_csv(
    f"{DATA_DIR}/LFB Incident data from 2009 - 2017.csv",
    dtype=str,
    low_memory=False,
)

df_xlsx1 = pd.read_excel(
    f"{DATA_DIR}/LFB Incident data from 2018 - 2023.xlsx",
    dtype=str,
)

df_xlsx2 = pd.read_excel(
    f"{DATA_DIR}/LFB Incident data from 2024 onwards.xlsx",
    dtype=str,
)

print(f"  2009-2017 CSV : {len(df_csv):>10,} rows")
print(f"  2018-2023 XLSX: {len(df_xlsx1):>10,} rows")
print(f"  2024+     XLSX: {len(df_xlsx2):>10,} rows")

df = pd.concat([df_csv, df_xlsx1, df_xlsx2], ignore_index=True)
print(f"  Combined      : {len(df):>10,} rows")

# ── 2. Replace literal nulls ──────────────────────────────────────────────────

df.replace("NULL", pd.NA, inplace=True)
df.replace("", pd.NA, inplace=True)

# ── 3. Parse datetime ─────────────────────────────────────────────────────────
#
# CSV DateOfCall:  "01-Jan-09"            → parse with %d-%b-%y
# XLSX DateOfCall: "2018-01-01 00:00:00"  → strip to date part only
#
# TimeOfCall is always "HH:MM:SS" across all files.

def parse_datetime(row):
    doc = str(row["DateOfCall"]).strip()
    toc = str(row["TimeOfCall"]).strip()
    # XLSX dates arrive as "YYYY-MM-DD HH:MM:SS" — keep only the date portion
    if len(doc) > 10 and doc[4] == "-":
        doc = doc[:10]
        return pd.to_datetime(doc + " " + toc, format="%Y-%m-%d %H:%M:%S", errors="coerce")
    else:
        return pd.to_datetime(doc + " " + toc, format="%d-%b-%y %H:%M:%S", errors="coerce")

print("Parsing datetimes...")

# Parse each file's datetimes vectorially before the concat so we avoid
# a slow row-by-row apply on ~2M rows.
#
# CSV:  DateOfCall = "01-Jan-09"              → format %d-%b-%y
# XLSX: DateOfCall = "2018-01-01 00:00:00"    → date part is first 10 chars

def _parse_dt(doc_series: pd.Series, toc_series: pd.Series, fmt: str) -> pd.Series:
    return pd.to_datetime(
        doc_series.str.strip() + " " + toc_series.str.strip(),
        format=fmt,
        errors="coerce",
    )

df_csv["datetime"]   = _parse_dt(df_csv["DateOfCall"], df_csv["TimeOfCall"], "%d-%b-%y %H:%M:%S")
df_xlsx1["datetime"] = _parse_dt(df_xlsx1["DateOfCall"].str[:10], df_xlsx1["TimeOfCall"], "%Y-%m-%d %H:%M:%S")
df_xlsx2["datetime"] = _parse_dt(df_xlsx2["DateOfCall"].str[:10], df_xlsx2["TimeOfCall"], "%Y-%m-%d %H:%M:%S")

df = pd.concat([df_csv, df_xlsx1, df_xlsx2], ignore_index=True)
print(f"  Combined after parse: {len(df):,} rows")

unparsed = df["datetime"].isna().sum()
if unparsed > 0:
    print(f"  WARNING: {unparsed} unparsed datetimes — sample rows:")
    print(df[df["datetime"].isna()][["DateOfCall", "TimeOfCall"]].head(5))

assert df["datetime"].isna().sum() == 0, f"Unparsed datetimes: {unparsed}"
assert df["datetime"].min().year == 2009, f"Unexpected min year: {df['datetime'].min().year}"
assert df["datetime"].max().year >= 2024, f"Unexpected max year: {df['datetime'].max().year}"

df = df.sort_values("datetime").reset_index(drop=True)
print(f"  Date range: {df['datetime'].min()} → {df['datetime'].max()}")

# ── 4. Strip whitespace from categoricals ─────────────────────────────────────

cat_cols = [
    "IncidentGroup", "StopCodeDescription", "SpecialServiceType",
    "PropertyCategory", "PropertyType", "IncGeo_BoroughName",
    "IncGeo_WardNameNew", "IncidentStationGround",
]
for col in cat_cols:
    if col in df.columns:
        df[col] = df[col].str.strip()

# ── 5. Drop duplicate IncidentNumbers ────────────────────────────────────────

before = len(df)
df = df.drop_duplicates(subset="IncidentNumber", keep="first")
print(f"Dropped {before - len(df):,} duplicate IncidentNumbers")

# ── 6. Cast numeric fields ────────────────────────────────────────────────────

numeric_cols = [
    "HourOfCall", "Easting_m", "Northing_m",
    "Easting_rounded", "Northing_rounded",
    "FirstPumpArriving_AttendanceTime", "NumPumpsAttending",
    "NumStationsWithPumpsAttending", "NumCalls",
    "PumpMinutesRounded", "Notional Cost (£)",
]
for col in numeric_cols:
    if col in df.columns:
        df[col] = pd.to_numeric(df[col], errors="coerce")

# ── 7. Canonical geography ────────────────────────────────────────────────────

df["ward_canonical"] = df["IncGeo_WardNameNew"].fillna(
    df["IncGeo_BoroughName"].apply(
        lambda x: f"BOROUGH:{x}" if pd.notna(x) else pd.NA
    )
)
fallback_rate = df["ward_canonical"].isna().mean()
print(f"Ward fallback rate: {fallback_rate:.2%}  (expect <2%)")

# ── 8. Regime flags ───────────────────────────────────────────────────────────

df["post_station_remap"] = (df["datetime"] >= "2014-01-10").astype(int)
df["post_grenfell"]      = (df["datetime"] >= "2017-06-14").astype(int)

# ── 9. Validate station coverage ──────────────────────────────────────────────

station_counts = df.groupby("IncidentStationGround").size().sort_values()

# Drop geographic catch-all labels that appear in the station field
# (e.g. "Beyond Home Counties" with a single incident).
invalid_stations = station_counts[station_counts < 100].index.tolist()
if invalid_stations:
    print(f"  Dropping {len(invalid_stations)} non-station value(s): {invalid_stations}")
    df = df[~df["IncidentStationGround"].isin(invalid_stations)].reset_index(drop=True)
    station_counts = df.groupby("IncidentStationGround").size().sort_values()

n_stations = len(station_counts)
print(f"Stations: {n_stations}  (expect ~102)")
print(f"  min={station_counts.min():,}  median={station_counts.median():,.0f}  max={station_counts.max():,}")
assert station_counts.min() > 1000, f"Suspiciously low count: {station_counts.idxmin()} = {station_counts.min()}"

# ── 10. Temporal train/test split ─────────────────────────────────────────────

df_train = df[df["datetime"] < "2025-01-01"].copy()
df_test  = df[df["datetime"] >= "2025-01-01"].copy()
print(f"Train: {len(df_train):,}  |  Test: {len(df_test):,}")

# ── 11. Save ──────────────────────────────────────────────────────────────────

df_train.to_parquet(f"{DATA_DIR}/lfb_train_clean.parquet", index=False)
df_test.to_parquet(f"{DATA_DIR}/lfb_test_clean.parquet", index=False)
print("Saved: data/lfb_train_clean.parquet  data/lfb_test_clean.parquet")

# ── Validation checklist ──────────────────────────────────────────────────────

print("\n── Validation ────────────────────────────────────────────────────────")

def check(label, cond):
    status = "PASS" if cond else "FAIL"
    print(f"  [{status}] {label}")
    if not cond:
        sys.exit(1)

check("No literal NULL strings",
      not any((df[c] == "NULL").any() for c in df.select_dtypes(include="str").columns))
check("datetime has zero nulls", df["datetime"].isna().sum() == 0)
check("IncidentStationGround: ~102 values", 90 <= n_stations <= 115)
check("IncGeo_BoroughName: ~33 values",
      20 <= df["IncGeo_BoroughName"].nunique() <= 40)
check("No trailing whitespace in IncidentGroup",
      not df["IncidentGroup"].dropna().str.contains(r"\s$").any())
check("df_train ends before 2025-01-01", df_train["datetime"].max() < pd.Timestamp("2025-01-01"))
check("df_test starts from 2025-01-01", len(df_test) == 0 or df_test["datetime"].min() >= pd.Timestamp("2025-01-01"))

print("\nAll checks passed.")
