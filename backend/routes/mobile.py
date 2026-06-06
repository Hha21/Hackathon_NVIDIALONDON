"""Mobile routes (owned by B, driven by C). Filled in Step 3.

  GET  /api/mobile/state?station=
  POST /api/mobile/accept
"""
from fastapi import APIRouter

router = APIRouter(prefix="/api/mobile", tags=["mobile"])

# TODO Step 3: GET /state -> MobileState ; POST /accept -> AcceptResponse
