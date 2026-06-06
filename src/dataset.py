"""
Phase 3: Windowing & Dataset construction.

Reads per-station token sequences (Phase 2) and builds PyTorch Datasets of
fixed-length sliding windows for causal LM training.

Each window layout  (seq_len tokens total):
    ┌─────────────── context prefix (PREFIX_LEN = 8) ───────────────┐
    │ <BOS>  <REGIME>  <TEMP_x>  <RAIN_x>  <WIND_x>  <DOW_x>       │
    │ <HOUR_x>  <MONTH_x>                                            │
    └───────────────────────────────────────────────────────────────┘
    ┌───────────── incident tokens (seq_len - 8) ────────────────────┐
    │ <DT> <STATION> <WARD> <TYPE> <STOP> <PROP>  × n_incidents      │
    └───────────────────────────────────────────────────────────────┘

Causal LM objective:
    input  = window[:-1]   shape (seq_len - 1,)
    target = window[1:]    shape (seq_len - 1,)

Usage:
    from src.dataset import build_dataloaders
    train_dl, val_dl, meta = build_dataloaders(seq_len=256, batch_size=32)

Standalone validation:
    python src/dataset.py
"""

import json
import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset, DataLoader
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────────

DATA_DIR    = Path("data")
PROC_DIR    = DATA_DIR / "processed"
VOCAB_PATH  = PROC_DIR / "vocab.json"
TRAIN_SEQ   = PROC_DIR / "station_sequences.npz"
TEST_SEQ    = PROC_DIR / "station_sequences_test.npz"
WEATHER_PATH = DATA_DIR / "weather_london_hourly.parquet"

PREFIX_LEN = 8   # fixed context prefix length (tokens)

# ── Token helpers (must match tokenise.py) ────────────────────────────────────

def _temp_token(t: float) -> str:
    if t <= 0:  return "<TEMP_FREEZING>"
    if t <= 8:  return "<TEMP_COLD>"
    if t <= 15: return "<TEMP_MILD>"
    if t <= 20: return "<TEMP_WARM>"
    return "<TEMP_HOT>"

def _rain_token(r: float) -> str:
    if r <= 0:  return "<RAIN_NONE>"
    if r <= 1:  return "<RAIN_LIGHT>"
    if r <= 4:  return "<RAIN_MOD>"
    return "<RAIN_HEAVY>"

def _wind_token(w: float) -> str:
    if w < 10:  return "<WIND_CALM>"
    if w < 25:  return "<WIND_BREEZY>"
    if w < 40:  return "<WIND_STRONG>"
    return "<WIND_STORM>"

_DOW_TOKENS   = ["<DOW_MON>","<DOW_TUE>","<DOW_WED>","<DOW_THU>",
                 "<DOW_FRI>","<DOW_SAT>","<DOW_SUN>"]
_MONTH_TOKENS = ["<MONTH_JAN>","<MONTH_FEB>","<MONTH_MAR>","<MONTH_APR>",
                 "<MONTH_MAY>","<MONTH_JUN>","<MONTH_JUL>","<MONTH_AUG>",
                 "<MONTH_SEP>","<MONTH_OCT>","<MONTH_NOV>","<MONTH_DEC>"]

# Regime breakpoints (inclusive lower bound)
_REMAP_DATE    = pd.Timestamp("2014-01-10")
_GRENFELL_DATE = pd.Timestamp("2017-06-14")

# ── Shared loaders (cached at module level) ───────────────────────────────────

_vocab: dict[str, int] | None = None
_weather_lut: dict | None = None


def load_vocab() -> dict[str, int]:
    global _vocab
    if _vocab is None:
        with open(VOCAB_PATH) as f:
            _vocab = json.load(f)
    return _vocab


def load_weather_lut() -> dict:
    """
    Returns a dict  pd.Timestamp (floor-hour) → (temp_id, rain_id, wind_id)
    for fast O(1) context-prefix lookup.
    """
    global _weather_lut
    if _weather_lut is not None:
        return _weather_lut

    vocab = load_vocab()
    PAD = vocab["<PAD>"]

    if WEATHER_PATH.exists():
        wdf = pd.read_parquet(WEATHER_PATH)
        lut = {}
        for row in wdf.itertuples(index=False):
            key = pd.Timestamp(row.hour_utc).floor("h")
            lut[key] = (
                vocab.get(_temp_token(row.weather_temperature), PAD),
                vocab.get(_rain_token(row.weather_rain),        PAD),
                vocab.get(_wind_token(row.weather_wind),        PAD),
            )
        _weather_lut = lut
    else:
        _weather_lut = {}   # will fall back to seasonal defaults

    return _weather_lut


_MONTH_TEMP = {1:5,2:6,3:8,4:11,5:14,6:17,7:19,8:19,9:16,10:13,11:9,12:6}


def build_prefix(dt: pd.Timestamp, vocab: dict[str, int], weather_lut: dict) -> np.ndarray:
    """
    Build the 8-token context prefix for a window starting at datetime `dt`.

    Layout:
        [BOS, REGIME, TEMP, RAIN, WIND, DOW, HOUR, MONTH]
    """
    PAD = vocab["<PAD>"]

    # BOS
    t_bos = vocab["<BOS>"]

    # Regime: most recent flag that applies
    if dt >= _GRENFELL_DATE:
        t_regime = vocab.get("<POST_GRENFELL>", PAD)
    elif dt >= _REMAP_DATE:
        t_regime = vocab.get("<POST_STATION_REMAP>", PAD)
    else:
        t_regime = PAD

    # Weather: look up exact hour, fall back to seasonal/average
    key = dt.floor("h")
    if key in weather_lut:
        t_temp, t_rain, t_wind = weather_lut[key]
    else:
        month_temp = _MONTH_TEMP.get(dt.month, 12)
        t_temp = vocab.get(_temp_token(float(month_temp)), PAD)
        t_rain = vocab.get("<RAIN_NONE>", PAD)
        t_wind = vocab.get("<WIND_BREEZY>", PAD)

    # Calendar
    t_dow   = vocab.get(_DOW_TOKENS[dt.dayofweek], PAD)
    t_hour  = vocab.get(f"<HOUR_{dt.hour}>",       PAD)
    t_month = vocab.get(_MONTH_TOKENS[dt.month - 1], PAD)

    return np.array([t_bos, t_regime, t_temp, t_rain, t_wind,
                     t_dow, t_hour, t_month], dtype=np.int16)


# ── Station datetime index ────────────────────────────────────────────────────

def load_station_datetimes(split: str = "train") -> dict[str, np.ndarray]:
    """
    Returns {station: datetime64_array_sorted_by_time}
    Each array has length = n_incidents (one per 6 tokens in the sequence).
    """
    if split == "train":
        parquet_path = DATA_DIR / "lfb_train_clean_weather.parquet"
        if not parquet_path.exists():
            parquet_path = DATA_DIR / "lfb_train_clean.parquet"
    else:
        parquet_path = DATA_DIR / "lfb_test_clean_weather.parquet"
        if not parquet_path.exists():
            parquet_path = DATA_DIR / "lfb_test_clean.parquet"

    df = pd.read_parquet(parquet_path, columns=["IncidentStationGround", "datetime"])
    df = df.sort_values(["IncidentStationGround", "datetime"])
    result = {}
    for station, grp in df.groupby("IncidentStationGround"):
        result[station] = grp["datetime"].values  # numpy datetime64
    return result


# ── Dataset ───────────────────────────────────────────────────────────────────

class IncidentSequenceDataset(Dataset):
    """
    Sliding-window causal LM dataset over per-station incident token sequences.

    Pre-builds all windows at construction time so __getitem__ is a simple
    array slice + tensor conversion.
    """

    def __init__(
        self,
        sequences:        dict[str, np.ndarray],
        station_datetimes: dict[str, np.ndarray],
        weather_lut:      dict,
        vocab:            dict[str, int],
        seq_len:          int = 256,
        stride:           int = 128,
        val_tail_frac:    float = 0.0,
    ):
        """
        Parameters
        ----------
        sequences         : {station: int16 token array}
        station_datetimes : {station: datetime64 array, one per incident}
        weather_lut       : {floor_hour_timestamp: (temp_id, rain_id, wind_id)}
        vocab             : token_string → int id
        seq_len           : total window length including prefix (tokens)
        stride            : step between consecutive windows (tokens)
        val_tail_frac     : if > 0, use only the last fraction of each sequence
                            (for building the validation dataset)
        """
        content_len = seq_len - PREFIX_LEN
        assert content_len > 0, "seq_len must be > PREFIX_LEN"

        self.seq_len = seq_len
        windows: list[np.ndarray] = []

        for station, toks in sequences.items():
            n = len(toks)
            if n < content_len:
                continue

            dts = station_datetimes.get(station)
            if dts is None or len(dts) == 0:
                continue

            # Temporal split: val_tail_frac selects the final portion
            if val_tail_frac > 0:
                split_tok = int(n * (1 - val_tail_frac))
                split_tok = (split_tok // 6) * 6  # align to incident boundary
                start_from = split_tok
            else:
                start_from = 0
                split_tok  = int(n * 0.85)   # train uses first 85%
                split_tok  = (split_tok // 6) * 6
                n = split_tok  # cap train at 85% to leave val untouched

            for pos in range(start_from, n - content_len + 1, stride):
                content = toks[pos: pos + content_len]
                if len(content) < content_len:
                    continue

                incident_idx = pos // 6
                if incident_idx >= len(dts):
                    continue

                dt = pd.Timestamp(dts[incident_idx])
                prefix = build_prefix(dt, vocab, weather_lut)
                window = np.concatenate([prefix, content])  # (seq_len,)
                windows.append(window)

        if len(windows) == 0:
            raise ValueError("No windows built — check sequence lengths vs seq_len/stride.")

        # Stack into a contiguous int16 array: shape (N, seq_len)
        self._data = np.stack(windows, axis=0).astype(np.int16)

    def __len__(self) -> int:
        return len(self._data)

    def __getitem__(self, idx: int):
        window = self._data[idx].astype(np.int64)  # (seq_len,)
        input_ids  = torch.from_numpy(window[:-1])  # (seq_len-1,)
        target_ids = torch.from_numpy(window[1:])   # (seq_len-1,)
        return input_ids, target_ids


# ── Public factory ─────────────────────────────────────────────────────────────

def build_dataloaders(
    seq_len:    int = 256,
    stride:     int = 128,
    batch_size: int = 32,
    num_workers: int = 0,
    val_tail_frac: float = 0.15,
) -> tuple[DataLoader, DataLoader, dict]:
    """
    Build train and validation DataLoaders from the tokenised sequences.

    Returns (train_loader, val_loader, meta_dict).
    meta_dict keys: vocab_size, seq_len, n_train, n_val, pad_id
    """
    vocab       = load_vocab()
    weather_lut = load_weather_lut()

    print("Loading station sequences ...")
    train_npz = np.load(TRAIN_SEQ)
    sequences = {k: train_npz[k] for k in train_npz.files}

    print("Loading station datetimes ...")
    station_dts = load_station_datetimes("train")

    print(f"Building train dataset (seq_len={seq_len}, stride={stride}) ...")
    train_ds = IncidentSequenceDataset(
        sequences, station_dts, weather_lut, vocab,
        seq_len=seq_len, stride=stride, val_tail_frac=0.0,
    )

    print(f"Building val dataset  (last {val_tail_frac:.0%} of each sequence) ...")
    val_ds = IncidentSequenceDataset(
        sequences, station_dts, weather_lut, vocab,
        seq_len=seq_len, stride=stride, val_tail_frac=val_tail_frac,
    )

    train_dl = DataLoader(
        train_ds, batch_size=batch_size, shuffle=True,
        num_workers=num_workers, pin_memory=torch.cuda.is_available(),
    )
    val_dl = DataLoader(
        val_ds, batch_size=batch_size, shuffle=False,
        num_workers=num_workers, pin_memory=torch.cuda.is_available(),
    )

    meta = {
        "vocab_size": len(vocab),
        "seq_len":    seq_len,
        "n_train":    len(train_ds),
        "n_val":      len(val_ds),
        "pad_id":     vocab["<PAD>"],
        "bos_id":     vocab["<BOS>"],
        "eos_id":     vocab["<EOS>"],
    }

    print(f"  Train windows : {meta['n_train']:,}")
    print(f"  Val windows   : {meta['n_val']:,}")
    print(f"  Vocab size    : {meta['vocab_size']:,}")

    return train_dl, val_dl, meta


# ── Standalone validation ──────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    print("=== Phase 3 Dataset Validation ===\n")

    vocab       = load_vocab()
    weather_lut = load_weather_lut()
    inv_vocab   = {v: k for k, v in vocab.items()}

    print(f"Vocab loaded: {len(vocab):,} tokens")
    print(f"Weather LUT : {len(weather_lut):,} hourly entries\n")

    train_dl, val_dl, meta = build_dataloaders(seq_len=256, batch_size=32)

    # Inspect one batch
    batch_in, batch_tgt = next(iter(train_dl))
    print(f"\nBatch shapes  : input {tuple(batch_in.shape)}  target {tuple(batch_tgt.shape)}")
    print(f"Token id range: min={batch_in.min().item()}  max={batch_in.max().item()}")

    # Decode first window in the batch
    sample = batch_in[0].tolist()
    decoded = [inv_vocab.get(t, f"?{t}") for t in sample]
    prefix_str  = " ".join(decoded[:PREFIX_LEN])
    incident_str = " ".join(decoded[PREFIX_LEN:PREFIX_LEN+12])
    print(f"\nFirst window prefix  : {prefix_str}")
    print(f"First 2 incidents    : {incident_str}")

    # Checks
    print("\n── Assertions ──────────────────────────────────────────────────")
    assert batch_in.shape  == (32, 255), f"Unexpected input shape: {batch_in.shape}"
    assert batch_tgt.shape == (32, 255), f"Unexpected target shape: {batch_tgt.shape}"
    assert (batch_in >= 0).all() and (batch_in < len(vocab)).all(), \
        "Token IDs out of vocab range"
    assert meta["n_train"] > 0 and meta["n_val"] > 0, "Empty train or val set"

    # Verify prefix always starts with BOS
    all_bos = all(
        val_dl.dataset._data[i, 0] == vocab["<BOS>"]
        for i in range(min(100, len(val_dl.dataset)))
    )
    assert all_bos, "Not all windows start with BOS"

    print("  [PASS] Batch shapes correct (32 × 255)")
    print("  [PASS] All token IDs within vocab range")
    print("  [PASS] All windows start with <BOS>")
    print(f"  [PASS] Train={meta['n_train']:,}  Val={meta['n_val']:,} windows")
    print("\nDataset ready for GPT-2 training.")
