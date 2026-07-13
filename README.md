# Blueprint

Blueprint is an AI Software Architect: it connects to a GitHub repository, builds an evidence-backed model of what the codebase actually is, and reasons about what's missing, what's blocked, and what to build next.

Blueprint does not summarize repositories. It cross-examines them.

## Documentation

Start here: [`docs/README_ARCHITECTURE.md`](docs/README_ARCHITECTURE.md) — a ~1 hour onboarding guide.

Then, as needed:

- [`docs/PRD.md`](docs/PRD.md) — what Blueprint is and why (product requirements)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the system is built (engineering bible)
- [`docs/RULES.md`](docs/RULES.md) — binding day-to-day engineering conventions
- [`docs/PHASES.md`](docs/PHASES.md) — implementation sequencing
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — architecture decision records (ADRs)
- [`docs/MEMORY.md`](docs/MEMORY.md) — living implementation log

## Repository layout

```
apps/
  web/          Next.js frontend (App Router, TypeScript, Tailwind)
  api/          FastAPI backend + pipeline + worker
packages/
  ui/           shared design system, incl. FindingCard
  shared-types/ OpenAPI-derived types shared FE/BE
infra/
  docker/
  railway/
docs/            architecture, rules, phases, decisions, memory
```

Full folder-structure rationale: `docs/ARCHITECTURE.md` §18.

## Status

Phase 0 (Foundation & Deterministic Ingestion) — see `docs/PHASES.md` and `docs/MEMORY.md` for current progress.

## Development

**Local Postgres (pgvector) + Redis:**

```
docker compose -f infra/docker/docker-compose.yml up -d
```

No Docker? `uv run pytest` still works without it — the test suite falls back to a real, ephemeral Postgres+pgvector instance (via `pgserver`, a bundled binary) when no `DATABASE_URL` is reachable, so every integration test still runs for real rather than skipping (see `docs/DECISIONS.md` ADR-022). Docker/`docker-compose` is only needed to run the API/worker themselves against a persistent local database.

**Backend** (`apps/api/`): Python 3.12, managed with [`uv`](https://github.com/astral-sh/uv) (see `docs/DECISIONS.md` ADR-016).

```
cd apps/api
uv sync
cp .env.example .env
uv run alembic upgrade head
uv run pytest
uv run uvicorn api.main:app --reload
```

Run the worker in a second terminal: `uv run python worker.py`.

**Frontend** (`apps/web/`): Node 24, npm workspaces (see `docs/DECISIONS.md` ADR-017).

```
npm install
npm run dev --workspace=@blueprint/web
```
