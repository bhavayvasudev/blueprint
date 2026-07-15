"""`services.repository_connection_service` depends only on
`integrations.repository.base.RepositoryProvider` (DECISIONS.md ADR-023)
— these tests prove that by swapping in a fake provider that implements
the protocol structurally, with no GitHub App config or network calls
involved at all, and asserting the service still behaves correctly."""

import uuid
from datetime import datetime

import pytest
from sqlalchemy.orm import Session

from integrations.github.exceptions import GitHubAppNotInstalled
from integrations.repository.base import CloneCredentials, InstallationMetadata, RepositoryMetadata
from models.installation import Installation
from models.repository import User
from models.types import AccountType, InstallationStatus
from services import repository_connection_service as service_module
from services.installation_service import upsert_installation
from services.repository_connection_service import (
    RepositoryAlreadyConnected,
    RepositoryNotFound,
    connect_all_available_repositories,
    connect_repository,
    get_connected_repository,
    list_available_repositories,
    list_connected_repositories,
)


class FakeRepositoryProvider:
    provider_name = "fake"

    def __init__(self, repos: list[RepositoryMetadata], *, raise_not_installed: bool = False) -> None:
        self._repos = repos
        self._raise_not_installed = raise_not_installed

    def get_installation(self, installation_id: str) -> InstallationMetadata:
        raise NotImplementedError

    def list_repositories(self, installation_id: str) -> list[RepositoryMetadata]:
        if self._raise_not_installed:
            raise GitHubAppNotInstalled("gone")
        return self._repos

    def get_repository(self, installation_id: str, full_name: str) -> RepositoryMetadata:
        if self._raise_not_installed:
            raise GitHubAppNotInstalled("gone")
        for repo in self._repos:
            if repo.full_name == full_name:
                return repo
        raise LookupError(full_name)

    def get_clone_credentials(self, installation_id: str, full_name: str) -> CloneCredentials:
        return CloneCredentials(
            clone_url="https://x-access-token:t@github.com/x/y.git", expires_at=datetime.now()
        )


@pytest.fixture
def installation(db_session: Session, user: User) -> Installation:
    metadata = InstallationMetadata(
        external_id="1001", account_login="acme-corp", account_type=AccountType.ORGANIZATION
    )
    return upsert_installation(db_session, user=user, metadata=metadata)


def _patch_provider(monkeypatch: pytest.MonkeyPatch, provider: FakeRepositoryProvider) -> None:
    monkeypatch.setattr(service_module, "get_repository_provider", lambda: provider)


def test_list_available_repositories_delegates_to_provider(
    db_session: Session, user: User, installation: Installation, monkeypatch: pytest.MonkeyPatch
) -> None:
    repos = [
        RepositoryMetadata(
            external_id="1", full_name="acme/widgets", default_branch="main", private=False,
            html_url="https://github.com/acme/widgets",
        )
    ]
    _patch_provider(monkeypatch, FakeRepositoryProvider(repos))

    result = list_available_repositories(db_session, user=user, installation_id=installation.id)
    assert result == repos


def test_list_available_repositories_marks_installation_revoked_on_not_installed(
    db_session: Session, user: User, installation: Installation, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_provider(monkeypatch, FakeRepositoryProvider([], raise_not_installed=True))

    with pytest.raises(GitHubAppNotInstalled):
        list_available_repositories(db_session, user=user, installation_id=installation.id)

    assert installation.status == InstallationStatus.REVOKED


def test_connect_repository_persists_a_new_row(
    db_session: Session, user: User, installation: Installation, monkeypatch: pytest.MonkeyPatch
) -> None:
    repos = [
        RepositoryMetadata(
            external_id="55", full_name="acme/widgets", default_branch="main", private=True,
            html_url="https://github.com/acme/widgets",
        )
    ]
    _patch_provider(monkeypatch, FakeRepositoryProvider(repos))

    repository = connect_repository(
        db_session, user=user, installation_id=installation.id, full_name="acme/widgets"
    )
    assert repository.github_repo_id == "55"
    assert repository.installation_id == installation.id
    assert repository.private is True


def test_connect_repository_rejects_duplicate_connection(
    db_session: Session, user: User, installation: Installation, monkeypatch: pytest.MonkeyPatch
) -> None:
    repos = [
        RepositoryMetadata(
            external_id="55", full_name="acme/widgets", default_branch="main", private=True,
            html_url="https://github.com/acme/widgets",
        )
    ]
    _patch_provider(monkeypatch, FakeRepositoryProvider(repos))

    connect_repository(db_session, user=user, installation_id=installation.id, full_name="acme/widgets")
    with pytest.raises(RepositoryAlreadyConnected):
        connect_repository(
            db_session, user=user, installation_id=installation.id, full_name="acme/widgets"
        )


def test_list_and_get_connected_repositories_are_scoped_to_the_user(
    db_session: Session, user: User, installation: Installation, monkeypatch: pytest.MonkeyPatch
) -> None:
    repos = [
        RepositoryMetadata(
            external_id="55", full_name="acme/widgets", default_branch="main", private=True,
            html_url="https://github.com/acme/widgets",
        )
    ]
    _patch_provider(monkeypatch, FakeRepositoryProvider(repos))
    connect_repository(db_session, user=user, installation_id=installation.id, full_name="acme/widgets")

    connected = list_connected_repositories(db_session, user=user)
    assert len(connected) == 1
    fetched = get_connected_repository(db_session, user=user, repository_id=connected[0].id)
    assert fetched.id == connected[0].id


def test_connect_all_available_repositories_connects_everything_new(
    db_session: Session, user: User, installation: Installation, monkeypatch: pytest.MonkeyPatch
) -> None:
    repos = [
        RepositoryMetadata(
            external_id="55", full_name="acme/widgets", default_branch="main", private=True,
            html_url="https://github.com/acme/widgets",
        ),
        RepositoryMetadata(
            external_id="56", full_name="acme/gadgets", default_branch="main", private=False,
            html_url="https://github.com/acme/gadgets",
        ),
    ]
    _patch_provider(monkeypatch, FakeRepositoryProvider(repos))

    connected = connect_all_available_repositories(
        db_session, user=user, installation_id=installation.id
    )
    assert {repo.full_name for repo in connected} == {"acme/widgets", "acme/gadgets"}

    all_connected = list_connected_repositories(db_session, user=user)
    assert len(all_connected) == 2


def test_connect_all_available_repositories_skips_already_connected(
    db_session: Session, user: User, installation: Installation, monkeypatch: pytest.MonkeyPatch
) -> None:
    repos = [
        RepositoryMetadata(
            external_id="55", full_name="acme/widgets", default_branch="main", private=True,
            html_url="https://github.com/acme/widgets",
        ),
        RepositoryMetadata(
            external_id="56", full_name="acme/gadgets", default_branch="main", private=False,
            html_url="https://github.com/acme/gadgets",
        ),
    ]
    _patch_provider(monkeypatch, FakeRepositoryProvider(repos))
    connect_repository(db_session, user=user, installation_id=installation.id, full_name="acme/widgets")

    connected = connect_all_available_repositories(
        db_session, user=user, installation_id=installation.id
    )
    assert [repo.full_name for repo in connected] == ["acme/gadgets"]
    assert len(list_connected_repositories(db_session, user=user)) == 2


def test_connect_all_available_repositories_marks_installation_revoked_on_not_installed(
    db_session: Session, user: User, installation: Installation, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_provider(monkeypatch, FakeRepositoryProvider([], raise_not_installed=True))

    with pytest.raises(GitHubAppNotInstalled):
        connect_all_available_repositories(db_session, user=user, installation_id=installation.id)

    assert installation.status == InstallationStatus.REVOKED


def test_get_connected_repository_raises_not_found_for_a_different_user(
    db_session: Session, user: User, installation: Installation, monkeypatch: pytest.MonkeyPatch
) -> None:
    repos = [
        RepositoryMetadata(
            external_id="55", full_name="acme/widgets", default_branch="main", private=True,
            html_url="https://github.com/acme/widgets",
        )
    ]
    _patch_provider(monkeypatch, FakeRepositoryProvider(repos))
    connect_repository(db_session, user=user, installation_id=installation.id, full_name="acme/widgets")

    other_user = User(
        id=uuid.uuid4(), github_id=f"other-{uuid.uuid4()}", email=f"{uuid.uuid4()}@example.com", name="Other"
    )
    db_session.add(other_user)
    db_session.flush()

    connected = list_connected_repositories(db_session, user=user)
    with pytest.raises(RepositoryNotFound):
        get_connected_repository(db_session, user=other_user, repository_id=connected[0].id)
