import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from api.dependencies import SESSION_COOKIE_NAME
from config import Settings
from integrations.github.exceptions import GitHubAppNotInstalled
from integrations.repository.base import CloneCredentials, InstallationMetadata, RepositoryMetadata
from models.installation import Installation
from models.repository import User
from models.types import AccountType, InstallationStatus
from services import repository_connection_service as service_module
from services.auth_service import create_session_token


class FakeRepositoryProvider:
    provider_name = "fake"

    def __init__(self, repos: list[RepositoryMetadata]) -> None:
        self._repos = repos

    def get_installation(self, installation_id: str) -> InstallationMetadata:
        raise NotImplementedError

    def list_repositories(self, installation_id: str) -> list[RepositoryMetadata]:
        return self._repos

    def get_repository(self, installation_id: str, full_name: str) -> RepositoryMetadata:
        for repo in self._repos:
            if repo.full_name == full_name:
                return repo
        raise GitHubAppNotInstalled(full_name)

    def get_clone_credentials(self, installation_id: str, full_name: str) -> CloneCredentials:
        raise NotImplementedError


def _logged_in_user(client: TestClient, db_session: Session, test_settings: Settings) -> User:
    user = User(
        id=uuid.uuid4(),
        github_id=f"gh-{uuid.uuid4()}",
        email=f"{uuid.uuid4()}@example.com",
        name="Test User",
    )
    db_session.add(user)
    db_session.flush()
    token = create_session_token(user.id, settings=test_settings)
    client.cookies.set(SESSION_COOKIE_NAME, token)
    return user


def _installation(db_session: Session, user: User) -> Installation:
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
    return installation


def test_list_repos_without_cookie_returns_401(client: TestClient) -> None:
    response = client.get("/api/v1/repos")
    assert response.status_code == 401


def test_list_repos_empty_for_new_user(
    client: TestClient, db_session: Session, test_settings: Settings
) -> None:
    _logged_in_user(client, db_session, test_settings)
    response = client.get("/api/v1/repos")
    assert response.status_code == 200
    assert response.json() == []


def test_connect_and_list_repository(
    client: TestClient,
    db_session: Session,
    test_settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = _logged_in_user(client, db_session, test_settings)
    installation = _installation(db_session, user)

    repo_metadata = RepositoryMetadata(
        external_id=str(uuid.uuid4()),
        full_name="acme/widgets",
        default_branch="main",
        private=True,
        html_url="https://github.com/acme/widgets",
    )
    monkeypatch.setattr(
        service_module, "get_repository_provider", lambda: FakeRepositoryProvider([repo_metadata])
    )

    connect_response = client.post(
        "/api/v1/repos/connect",
        json={"installation_id": str(installation.id), "full_name": "acme/widgets"},
    )
    assert connect_response.status_code == 201
    body = connect_response.json()
    assert body["full_name"] == "acme/widgets"
    assert body["private"] is True

    list_response = client.get("/api/v1/repos")
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1

    get_response = client.get(f"/api/v1/repos/{body['id']}")
    assert get_response.status_code == 200
    assert get_response.json()["id"] == body["id"]


def test_connect_duplicate_repository_returns_409(
    client: TestClient,
    db_session: Session,
    test_settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = _logged_in_user(client, db_session, test_settings)
    installation = _installation(db_session, user)

    repo_metadata = RepositoryMetadata(
        external_id=str(uuid.uuid4()),
        full_name="acme/widgets",
        default_branch="main",
        private=True,
        html_url="https://github.com/acme/widgets",
    )
    monkeypatch.setattr(
        service_module, "get_repository_provider", lambda: FakeRepositoryProvider([repo_metadata])
    )

    payload = {"installation_id": str(installation.id), "full_name": "acme/widgets"}
    first = client.post("/api/v1/repos/connect", json=payload)
    assert first.status_code == 201

    second = client.post("/api/v1/repos/connect", json=payload)
    assert second.status_code == 409


def test_connect_repository_for_unowned_installation_returns_404(
    client: TestClient, db_session: Session, test_settings: Settings
) -> None:
    _logged_in_user(client, db_session, test_settings)
    response = client.post(
        "/api/v1/repos/connect",
        json={"installation_id": str(uuid.uuid4()), "full_name": "acme/widgets"},
    )
    assert response.status_code == 404


def test_get_repository_not_found_returns_404(
    client: TestClient, db_session: Session, test_settings: Settings
) -> None:
    _logged_in_user(client, db_session, test_settings)
    response = client.get(f"/api/v1/repos/{uuid.uuid4()}")
    assert response.status_code == 404
