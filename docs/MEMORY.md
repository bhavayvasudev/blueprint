# Blueprint — Implementation Memory

Status: living log, updated at the end of every completed phase milestone (per `RULES.md` §20) — not a design document, not a duplicate of `DECISIONS.md`. This file answers "where did implementation actually land, and why, when it differed from the plan" — a chronological record for whoever (human or agent) picks this project back up after time away.

"Underway" (per `README_ARCHITECTURE.md` §8) means: implementation begins the moment the first line of application code is written, not when a phase fully ships. Update this file incrementally as milestones inside a phase complete, not only at phase boundaries.

Each entry: date, what shipped, what deviated from `PHASES.md`/`ARCHITECTURE.md` and why (if anything), what's next.

---

## 2026-07-13 — Project initialized, Phase 0 underway

Planning documents (`PRD.md`, `ARCHITECTURE.md`, `RULES.md`, `PHASES.md`, `DECISIONS.md`, `README_ARCHITECTURE.md`) moved from conversation context into `docs/` as the durable source of truth. Repository initialized with git, monorepo scaffolding per `ARCHITECTURE.md` §18 stood up.

Two tooling ADRs added during scaffolding, not anticipated by the original doc set: **ADR-016** (uv, pinned to CPython 3.12, for the Python side — the 3.14 system default lacks mature native-extension wheel coverage for Tree-sitter/LangGraph/psycopg) and **ADR-017** (npm workspaces, not pnpm/Turborepo, for the JS monorepo — pnpm isn't installed on this machine and Phase 0 has no build graph complex enough to justify Turborepo). Both are explicitly conditional, revisit-on-signal decisions, not permanent commitments.

**Status:** Phase 0, PR1 (repo scaffolding + CI) in progress.

**Next:** PR1 completion, then PR2 (DB schema + migrations). PR3 (GitHub App auth) requires a real GitHub App to be registered in GitHub's UI (Client ID, private key, webhook secret) — this is a manual, human step that can't be fabricated; flagged for the project owner rather than blocking the rest of Phase 0. PR4 (Tree-sitter extraction) has no such external dependency and can proceed in parallel with PR3's manual setup step.
