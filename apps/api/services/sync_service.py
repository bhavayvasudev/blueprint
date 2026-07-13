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
    `failed` rather than left in a permanently-indexing state with no
    corresponding job (RULES.md §16: a failure is recorded, never silent)."""
    snapshot = RepoSnapshot(
        repository_id=repository.id, commit_sha=None, status=SnapshotStatus.INDEXING
    )
    db.add(snapshot)
    db.flush()

    try:
        enqueue_ingestion_job(snapshot.id)
    except RedisError:
        snapshot.status = SnapshotStatus.FAILED
        db.commit()
        raise

    db.commit()
    return snapshot
