"""Blueprint's own session/state tokens (ARCHITECTURE.md §14: "GitHub
OAuth for login, short-lived JWT for API sessions"). Two distinct JWT
uses, both HS256 signed with `config.Settings.jwt_secret` — a Blueprint
secret, unrelated to any GitHub credential:

1. **Session tokens** — issued after a successful OAuth login, carried as
   an httpOnly cookie, authenticate subsequent API requests. Short-lived
   (`SESSION_TOKEN_TTL`), never granting GitHub access themselves.
2. **State tokens** — stateless CSRF protection for the OAuth login and
   GitHub App install redirects (RULES.md §22). Signed, single-purpose,
   short-lived (`STATE_TOKEN_TTL`); no server-side session store needed
   because the signature and expiry are themselves the guarantee.

This module also owns `upsert_user`, the one piece of business logic
tightly coupled to the login callback (RULES.md §6: business logic lives
in `services/`, not in a thin route handler).
"""

import uuid
from datetime import UTC, datetime, timedelta

import jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from config import Settings
from integrations.github.exceptions import InvalidOAuthState
from integrations.github.oauth import GitHubUserProfile
from models.repository import User

SESSION_TOKEN_TTL = timedelta(hours=12)
STATE_TOKEN_TTL = timedelta(minutes=10)

STATE_PURPOSE_LOGIN = "oauth_login"
STATE_PURPOSE_INSTALL = "github_install"

_ALGORITHM = "HS256"


class SessionConfigError(Exception):
    """`config.Settings.jwt_secret` is not set — the fail-fast check for
    Blueprint's own signing secret, distinct from GitHub App config."""


class InvalidSessionToken(Exception):
    """A session cookie failed signature verification or expired."""


class StateClaims(BaseModel):
    purpose: str
    subject: str | None = None


def _require_jwt_secret(settings: Settings) -> str:
    if not settings.jwt_secret:
        raise SessionConfigError(
            "JWT_SECRET is not configured — set it before issuing or verifying "
            "Blueprint session/state tokens (see .env.example)."
        )
    return settings.jwt_secret


def create_session_token(user_id: uuid.UUID, *, settings: Settings) -> str:
    secret = _require_jwt_secret(settings)
    now = datetime.now(UTC)
    payload = {"sub": str(user_id), "iat": now, "exp": now + SESSION_TOKEN_TTL}
    return jwt.encode(payload, secret, algorithm=_ALGORITHM)


def verify_session_token(token: str, *, settings: Settings) -> uuid.UUID:
    secret = _require_jwt_secret(settings)
    try:
        payload = jwt.decode(token, secret, algorithms=[_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise InvalidSessionToken(f"Session token invalid or expired: {exc}") from exc
    try:
        return uuid.UUID(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise InvalidSessionToken("Session token missing a valid subject") from exc


def create_state_token(purpose: str, *, settings: Settings, subject: str | None = None) -> str:
    secret = _require_jwt_secret(settings)
    now = datetime.now(UTC)
    payload = {
        "purpose": purpose,
        "sub": subject,
        "iat": now,
        "exp": now + STATE_TOKEN_TTL,
    }
    return jwt.encode(payload, secret, algorithm=_ALGORITHM)


def verify_state_token(token: str, *, purpose: str, settings: Settings) -> StateClaims:
    secret = _require_jwt_secret(settings)
    try:
        payload = jwt.decode(token, secret, algorithms=[_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise InvalidOAuthState(f"State token invalid or expired: {exc}") from exc

    if payload.get("purpose") != purpose:
        raise InvalidOAuthState(
            f"State token was issued for purpose {payload.get('purpose')!r}, expected {purpose!r}"
        )
    return StateClaims(purpose=payload["purpose"], subject=payload.get("sub"))


def upsert_user(db: Session, profile: GitHubUserProfile) -> User:
    existing = db.execute(select(User).where(User.github_id == profile.github_id)).scalar_one_or_none()
    if existing is not None:
        existing.email = profile.email
        existing.name = profile.name
        db.flush()
        return existing

    user = User(github_id=profile.github_id, email=profile.email, name=profile.name)
    db.add(user)
    db.flush()
    return user
