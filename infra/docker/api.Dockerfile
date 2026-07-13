# Single image for both the FastAPI process and the worker process
# (ARCHITECTURE.md §13: "same codebase, different entrypoint") — Railway
# service config selects the CMD per deployed service, not this file.
FROM python:3.12-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends git build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app
COPY apps/api/pyproject.toml apps/api/uv.lock* /app/
RUN uv sync --frozen --no-dev --no-install-project

COPY apps/api /app

RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH"

# Default: API process. Worker deployments override CMD to
# ["python", "worker.py"] at the Railway service level.
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
