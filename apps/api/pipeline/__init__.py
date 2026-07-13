"""The Repository Intelligence Pipeline (ARCHITECTURE.md §3).

Must remain importable and runnable without FastAPI running (RULES.md §6,
ARCHITECTURE.md §13) — nothing in this package or its subpackages may
import from `api/`. This is what lets a future CLI (`blueprint scan .`,
PRD.md §16) reuse the pipeline with zero rework.
"""
