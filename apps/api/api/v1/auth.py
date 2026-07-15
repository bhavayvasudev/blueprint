"""Login (GitHub OAuth) and GitHub App installation routes (ARCHITECTURE.md
§14). Thin per RULES.md §6 — state/session handling lives in
`services.auth_service`, installation persistence in
`services.installation_service`; this module only wires HTTP in and out.
"""

import logging
import uuid

from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse, Response
from sqlalchemy.orm import Session

from api.dependencies import SESSION_COOKIE_NAME, get_current_user
from api.v1.schemas import UserOut
from config import Settings, get_settings
from integrations.github.config import GitHubAppConfig
from integrations.github.exceptions import GitHubIntegrationError
from integrations.github.oauth import GitHubOAuthClient, build_authorize_url, build_install_url
from integrations.repository.registry import get_repository_provider
from models.db import get_session
from models.repository import User
from services.auth_service import (
    SESSION_TOKEN_TTL,
    STATE_PURPOSE_INSTALL,
    STATE_PURPOSE_LOGIN,
    StateClaims,
    create_session_token,
    create_state_token,
    decode_state_token,
    upsert_user,
    verify_state_token,
)
from services.installation_service import upsert_installation
from services.repository_connection_service import connect_all_available_repositories

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/login")
def login(settings: Settings = Depends(get_settings)) -> RedirectResponse:
    config = GitHubAppConfig.from_settings(settings)
    state = create_state_token(STATE_PURPOSE_LOGIN, settings=settings)
    redirect_uri = f"{settings.api_base_url}/api/v1/auth/callback"
    return RedirectResponse(build_authorize_url(config, redirect_uri=redirect_uri, state=state))


@router.get("/callback")
def callback(
    code: str,
    state: str,
    installation_id: str | None = Query(default=None),
    setup_action: str = Query(default="install"),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    # This URL is GitHub's "Authorization callback URL". Ordinarily that's
    # only ever hit by a plain login redirect (`oauth_login` state) — but
    # if the GitHub App has "Request user authorization (OAuth) during
    # installation" enabled, GitHub *also* sends the post-install redirect
    # here (not to the Setup URL) carrying the `github_install` state
    # created by `github_install()`. Decode first to learn which flow this
    # actually is, then validate strictly against that flow's own purpose
    # — never assume `oauth_login` and never skip the purpose check.
    claims = decode_state_token(state, settings=settings)
    logger.info(
        "OAuth callback: purpose=%s installation_id=%s setup_action=%s",
        claims.purpose,
        installation_id,
        setup_action,
    )
    if claims.purpose == STATE_PURPOSE_INSTALL:
        return _complete_install(
            claims,
            installation_id=installation_id,
            setup_action=setup_action,
            db=db,
            settings=settings,
        )

    verify_state_token(state, purpose=STATE_PURPOSE_LOGIN, settings=settings)

    config = GitHubAppConfig.from_settings(settings)
    oauth_client = GitHubOAuthClient(config)
    user_token = oauth_client.exchange_code_for_user_token(code)
    profile = oauth_client.fetch_user_profile(user_token)
    # `user_token` is never stored beyond this point (ARCHITECTURE.md §14:
    # "never store long-lived access tokens") — it goes out of scope here.
    logger.info("OAuth login: github_id=%s login=%s", profile.github_id, profile.login)

    user = upsert_user(db, profile)
    db.commit()
    logger.info("OAuth login: user upserted user_id=%s", user.id)

    session_token = create_session_token(user.id, settings=settings)
    response = RedirectResponse(f"{settings.frontend_url}/dashboard")
    response.set_cookie(
        SESSION_COOKIE_NAME,
        session_token,
        httponly=True,
        secure=settings.environment == "production",
        samesite="lax",
        max_age=int(SESSION_TOKEN_TTL.total_seconds()),
    )
    return response


@router.post("/logout")
def logout() -> Response:
    response = Response(status_code=204)
    response.delete_cookie(SESSION_COOKIE_NAME)
    return response


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.get("/github/install")
def github_install(
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    config = GitHubAppConfig.from_settings(settings)
    state = create_state_token(STATE_PURPOSE_INSTALL, settings=settings, subject=str(user.id))
    install_url = build_install_url(config, state=state)
    logger.info("Install: redirecting user_id=%s to %s", user.id, install_url)
    return RedirectResponse(install_url)


@router.get("/github/install/callback")
def github_install_callback(
    state: str,
    installation_id: str | None = Query(default=None),
    setup_action: str = Query(default="install"),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    logger.info(
        "Install callback (Setup URL) hit: installation_id=%s setup_action=%s",
        installation_id,
        setup_action,
    )
    claims = verify_state_token(state, purpose=STATE_PURPOSE_INSTALL, settings=settings)
    return _complete_install(
        claims, installation_id=installation_id, setup_action=setup_action, db=db, settings=settings
    )


def _complete_install(
    claims: StateClaims,
    *,
    installation_id: str | None,
    setup_action: str,
    db: Session,
    settings: Settings,
) -> RedirectResponse:
    """Shared by both routes GitHub may redirect an installation completion
    to: `/github/install/callback` (the Setup URL) and `/callback` (when
    "request user authorization during installation" routes it to the
    Authorization callback URL instead). Callers must have already verified
    `claims` against `STATE_PURPOSE_INSTALL`."""
    if setup_action == "request" or installation_id is None:
        # Org installation pending owner approval — nothing to fetch from
        # GitHub yet (the App isn't actually installed until approved).
        logger.info(
            "Install pending: setup_action=%s installation_id=%s subject=%s",
            setup_action,
            installation_id,
            claims.subject,
        )
        return RedirectResponse(f"{settings.frontend_url}/dashboard?install=pending")

    user = db.get(User, uuid.UUID(claims.subject)) if claims.subject else None
    if user is None:
        logger.warning("Install: no user for state subject=%s — session expired", claims.subject)
        return RedirectResponse(f"{settings.frontend_url}/login?error=session_expired")

    logger.info("Install: fetching installation metadata for installation_id=%s", installation_id)
    provider = get_repository_provider()
    metadata = provider.get_installation(installation_id)
    logger.info(
        "Install: got metadata external_id=%s account_login=%s account_type=%s",
        metadata.external_id,
        metadata.account_login,
        metadata.account_type,
    )
    installation = upsert_installation(db, user=user, metadata=metadata)
    logger.info(
        "Install: upserted installation row id=%s user_id=%s status=%s",
        installation.id,
        installation.user_id,
        installation.status,
    )

    # Master Prompt: repositories the installation grants access to must
    # appear automatically, not through a one-by-one manual "Connect"
    # step. A failure here (rate limit, transient GitHub API error) must
    # not lose the installation row itself — it's already flushed — so
    # the install still completes; the frontend gets `repo_sync_error=1`
    # and offers a "Sync from GitHub" retry (ConnectPanel) instead.
    try:
        connected = connect_all_available_repositories(db, user=user, installation_id=installation.id)
        logger.info(
            "Install: auto-connected %d repositories for installation_id=%s: %s",
            len(connected),
            installation.id,
            [repo.full_name for repo in connected],
        )
    except GitHubIntegrationError:
        logger.exception(
            "Install: connect_all_available_repositories failed for installation_id=%s — "
            "installation row is kept, frontend gets repo_sync_error=1",
            installation.id,
        )
        db.commit()
        return RedirectResponse(f"{settings.frontend_url}/dashboard?installed=1&repo_sync_error=1")

    db.commit()
    logger.info("Install: complete for installation_id=%s", installation.id)

    return RedirectResponse(f"{settings.frontend_url}/dashboard?installed=1")
