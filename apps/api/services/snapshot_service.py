"""Read queries backing `GET /repos/{id}/snapshots`,
`GET /repos/{id}/snapshots/{snapshot_id}`, and
`GET /repos/{id}/snapshots/{snapshot_id}/architecture-graph`
(ARCHITECTURE.md §12) — the service layer `api/v1/snapshots.py`'s thin
routes call into (RULES.md §6). Every number here is a direct aggregate
over `files`/`graph_nodes`/`graph_edges` for one snapshot — nothing
inferred, nothing LLM-touched (this is Phase 0 deterministic data only).
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from integrations.queue.rq_queue import (
    JobPresence,
    cancel_ingestion_job,
    job_presence,
    job_queue_position,
)
from models.graph import GraphEdge, GraphNode
from models.repository import File, Repository, RepoSnapshot
from models.types import (
    ACTIVE_SNAPSHOT_STATUSES,
    GraphType,
    PipelineStage,
    SnapshotStatus,
    StructuralConfidence,
)
from services.pipeline_runner import (
    _CLONE_TIMEOUT_SECONDS,
    _INDEXING_TIMEOUT_SECONDS,
    _STAGE_TIMEOUT_SECONDS,
)

logger = logging.getLogger(__name__)

# A snapshot whose `current_stage` is still null this long after `created_at`
# never got picked up by a worker at all (lost job, no worker running) — the
# literal "stuck on Starting forever" case. Stages already in progress get a
# budget derived from `pipeline_runner.py`'s own per-stage timeouts instead
# of this flat number, so a legitimately slow clone/parse isn't flagged
# before the worker itself would have failed it.
_NOT_STARTED_STALL_SECONDS = 20
_STAGE_STALL_GRACE_SECONDS = 30


# Each stage's stall budget must track the budget the worker itself enforces
# for that stage (`pipeline_runner._exit_stage`), or this detector fails
# snapshots the worker considers perfectly healthy. The Stage 4 indexing
# stages are the reason this is a function rather than one constant: they are
# network-bound across hundreds of embedding requests and legitimately run for
# minutes, so holding them to the 60s in-process budget would mark every
# real-sized repository "stalled" while it was actively, correctly indexing.
def _stage_budget_seconds(stage: PipelineStage) -> int:
    if stage == PipelineStage.CLONING:
        return _CLONE_TIMEOUT_SECONDS
    if stage in (PipelineStage.INDEXING_DOCS, PipelineStage.INDEXING_CODE):
        return _INDEXING_TIMEOUT_SECONDS
    return _STAGE_TIMEOUT_SECONDS


class SnapshotNotFound(Exception):
    """No snapshot with this ID exists for this repository — a dedicated
    type rather than a bare `LookupError` (see
    `services.installation_service.InstallationNotFound` for why)."""


def _mark_queued_lost_if_needed(db: Session, snapshot: RepoSnapshot) -> RepoSnapshot:
    """Fails a `QUEUED` snapshot only when the queue itself says its job is
    gone — never on a timer.

    A queued study has no deadline, and must not have one. With a worker
    pool and a queue, waiting is the correct, expected state of every study
    beyond the pool's capacity, and it can legitimately last as long as the
    studies ahead of it take. The wall-clock budget that used to govern this
    case (`_NOT_STARTED_STALL_SECONDS`, 20s) is precisely what made a second
    concurrent study impossible: it fired while the first study was still
    running, and reported "the worker process likely crashed or was never
    running" about a worker that was busy and a queue that was fine.

    So the question is no longer "how long has it waited" but "does its job
    still exist", which `rq_queue.job_presence` answers from real queue
    state. Only `LOST` — the queue answered and has no record of this job —
    is grounds to fail it. `UNKNOWN` (Redis unreachable, or no job id on the
    row) proves nothing and is left alone, because failing every waiting
    study over a momentary Redis blip would be a far worse error than
    leaving one honestly-labelled `queued` a little too long.
    """
    if snapshot.status != SnapshotStatus.QUEUED:
        return snapshot
    if job_presence(snapshot.job_id) != JobPresence.LOST:
        return snapshot

    logger.warning("snapshot=%s event=queued_job_lost job=%s", snapshot.id, snapshot.job_id)
    snapshot.status = SnapshotStatus.FAILED
    snapshot.current_stage = None
    snapshot.stage_started_at = None
    snapshot.completed_at = datetime.now(UTC)
    snapshot.error_message = (
        "startup: this study was queued but its job is no longer in the queue, so no "
        "worker will ever pick it up (the queue was flushed, or the job was dropped)"
    )[:500]
    db.commit()
    return snapshot


def _mark_stalled_if_needed(db: Session, snapshot: RepoSnapshot) -> RepoSnapshot:
    """Lazily detects a snapshot whose worker has gone silent — a worker
    that claimed the row and then died (a crashed process never reaches
    `pipeline_runner.py`'s except block, so nothing else marks it `failed`)
    — and fails it here, on read, rather than leaving the UI polling
    `indexing` forever (RULES.md §16: a failure is recorded, never silent).
    Runs on every read of an `indexing` snapshot rather than via a separate
    monitor process, since nothing here needs sub-poll-interval precision.

    Scoped to `INDEXING` only. A `QUEUED` snapshot is not stalled, it is
    waiting, and it is judged by `_mark_queued_lost_if_needed` against the
    queue instead — see that function for why a clock is the wrong
    instrument there.

    The `current_stage is None` branch now means something narrower than it
    used to: a worker that took the row (so `started_at` is set) but died
    before committing its first stage. That is a real crash and still gets
    the tight `_NOT_STARTED_STALL_SECONDS` budget — but the budget is
    measured from when the worker *claimed* the snapshot, not from when it
    was created, so time spent queueing is never charged against it.
    """
    if snapshot.status != SnapshotStatus.INDEXING:
        return snapshot

    now = datetime.now(UTC)
    if snapshot.current_stage is None:
        reference = snapshot.started_at or snapshot.created_at
        budget = _NOT_STARTED_STALL_SECONDS
    else:
        reference = snapshot.stage_started_at or snapshot.started_at or snapshot.created_at
        budget = _stage_budget_seconds(snapshot.current_stage) + _STAGE_STALL_GRACE_SECONDS

    elapsed = (now - reference).total_seconds()
    if elapsed <= budget:
        return snapshot

    # `current_stage` is a plain `String` column, so SQLAlchemy hands back a
    # `str` on any load from the database, not a `PipelineStage` — `.value`
    # on it raised `AttributeError` and took down this whole function. It only
    # ever bit when a stage was actually set (a worker that died *mid-stage*),
    # which is precisely the case this detector exists to report; the common
    # "job never picked up" path has `current_stage is None` and took the
    # literal branch instead, which is why it went unnoticed. `PipelineStage`
    # is a `StrEnum`, so `str()` is correct for both forms.
    stage_label = str(snapshot.current_stage) if snapshot.current_stage else "startup"
    logger.warning(
        "snapshot=%s stage=%s event=stalled elapsed=%.1fs budget=%ss",
        snapshot.id, stage_label, elapsed, budget,
    )
    snapshot.status = SnapshotStatus.FAILED
    snapshot.current_stage = None
    snapshot.stage_started_at = None
    snapshot.error_message = (
        f"{stage_label}: no progress update from the worker in {elapsed:.0f}s "
        "(the worker process likely crashed or was never running)"
    )[:500]
    db.commit()
    return snapshot


_ETA_HISTORY_LIMIT = 5


def _estimate_total_seconds(db: Session, snapshot: RepoSnapshot) -> int | None:
    """A real, historical-average ETA — the average `completed_at -
    created_at` across this repository's last `_ETA_HISTORY_LIMIT` READY
    studies — never a fabricated countdown (PRODUCT.md bans "AI theater"
    ETAs; RULES.md §23 bans fabricated numbers generally). Returns `None`
    for a repository's first-ever study: there is nothing honest to
    estimate from yet, and the frontend is expected to say so rather than
    show a number."""
    if snapshot.status != SnapshotStatus.INDEXING:
        return None
    rows = db.execute(
        select(RepoSnapshot.created_at, RepoSnapshot.started_at, RepoSnapshot.completed_at)
        .where(
            RepoSnapshot.repository_id == snapshot.repository_id,
            RepoSnapshot.status == SnapshotStatus.READY,
            RepoSnapshot.completed_at.is_not(None),
        )
        .order_by(RepoSnapshot.created_at.desc())
        .limit(_ETA_HISTORY_LIMIT)
    ).all()
    if not rows:
        return None
    # Measured from when a worker *started* the study, not when it was
    # enqueued. Under concurrency those differ by however long the queue
    # was — including a queue wait in the average would mean one busy
    # afternoon permanently inflated every future estimate for this
    # repository, and the number is supposed to describe how long studying
    # it takes, not how busy Blueprint was. `created_at` remains the
    # fallback for rows studied before `started_at` existed.
    durations = [
        (completed_at - (started_at or created_at)).total_seconds()
        for created_at, started_at, completed_at in rows
    ]
    return int(round(sum(durations) / len(durations)))


def _queue_position(snapshot: RepoSnapshot) -> int | None:
    """How many studies are ahead of this one, 1-based — a real count from
    the queue, only for a snapshot that is actually waiting. `None` for
    every other status, and for a queued job the queue can't be asked
    about; the UI says "waiting for a worker" without a number rather than
    inventing one (RULES.md §23)."""
    if snapshot.status != SnapshotStatus.QUEUED:
        return None
    return job_queue_position(snapshot.job_id)


def _decorate(db: Session, snapshot: RepoSnapshot) -> RepoSnapshot:
    """Everything a read of one snapshot needs beyond its columns: settle
    whether it is still really alive, then attach the two computed fields.

    Both liveness checks run, in order, and each is a no-op for a status it
    doesn't own — `_mark_queued_lost_if_needed` only judges `QUEUED`,
    `_mark_stalled_if_needed` only judges `INDEXING`. Ordering them this way
    means a snapshot claimed by a worker between the two calls is judged by
    the stall detector on the same read, rather than escaping both.
    """
    snapshot = _mark_stalled_if_needed(db, _mark_queued_lost_if_needed(db, snapshot))
    # Plain instance attributes, not mapped columns — `SnapshotOut` reads
    # them via Pydantic's `from_attributes`, same as any other field.
    snapshot.estimated_total_seconds = _estimate_total_seconds(db, snapshot)  # type: ignore[attr-defined]
    snapshot.queue_position = _queue_position(snapshot)  # type: ignore[attr-defined]
    return snapshot


def list_snapshots(db: Session, *, repository: Repository) -> list[RepoSnapshot]:
    snapshots = list(
        db.execute(
            select(RepoSnapshot)
            .where(RepoSnapshot.repository_id == repository.id)
            .order_by(RepoSnapshot.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [_decorate(db, snapshot) for snapshot in snapshots]


def latest_ready_snapshot(db: Session, *, repository: Repository) -> RepoSnapshot | None:
    """The newest study that actually completed, or None if this repository
    has never finished one. The canonical "what does Blueprint currently
    know about this repo" pointer — search, the Briefing and the Atlas all
    read the same snapshot, so they can never describe different studies."""
    return db.execute(
        select(RepoSnapshot)
        .where(
            RepoSnapshot.repository_id == repository.id,
            RepoSnapshot.status == SnapshotStatus.READY,
        )
        .order_by(RepoSnapshot.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()


def get_snapshot(db: Session, *, repository: Repository, snapshot_id: uuid.UUID) -> RepoSnapshot:
    snapshot = db.execute(
        select(RepoSnapshot).where(
            RepoSnapshot.id == snapshot_id, RepoSnapshot.repository_id == repository.id
        )
    ).scalar_one_or_none()
    if snapshot is None:
        raise SnapshotNotFound(f"No snapshot {snapshot_id} for this repository")
    return _decorate(db, snapshot)


class SnapshotNotCancellable(Exception):
    """This snapshot has already reached a terminal status — there is
    nothing left to cancel. Surfaced as 409, not silently accepted: telling
    a user their finished study was cancelled would be a false report of
    what happened (RULES.md §8)."""


def cancel_snapshot(db: Session, *, repository: Repository, snapshot_id: uuid.UUID) -> RepoSnapshot:
    """Stops one study, and only that study.

    Two halves, in this order. First the row is moved to `CANCELLED` under
    the same conditional-UPDATE discipline `pipeline_runner._claim_snapshot`
    uses — `rowcount == 0` means it reached a terminal status first, so the
    request is refused rather than overwriting a real result. Doing this
    *before* touching the queue is what closes the race with a worker about
    to claim it: `_claim_snapshot` only promotes rows still in `QUEUED`, so
    once this UPDATE commits, no worker can start the study, and one already
    running observes the new status at its next stage boundary
    (`_raise_if_cancelled`).

    Then the queue is told, which matters only for a job still waiting —
    removing it means no worker ever wakes up for a study that has already
    been called off. A failure to reach Redis here is logged and tolerated:
    the database is authoritative, and a worker that picks up the orphaned
    job will decline it at the claim.
    """
    snapshot = get_snapshot(db, repository=repository, snapshot_id=snapshot_id)

    result = db.execute(
        update(RepoSnapshot)
        .where(
            RepoSnapshot.id == snapshot.id,
            RepoSnapshot.status.in_(tuple(ACTIVE_SNAPSHOT_STATUSES)),
        )
        .values(status=SnapshotStatus.CANCELLED, completed_at=datetime.now(UTC))
    )
    db.commit()
    if result.rowcount == 0:
        raise SnapshotNotCancellable(
            f"This study is already {snapshot.status} and cannot be cancelled"
        )

    cancel_ingestion_job(snapshot.job_id)
    logger.info("snapshot=%s event=cancelled job=%s", snapshot.id, snapshot.job_id)
    db.refresh(snapshot)
    return _decorate(db, snapshot)


@dataclass
class LanguageStat:
    language: str
    file_count: int
    loc: int


@dataclass
class TreeSitterStatus:
    full_confidence_files: int
    low_confidence_files: int


@dataclass
class KnowledgeGraphStatus:
    node_count: int
    edge_count: int


@dataclass
class ArchitectureGraphData:
    snapshot: RepoSnapshot
    file_count: int
    language_mix: list[LanguageStat]
    tree_sitter_status: TreeSitterStatus
    knowledge_graph_status: KnowledgeGraphStatus
    repository_graph_nodes: list[GraphNode]
    repository_graph_edges: list[GraphEdge]


def get_architecture_graph(db: Session, *, snapshot: RepoSnapshot) -> ArchitectureGraphData:
    language_rows = db.execute(
        select(File.language, func.count(File.id), func.coalesce(func.sum(File.loc), 0))
        .where(File.snapshot_id == snapshot.id)
        .group_by(File.language)
        .order_by(File.language)
    ).all()
    language_mix = [
        LanguageStat(language=language, file_count=count, loc=loc)
        for language, count, loc in language_rows
    ]
    file_count = sum(stat.file_count for stat in language_mix)

    confidence_pairs = db.execute(
        select(File.structural_confidence, func.count(File.id))
        .where(File.snapshot_id == snapshot.id)
        .group_by(File.structural_confidence)
    ).all()
    confidence_rows: dict[StructuralConfidence, int] = {
        confidence: count for confidence, count in confidence_pairs
    }
    tree_sitter_status = TreeSitterStatus(
        full_confidence_files=confidence_rows.get(StructuralConfidence.FULL, 0),
        low_confidence_files=confidence_rows.get(StructuralConfidence.LOW, 0),
    )

    knowledge_graph_status = KnowledgeGraphStatus(
        node_count=db.execute(
            select(func.count(GraphNode.id)).where(
                GraphNode.snapshot_id == snapshot.id, GraphNode.graph_type == GraphType.KNOWLEDGE
            )
        ).scalar_one(),
        edge_count=db.execute(
            select(func.count(GraphEdge.id)).where(
                GraphEdge.snapshot_id == snapshot.id, GraphEdge.graph_type == GraphType.KNOWLEDGE
            )
        ).scalar_one(),
    )

    repository_graph_nodes = list(
        db.execute(
            select(GraphNode)
            .where(
                GraphNode.snapshot_id == snapshot.id, GraphNode.graph_type == GraphType.REPOSITORY
            )
            .order_by(GraphNode.label)
        )
        .scalars()
        .all()
    )
    repository_graph_edges = list(
        db.execute(
            select(GraphEdge).where(
                GraphEdge.snapshot_id == snapshot.id, GraphEdge.graph_type == GraphType.REPOSITORY
            )
        )
        .scalars()
        .all()
    )

    return ArchitectureGraphData(
        snapshot=snapshot,
        file_count=file_count,
        language_mix=language_mix,
        tree_sitter_status=tree_sitter_status,
        knowledge_graph_status=knowledge_graph_status,
        repository_graph_nodes=repository_graph_nodes,
        repository_graph_edges=repository_graph_edges,
    )
