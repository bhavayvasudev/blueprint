# Blueprint API

FastAPI backend + pipeline + worker. See the root [`README.md`](../../README.md) and [`docs/README_ARCHITECTURE.md`](../../docs/README_ARCHITECTURE.md) for full setup and architecture.

```
uv sync
cp .env.example .env
uv run alembic upgrade head
uv run pytest
uv run uvicorn api.main:app --reload
```

## NVIDIA Configuration

Threads' reasoning model is NVIDIA Nemotron, served through NVIDIA's OpenAI-compatible inference API (`integrate.api.nvidia.com`). Configured in `apps/api/.env`:

```
NVIDIA_API_KEY=
NVIDIA_MODEL=nvidia/nemotron-3-ultra-550b-a55b
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
```

Paste your own NVIDIA API key into `NVIDIA_API_KEY`. `NVIDIA_MODEL` and `NVIDIA_BASE_URL` already have sensible defaults (`config.py`) and only need changing to point at a different hosted model or a self-hosted NIM.

If `NVIDIA_API_KEY` is left blank, the app does not crash: `integrations/llm/registry.py` returns no chat provider, and the Threads room degrades to an honest "no reasoning model configured" state instead of a 500 — local dev and CI work with zero credentials.
