"""Isolated code execution.

Isolation model (v1):
- The sandbox CONTAINER is the primary boundary (runs separately from the
  agent server; no shared filesystem).
- Each execution gets a throwaway temp dir as cwd/HOME, a minimal environment
  (no inherited secrets), rlimits for CPU/memory/files, an output cap, and a
  hard wall-clock timeout that kills the whole process group.
"""

import asyncio
import os
import resource
import shutil
import signal
import sys
import tempfile
import time
from dataclasses import dataclass
from typing import Literal

MAX_OUTPUT_BYTES = 64 * 1024
CPU_SECONDS_LIMIT = 30
MEMORY_LIMIT_BYTES = 512 * 1024 * 1024
FILE_SIZE_LIMIT_BYTES = 8 * 1024 * 1024
OPEN_FILES_LIMIT = 128

Language = Literal["python", "bash"]


@dataclass
class ExecutionResult:
    stdout: str
    stderr: str
    exit_code: int | None
    duration_ms: int
    timed_out: bool
    stdout_truncated: bool
    stderr_truncated: bool


def _apply_limits() -> None:
    """Applied in the child between fork and exec."""
    resource.setrlimit(resource.RLIMIT_CPU, (CPU_SECONDS_LIMIT, CPU_SECONDS_LIMIT))
    resource.setrlimit(resource.RLIMIT_AS, (MEMORY_LIMIT_BYTES, MEMORY_LIMIT_BYTES))
    resource.setrlimit(resource.RLIMIT_FSIZE, (FILE_SIZE_LIMIT_BYTES, FILE_SIZE_LIMIT_BYTES))
    resource.setrlimit(resource.RLIMIT_NOFILE, (OPEN_FILES_LIMIT, OPEN_FILES_LIMIT))


def _truncate(raw: bytes) -> tuple[str, bool]:
    truncated = len(raw) > MAX_OUTPUT_BYTES
    text = raw[:MAX_OUTPUT_BYTES].decode("utf-8", errors="replace")
    return text, truncated


def _command_for(language: Language, entry_path: str) -> list[str]:
    if language == "python":
        return [sys.executable, entry_path]
    return ["bash", entry_path]


def _entry_filename(language: Language) -> str:
    return "main.py" if language == "python" else "main.sh"


async def execute(language: Language, code: str, timeout_ms: int) -> ExecutionResult:
    workdir = tempfile.mkdtemp(prefix="hyperagent-exec-")
    started = time.monotonic()
    timed_out = False

    try:
        entry_path = os.path.join(workdir, _entry_filename(language))
        with open(entry_path, "w", encoding="utf-8") as handle:
            handle.write(code)

        process = await asyncio.create_subprocess_exec(
            *_command_for(language, entry_path),
            cwd=workdir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            stdin=asyncio.subprocess.DEVNULL,
            # Minimal env: the child must not inherit sandbox-service secrets.
            env={
                "PATH": "/usr/local/bin:/usr/bin:/bin",
                "HOME": workdir,
                "LANG": "C.UTF-8",
                "PYTHONUNBUFFERED": "1",
            },
            preexec_fn=_apply_limits,
            start_new_session=True,
        )

        try:
            stdout_raw, stderr_raw = await asyncio.wait_for(
                process.communicate(), timeout=timeout_ms / 1000
            )
        except TimeoutError:
            timed_out = True
            try:
                os.killpg(os.getpgid(process.pid), signal.SIGKILL)
            except ProcessLookupError:
                pass
            stdout_raw, stderr_raw = await process.communicate()

        duration_ms = int((time.monotonic() - started) * 1000)
        stdout, stdout_truncated = _truncate(stdout_raw)
        stderr, stderr_truncated = _truncate(stderr_raw)

        return ExecutionResult(
            stdout=stdout,
            stderr=stderr,
            exit_code=None if timed_out else process.returncode,
            duration_ms=duration_ms,
            timed_out=timed_out,
            stdout_truncated=stdout_truncated,
            stderr_truncated=stderr_truncated,
        )
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
