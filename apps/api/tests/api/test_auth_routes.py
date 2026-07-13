import uuid

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
