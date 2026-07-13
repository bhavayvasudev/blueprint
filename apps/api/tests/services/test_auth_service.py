import time
import uuid

import jwt
import pytest
from sqlalchemy.orm import Session

from config import Settings
from integrations.github.exceptions import InvalidOAuthState
from integrations.github.oauth import GitHubUserProfile
from services.auth_service import (
    STATE_PURPOSE_INSTALL,
    STATE_PURPOSE_LOGIN,
    InvalidSessionToken,
    SessionConfigError,
    create_session_token,
    create_state_token,
    decode_state_token,
    upsert_user,
    verify_session_token,
    verify_state_token,
)


def _settings(**overrides: object) -> Settings:
    base: dict[str, object] = {"_env_file": None, "jwt_secret": "test-secret-at-least-32-bytes-long"}
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def test_session_token_round_trips() -> None:
    settings = _settings()
    user_id = uuid.uuid4()
    token = create_session_token(user_id, settings=settings)
    assert verify_session_token(token, settings=settings) == user_id


def test_session_token_requires_jwt_secret() -> None:
    settings = _settings(jwt_secret="")
    with pytest.raises(SessionConfigError):
        create_session_token(uuid.uuid4(), settings=settings)


def test_expired_session_token_raises() -> None:
    settings = _settings()
    expired_payload = {"sub": str(uuid.uuid4()), "iat": time.time() - 1000, "exp": time.time() - 500}
    token = jwt.encode(expired_payload, settings.jwt_secret, algorithm="HS256")
    with pytest.raises(InvalidSessionToken):
        verify_session_token(token, settings=settings)


def test_tampered_session_token_raises() -> None:
    settings = _settings()
    token = create_session_token(uuid.uuid4(), settings=settings)
    # Flip a character in the middle, not the last one: base64url's last
    # character can, depending on padding alignment, decode to the same
    # bytes even after being changed, making tamper-detection tests that
    # flip it flaky rather than reliably invalid.
    mid = len(token) // 2
    tampered = token[:mid] + ("a" if token[mid] != "a" else "b") + token[mid + 1 :]
    with pytest.raises(InvalidSessionToken):
        verify_session_token(tampered, settings=settings)


def test_state_token_round_trips_with_purpose_and_subject() -> None:
    settings = _settings()
    token = create_state_token(STATE_PURPOSE_INSTALL, settings=settings, subject="user-123")
    claims = verify_state_token(token, purpose=STATE_PURPOSE_INSTALL, settings=settings)
    assert claims.purpose == STATE_PURPOSE_INSTALL
    assert claims.subject == "user-123"


def test_state_token_wrong_purpose_raises_invalid_oauth_state() -> None:
    settings = _settings()
    token = create_state_token(STATE_PURPOSE_LOGIN, settings=settings)
    with pytest.raises(InvalidOAuthState):
        verify_state_token(token, purpose=STATE_PURPOSE_INSTALL, settings=settings)


def test_decode_state_token_does_not_check_purpose() -> None:
    """`/callback` must learn a token's real purpose before it can decide
    which purpose to strictly verify against — decode_state_token is the
    signature/expiry-only primitive that makes that possible."""
    settings = _settings()
    token = create_state_token(STATE_PURPOSE_INSTALL, settings=settings, subject="user-123")
    claims = decode_state_token(token, settings=settings)
    assert claims.purpose == STATE_PURPOSE_INSTALL
    assert claims.subject == "user-123"


def test_decode_state_token_still_raises_on_bad_signature() -> None:
    settings = _settings()
    token = create_state_token(STATE_PURPOSE_LOGIN, settings=settings)
    # Flip a character in the middle, not the last one: base64url's last
    # character can, depending on padding alignment, decode to the same
    # bytes even after being changed, making tamper-detection tests that
    # flip it flaky rather than reliably invalid.
    mid = len(token) // 2
    tampered = token[:mid] + ("a" if token[mid] != "a" else "b") + token[mid + 1 :]
    with pytest.raises(InvalidOAuthState):
        decode_state_token(tampered, settings=settings)


def test_expired_state_token_raises_invalid_oauth_state() -> None:
    settings = _settings()
    expired_payload = {
        "purpose": STATE_PURPOSE_LOGIN,
        "sub": None,
        "iat": time.time() - 1000,
        "exp": time.time() - 500,
    }
    token = jwt.encode(expired_payload, settings.jwt_secret, algorithm="HS256")
    with pytest.raises(InvalidOAuthState):
        verify_state_token(token, purpose=STATE_PURPOSE_LOGIN, settings=settings)


def test_upsert_user_creates_new_user(db_session: Session) -> None:
    profile = GitHubUserProfile(
        github_id="gh-1", login="octocat", name="The Octocat", email="octo@example.com"
    )
    user = upsert_user(db_session, profile)
    assert user.github_id == "gh-1"
    assert user.email == "octo@example.com"


def test_upsert_user_updates_existing_user_by_github_id(db_session: Session) -> None:
    profile = GitHubUserProfile(github_id="gh-2", login="octocat", name="Old Name", email="old@example.com")
    first = upsert_user(db_session, profile)

    updated_profile = GitHubUserProfile(
        github_id="gh-2", login="octocat", name="New Name", email="new@example.com"
    )
    second = upsert_user(db_session, updated_profile)

    assert first.id == second.id
    assert second.name == "New Name"
    assert second.email == "new@example.com"
