"""Sandbox service: health + isolated code execution."""

import os
import time
from datetime import UTC, datetime
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.executor import ExecutionResult, execute

SERVICE_VERSION = "0.2.0"
_STARTED_AT = time.monotonic()

app = FastAPI(title="hyperagent-sandbox", version=SERVICE_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("WEB_ORIGIN", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ExecuteRequest(BaseModel):
    language: Literal["python", "bash"]
    code: str = Field(min_length=1, max_length=100_000)
    timeout_ms: int = Field(default=30_000, ge=100, le=120_000)


class ExecuteResponse(BaseModel):
    stdout: str
    stderr: str
    exit_code: int | None
    duration_ms: int
    timed_out: bool
    stdout_truncated: bool
    stderr_truncated: bool

    @classmethod
    def from_result(cls, result: ExecutionResult) -> "ExecuteResponse":
        return cls(
            stdout=result.stdout,
            stderr=result.stderr,
            exit_code=result.exit_code,
            duration_ms=result.duration_ms,
            timed_out=result.timed_out,
            stdout_truncated=result.stdout_truncated,
            stderr_truncated=result.stderr_truncated,
        )


@app.post("/execute")
async def execute_code(request: ExecuteRequest) -> ExecuteResponse:
    """Run code in an isolated, resource-limited subprocess."""
    result = await execute(request.language, request.code, request.timeout_ms)
    return ExecuteResponse.from_result(result)


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
