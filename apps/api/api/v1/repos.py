"""Repository connect/list routes (ARCHITECTURE.md §12). Thin per
RULES.md §6 — all business logic lives in
`services.repository_connection_service`, which depends only on the
`RepositoryProvider` abstraction (DECISIONS.md ADR-023), never on GitHub
directly.
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.dependencies import get_current_user
from api.v1.schemas import (
    ArchitectureGraphOut,
    AvailableRepositoryOut,
    ConnectRepositoryRequest,
    GraphEdgeOut,
    GraphNodeOut,
    KnowledgeGraphStatusOut,
    LanguageStatOut,
    RepositoryOut,
    SnapshotOut,
    TreeSitterStatusOut,
)
from models.db import get_session
from models.repository import User
from services.repository_connection_service import (
    connect_repository,
    get_connected_repository,
    list_available_repositories,
    list_connected_repositories,
)
from services.snapshot_service import get_architecture_graph, get_snapshot, list_snapshots
from services.sync_service import trigger_sync

router = APIRouter(prefix="/repos", tags=["repos"])


@router.get("/available", response_model=list[AvailableRepositoryOut])
def available(
    installation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> list[AvailableRepositoryOut]:
    metadata = list_available_repositories(db, user=user, installation_id=installation_id)
    return [AvailableRepositoryOut(**item.model_dump()) for item in metadata]


@router.post("/connect", response_model=RepositoryOut, status_code=201)
def connect(
    body: ConnectRepositoryRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> RepositoryOut:
    repository = connect_repository(
        db, user=user, installation_id=body.installation_id, full_name=body.full_name
    )
    db.commit()
    return RepositoryOut.model_validate(repository)


@router.get("", response_model=list[RepositoryOut])
def list_repos(
    user: User = Depends(get_current_user), db: Session = Depends(get_session)
) -> list[RepositoryOut]:
    return [
        RepositoryOut.model_validate(repo) for repo in list_connected_repositories(db, user=user)
    ]


@router.get("/{repository_id}", response_model=RepositoryOut)
def get_repo(
    repository_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> RepositoryOut:
    repository = get_connected_repository(db, user=user, repository_id=repository_id)
    return RepositoryOut.model_validate(repository)


@router.post("/{repository_id}/sync", response_model=SnapshotOut, status_code=202)
def sync(
    repository_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> SnapshotOut:
    """Triggers a pipeline run (RULES.md §14: returns immediately with a
    job/request ID — here, the new snapshot's own ID — rather than holding
    the request open for the full pipeline duration)."""
    repository = get_connected_repository(db, user=user, repository_id=repository_id)
    snapshot = trigger_sync(db, repository=repository)
    return SnapshotOut.model_validate(snapshot)


@router.get("/{repository_id}/snapshots", response_model=list[SnapshotOut])
def snapshots(
    repository_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> list[SnapshotOut]:
    repository = get_connected_repository(db, user=user, repository_id=repository_id)
    return [SnapshotOut.model_validate(s) for s in list_snapshots(db, repository=repository)]


@router.get("/{repository_id}/snapshots/{snapshot_id}", response_model=SnapshotOut)
def snapshot_detail(
    repository_id: uuid.UUID,
    snapshot_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> SnapshotOut:
    repository = get_connected_repository(db, user=user, repository_id=repository_id)
    snapshot = get_snapshot(db, repository=repository, snapshot_id=snapshot_id)
    return SnapshotOut.model_validate(snapshot)


@router.get(
    "/{repository_id}/snapshots/{snapshot_id}/architecture-graph",
    response_model=ArchitectureGraphOut,
)
def architecture_graph(
    repository_id: uuid.UUID,
    snapshot_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> ArchitectureGraphOut:
    """ARCHITECTURE.md §12 — Repository Graph nodes/edges plus the
    deterministic Phase 0 status data the Architecture View renders
    alongside it (RULES.md §18: no fabricated percentages, only what's
    directly explainable from `files`/`graph_nodes`/`graph_edges`)."""
    repository = get_connected_repository(db, user=user, repository_id=repository_id)
    snapshot = get_snapshot(db, repository=repository, snapshot_id=snapshot_id)
    data = get_architecture_graph(db, snapshot=snapshot)
    return ArchitectureGraphOut(
        snapshot=SnapshotOut.model_validate(data.snapshot),
        file_count=data.file_count,
        language_mix=[LanguageStatOut.model_validate(stat) for stat in data.language_mix],
        tree_sitter_status=TreeSitterStatusOut.model_validate(data.tree_sitter_status),
        knowledge_graph_status=KnowledgeGraphStatusOut.model_validate(data.knowledge_graph_status),
        repository_graph_nodes=[
            GraphNodeOut(id=node.id, node_type=node.node_type, label=node.label, metadata=node.node_metadata)
            for node in data.repository_graph_nodes
        ],
        repository_graph_edges=[GraphEdgeOut.model_validate(edge) for edge in data.repository_graph_edges],
    )
