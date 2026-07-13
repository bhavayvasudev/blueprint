"""The one place `rq`/`redis` is imported for enqueueing (module docstring).
The job function itself (`services.pipeline_runner.run_ingestion_job`) is
referenced here only by its importable dotted path — RQ resolves and
imports that path inside the worker process (`worker.py`), never inside
the API process at enqueue time.
"""

import uuid

from redis import Redis
from rq import Queue

from config import get_settings

_INGESTION_QUEUE_NAME = "ingestion"
_INGESTION_JOB_PATH = "services.pipeline_runner.run_ingestion_job"


def enqueue_ingestion_job(snapshot_id: uuid.UUID) -> str:
    """Enqueues the ingestion pipeline for one snapshot; returns the RQ
    job ID. Raises whatever `redis`/`rq` raises on a connection failure —
    callers (the `/sync` route) let that propagate as a 502-class error
    rather than silently swallowing it (RULES.md §6)."""
    settings = get_settings()
    connection = Redis.from_url(settings.redis_url)
    queue = Queue(_INGESTION_QUEUE_NAME, connection=connection)
    job = queue.enqueue(_INGESTION_JOB_PATH, str(snapshot_id))
    return job.id
