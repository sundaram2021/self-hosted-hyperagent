# Sandbox executor — the container IS the isolation boundary; the app adds
# per-execution temp dirs, env stripping, rlimits, and timeouts on top.
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app
COPY apps/sandbox/pyproject.toml apps/sandbox/uv.lock apps/sandbox/.python-version ./
RUN uv sync --frozen --no-dev --no-install-project || uv sync --frozen --no-dev
COPY apps/sandbox/app ./app

EXPOSE 8788
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8788/health').status==200 else 1)"
CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8788"]
