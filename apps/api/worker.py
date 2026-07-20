"""Background worker entrypoint (ARCHITECTURE.md §13).

Same codebase as the API, different process. Consumes ingestion and
pipeline-run jobs from a Redis-backed RQ queue. LangGraph pipeline
execution happens exclusively here, never inline in a FastAPI request
handler, except Stage 11 (Prompt Generation) which is intentionally light
enough to run synchronously within the API process (added in Phase 7).

Why this is a *pool*
--------------------
This was a single `Worker`, and a single RQ worker consumes its queues
strictly serially: pop one job, run it to completion, pop the next. That is
the entire reason Blueprint could only ever study one repository at a time.
Nothing rejected the second study — `/sync` accepted it, committed a
snapshot row and enqueued a job exactly as it should. The job simply sat in
Redis behind the first one, sometimes for minutes, while its snapshot sat
in `indexing` with no `current_stage`. That state was indistinguishable
from a worker that had died before its first stage, so
`snapshot_service`'s stall detector did what it was built to do and failed
it after 20 seconds — which is what surfaced, quite reasonably, as "you
cannot study a second repository."

The fix is two-part and neither part is a rewrite: this file runs
`settings.worker_count` workers instead of one, and `SnapshotStatus.QUEUED`
gives a waiting study a state of its own so nothing mistakes patience for
death. The pipeline those workers run is untouched.

`rq.WorkerPool` (RQ ≥ 1.14) supervises N worker processes over the same
queues, which is the smallest possible change that gets real concurrency:
Redis already delivers each job to exactly one worker, so the pool needs no
coordination logic of its own, and each job still runs in its own process
with its own DB session and its own temporary clone directory
(`services/pipeline_runner.py`'s isolation contract).

The pool is bounded, never elastic. `max_concurrent_studies` is the cap on
how much real work runs at once — see `config.Settings` for what those
workers contend over (CPU, the repository provider's rate limit, the
embedding provider's concurrency) and why more of them stops helping well
before it stops being possible. Studies beyond the cap wait in the queue,
which is the point of having one.

`rq.Worker` forks a work-horse process per job (`os.fork()`), which
doesn't exist on Windows — on this platform every dequeued job crashed
the worker with `AttributeError` before the job function ever ran, so a
snapshot's status never advanced past `indexing` (the crash happened in
RQ's own dispatch loop, outside `pipeline_runner.py`'s try/except).
`rq.worker.SimpleWorker` runs the job in-process instead of forking —
no isolation between jobs, acceptable for local dev — while deployed
Linux workers keep the fork-based `Worker` and its per-job isolation.
Under the pool this distinction matters slightly more than it did: each
pool member is its own OS process either way, so concurrency across
studies is real on both platforms; what Windows gives up is only the
extra per-*job* process boundary within one worker.

Run with: `uv run python worker.py`
"""

import logging
import os

from redis import Redis
from rq import Queue
from rq.worker import SimpleWorker, Worker
from rq.worker_pool import WorkerPool

from config import get_settings

QUEUE_NAMES = ["ingestion", "pipeline"]


def _configure_logging(settings) -> None:
    """Mirrors `api/main.py`'s `_configure_logging` — this process never had
    its own logging setup, so `pipeline_runner.py`'s per-stage logs (and the
    fork-crash this file works around) were invisible here even after
    `api/main.py` got instrumented, since it's a separate process.

    Every line the pipeline logs is already prefixed `snapshot=<id>`, which
    is what keeps concurrent studies readable in one stream: with several
    running at once the log is interleaved by construction, and the snapshot
    id is how a reader separates them back out."""
    logging.basicConfig(
        level=logging.DEBUG if settings.environment == "development" else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s [pid %(process)d]: %(message)s",
    )


def main() -> None:
    settings = get_settings()
    _configure_logging(settings)
    connection = Redis.from_url(settings.redis_url)
    worker_class = Worker if hasattr(os, "fork") else SimpleWorker
    count = settings.worker_count

    logger = logging.getLogger(__name__)
    logger.info(
        "starting worker pool: workers=%s queues=%s worker_class=%s",
        count, ",".join(QUEUE_NAMES), worker_class.__name__,
    )

    # A single worker is still run as a plain `Worker`, not a one-member
    # pool: `WorkerPool` supervises subprocesses, so it would add a process
    # hop and a supervision layer to the exact configuration that had
    # neither before. Concurrency is what earns that cost.
    if count == 1:
        queues = [Queue(name, connection=connection) for name in QUEUE_NAMES]
        worker_class(queues, connection=connection).work()
        return

    WorkerPool(
        QUEUE_NAMES,
        connection=connection,
        num_workers=count,
        worker_class=worker_class,
    ).start()


if __name__ == "__main__":
    main()
