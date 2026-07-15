import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from api.dependencies import SESSION_COOKIE_NAME
from config import Settings
from models.repository import User
from services.auth_service import create_session_token


def _create_user(db_session: Session) -> User:
    user = User(
        id=uuid.uuid4(),
        github_id=f"gh-{uuid.uuid4()}",
        email=f"{uuid.uuid4()}@example.com",
        name="Test User",
    )
    db_session.add(user)
    db_session.flush()
    return user


def test_login_redirects_to_github_authorize_url(client: TestClient, test_settings: Settings) -> None:
    response = client.get("/api/v1/auth/login", follow_redirects=False)
    assert response.status_code in (302, 307)
    location = response.headers["location"]
    assert location.startswith("https://github.com/login/oauth/authorize")
    assert "client_id=client-id" in location


def test_login_fails_fast_without_github_config(db_session: Session) -> None:
    from fastapi.testclient import TestClient as _TestClient

    from api.main import app
    from config import get_settings
    from models.db import get_session

    unconfigured = Settings(_env_file=None)
    app.dependency_overrides[get_session] = lambda: db_session
    app.dependency_overrides[get_settings] = lambda: unconfigured
    try:
        response = _TestClient(app).get("/api/v1/auth/login")
        assert response.status_code == 503
    finally:
        app.dependency_overrides.clear()


def test_me_without_cookie_returns_401(client: TestClient) -> None:
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401


def test_me_with_valid_cookie_returns_user(
    client: TestClient, db_session: Session, test_settings: Settings
) -> None:
    user = _create_user(db_session)
    token = create_session_token(user.id, settings=test_settings)
    client.cookies.set(SESSION_COOKIE_NAME, token)

    response = client.get("/api/v1/auth/me")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(user.id)
    assert body["email"] == user.email


def test_me_with_tampered_cookie_returns_401(client: TestClient) -> None:
    client.cookies.set(SESSION_COOKIE_NAME, "not-a-valid-jwt")
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401


def test_callback_with_invalid_state_returns_400(client: TestClient) -> None:
    response = client.get(
        "/api/v1/auth/callback", params={"code": "abc", "state": "not-a-real-state-token"}
    )
    assert response.status_code == 400


def test_logout_clears_session_cookie(
    client: TestClient, db_session: Session, test_settings: Settings
) -> None:
    user = _create_user(db_session)
    token = create_session_token(user.id, settings=test_settings)
    client.cookies.set(SESSION_COOKIE_NAME, token)

    response = client.post("/api/v1/auth/logout")
    assert response.status_code == 204
    set_cookie = response.headers["set-cookie"]
    assert SESSION_COOKIE_NAME in set_cookie
    assert "Max-Age=0" in set_cookie or "01 Jan 1970" in set_cookie


def test_github_install_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/v1/auth/github/install", follow_redirects=False)
    assert response.status_code == 401


def test_github_install_redirects_to_install_url_when_authenticated(
    client: TestClient, db_session: Session, test_settings: Settings
) -> None:
    user = _create_user(db_session)
    token = create_session_token(user.id, settings=test_settings)
    client.cookies.set(SESSION_COOKIE_NAME, token)

    response = client.get("/api/v1/auth/github/install", follow_redirects=False)
    assert response.status_code in (302, 307)
    assert response.headers["location"].startswith(
        "https://github.com/apps/blueprint-dev/installations/new"
    )


def test_github_install_callback_with_setup_action_request_is_pending(
    client: TestClient, test_settings: Settings
) -> None:
    from services.auth_service import STATE_PURPOSE_INSTALL, create_state_token

    state = create_state_token(STATE_PURPOSE_INSTALL, settings=test_settings, subject="whatever")
    response = client.get(
        "/api/v1/auth/github/install/callback",
        params={"state": state, "setup_action": "request"},
        follow_redirects=False,
    )
    assert response.status_code in (302, 307)
    assert "install=pending" in response.headers["location"]


def test_callback_with_install_purpose_token_completes_install_not_login(
    client: TestClient, test_settings: Settings
) -> None:
    """Regression test: some GitHub Apps ("Request user authorization
    during installation" enabled) deliver the post-install redirect to
    `/callback` (the Authorization callback URL) instead of
    `/github/install/callback` (the Setup URL), still carrying a
    `github_install`-purpose state token. `/callback` must dispatch this
    to the same install-completion path rather than rejecting it for not
    being an `oauth_login` token."""
    from services.auth_service import STATE_PURPOSE_INSTALL, create_state_token

    state = create_state_token(STATE_PURPOSE_INSTALL, settings=test_settings, subject="whatever")
    response = client.get(
        "/api/v1/auth/callback",
        params={"code": "unused", "state": state, "setup_action": "request"},
        follow_redirects=False,
    )
    assert response.status_code in (302, 307)
    assert "install=pending" in response.headers["location"]


def test_github_install_callback_with_login_purpose_token_still_rejected(
    client: TestClient, test_settings: Settings
) -> None:
    """The Setup URL must stay strict: a login-purpose token arriving
    there is still an error, not silently accepted."""
    from services.auth_service import STATE_PURPOSE_LOGIN, create_state_token

    state = create_state_token(STATE_PURPOSE_LOGIN, settings=test_settings)
    response = client.get(
        "/api/v1/auth/github/install/callback",
        params={"state": state, "setup_action": "request"},
        follow_redirects=False,
    )
    assert response.status_code == 400


def test_install_callback_auto_connects_available_repositories(
    client: TestClient, db_session: Session, test_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Master Prompt: repositories the installation grants access to must
    appear without a manual per-repo "Connect" step."""
    from api.v1 import auth as auth_module
    from integrations.repository.base import InstallationMetadata, RepositoryMetadata
    from models.types import AccountType
    from services import repository_connection_service as repo_service_module
    from services.auth_service import STATE_PURPOSE_INSTALL, create_state_token

    user = _create_user(db_session)
    installation_metadata = InstallationMetadata(
        external_id="9001", account_login="acme-corp", account_type=AccountType.ORGANIZATION
    )
    repo_metadata = [
        RepositoryMetadata(
            external_id="55", full_name="acme/widgets", default_branch="main", private=True,
            html_url="https://github.com/acme/widgets",
        ),
        RepositoryMetadata(
            external_id="56", full_name="acme/gadgets", default_branch="main", private=False,
            html_url="https://github.com/acme/gadgets",
        ),
    ]

    class FakeProvider:
        provider_name = "fake"

        def get_installation(self, installation_id: str) -> InstallationMetadata:
            return installation_metadata

        def list_repositories(self, installation_id: str) -> list[RepositoryMetadata]:
            return repo_metadata

        def get_repository(self, installation_id: str, full_name: str) -> RepositoryMetadata:
            raise NotImplementedError

        def get_clone_credentials(self, installation_id: str, full_name: str):
            raise NotImplementedError

    monkeypatch.setattr(auth_module, "get_repository_provider", lambda: FakeProvider())
    monkeypatch.setattr(repo_service_module, "get_repository_provider", lambda: FakeProvider())

    state = create_state_token(STATE_PURPOSE_INSTALL, settings=test_settings, subject=str(user.id))
    response = client.get(
        "/api/v1/auth/github/install/callback",
        params={"state": state, "installation_id": "9001", "setup_action": "install"},
        follow_redirects=False,
    )
    assert response.status_code in (302, 307)
    location = response.headers["location"]
    assert "installed=1" in location
    assert "repo_sync_error" not in location

    token = create_session_token(user.id, settings=test_settings)
    client.cookies.set(SESSION_COOKIE_NAME, token)
    repos_response = client.get("/api/v1/repos")
    assert repos_response.status_code == 200
    full_names = {repo["full_name"] for repo in repos_response.json()}
    assert full_names == {"acme/widgets", "acme/gadgets"}


def test_install_callback_keeps_installation_and_flags_repo_sync_error_on_failure(
    client: TestClient, db_session: Session, test_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A transient GitHub failure while auto-connecting repos must not
    lose the installation itself — the frontend gets a flag to offer a
    retry (ConnectPanel's "Sync from GitHub" action) instead."""
    from api.v1 import auth as auth_module
    from integrations.github.exceptions import GitHubRateLimited
    from integrations.repository.base import InstallationMetadata
    from models.types import AccountType
    from services import repository_connection_service as repo_service_module
    from services.auth_service import STATE_PURPOSE_INSTALL, create_state_token

    user = _create_user(db_session)
    installation_metadata = InstallationMetadata(
        external_id="9002", account_login="acme-corp", account_type=AccountType.ORGANIZATION
    )

    class FailingProvider:
        provider_name = "fake"

        def get_installation(self, installation_id: str) -> InstallationMetadata:
            return installation_metadata

        def list_repositories(self, installation_id: str):
            raise GitHubRateLimited(retry_after=30)

        def get_repository(self, installation_id: str, full_name: str):
            raise NotImplementedError

        def get_clone_credentials(self, installation_id: str, full_name: str):
            raise NotImplementedError

    monkeypatch.setattr(auth_module, "get_repository_provider", lambda: FailingProvider())
    monkeypatch.setattr(repo_service_module, "get_repository_provider", lambda: FailingProvider())

    state = create_state_token(STATE_PURPOSE_INSTALL, settings=test_settings, subject=str(user.id))
    response = client.get(
        "/api/v1/auth/github/install/callback",
        params={"state": state, "installation_id": "9002", "setup_action": "install"},
        follow_redirects=False,
    )
    assert response.status_code in (302, 307)
    location = response.headers["location"]
    assert "installed=1" in location
    assert "repo_sync_error=1" in location

    token = create_session_token(user.id, settings=test_settings)
    client.cookies.set(SESSION_COOKIE_NAME, token)
    installations_response = client.get("/api/v1/installations")
    assert installations_response.status_code == 200
    assert len(installations_response.json()) == 1


def test_callback_with_unknown_purpose_token_returns_400(test_settings: Settings) -> None:
    """A token of neither known purpose must still be rejected at
    `/callback` — dispatching on `github_install` must not weaken the
    strict check for everything else."""
    import jwt
    from fastapi.testclient import TestClient as _TestClient

    from api.main import app
    from config import get_settings
    from models.db import get_session

    token = jwt.encode(
        {"purpose": "something_else", "iat": 0, "exp": 99999999999},
        test_settings.jwt_secret,
        algorithm="HS256",
    )
    app.dependency_overrides[get_settings] = lambda: test_settings
    app.dependency_overrides[get_session] = lambda: None
    try:
        response = _TestClient(app).get(
            "/api/v1/auth/callback",
            params={"code": "unused", "state": token},
            follow_redirects=False,
        )
        assert response.status_code == 400
    finally:
        app.dependency_overrides.clear()
