"""DGX Spark dispatch: regenerate the forecast on the GPU box, on demand.

The scenario panel's "Generate day on Spark" button hits POST /api/forecast/generate,
which runs a job here. A job:

  1. SSHes to the Spark (nvidia@scan-02.local) and runs `python3 -m src.infer`
     with the requested date/hour/weather/n_rollouts. The GPT-2 model conditions
     only on TEMP/RAIN/WIND buckets + DOW/HOUR/MONTH (see src/dataset.py).
  2. scp's the regenerated outputs/forecast_24h.json back to the local repo.
  3. The shared loader hot-reloads it on mtime change — no restart, GET /api/forecast
     serves the new "possible day".

Inference has no KV cache (~4-5 min for 50 rollouts/station). So generation runs in
a background thread and the frontend polls GET /api/forecast/generate/{job_id}.

Connection is configurable via env (SPARK_HOST/SPARK_USER/SPARK_REPO); SSH key auth
is assumed (key installed via ssh-copy-id — no password ever stored in the repo).
Only one job runs at a time: the Spark is a single GPU.
"""

from __future__ import annotations

import json
import os
import shlex
import subprocess
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from backend.schemas import GenerateRequest

# ── Spark connection (override via env) ────────────────────────────────────────
SPARK_HOST = os.getenv("SPARK_HOST", "scan-02.local")
SPARK_USER = os.getenv("SPARK_USER", "nvidia")
SPARK_REPO = os.getenv("SPARK_REPO", "~/Hackathon_NVIDIALONDON")
SSH_TIMEOUT_S = int(os.getenv("SPARK_SSH_TIMEOUT", "1200"))  # 20 min ceiling

LOCAL_OUT = Path(__file__).resolve().parents[1] / "outputs" / "forecast_24h.json"

# ── In-process job store (single GPU → at most one active job) ─────────────────
_jobs: dict[str, dict] = {}
_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def active_job() -> Optional[dict]:
    with _lock:
        for j in _jobs.values():
            if j["status"] in ("queued", "running"):
                return dict(j)
    return None


def get_job(job_id: str) -> Optional[dict]:
    with _lock:
        j = _jobs.get(job_id)
        return dict(j) if j else None


def _set(job_id: str, **fields) -> None:
    with _lock:
        _jobs[job_id].update(fields)


def _infer_command(req: GenerateRequest) -> str:
    """Build the remote shell command. User-controlled args are validated numerics
    /date regex (see GenerateRequest) and additionally shlex-quoted, so the only
    unquoted token is the fixed SPARK_REPO path (needs ~ expansion)."""
    parts = ["python3", "-m", "src.infer",
             "--n-rollouts", str(req.n_rollouts),
             "--hour", str(req.hour)]
    if req.date is not None:
        parts += ["--date", req.date]
    if req.temp is not None:
        parts += ["--temp", str(req.temp)]
    if req.rain is not None:
        parts += ["--rain", str(req.rain)]
    if req.wind is not None:
        parts += ["--wind", str(req.wind)]
    return f"cd {SPARK_REPO} && " + " ".join(shlex.quote(p) for p in parts)


def _run_job(job_id: str, req: GenerateRequest) -> None:
    target = f"{SPARK_USER}@{SPARK_HOST}"
    try:
        _set(job_id, status="running", message="Running GPT-2 rollouts on DGX Spark…")
        ssh = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
               target, _infer_command(req)]
        r = subprocess.run(ssh, capture_output=True, text=True, timeout=SSH_TIMEOUT_S)
        if r.returncode != 0:
            tail = (r.stderr or r.stdout or "").strip().splitlines()[-8:]
            raise RuntimeError("infer.py failed on Spark:\n" + "\n".join(tail))

        _set(job_id, message="Copying forecast back from Spark…")
        scp = ["scp", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
               f"{target}:{SPARK_REPO}/outputs/forecast_24h.json", str(LOCAL_OUT)]
        r = subprocess.run(scp, capture_output=True, text=True, timeout=120)
        if r.returncode != 0:
            raise RuntimeError("scp failed:\n" + (r.stderr or r.stdout).strip())

        # Read back what the model stamped so the UI can confirm it was the GPU.
        device = generated_at = None
        try:
            meta = json.loads(LOCAL_OUT.read_text())
            device = meta.get("device")
            generated_at = meta.get("generated_at")
        except Exception:
            pass

        _set(job_id, status="done", message="Forecast regenerated on Spark.",
             finished_at=_now(), device=device, forecast_generated_at=generated_at)
    except subprocess.TimeoutExpired:
        _set(job_id, status="error", finished_at=_now(),
             message="Spark job timed out.", error=f"timeout after {SSH_TIMEOUT_S}s")
    except Exception as e:  # noqa: BLE001 — surface any failure to the UI
        _set(job_id, status="error", finished_at=_now(),
             message="Spark job failed.", error=str(e))


def start_job(req: GenerateRequest) -> dict:
    """Spawn a background generation job. Returns the initial job record."""
    job_id = f"gen_{uuid.uuid4().hex[:8]}"
    job = {
        "job_id": job_id,
        "status": "queued",
        "message": "Queued.",
        "started_at": _now(),
        "finished_at": None,
        "device": None,
        "forecast_generated_at": None,
        "n_rollouts": req.n_rollouts,
        "error": None,
    }
    with _lock:
        _jobs[job_id] = job
    threading.Thread(target=_run_job, args=(job_id, req), daemon=True).start()
    return dict(job)
