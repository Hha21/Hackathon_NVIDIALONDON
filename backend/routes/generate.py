"""POST /api/forecast/generate — dispatch a GPT-2 forecast regen to the DGX Spark.

Thin route over backend.spark (the job runner). The scenario panel sends the
weather/date/hour the model conditions on; the Spark runs src.infer and scp's the
new outputs/forecast_24h.json back, which the loader hot-reloads. Async because
inference is ~minutes: POST returns a job_id, the client polls GET .../{job_id}.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.schemas import GenerateJob, GenerateRequest
from backend.spark import active_job, get_job, start_job

router = APIRouter(prefix="/api/forecast", tags=["generate"])


@router.post("/generate", response_model=GenerateJob)
def post_generate(req: GenerateRequest) -> GenerateJob:
    busy = active_job()
    if busy is not None:
        # One GPU → refuse a second concurrent run, point the client at the live job.
        raise HTTPException(
            status_code=409,
            detail={"message": "A Spark job is already running.", "job": busy},
        )
    return GenerateJob(**start_job(req))


@router.get("/generate/{job_id}", response_model=GenerateJob)
def get_generate(job_id: str) -> GenerateJob:
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return GenerateJob(**job)
