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
from integrations.queue.rq_queue import JobPresence
from config import Settings
from models.graph import GraphEdge, GraphNode
from models.installation import Installation
from models.repository import File, Repository, User
from models.types import AccountType, ConnectionStatus, GraphType, InstallationStatus, StructuralConfidence
from services import snapshot_service as snapshot_service_module
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


def test_sync_triggers_job_and_creates_queued_snapshot(
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
    # `queued`, not `indexing`: the job has been handed to the queue and
    # nothing is studying it yet. Claiming `indexing` here is what used to
    # expose a waiting study to the not-started stall budget and fail it.
    assert body["status"] == "queued"
    assert body["commit_sha"] is None
    assert body["started_at"] is None
    assert enqueued == [uuid.UUID(body["id"])]

    list_response = client.get(f"/api/v1/repos/{repository.id}/snapshots")
    assert list_response.status_code == 200
    assert [s["id"] for s in list_response.json()] == [body["id"]]

    detail_response = client.get(f"/api/v1/repos/{repository.id}/snapshots/{body['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["status"] == "queued"


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


def test_two_repositories_can_be_synced_without_either_failing(
    client: TestClient,
    db_session: Session,
    test_settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The product-level claim, at the route boundary: syncing a second
    repository while the first is outstanding gives back a real queued
    snapshot, and neither study disturbs the other.

    Under the old model the second `/sync` succeeded here too — the failure
    came later, when the second snapshot was read back and the stall
    detector had already failed it for waiting. So this test reads both
    snapshots back, which is where the bug actually surfaced.
    """
    user = _logged_in_user(client, db_session, test_settings)
    first = _connected_repository(db_session, user)
    second = Repository(
        id=uuid.uuid4(),
        user_id=user.id,
        installation_id=first.installation_id,
        github_repo_id=str(uuid.uuid4()),
        full_name="acme/gadgets",
        default_branch="main",
        private=True,
        connection_status=ConnectionStatus.CONNECTED,
    )
    db_session.add(second)
    db_session.flush()

    monkeypatch.setattr(sync_service_module, "enqueue_ingestion_job", lambda snapshot_id: str(snapshot_id))
    # The enqueue above is faked, so the job ids it hands back are not in any
    # real queue. Pin the queue's answer to LIVE so this test asserts the
    # route's behaviour rather than re-testing the lost-job detector, which
    # `tests/services/test_concurrent_studies.py` covers directly.
    monkeypatch.setattr(snapshot_service_module, "job_presence", lambda job_id: JobPresence.LIVE)
    monkeypatch.setattr(snapshot_service_module, "job_queue_position", lambda job_id: None)

    first_body = client.post(f"/api/v1/repos/{first.id}/sync").json()
    second_body = client.post(f"/api/v1/repos/{second.id}/sync").json()

    assert first_body["id"] != second_body["id"]
    assert first_body["status"] == "queued"
    assert second_body["status"] == "queued"

    # Read both back — independently, as the two repository cards do.
    for repository, body in ((first, first_body), (second, second_body)):
        detail = client.get(f"/api/v1/repos/{repository.id}/snapshots/{body['id']}")
        assert detail.status_code == 200
        assert detail.json()["status"] == "queued"
        assert detail.json()["error_message"] is None


def test_cancelling_one_study_does_not_touch_another_repositorys_study(
    client: TestClient,
    db_session: Session,
    test_settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = _logged_in_user(client, db_session, test_settings)
    first = _connected_repository(db_session, user)
    second = Repository(
        id=uuid.uuid4(),
        user_id=user.id,
        installation_id=first.installation_id,
        github_repo_id=str(uuid.uuid4()),
        full_name="acme/sprockets",
        default_branch="main",
        private=True,
        connection_status=ConnectionStatus.CONNECTED,
    )
    db_session.add(second)
    db_session.flush()

    monkeypatch.setattr(sync_service_module, "enqueue_ingestion_job", lambda snapshot_id: str(snapshot_id))
    monkeypatch.setattr(snapshot_service_module, "cancel_ingestion_job", lambda job_id: True)
    monkeypatch.setattr(snapshot_service_module, "job_presence", lambda job_id: JobPresence.LIVE)
    monkeypatch.setattr(snapshot_service_module, "job_queue_position", lambda job_id: None)

    keep = client.post(f"/api/v1/repos/{first.id}/sync").json()
    drop = client.post(f"/api/v1/repos/{second.id}/sync").json()

    cancelled = client.post(f"/api/v1/repos/{second.id}/snapshots/{drop['id']}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"

    # Cancelling the second study is invisible to the first.
    still_queued = client.get(f"/api/v1/repos/{first.id}/snapshots/{keep['id']}")
    assert still_queued.json()["status"] == "queued"

    # And a second cancel of the same study is a 409, not a silent success.
    assert client.post(f"/api/v1/repos/{second.id}/snapshots/{drop['id']}/cancel").status_code == 409
