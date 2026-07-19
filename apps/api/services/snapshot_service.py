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

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models.graph import GraphEdge, GraphNode
from models.repository import File, Repository, RepoSnapshot
from models.types import GraphType, PipelineStage, SnapshotStatus, StructuralConfidence
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


def _mark_stalled_if_needed(db: Session, snapshot: RepoSnapshot) -> RepoSnapshot:
    """Lazily detects a snapshot whose worker has gone silent — either the
    job was never picked up, or the worker died mid-stage (a crashed
    process never reaches `pipeline_runner.py`'s except block, so nothing
    else marks it `failed`) — and fails it here, on read, rather than
    leaving the UI polling `indexing` forever (RULES.md §16: a failure is
    recorded, never silent). Runs on every read of an `indexing` snapshot
    rather than via a separate monitor process, since nothing here needs
    sub-poll-interval precision."""
    if snapshot.status != SnapshotStatus.INDEXING:
        return snapshot

    now = datetime.now(UTC)
    if snapshot.current_stage is None:
        reference = snapshot.created_at
        budget = _NOT_STARTED_STALL_SECONDS
    else:
        reference = snapshot.stage_started_at or snapshot.created_at
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
        select(RepoSnapshot.created_at, RepoSnapshot.completed_at)
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
    durations = [(completed_at - created_at).total_seconds() for created_at, completed_at in rows]
    return int(round(sum(durations) / len(durations)))


def _attach_estimate(db: Session, snapshot: RepoSnapshot) -> RepoSnapshot:
    # A plain instance attribute, not a mapped column — `SnapshotOut`
    # reads it via Pydantic's `from_attributes`, same as any other field.
    snapshot.estimated_total_seconds = _estimate_total_seconds(db, snapshot)  # type: ignore[attr-defined]
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
    return [_attach_estimate(db, _mark_stalled_if_needed(db, snapshot)) for snapshot in snapshots]


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
    return _attach_estimate(db, _mark_stalled_if_needed(db, snapshot))


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
