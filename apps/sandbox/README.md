# hyperagent-sandbox

Isolated execution service for skill scripts and generated code. Managed with [uv](https://docs.astral.sh/uv/).

```bash
uv sync            # create venv + install deps
uv run uvicorn app.main:app --port 8788 --reload
uv run pytest      # tests
uv run ruff check .
```

Phase 4 adds the actual execution API (resource limits, per-run temp dirs, output caps). For now this service only exposes `GET /health`.
