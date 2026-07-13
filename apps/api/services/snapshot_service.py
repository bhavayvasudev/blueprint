"""Read queries backing `GET /repos/{id}/snapshots`,
`GET /repos/{id}/snapshots/{snapshot_id}`, and
`GET /repos/{id}/snapshots/{snapshot_id}/architecture-graph`
(ARCHITECTURE.md §12) — the service layer `api/v1/snapshots.py`'s thin
routes call into (RULES.md §6). Every number here is a direct aggregate
over `files`/`graph_nodes`/`graph_edges` for one snapshot — nothing
inferred, nothing LLM-touched (this is Phase 0 deterministic data only).
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models.graph import GraphEdge, GraphNode
from models.repository import File, Repository, RepoSnapshot
from models.types import GraphType, StructuralConfidence


class SnapshotNotFound(Exception):
    """No snapshot with this ID exists for this repository — a dedicated
    type rather than a bare `LookupError` (see
    `services.installation_service.InstallationNotFound` for why)."""


def list_snapshots(db: Session, *, repository: Repository) -> list[RepoSnapshot]:
    return list(
        db.execute(
            select(RepoSnapshot)
            .where(RepoSnapshot.repository_id == repository.id)
            .order_by(RepoSnapshot.created_at.desc())
        )
        .scalars()
        .all()
    )


def get_snapshot(db: Session, *, repository: Repository, snapshot_id: uuid.UUID) -> RepoSnapshot:
    snapshot = db.execute(
        select(RepoSnapshot).where(
            RepoSnapshot.id == snapshot_id, RepoSnapshot.repository_id == repository.id
        )
    ).scalar_one_or_none()
    if snapshot is None:
        raise SnapshotNotFound(f"No snapshot {snapshot_id} for this repository")
    return snapshot


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
