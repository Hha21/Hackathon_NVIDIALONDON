# Foresight for Fires

A locally-running spatiotemporal risk forecasting system for London Fire Brigade incidents, inspired by the NHS Foresight AI project (Kraljevic et al., *Lancet Digital Health* 2024). We treat each fire station's call history as a token sequence and train a GPT-2 scale causal language model from scratch to learn the statistical rhythm of London's fire incidents, producing a dynamic ward-level risk surface for the next 24 hours.

Built at NVIDIA Hack London. Track: **Urban Operations**.

---

## Project Overview

Rather than predicting individual fires (which is noise), the model learns the **intensity function** — the expected rate of incidents per ward per unit time — as a function of historical patterns, weather, and calendar context. Sampling many forward rollouts from the trained model gives a probabilistic 24-hour heatmap over London's wards, rendered as an interactive Three.js 3D surface.

A natural language interface on top allows a station commander to query the system in plain English, running entirely on DGX Spark hardware without cloud exposure.

---

## Data Sources

| Dataset | Source | Licence |
|---|---|---|
| LFB Incident Records 2009–present (~1.7M rows) | [London Datastore](https://data.london.gov.uk/dataset/london-fire-brigade-incident-records-em8xy/) | OGL v3 |
| Met Office MIDAS Open hourly weather | [CEDA Archive](https://catalogue.ceda.ac.uk) | OGL v3 |
| Index of Multiple Deprivation 2019 | [London Datastore](https://data.london.gov.uk) | OGL v3 |
| ONS Census 2021 LSOA tables | [ONS](https://www.ons.gov.uk) | OGL v3 |
| LFB Bonfire/Diwali/Halloween incident records | [London Datastore](https://data.london.gov.uk/dataset/incidents-occuring-around-diwali-halloween---bonfire-night/) | OGL v3 |

---

## Scheme of Work

```
Phase 0  Setup & environment                          ~30 min
Phase 1  Data cleaning                                ~1.5 hr
Phase 2  Tokenisation scheme                          ~1 hr
Phase 3  Windowing & dataset construction             ~30 min
Phase 4  Model definition & training                  ~1.5 hr (+ ~1 hr training time)
Phase 5  Inference & risk surface generation          ~1 hr
Phase 6  Evaluation                                   ~30 min
Phase 7  Three.js frontend (parallel from Phase 0)    ~3 hr
```

---

## Phase 1: Data Cleaning

This phase is the foundation for everything downstream. The tokenisation scheme, model vocabulary, and evaluation pipeline all depend on a clean, consistent dataframe. Lock this down before moving to Phase 2.

### 1.1 Raw Schema

The raw CSV has 38 columns. The fields we use and their known issues:

| Field | Use | Known Issues |
|---|---|---|
| `IncidentNumber` | Unique row ID | Some duplicates — drop |
| `DateOfCall` | Datetime base | Format `%d-%b-%y`, two-digit year |
| `TimeOfCall` | Datetime base | Combine with `DateOfCall` |
| `HourOfCall` | Derived feature | Redundant once datetime is parsed — keep as sanity check |
| `IncidentGroup` | Token: `GROUP` | 3 values: Fire, Special Service, False Alarm |
| `StopCodeDescription` | Token: `STOP` | ~8 values, e.g. Primary Fire, AFA, False Alarm Good Intent |
| `SpecialServiceType` | Token: `SVCTYPE` | ~20 values, only populated when `IncidentGroup = Special Service` |
| `PropertyCategory` | Token: `PROP` | 9 values — use this, not `PropertyType`, for v1 |
| `PropertyType` | Reference only | Hundreds of values with trailing whitespace — strip but defer |
| `IncGeo_BoroughName` | Token: `BOROUGH` | Clean, 33 values |
| `IncGeo_WardNameNew` | Token: `WARD` | Use this not `IncGeo_WardName` — accounts for 2018 boundary change |
| `Easting_rounded` / `Northing_rounded` | Spatial fallback | 50m BNG, always present; lat/long redacted for dwellings |
| `Latitude` / `Longitude` | Spatial (non-dwellings) | Null for ~53% of fire incidents (dwelling privacy redaction) |
| `IncidentStationGround` | Sequence key | 102 values — this is the "patient ID" |
| `FirstPumpArriving_AttendanceTime` | Feature | Seconds, some nulls |
| `NumPumpsAttending` | Feature | Integer |
| `NumCalls` | Feature | Integer |

### 1.2 Cleaning Steps

Run these in order. Each step has a validation check — do not skip these, as silent errors here corrupt the entire pipeline.

**Step 1: Load and inspect**
```python
import pandas as pd

df = pd.read_csv("lfb_incidents.csv", dtype=str, low_memory=False)
print(df.shape)           # expect ~1.7M rows, 38 cols
print(df.dtypes)
print(df.head(3))
```

Load everything as strings initially so that literal `"NULL"` values are visible before coercion.

**Step 2: Replace literal nulls**
```python
df.replace("NULL", pd.NA, inplace=True)
df.replace("", pd.NA, inplace=True)
```

Literal `"NULL"` strings appear throughout the raw data and will silently persist as valid categorical values if not caught here.

**Step 3: Parse datetime**
```python
df["datetime"] = pd.to_datetime(
    df["DateOfCall"].str.strip() + " " + df["TimeOfCall"].str.strip(),
    format="%d-%b-%y %H:%M:%S"
)
df = df.sort_values("datetime").reset_index(drop=True)
```

Validate:
```python
assert df["datetime"].isna().sum() == 0, "Unparsed datetimes"
assert df["datetime"].min().year == 2009
assert df["datetime"].max().year >= 2024
```

**Step 4: Strip whitespace from categoricals**
```python
cat_cols = [
    "IncidentGroup", "StopCodeDescription", "SpecialServiceType",
    "PropertyCategory", "PropertyType", "IncGeo_BoroughName",
    "IncGeo_WardNameNew", "IncidentStationGround"
]
for col in cat_cols:
    df[col] = df[col].str.strip()
```

`PropertyType` is the main offender (`"Car "`, `"Lake/pond/reservoir "`).

**Step 5: Drop duplicates**
```python
before = len(df)
df = df.drop_duplicates(subset="IncidentNumber", keep="first")
print(f"Dropped {before - len(df)} duplicate IncidentNumbers")
```

**Step 6: Cast numeric fields**
```python
numeric_cols = [
    "HourOfCall", "Easting_m", "Northing_m",
    "Easting_rounded", "Northing_rounded",
    "FirstPumpArriving_AttendanceTime", "NumPumpsAttending",
    "NumStationsWithPumpsAttending", "NumCalls",
    "PumpMinutesRounded", "Notional Cost (£)"
]
for col in numeric_cols:
    df[col] = pd.to_numeric(df[col], errors="coerce")
```

**Step 7: Canonical geography**

Use `IncGeo_WardNameNew` throughout. Where missing, fall back to `IncGeo_BoroughName`. Log the fallback rate.
```python
df["ward_canonical"] = df["IncGeo_WardNameNew"].fillna(
    df["IncGeo_BoroughName"].apply(lambda x: f"BOROUGH:{x}" if pd.notna(x) else pd.NA)
)
fallback_rate = df["ward_canonical"].isna().mean()
print(f"Ward fallback rate: {fallback_rate:.2%}")  # expect <2%
```

**Step 8: Regime flags**

The data contains two structural breaks that the model must account for, otherwise temporal patterns around these dates will appear as noise.

```python
df["post_station_remap"] = (df["datetime"] >= "2014-01-10").astype(int)
df["post_grenfell"]      = (df["datetime"] >= "2017-06-14").astype(int)
```

These become static prefix tokens in the sequence.

**Step 9: Validate station coverage**
```python
station_counts = df.groupby("IncidentStationGround").size().sort_values()
print(station_counts.describe())
# expect min ~5000, median ~15000, max ~30000 across 102 stations
assert station_counts.min() > 1000, "Suspiciously low count for a station"
```

**Step 10: Temporal train/test split**

Hold out 2025 entirely as the test set. This ensures evaluation is genuinely forward-looking.
```python
df_train = df[df["datetime"] < "2025-01-01"].copy()
df_test  = df[df["datetime"] >= "2025-01-01"].copy()
print(f"Train: {len(df_train):,}  |  Test: {len(df_test):,}")
```

**Step 11: Save cleaned output**
```python
df_train.to_parquet("data/lfb_train_clean.parquet", index=False)
df_test.to_parquet("data/lfb_test_clean.parquet", index=False)
```

Parquet preserves dtypes, loads ~10x faster than CSV, and halves file size.

### 1.3 Validation Checklist

Before moving to Phase 2, confirm all of the following:

- [ ] No literal `"NULL"` strings remain in any column
- [ ] `datetime` is parsed for all rows with zero nulls
- [ ] 102 unique values in `IncidentStationGround`
- [ ] 33 unique values in `IncGeo_BoroughName`
- [ ] No trailing whitespace in any categorical field
- [ ] Duplicate `IncidentNumber` rows removed
- [ ] `df_train` ends before 2025-01-01, `df_test` starts from 2025-01-01
- [ ] Both parquet files written successfully

---

## Phase 2: Tokenisation Scheme

Coming next. The vocabulary covers five token families: `GAP`, `GROUP`, `STOP`, `PROP`, `WARD`, plus context prefix tokens for weather and calendar. Each incident maps to roughly 10–15 tokens; the full corpus is approximately 35M tokens.

---

## Phase 3–7

To be documented as work progresses.

---

## Repository Structure

```
foresight-for-fires/
├── data/
│   ├── raw/                  # original LFB CSV download
│   ├── lfb_train_clean.parquet
│   ├── lfb_test_clean.parquet
│   └── weather/              # MIDAS joined data
├── src/
│   ├── clean.py              # Phase 1 cleaning pipeline
│   ├── tokenise.py           # Phase 2 tokenisation
│   ├── dataset.py            # Phase 3 windowing and DataLoader
│   ├── model.py              # Phase 4 GPT-2 config and training
│   ├── infer.py              # Phase 5 rollout and risk surface
│   └── eval.py               # Phase 6 precision@K and PAI
├── frontend/
│   └── index.html            # Three.js ward map
├── notebooks/
│   └── 01_eda.ipynb          # Exploratory analysis and validation plots
├── README.md
└── requirements.txt
```

---

## Environment

```
python >= 3.10
torch >= 2.3
transformers >= 4.40
pandas >= 2.2
pyarrow
scikit-learn
matplotlib
```

On DGX Spark, use the NVIDIA PyTorch container as the base:
```bash
docker pull nvcr.io/nvidia/pytorch:24.04-py3
```