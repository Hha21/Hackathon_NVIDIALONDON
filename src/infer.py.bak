"""
Phase 5: Inference & risk surface generation.

Loads models/gpt2_best.pt, runs per-station rollout sampling,
aggregates ward×hour×type counts, and writes outputs/forecast_24h.json.

Usage:
    python src/infer.py                             # forecast from now
    python src/infer.py --date 2024-11-05 --hour 18
    python src/infer.py --n-rollouts 100
    python src/infer.py --temp 2.0 --rain 5.0 --wind 35
"""

import sys
import json
import argparse
import numpy as np
import pandas as pd
import torch
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.model   import GPT, GPTConfig
from src.dataset import (build_prefix, load_vocab, load_weather_lut,
                         _temp_token, _rain_token, _wind_token)

# ── Paths ──────────────────────────────────────────────────────────────────────

BEST_CKPT    = Path("models/gpt2_best.pt")
BASELINE_PKL = Path("models/fire_risk_model.pkl")
TRAIN_SEQ    = Path("data/processed/station_sequences.npz")
OUTPUT_PATH  = Path("outputs/forecast_24h.json")
OUTPUT_PATH.parent.mkdir(exist_ok=True)

# ── GAP token → median minutes ─────────────────────────────────────────────────

GAP_MINUTES = {
    "<DT_5MIN>":  2.5,
    "<DT_15MIN>": 10.0,
    "<DT_30MIN>": 22.5,
    "<DT_1H>":    45.0,
    "<DT_2H>":    90.0,
    "<DT_4H>":    180.0,
    "<DT_8H>":    360.0,
    "<DT_1D>":    960.0,
    "<DT_2D>":    2160.0,
    "<DT_LONG>":  4320.0,
}

INCIDENT_TYPES = ["dwelling_fire", "outdoor_fire", "false_alarm", "special_service"]

TYPE_TOKEN_MAP = {
    "TYPE_DWELLING_FIRE":   "dwelling_fire",
    "TYPE_OUTDOOR_FIRE":    "outdoor_fire",
    "TYPE_FALSE_ALARM":     "false_alarm",
    "TYPE_SPECIAL_SERVICE": "special_service",
}

# ── Ward metadata ──────────────────────────────────────────────────────────────

def load_ward_meta() -> tuple[dict, dict]:
    """
    Returns:
        ward_coords    : {ward_upper: (lat, lon)}
        ward_to_borough: {ward_upper: borough}
    """
    if not BASELINE_PKL.exists():
        print("  WARNING: baseline pickle not found — ward coords will be missing")
        return {}, {}

    import pickle
    with open(BASELINE_PKL, "rb") as f:
        art = pickle.load(f)

    # ward_coords may be a DataFrame or [(col_name, Series), ...]
    raw = art.get("ward_coords", None)
    coords = {}
    if raw is not None:
        if isinstance(raw, pd.DataFrame):
            df_c = raw
        else:
            # list of (col_name, Series) tuples
            col_dict = {name: series for name, series in raw}
            df_c = pd.DataFrame(col_dict)
        for _, row in df_c.iterrows():
            w  = str(row["ward_canonical"]).upper()
            la = row["lat"]
            lo = row["lon"]
            if pd.notna(la) and pd.notna(lo):
                coords[w] = (float(la), float(lo))

    ward_to_borough = {
        str(k).upper(): str(v)
        for k, v in art.get("ward_to_borough", {}).items()
    }
    return coords, ward_to_borough


# ── Token helpers ──────────────────────────────────────────────────────────────

def station_to_token(name: str) -> str:
    return f"<STATION_{name.upper().replace(' ', '_').replace('-', '_')}>"


def parse_rollout(tokens: list[str], forecast_hours: int = 24) -> list[dict]:
    """
    Walk a generated token list, tracking simulated time via GAP midpoints.
    Returns [{ward, type, hour}, ...] for incidents within forecast_hours.
    """
    incidents = []
    sim_min   = 0.0
    max_min   = forecast_hours * 60.0
    i = 0
    while i < len(tokens) - 5:
        tok = tokens[i]
        if tok in GAP_MINUTES:
            sim_min += GAP_MINUTES[tok]
            if sim_min > max_min:
                break
            # layout: DT STATION WARD TYPE STOP PROP
            ward_tok = tokens[i + 2]
            type_tok = tokens[i + 3]

            if ward_tok.startswith("<WARD_"):
                ward = ward_tok[6:-1].upper().replace("_", " ")
            else:
                i += 1
                continue

            itype = TYPE_TOKEN_MAP.get(type_tok.strip("<>"))
            if itype:
                hour = min(int(sim_min // 60), forecast_hours - 1)
                incidents.append({"ward": ward, "type": itype, "hour": hour})
            i += 6
        else:
            i += 1
    return incidents


# ── Model loader ───────────────────────────────────────────────────────────────

def load_model(device: torch.device):
    ckpt  = torch.load(BEST_CKPT, map_location=device, weights_only=False)
    cfg   = GPTConfig(**ckpt["config"])
    model = GPT(cfg).to(device)
    model.load_state_dict(ckpt["model"])
    model.eval()
    return model, ckpt


# ── Main ───────────────────────────────────────────────────────────────────────

def run_inference(args):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device : {device}")

    vocab       = load_vocab()
    inv_vocab   = {v: k for k, v in vocab.items()}
    weather_lut = load_weather_lut()

    print("Loading model ...")
    model, ckpt = load_model(device)
    print(f"  Epoch {ckpt['epoch']+1}  val_loss={ckpt['val_loss']:.4f}")

    print("Loading stations ...")
    npz      = np.load(TRAIN_SEQ)
    stations = list(npz.files)
    print(f"  {len(stations)} stations")

    print("Loading ward metadata ...")
    ward_coords, ward_to_borough = load_ward_meta()
    print(f"  {len(ward_coords)} wards with coordinates")

    # ── Context ────────────────────────────────────────────────────────────────
    if args.date:
        dt = pd.Timestamp(f"{args.date} {args.hour:02d}:00:00")
    else:
        dt = pd.Timestamp.now().floor("h")

    prefix = build_prefix(dt, vocab, weather_lut)
    if args.temp is not None:
        prefix[2] = vocab.get(_temp_token(args.temp), prefix[2])
    if args.rain is not None:
        prefix[3] = vocab.get(_rain_token(args.rain), prefix[3])
    if args.wind is not None:
        prefix[4] = vocab.get(_wind_token(args.wind), prefix[4])

    ctx_tokens = [inv_vocab.get(int(t), "?") for t in prefix]
    print(f"\nContext : {dt.strftime('%A %Y-%m-%d %H:%M')}")
    print(f"  Prefix : {' '.join(ctx_tokens)}")
    print(f"  Rollouts/station : {args.n_rollouts}")
    print(f"  Temperature      : {args.temperature}  top_k={args.top_k}")
    print(f"  Max new tokens   : {args.max_new_tokens}")
    print()

    # ── Rollout loop ───────────────────────────────────────────────────────────
    # count[ward][type][hour] = cumulative hit count
    count: dict = defaultdict(lambda: {t: [0.0] * 24 for t in INCIDENT_TYPES})

    seed_dt = vocab.get("<DT_1D>", vocab["<PAD>"])
    total_rollouts = 0
    skipped        = 0
    n_stations     = len(stations)

    for s_idx, stn_name in enumerate(stations):
        stn_tok_id = vocab.get(station_to_token(stn_name))
        if stn_tok_id is None:
            skipped += 1
            continue

        seed = list(prefix) + [seed_dt, stn_tok_id]
        prompt = torch.tensor(seed, dtype=torch.long).unsqueeze(0).to(device)

        for _ in range(args.n_rollouts):
            with torch.no_grad():
                out = model.generate(
                    prompt,
                    max_new_tokens=args.max_new_tokens,
                    temperature=args.temperature,
                    top_k=args.top_k,
                )
            tokens    = [inv_vocab.get(int(t), "?") for t in out[0].tolist()]
            generated = tokens[len(seed):]
            for inc in parse_rollout(generated, forecast_hours=24):
                count[inc["ward"]][inc["type"]][inc["hour"]] += 1

        total_rollouts += args.n_rollouts

        if (s_idx + 1) % 10 == 0 or s_idx == n_stations - 1:
            print(f"  [{s_idx+1:3d}/{n_stations}]  rollouts={total_rollouts:,}  "
                  f"wards_hit={len(count)}", flush=True)

    print(f"\nTotal rollouts : {total_rollouts:,}")
    print(f"Stations skipped (not in vocab): {skipped}")
    print(f"Wards with predicted incidents : {len(count)}")

    # ── Normalise & build output ───────────────────────────────────────────────
    ward_totals = {
        w: sum(count[w][t][h] for t in INCIDENT_TYPES for h in range(24))
        for w in count
    }
    max_total = max(ward_totals.values()) if ward_totals else 1.0

    # Global max hourly count — used to normalise per-hour risk_score across all wards
    global_hour_max = max(
        (sum(count[w][t][h] for t in INCIDENT_TYPES) for w in count for h in range(24)),
        default=1.0,
    )

    wards_out = []
    missing_coords = 0

    for ward in sorted(ward_totals, key=lambda w: -ward_totals[w]):
        ward_key = ward.upper()

        if ward_key not in ward_coords:
            missing_coords += 1
            continue

        lat, lon = ward_coords[ward_key]
        borough  = ward_to_borough.get(ward_key, "Unknown")
        total    = ward_totals[ward]

        # Build hourly array matching Person B's schema:
        # { hour, risk_score, expected_count, dominant_type }
        hourly = []
        for h in range(24):
            hour_total = sum(count[ward][t][h] for t in INCIDENT_TYPES)
            dominant   = max(INCIDENT_TYPES, key=lambda t: count[ward][t][h])
            hourly.append({
                "hour":           h,
                "risk_score":     round(hour_total / global_hour_max, 4),
                "expected_count": round(hour_total / args.n_rollouts, 4),
                "dominant_type":  dominant,
            })

        # ward_id: use normalised ward name as geometry key (ONS codes not in dataset)
        ward_id = ward.lower().replace(" ", "_").replace("'", "").replace("&", "and")

        wards_out.append({
            "ward_id":    ward_id,
            "ward_name":  ward.title(),
            "borough":    borough.title(),
            "geometry_id": ward_id,
            "lat":        round(lat, 5),
            "lon":        round(lon, 5),
            "risk_score": round(total / max_total, 4),
            "hourly":     hourly,
        })

    print(f"Wards dropped (no coords): {missing_coords}")
    print(f"Wards written            : {len(wards_out)}")

    output = {
        "generated_at":   pd.Timestamp.now("UTC").strftime("%Y-%m-%dT%H:%M:%SZ"),
        "forecast_date":  (dt + pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
        "forecast_from":  dt.strftime("%Y-%m-%dT%H:%M:%S"),
        "horizon_hours":  24,
        "model":          "gpt2-small-19.5M",
        "n_rollouts":     total_rollouts,
        "context_tokens": ctx_tokens,
        "weather_context": {
            "temp_token": ctx_tokens[2],
            "rain_token": ctx_tokens[3],
            "wind_token": ctx_tokens[4],
        },
        "wards": wards_out,
    }

    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    if wards_out:
        scores = [w["risk_score"] for w in wards_out]
        print(f"\nRisk score range : {min(scores):.4f} – {max(scores):.4f}")
        print("\nTop 10 highest-risk wards:")
        print(f"  {'Ward':<32} {'Borough':<22} {'Risk':>6}  Top type (peak hour)")
        print("  " + "-" * 75)
        for w in wards_out[:10]:
            peak_h = max(w["hourly"], key=lambda h: h["risk_score"])
            print(f"  {w['ward_name']:<32} {w['borough']:<22} "
                  f"{w['risk_score']:>6.3f}  {peak_h['dominant_type']}")

    print(f"\nWrote → {OUTPUT_PATH}")


# ── CLI ────────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description="GPT-2 inference → forecast_24h.json")
    p.add_argument("--date",           default=None,  help="Forecast date YYYY-MM-DD (default: today)")
    p.add_argument("--hour",           type=int, default=0, help="Start hour 0-23 (default: 0)")
    p.add_argument("--temp",           type=float, default=None, help="Temperature °C override")
    p.add_argument("--rain",           type=float, default=None, help="Rainfall mm/h override")
    p.add_argument("--wind",           type=float, default=None, help="Wind speed km/h override")
    p.add_argument("--n-rollouts",     type=int,   default=50,   help="Rollouts per station (default: 50)")
    p.add_argument("--temperature",    type=float, default=0.85, help="Sampling temperature (default: 0.85)")
    p.add_argument("--top-k",          type=int,   default=40,   help="Top-k sampling (default: 40)")
    p.add_argument("--max-new-tokens", type=int,   default=150,  help="Tokens per rollout (default: 150)")
    args = p.parse_args()
    run_inference(args)


if __name__ == "__main__":
    main()
