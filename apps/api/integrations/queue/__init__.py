"""RQ/Redis wrapper (RULES.md §6: every external call is wrapped in
`integrations/`, never called directly from `services/`).

`rq_queue.enqueue_ingestion_job()` is the only place a `Queue` is ever
constructed or `.enqueue()` is ever called — `services/sync_service.py`
depends on this module's function, never on `rq`/`redis` directly, which
is what keeps the route/service layer swappable to a different queue
backend and, closer term, mockable in tests without a real Redis
instance running (this environment has none, same constraint as Docker —
see `docs/MEMORY.md`).
"""
