"""Real integration test against Postgres — skips here (no DB available
in this environment), runs for real in CI (see tests/conftest.py).
"""

import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from models.graph import GraphNode
from models.repository import Repository, RepoSnapshot, User
from models.types import ConnectionStatus, GraphType, SnapshotStatus
from pipeline.graph.knowledge import build_knowledge_graph
from pipeline.graph.repository import build_repository_graph
from pipeline.ingestion.discovery import find_manifest_directories
from pipeline.ingestion.extract import extract_repository
from services.graph_service import persist_graph
from services.ingestion_service import persist_files

FIXTURE_REPO = Path(__file__).parent.parent / "pipeline" / "ingestion" / "fixtures" / "sample_repo"


def _make_snapshot(session: Session) -> RepoSnapshot:
    user = User(
        id=uuid.uuid4(), github_id=f"test-{uuid.uuid4()}", email=f"{uuid.uuid4()}@example.com", name="Test"
    )
    session.add(user)
    session.flush()

    repository = Repository(
        id=uuid.uuid4(),
        user_id=user.id,
        github_repo_id=str(uuid.uuid4()),
        full_name="test/sample",
        default_branch="main",
        private=False,
        connection_status=ConnectionStatus.CONNECTED,
    )
    session.add(repository)
    session.flush()

    snapshot = RepoSnapshot(
        id=uuid.uuid4(),
        repository_id=repository.id,
        commit_sha="deadbeef",
        status=SnapshotStatus.INDEXING,
    )
    session.add(snapshot)
    session.flush()
    return snapshot


def test_persist_files_and_graph_end_to_end(db_session: Session) -> None:
    snapshot = _make_snapshot(db_session)

    facts = extract_repository(FIXTURE_REPO)
    files_by_path = persist_files(db_session, snapshot, facts)
    assert len(files_by_path) == len(facts)
    assert all(f.id is not None for f in files_by_path.values())

    kg_nodes, kg_edges = build_knowledge_graph(facts)
    persist_graph(db_session, snapshot.id, kg_nodes, kg_edges, files_by_path)

    manifest_dirs = find_manifest_directories(FIXTURE_REPO)
    repo_nodes, repo_edges = build_repository_graph(kg_nodes, kg_edges, manifest_dirs)
    persist_graph(db_session, snapshot.id, repo_nodes, repo_edges, files_by_path)

    db_session.flush()

    persisted_kg_nodes = (
        db_session.query(GraphNode)
        .filter_by(snapshot_id=snapshot.id, graph_type=GraphType.KNOWLEDGE)
        .all()
    )
    assert len(persisted_kg_nodes) == len(kg_nodes)
    # Every Knowledge Graph node maps to a real, persisted file (ADR-019).
    assert all(node.file_id is not None for node in persisted_kg_nodes)
    assert all(node.file_id in {f.id for f in files_by_path.values()} for node in persisted_kg_nodes)

    persisted_repo_nodes = (
        db_session.query(GraphNode)
        .filter_by(snapshot_id=snapshot.id, graph_type=GraphType.REPOSITORY)
        .all()
    )
    assert len(persisted_repo_nodes) == len(repo_nodes)
    # Repository Graph nodes roll up multiple files — never attributed to one.
    assert all(node.file_id is None for node in persisted_repo_nodes)
