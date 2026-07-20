"""`POST /repos/{id}/sync` (ARCHITECTURE.md §12) — the route-facing half of
sync. Creates the `RepoSnapshot` row (status=indexing, commit_sha unknown
until the clone resolves it — DECISIONS.md ADR-025) and enqueues the
ingestion job; `pipeline_runner.py` is what the enqueued job actually runs,
in the worker process, per ARCHITECTURE.md §13. Split into its own module
(rather than folded into `pipeline_runner.py`) so route tests can
monkeypatch `enqueue_ingestion_job` without needing a real Redis instance —
this environment has none, same constraint noted throughout docs/MEMORY.md
for Docker.
"""

from redis.exceptions import RedisError
from sqlalchemy.orm import Session

from integrations.queue.rq_queue import enqueue_ingestion_job
from models.repository import Repository, RepoSnapshot
from models.types import SnapshotStatus


def trigger_sync(db: Session, *, repository: Repository) -> RepoSnapshot:
    """Always returns a real, persisted snapshot row — if enqueueing fails
    (queue backend unreachable), the row is still committed but marked
    `failed` rather than left in a permanently-queued state with no
    corresponding job (RULES.md §16: a failure is recorded, never silent).

    The row is born `QUEUED`, not `INDEXING`. Nothing is indexing it yet:
    it has been handed to the queue, and a worker may pick it up in a
    millisecond or, if every worker in the pool is busy with another
    repository, in several minutes. Claiming `INDEXING` here was the single
    change that made a second concurrent study impossible — it put the row
    in a state whose stall budget assumes a worker is already on it, so the
    stall detector failed it 20 seconds later for the crime of waiting its
    turn. `pipeline_runner` promotes it to `INDEXING` when a worker really
    does claim it, and never before.

    This function does not check whether another study is already running.
    It deliberately never did — the serialisation was in the worker, not
    here — and with a pool there is nothing to serialise: studies of
    different repositories share no state (see
    `pipeline_runner.run_ingestion_pipeline`), so one waiting on another is
    a scheduling fact, not a correctness one.
    """
    snapshot = RepoSnapshot(
        repository_id=repository.id, commit_sha=None, status=SnapshotStatus.QUEUED
    )
    db.add(snapshot)
    db.flush()

    try:
        snapshot.job_id = enqueue_ingestion_job(snapshot.id)
    except RedisError:
        snapshot.status = SnapshotStatus.FAILED
        snapshot.error_message = "startup: could not reach the job queue to schedule this study"
        db.commit()
        raise

    db.commit()
    return snapshot
