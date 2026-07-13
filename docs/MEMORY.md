# Blueprint — Implementation Memory

Status: living log, updated at the end of every completed phase milestone (per `RULES.md` §20) — not a design document, not a duplicate of `DECISIONS.md`. This file answers "where did implementation actually land, and why, when it differed from the plan" — a chronological record for whoever (human or agent) picks this project back up after time away.

"Underway" (per `README_ARCHITECTURE.md` §8) means: implementation begins the moment the first line of application code is written, not when a phase fully ships. Update this file incrementally as milestones inside a phase complete, not only at phase boundaries.

Each entry: date, what shipped, what deviated from `PHASES.md`/`ARCHITECTURE.md` and why (if anything), what's next.

---

## 2026-07-13 — Project initialized, Phase 0 underway

Planning documents (`PRD.md`, `ARCHITECTURE.md`, `RULES.md`, `PHASES.md`, `DECISIONS.md`, `README_ARCHITECTURE.md`) moved from conversation context into `docs/` as the durable source of truth. Repository initialized with git, monorepo scaffolding per `ARCHITECTURE.md` §18 stood up.

Two tooling ADRs added during scaffolding, not anticipated by the original doc set: **ADR-016** (uv, pinned to CPython 3.12, for the Python side — the 3.14 system default lacks mature native-extension wheel coverage for Tree-sitter/LangGraph/psycopg) and **ADR-017** (npm workspaces, not pnpm/Turborepo, for the JS monorepo — pnpm isn't installed on this machine and Phase 0 has no build graph complex enough to justify Turborepo). Both are explicitly conditional, revisit-on-signal decisions, not permanent commitments.

PR1 (repo scaffolding + CI) shipped: `apps/api` (FastAPI app factory, RQ worker entrypoint, Pydantic settings, Phase 0 SQLAlchemy models), `apps/web` (Next.js via create-next-app), `packages/ui` and `packages/shared-types` (placeholders — nothing to export until Phase 1's `FindingCard` and a real typed API surface exist), `infra/docker` (compose file for local Postgres+pgvector and Redis, a shared Dockerfile for the api/worker services), and CI (lint/typecheck/test for both apps). Verified locally: ruff, mypy --strict, pytest, eslint, tsc, and `next build` all pass.

PR2 (DB schema + migrations) shipped: Alembic wired to `apps/api`'s own settings (one `DATABASE_URL`, not a value duplicated into `alembic.ini`); one hand-authored migration (`f7826c23e482_phase_0_schema.py`) creating exactly the 8 Phase 0 tables — chosen over `alembic revision --autogenerate` because autogenerate requires a live DB connection to diff against, which wasn't available (see below).

**Two documentation findings, filed rather than silently resolved, per the instruction that doc/code disagreement is a bug to file:**

1. `ARCHITECTURE.md` §3.1 describes Stage 1 as extracting commit metadata (author, timestamp, message, files touched), and §11 lists a `commits` table (and separately an `issues` table) as part of the schema — but `PHASES.md`'s Phase 0 deliverable list names only 8 tables, omitting both. Resolved by *not* creating `commits`/`issues` in this migration: nothing in Phase 0's stated acceptance criteria (a populated Repository Graph, zero LLM calls) requires commit or issue history, and the first real consumers (the Debt Agent's staleness signal, Phase 3; feature/dependency reasoning that might reference issues) are both later-phase. Revisit when a shipping stage actually needs either table — don't build storage ahead of a consumer.
2. `ARCHITECTURE.md` §10 leaves the embedding model choice open pending Stage 4's own accuracy/cost comparison, but pgvector needs a fixed column width today. Resolved with **ADR-018**: a documented, provisional 1536-dim placeholder, the same "ship a flagged placeholder, revisit on real data" pattern ADR-009 already established for the absence-claim confidence ceiling — not a new precedent, a reapplication of one already accepted.

**Environment constraint, noted rather than papered over:** this development environment has neither Docker nor a local PostgreSQL installation, so the migration's `upgrade()`/`downgrade()` could not be executed against a real `pgvector`-enabled Postgres here. What *was* verified: `alembic upgrade head --sql` and `alembic downgrade <rev>:base --sql` (Alembic's offline mode, which compiles the DDL through SQLAlchemy's real Postgres dialect without a live connection) — both rendered correct, dependency-ordered SQL, including the `VECTOR(1536)` column type and the `USING hnsw` indexes. CI (`.github/workflows/ci.yml`) runs `alembic upgrade head` against a real `pgvector/pgvector:pg16` service container on every push, so the first PR/push against this repo is the actual live-execution verification — flagging this explicitly rather than asserting untested code works. If you have Docker locally, `docker compose -f infra/docker/docker-compose.yml up -d && cd apps/api && uv run alembic upgrade head` would confirm it directly before that first push.

**Status:** Phase 0, PR1 and PR2 complete and committed.

**Next:** PR4 (Tree-sitter extraction) — no external-credential dependency, proceeding next. PR3 (GitHub App auth) requires a real GitHub App to be registered in GitHub's UI (Client ID, private key, webhook secret) — a manual, human step that can't be fabricated; flagged for the project owner rather than blocking the rest of Phase 0. PR5/6 (Knowledge Graph / Repository Graph construction) and PR7 (embeddings + hybrid retrieval) follow PR4 in order since each consumes the previous stage's output.
