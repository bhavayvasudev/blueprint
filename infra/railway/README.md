# Railway Deployment

Blueprint deploys the API and worker as two Railway services built from the same image (`infra/docker/api.Dockerfile`), plus managed Postgres (with the `pgvector` extension enabled) and Redis add-ons — see `docs/ARCHITECTURE.md` §1 and §13.

This directory intentionally has no `railway.json`/service config checked in yet: actually provisioning a Railway project (creating the project, wiring the two services to `infra/docker/api.Dockerfile` with different start commands, attaching Postgres/Redis, and setting the environment variables in `apps/api/.env.example`) is a manual step in Railway's dashboard/CLI tied to a real account, not something to fabricate ahead of an actual deploy. This README will be replaced with real service configuration the first time Blueprint is actually deployed.

**Services to create when that happens:**

- `api` — `infra/docker/api.Dockerfile`, default `CMD` (`uvicorn api.main:app`).
- `worker` — same Dockerfile, `CMD` overridden to `python worker.py`.
- Postgres add-on with `pgvector` extension enabled (`CREATE EXTENSION vector;` after provisioning).
- Redis add-on for the RQ queue + cache.

Environment variables: everything in `apps/api/.env.example`, sourced from Railway's secret store — never committed.
