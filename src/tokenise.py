"""
Phase 2: Tokenisation scheme.

Converts cleaned LFB incident records into integer token sequences,
one sequence per station (sorted by datetime).

Per-incident encoding (6 tokens in this order):
    <DT_xxx>        time gap from previous incident at this station
    <STATION_xxx>   fire station ground
    <WARD_xxx>      ward canonical name
    <TYPE_xxx>      canonical incident type (4 values)
    <STOP_xxx>      stop code description (10 values)
    <PROP_xxx>      property category (9 values)

Context prefix tokens (NOT stored here — prepended per window in Phase 3):
    <POST_STATION_REMAP>  <POST_GRENFELL>    (regime flags, 0-2)
    <TEMP_xxx>  <RAIN_xxx>  <WIND_xxx>       (weather buckets)
    <DOW_xxx>   <HOUR_xxx>  <MONTH_xxx>      (calendar)

Outputs:
    data/processed/vocab.json                token_string → int id
    data/processed/station_sequences.npz     dict station → int16 token array
    data/processed/sequence_meta.parquet     per-station stats for windowing
"""

import json
import pickle
import numpy as np
import pandas as pd
from pathlib import Path

DATA_DIR  = Path("data")
OUT_DIR   = DATA_DIR / "processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Incident-type mapping (same as train_baseline.py) ─────────────────────────

DWELLING_PROPS = {
    "Dwelling", "House - single occupancy", "Flat/Maisonette",
    "Purpose Built Flat/Maisonette", "Converted Flat/Maisonette",
    "Sheltered Housing", "Hotel/Motel", "Hostel",
}

def map_incident_type(group, stop, prop):
    if group == "False Alarm":
        return "false_alarm"
    if group == "Special Service":
        return "special_service"
    if stop == "Secondary Fire":
        return "outdoor_fire"
    if prop in DWELLING_PROPS:
        return "dwelling_fire"
    return "outdoor_fire"

# ── GAP bucket thresholds (minutes) ───────────────────────────────────────────

# Designed from the actual gap distribution in LFB training data:
#   p10=29min  p25=90min  p50=257min  p75=644min  p90=1190min  p99=2880min
GAP_BINS   = [0, 5, 15, 30, 60, 120, 240, 480, 1440, 2880]
GAP_TOKENS = [
    "DT_5MIN",   # 0 – 5 min
    "DT_15MIN",  # 5 – 15 min
    "DT_30MIN",  # 15 – 30 min
    "DT_1H",     # 30 – 60 min
    "DT_2H",     # 1 – 2 h
    "DT_4H",     # 2 – 4 h
    "DT_8H",     # 4 – 8 h
    "DT_1D",     # 8 – 24 h
    "DT_2D",     # 1 – 2 d
    "DT_LONG",   # > 2 d (or first incident in station history)
]

def gap_to_token(gap_minutes: float) -> str:
    if pd.isna(gap_minutes) or gap_minutes < 0:
        return "DT_LONG"
    for threshold, name in zip(GAP_BINS[1:], GAP_TOKENS):
        if gap_minutes < threshold:
            return name
    return "DT_LONG"

# ── Weather bucket helpers (used to build vocab; bucketing applied in Phase 3) ─

TEMP_TOKENS  = ["TEMP_FREEZING", "TEMP_COLD", "TEMP_MILD", "TEMP_WARM", "TEMP_HOT"]
RAIN_TOKENS  = ["RAIN_NONE", "RAIN_LIGHT", "RAIN_MOD", "RAIN_HEAVY"]
WIND_TOKENS  = ["WIND_CALM", "WIND_BREEZY", "WIND_STRONG", "WIND_STORM"]
DOW_TOKENS   = ["DOW_MON", "DOW_TUE", "DOW_WED", "DOW_THU", "DOW_FRI", "DOW_SAT", "DOW_SUN"]
HOUR_TOKENS  = [f"HOUR_{h}" for h in range(24)]
MONTH_TOKENS = ["MONTH_JAN","MONTH_FEB","MONTH_MAR","MONTH_APR","MONTH_MAY","MONTH_JUN",
                "MONTH_JUL","MONTH_AUG","MONTH_SEP","MONTH_OCT","MONTH_NOV","MONTH_DEC"]
REGIME_TOKENS = ["POST_STATION_REMAP", "POST_GRENFELL"]

# Bucketing functions (used in Phase 3 context prefix construction)
def temp_token(t: float) -> str:
    if t <= 0:   return "TEMP_FREEZING"
    if t <= 8:   return "TEMP_COLD"
    if t <= 15:  return "TEMP_MILD"
    if t <= 20:  return "TEMP_WARM"
    return "TEMP_HOT"

def rain_token(r: float) -> str:
    if r <= 0:   return "RAIN_NONE"
    if r <= 1:   return "RAIN_LIGHT"
    if r <= 4:   return "RAIN_MOD"
    return "RAIN_HEAVY"

def wind_token(w: float) -> str:
    if w < 10:   return "WIND_CALM"
    if w < 25:   return "WIND_BREEZY"
    if w < 40:   return "WIND_STRONG"
    return "WIND_STORM"

# ── Build vocabulary ──────────────────────────────────────────────────────────

def build_vocab(
    stations: list[str],
    wards: list[str],
    stop_codes: list[str],
    prop_cats: list[str],
) -> dict[str, int]:
    """
    Assign integer IDs to every token string.
    IDs are contiguous and deterministic (sorted within each family).
    """
    tokens = []

    # Special tokens — fixed positions 0-3
    tokens += ["<PAD>", "<BOS>", "<EOS>", "<UNK>"]

    # Regime prefix
    tokens += [f"<{t}>" for t in REGIME_TOKENS]

    # Gap / time-delta
    tokens += [f"<{t}>" for t in GAP_TOKENS]

    # Station
    tokens += [f"<STATION_{s.upper().replace(' ', '_')}>" for s in sorted(stations)]

    # Ward (sorted for determinism)
    tokens += [f"<WARD_{w.upper().replace(' ', '_').replace(':', '_')}>" for w in sorted(wards)]

    # Canonical incident type
    tokens += ["<TYPE_DWELLING_FIRE>", "<TYPE_OUTDOOR_FIRE>",
               "<TYPE_FALSE_ALARM>",   "<TYPE_SPECIAL_SERVICE>"]

    # Stop code (normalised)
    tokens += [f"<STOP_{s.upper().replace(' ', '_').replace('-', '_').replace('/', '_')}>"
               for s in sorted(stop_codes)]
    tokens.append("<STOP_OTHER>")

    # Property category
    tokens += [f"<PROP_{p.upper().replace(' ', '_').replace('/', '_').replace('-', '_')}>"
               for p in sorted(prop_cats)]
    tokens.append("<PROP_UNKNOWN>")

    # Weather context tokens (used in Phase 3)
    tokens += [f"<{t}>" for t in TEMP_TOKENS]
    tokens += [f"<{t}>" for t in RAIN_TOKENS]
    tokens += [f"<{t}>" for t in WIND_TOKENS]
    tokens += [f"<{t}>" for t in DOW_TOKENS]
    tokens += [f"<{t}>" for t in HOUR_TOKENS]
    tokens += [f"<{t}>" for t in MONTH_TOKENS]

    # Deduplicate while preserving order (Python 3.7+ dict preserves insertion order)
    seen = {}
    for i, tok in enumerate(tokens):
        if tok not in seen:
            seen[tok] = len(seen)
    return seen  # token_string → int id


# ── Tokenise a station's incident sequence ────────────────────────────────────

def tokenise_station(
    station_df: pd.DataFrame,
    vocab: dict[str, int],
    stop_norm: dict[str, str],
    prop_norm: dict[str, str],
) -> np.ndarray:
    """
    Convert one station's incident DataFrame (sorted by datetime) into a
    flat int16 token array.  Each incident produces exactly 6 tokens.
    """
    UNK = vocab["<UNK>"]
    BOS = vocab["<BOS>"]
    EOS = vocab["<EOS>"]

    rows = []
    prev_dt = None

    for row in station_df.itertuples(index=False):
        dt  = row.datetime
        gap_min = (dt - prev_dt).total_seconds() / 60 if prev_dt is not None else None
        prev_dt = dt

        # 1. GAP token
        dt_key = f"<{gap_to_token(gap_min)}>"
        t_gap = vocab.get(dt_key, UNK)

        # 2. STATION token
        station_key = f"<STATION_{row.IncidentStationGround.upper().replace(' ', '_')}>"
        t_station = vocab.get(station_key, UNK)

        # 3. WARD token
        ward = row.ward_canonical if pd.notna(row.ward_canonical) else ""
        ward_key = f"<WARD_{ward.upper().replace(' ', '_').replace(':', '_')}>"
        t_ward = vocab.get(ward_key, UNK)

        # 4. TYPE token
        inc_type = map_incident_type(row.IncidentGroup, row.StopCodeDescription, row.PropertyCategory)
        type_key = f"<TYPE_{inc_type.upper()}>"
        t_type = vocab.get(type_key, UNK)

        # 5. STOP token
        stop_raw = row.StopCodeDescription if pd.notna(row.StopCodeDescription) else ""
        stop_key = stop_norm.get(stop_raw, "<STOP_OTHER>")
        t_stop = vocab.get(stop_key, UNK)

        # 6. PROP token
        prop_raw = row.PropertyCategory if pd.notna(row.PropertyCategory) else ""
        prop_key = prop_norm.get(prop_raw, "<PROP_UNKNOWN>")
        t_prop = vocab.get(prop_key, UNK)

        rows.extend([t_gap, t_station, t_ward, t_type, t_stop, t_prop])

    return np.array(rows, dtype=np.int16)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    # ── Load data ──────────────────────────────────────────────────────────────
    weather_path = DATA_DIR / "lfb_train_clean_weather.parquet"
    plain_path   = DATA_DIR / "lfb_train_clean.parquet"
    src = weather_path if weather_path.exists() else plain_path
    print(f"Loading {src.name} ...")
    df = pd.read_parquet(src)
    print(f"  {len(df):,} incidents")

    # Also load test set so vocab covers it too
    test_src = DATA_DIR / "lfb_test_clean_weather.parquet"
    if not test_src.exists():
        test_src = DATA_DIR / "lfb_test_clean.parquet"
    df_test = pd.read_parquet(test_src)
    df_all  = pd.concat([df, df_test], ignore_index=True)
    print(f"  + {len(df_test):,} test incidents  →  {len(df_all):,} total")

    # ── Collect vocabulary source values ──────────────────────────────────────
    stations  = sorted(df_all["IncidentStationGround"].dropna().unique().tolist())
    wards     = sorted(df_all["ward_canonical"].dropna().unique().tolist())
    stop_vals = sorted(df_all["StopCodeDescription"].dropna().unique().tolist())
    prop_vals = sorted(df_all["PropertyCategory"].dropna().unique().tolist())

    # Normalised lookup for stop codes → vocab key
    stop_norm = {
        s: f"<STOP_{s.upper().replace(' ', '_').replace('-', '_').replace('/', '_')}>"
        for s in stop_vals
    }
    prop_norm = {
        p: f"<PROP_{p.upper().replace(' ', '_').replace('/', '_').replace('-', '_')}>"
        for p in prop_vals
    }

    # ── Build vocabulary ──────────────────────────────────────────────────────
    vocab = build_vocab(stations, wards, stop_vals, prop_vals)
    print(f"\nVocabulary: {len(vocab):,} tokens")
    print(f"  Special  : 4")
    print(f"  Regime   : 2")
    print(f"  GAP      : {len(GAP_TOKENS)}")
    print(f"  Station  : {len(stations)}")
    print(f"  Ward     : {len(wards)}")
    print(f"  Type     : 4")
    print(f"  Stop     : {len(stop_vals) + 1}")
    print(f"  Prop     : {len(prop_vals) + 1}")
    print(f"  Weather  : {len(TEMP_TOKENS)+len(RAIN_TOKENS)+len(WIND_TOKENS)}")
    print(f"  Calendar : {len(DOW_TOKENS)+len(HOUR_TOKENS)+len(MONTH_TOKENS)}")

    vocab_path = OUT_DIR / "vocab.json"
    with open(vocab_path, "w") as f:
        json.dump(vocab, f, indent=2)
    print(f"\nSaved vocab → {vocab_path}")

    # ── Tokenise training sequences ───────────────────────────────────────────
    print("\nTokenising training sequences by station ...")
    df_sorted = df.sort_values(["IncidentStationGround", "datetime"])

    sequences  = {}   # station → int16 array
    meta_rows  = []

    for station, grp in df_sorted.groupby("IncidentStationGround", sort=False):
        tokens = tokenise_station(grp, vocab, stop_norm, prop_norm)
        sequences[station] = tokens
        meta_rows.append({
            "station":     station,
            "n_incidents": len(grp),
            "n_tokens":    len(tokens),
            "start_date":  grp["datetime"].min(),
            "end_date":    grp["datetime"].max(),
        })

    # ── Tokenise test sequences ───────────────────────────────────────────────
    print("Tokenising test sequences ...")
    df_test_sorted = df_test.sort_values(["IncidentStationGround", "datetime"])
    test_sequences = {}
    for station, grp in df_test_sorted.groupby("IncidentStationGround", sort=False):
        test_sequences[station] = tokenise_station(grp, vocab, stop_norm, prop_norm)

    # ── Save sequences ────────────────────────────────────────────────────────
    seq_path      = OUT_DIR / "station_sequences.npz"
    test_seq_path = OUT_DIR / "station_sequences_test.npz"
    np.savez_compressed(seq_path,      **sequences)
    np.savez_compressed(test_seq_path, **test_sequences)
    print(f"Saved train sequences → {seq_path}")
    print(f"Saved test  sequences → {test_seq_path}")

    # ── Save metadata ──────────────────────────────────────────────────────────
    meta = pd.DataFrame(meta_rows).sort_values("n_tokens", ascending=False)
    meta_path = OUT_DIR / "sequence_meta.parquet"
    meta.to_parquet(meta_path, index=False)

    # ── Statistics ────────────────────────────────────────────────────────────
    total_tokens   = sum(len(v) for v in sequences.values())
    total_tokens_t = sum(len(v) for v in test_sequences.values())

    print(f"\n── Statistics ─────────────────────────────────────────────────")
    print(f"  Training tokens : {total_tokens:>12,}  (~{total_tokens/1e6:.1f}M)")
    print(f"  Test tokens     : {total_tokens_t:>12,}  (~{total_tokens_t/1e6:.1f}M)")
    print(f"  Tokens/incident : {total_tokens / len(df):.1f}")
    print(f"  Stations        : {len(sequences)}")
    print(f"\n  Token sequence lengths (per station):")
    lens = [len(v) for v in sequences.values()]
    for pct in [0, 25, 50, 75, 95, 100]:
        print(f"    p{pct:3d}: {np.percentile(lens, pct):>8,.0f}")

    print(f"\n  Sample tokens from Lewisham (first 30):")
    inv_vocab = {v: k for k, v in vocab.items()}
    sample_station = next((s for s in sequences if "lewisham" in s.lower()), stations[0])
    toks = sequences[sample_station][:30]
    print(f"  {' '.join(inv_vocab[t] for t in toks)}")

    print(f"\n── Validation ──────────────────────────────────────────────────")
    assert vocab["<PAD>"] == 0, "PAD must be 0"
    assert vocab["<BOS>"] == 1, "BOS must be 1"
    assert vocab["<EOS>"] == 2, "EOS must be 2"
    assert all(len(v) % 6 == 0 for v in sequences.values()), \
        "All station sequences must be a multiple of 6 tokens"
    assert len(vocab) < 32768, f"Vocab {len(vocab)} exceeds int16 range"
    print("  [PASS] PAD=0, BOS=1, EOS=2")
    print("  [PASS] All sequences are multiples of 6 tokens")
    print(f"  [PASS] Vocab size {len(vocab)} fits in int16")
    print("\nTokenisation complete.")


if __name__ == "__main__":
    main()
