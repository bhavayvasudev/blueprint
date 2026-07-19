"""Background worker entrypoint (ARCHITECTURE.md §13).

Same codebase as the API, different process. Consumes ingestion and
pipeline-run jobs from a Redis-backed RQ queue. LangGraph pipeline
execution happens exclusively here, never inline in a FastAPI request
handler, except Stage 11 (Prompt Generation) which is intentionally light
enough to run synchronously within the API process (added in Phase 7).

`rq.Worker` forks a work-horse process per job (`os.fork()`), which
doesn't exist on Windows — on this platform every dequeued job crashed
the worker with `AttributeError` before the job function ever ran, so a
snapshot's status never advanced past `indexing` (the crash happened in
RQ's own dispatch loop, outside `pipeline_runner.py`'s try/except).
`rq.worker.SimpleWorker` runs the job in-process instead of forking —
no isolation between jobs, acceptable for local dev — while deployed
Linux workers keep the fork-based `Worker` and its per-job isolation.

Run with: `uv run python worker.py`
"""

import logging
import os

from redis import Redis
from rq import Queue
from rq.worker import SimpleWorker, Worker

from config import get_settings

QUEUE_NAMES = ["ingestion", "pipeline"]


def _configure_logging(settings) -> None:
    """Mirrors `api/main.py`'s `_configure_logging` — this process never had
    its own logging setup, so `pipeline_runner.py`'s per-stage logs (and the
    fork-crash this file works around) were invisible here even after
    `api/main.py` got instrumented, since it's a separate process."""
    logging.basicConfig(
        level=logging.DEBUG if settings.environment == "development" else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def main() -> None:
    settings = get_settings()
    _configure_logging(settings)
    connection = Redis.from_url(settings.redis_url)
    queues = [Queue(name, connection=connection) for name in QUEUE_NAMES]
    worker_class = Worker if hasattr(os, "fork") else SimpleWorker
    worker_class(queues, connection=connection).work()


if __name__ == "__main__":
    main()
