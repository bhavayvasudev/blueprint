"""Route coverage for the two live-GitHub reads on the Briefing
(`GET /repos/{id}/status` and `GET /repos/{id}/contributors`).

Deterministic-stage testing per RULES.md §15 — a fake provider stands in
for GitHub, so what's under test is the layering (ownership check, share
computation, response shape), never GitHub's own behavior.
"""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from api.dependencies import SESSION_COOKIE_NAME
from config import Settings
from integrations.repository.base import ContributorMetadata, RepositoryStatusMetadata
from models.installation import Installation
from models.repository import Repository, User
from models.types import AccountType, ConnectionStatus, InstallationStatus
from services import repository_status_service as service_module
from services.auth_service import create_session_token

_STATUS = RepositoryStatusMetadata(
    stars=1280,
    forks=96,
    watchers=41,
    open_issues=12,
    primary_language="Python",
    license_name="MIT License",
    license_spdx_id="MIT",
    default_branch="main",
    private=False,
    html_url="https://github.com/acme/widgets",
    last_commit_sha="abc1234",
    last_commit_at=None,
    last_commit_message="fix: the thing",
    last_commit_author="Ada Lovelace",
)


class FakeProvider:
    provider_name = "fake"

    def __init__(self, contributors: list[ContributorMetadata] | None = None) -> None:
        self._contributors = contributors or []

    def get_repository_status(self, installation_id: str, full_name: str):
        return _STATUS

    def list_contributors(self, installation_id: str, full_name: str, *, limit: int = 100):
        return self._contributors[:limit]


def _contributor(login: str, contributions: int) -> ContributorMetadata:
    return ContributorMetadata(
        login=login,
        avatar_url=f"https://avatars.example/{login}",
        html_url=f"https://github.com/{login}",
        contributions=contributions,
    )


def _connected_repository(
    client: TestClient, db_session: Session, test_settings: Settings
) -> Repository:
    user = User(
        id=uuid.uuid4(),
        github_id=f"gh-{uuid.uuid4()}",
        email=f"{uuid.uuid4()}@example.com",
        name="Test User",
    )
    db_session.add(user)
    db_session.flush()
    client.cookies.set(SESSION_COOKIE_NAME, create_session_token(user.id, settings=test_settings))

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
        private=False,
        connection_status=ConnectionStatus.CONNECTED,
    )
    db_session.add(repository)
    db_session.flush()
    return repository


def test_status_requires_a_session(client: TestClient) -> None:
    assert client.get(f"/api/v1/repos/{uuid.uuid4()}/status").status_code == 401


def test_status_returns_live_github_numbers(
    client: TestClient,
    db_session: Session,
    test_settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = _connected_repository(client, db_session, test_settings)
    monkeypatch.setattr(service_module, "get_repository_provider", FakeProvider)

    body = client.get(f"/api/v1/repos/{repository.id}/status").json()

    assert body["stars"] == 1280
    assert body["watchers"] == 41
    assert body["license_spdx_id"] == "MIT"
    assert body["last_commit_author"] == "Ada Lovelace"


def test_status_of_another_users_repository_is_404(
    client: TestClient,
    db_session: Session,
    test_settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ownership is enforced before we ever talk to the provider — the
    same `get_connected_repository` gate every other repo route uses."""
    _connected_repository(client, db_session, test_settings)
    monkeypatch.setattr(service_module, "get_repository_provider", FakeProvider)

    assert client.get(f"/api/v1/repos/{uuid.uuid4()}/status").status_code == 404


def test_contributors_shares_sum_to_one(
    client: TestClient,
    db_session: Session,
    test_settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = _connected_repository(client, db_session, test_settings)
    contributors = [_contributor("ada", 300), _contributor("grace", 100)]
    monkeypatch.setattr(
        service_module, "get_repository_provider", lambda: FakeProvider(contributors)
    )

    body = client.get(f"/api/v1/repos/{repository.id}/contributors").json()

    assert body["total_contributions"] == 400
    assert body["truncated"] is False
    assert [c["login"] for c in body["contributors"]] == ["ada", "grace"]
    assert body["contributors"][0]["share"] == pytest.approx(0.75)
    assert body["contributors"][1]["share"] == pytest.approx(0.25)
    assert sum(c["share"] for c in body["contributors"]) == pytest.approx(1.0)


def test_contributors_empty_repository_is_an_empty_list_not_an_error(
    client: TestClient,
    db_session: Session,
    test_settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """"Nobody has committed" is a real answer and must not divide by zero
    on its way out."""
    repository = _connected_repository(client, db_session, test_settings)
    monkeypatch.setattr(service_module, "get_repository_provider", FakeProvider)

    response = client.get(f"/api/v1/repos/{repository.id}/contributors")

    assert response.status_code == 200
    assert response.json() == {"contributors": [], "total_contributions": 0, "truncated": False}


def test_contributors_flags_a_truncated_list(
    client: TestClient,
    db_session: Session,
    test_settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """At the cap, `share` is a share of the *listed* set — the flag is
    what lets the UI say so instead of implying whole-history percentages."""
    repository = _connected_repository(client, db_session, test_settings)
    contributors = [_contributor(f"dev{i}", 10) for i in range(service_module.CONTRIBUTOR_LIMIT)]
    monkeypatch.setattr(
        service_module, "get_repository_provider", lambda: FakeProvider(contributors)
    )

    body = client.get(f"/api/v1/repos/{repository.id}/contributors").json()

    assert body["truncated"] is True
    assert len(body["contributors"]) == service_module.CONTRIBUTOR_LIMIT
