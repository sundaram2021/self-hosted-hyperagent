"""Sandbox service entrypoint.

Phase 1 ships only the health endpoint; Phase 4 adds the isolated execution
API (per-run temp dirs, resource limits, output caps).
"""

import os
import time
from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

SERVICE_VERSION = "0.1.0"
_STARTED_AT = time.monotonic()

app = FastAPI(title="hyperagent-sandbox", version=SERVICE_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("WEB_ORIGIN", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    """Health contract shared with the Node services (see packages/shared)."""
    return {
        "status": "ok",
        "service": "sandbox",
        "version": SERVICE_VERSION,
        "uptimeSeconds": round(time.monotonic() - _STARTED_AT, 3),
        "timestamp": datetime.now(UTC).isoformat(),
    }
