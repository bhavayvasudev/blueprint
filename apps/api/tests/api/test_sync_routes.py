"""`POST /repos/{id}/sync`, `GET /repos/{id}/snapshots[/...]`, and
`GET /repos/{id}/snapshots/{id}/architecture-graph` (ARCHITECTURE.md §12).
`services.sync_service.enqueue_ingestion_job` is monkeypatched throughout
(matching `tests/api/test_repos_routes.py`'s `get_repository_provider`
pattern) so these tests need no real Redis instance (this environment has
none — see docs/MEMORY.md).
"""

import uuid

import pytest
from fastapi.testclient import TestClient
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlalchemy.orm import Session

from api.dependencies import SESSION_COOKIE_NAME
from config import Settings
from models.graph import GraphEdge, GraphNode
from models.installation import Installation
from models.repository import File, Repository, User
from models.types import AccountType, ConnectionStatus, GraphType, InstallationStatus, StructuralConfidence
from services import sync_service as sync_service_module
from services.auth_service import create_session_token


def _logged_in_user(client: TestClient, db_session: Session, test_settings: Settings) -> User:
    user = User(
        id=uuid.uuid4(), github_id=f"gh-{uuid.uuid4()}", email=f"{uuid.uuid4()}@example.com", name="Test"
    )
    db_session.add(user)
    db_session.flush()
    token = create_session_token(user.id, settings=test_settings)
    client.cookies.set(SESSION_COOKIE_NAME, token)
    return user


def _connected_repository(db_session: Session, user: User) -> Repository:
    installation = Installation(
        id=uuid.uuid4(),
        user_id=user.id,
        provider="github",
        external_id=str(uuid.uuid4()),
        account_login="acme-corp",
        account_type=AccountType.ORGANIZATION,
        status=InstallationStatus.ACTIVE,
    )
    db_session.add(installation)
    db_session.flush()

    repository = Repository(
        id=uuid.uuid4(),
        user_id=user.id,
        installation_id=installation.id,
        github_repo_id=str(uuid.uuid4()),
        full_name="acme/widgets",
        default_branch="main",
        private=True,
        connection_status=ConnectionStatus.CONNECTED,
    )
    db_session.add(repository)
    db_session.flush()
    return repository


def test_sync_without_cookie_returns_401(client: TestClient) -> None:
    response = client.post(f"/api/v1/repos/{uuid.uuid4()}/sync")
    assert response.status_code == 401


def test_sync_triggers_job_and_creates_indexing_snapshot(
    client: TestClient,
    db_session: Session,
    test_settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = _logged_in_user(client, db_session, test_settings)
    repository = _connected_repository(db_session, user)

    enqueued: list[uuid.UUID] = []
    monkeypatch.setattr(
        sync_service_module, "enqueue_ingestion_job", lambda snapshot_id: enqueued.append(snapshot_id)
    )

    response = client.post(f"/api/v1/repos/{repository.id}/sync")
    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "indexing"
    assert body["commit_sha"] is None
    assert enqueued == [uuid.UUID(body["id"])]

    list_response = client.get(f"/api/v1/repos/{repository.id}/snapshots")
    assert list_response.status_code == 200
    assert [s["id"] for s in list_response.json()] == [body["id"]]

    detail_response = client.get(f"/api/v1/repos/{repository.id}/snapshots/{body['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["status"] == "indexing"


def test_sync_marks_snapshot_failed_when_queue_unavailable(
    client: TestClient,
    db_session: Session,
    test_settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = _logged_in_user(client, db_session, test_settings)
    repository = _connected_repository(db_session, user)

    def _raise(snapshot_id: uuid.UUID) -> str:
        raise RedisConnectionError("no queue backend reachable")

    monkeypatch.setattr(sync_service_module, "enqueue_ingestion_job", _raise)

    response = client.post(f"/api/v1/repos/{repository.id}/sync")
    assert response.status_code == 503

    list_response = client.get(f"/api/v1/repos/{repository.id}/snapshots")
    assert [s["status"] for s in list_response.json()] == ["failed"]


def test_snapshot_detail_404_for_unknown_snapshot(
    client: TestClient, db_session: Session, test_settings: Settings
) -> None:
    user = _logged_in_user(client, db_session, test_settings)
    repository = _connected_repository(db_session, user)

    response = client.get(f"/api/v1/repos/{repository.id}/snapshots/{uuid.uuid4()}")
    assert response.status_code == 404


def test_architecture_graph_reflects_persisted_files_and_repository_graph(
    client: TestClient, db_session: Session, test_settings: Settings
) -> None:
    user = _logged_in_user(client, db_session, test_settings)
    repository = _connected_repository(db_session, user)

    from models.repository import RepoSnapshot
    from models.types import SnapshotStatus

    snapshot = RepoSnapshot(
        id=uuid.uuid4(), repository_id=repository.id, commit_sha="abc123", status=SnapshotStatus.READY
    )
    db_session.add(snapshot)
    db_session.flush()

    py_file = File(
        id=uuid.uuid4(),
        snapshot_id=snapshot.id,
        path="main.py",
        language="python",
        loc=42,
        content_hash="h1",
        structural_confidence=StructuralConfidence.FULL,
    )
    go_file = File(
        id=uuid.uuid4(),
        snapshot_id=snapshot.id,
        path="service/server.go",
        language="go",
        loc=10,
        content_hash="h2",
        structural_confidence=StructuralConfidence.LOW,
    )
    db_session.add_all([py_file, go_file])
    db_session.flush()

    knowledge_node = GraphNode(
        id=uuid.uuid4(),
        snapshot_id=snapshot.id,
        graph_type=GraphType.KNOWLEDGE,
        node_type="module",
        label="main.py",
        node_metadata={},
        file_id=py_file.id,
    )
    module_a = GraphNode(
        id=uuid.uuid4(),
        snapshot_id=snapshot.id,
        graph_type=GraphType.REPOSITORY,
        node_type="module",
        label=".",
        node_metadata={"file_paths": ["main.py"]},
    )
    module_b = GraphNode(
        id=uuid.uuid4(),
        snapshot_id=snapshot.id,
        graph_type=GraphType.REPOSITORY,
        node_type="service",
        label="service",
        node_metadata={"file_paths": ["service/server.go"]},
    )
    db_session.add_all([knowledge_node, module_a, module_b])
    db_session.flush()

    edge = GraphEdge(
        id=uuid.uuid4(),
        snapshot_id=snapshot.id,
        graph_type=GraphType.REPOSITORY,
        source_node_id=module_a.id,
        target_node_id=module_b.id,
        edge_type="depends_on",
    )
    db_session.add(edge)
    db_session.flush()

    response = client.get(
        f"/api/v1/repos/{repository.id}/snapshots/{snapshot.id}/architecture-graph"
    )
    assert response.status_code == 200
    body = response.json()

    assert body["file_count"] == 2
    language_mix = {row["language"]: row for row in body["language_mix"]}
    assert language_mix["python"] == {"language": "python", "file_count": 1, "loc": 42}
    assert language_mix["go"] == {"language": "go", "file_count": 1, "loc": 10}

    assert body["tree_sitter_status"] == {"full_confidence_files": 1, "low_confidence_files": 1}
    assert body["knowledge_graph_status"] == {"node_count": 1, "edge_count": 0}

    node_labels = {n["label"] for n in body["repository_graph_nodes"]}
    assert node_labels == {".", "service"}
    assert len(body["repository_graph_edges"]) == 1
    assert body["repository_graph_edges"][0]["edge_type"] == "depends_on"
