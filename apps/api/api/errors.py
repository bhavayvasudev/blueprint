"""Maps typed integration/service exceptions to HTTP responses, in one
place (RULES.md §6: route handlers stay thin — they raise/propagate,
they don't build error responses inline). Registered once, in
`api.main.create_app`.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from redis.exceptions import RedisError

from integrations.github.exceptions import (
    GitHubAppConfigError,
    GitHubAppNotInstalled,
    GitHubIntegrationError,
    GitHubRateLimited,
    InstallationRevoked,
    InstallationTokenExpired,
    InsufficientPermissions,
    InvalidOAuthState,
)
from services.auth_service import SessionConfigError
from services.installation_service import InstallationNotFound
from services.repository_connection_service import RepositoryAlreadyConnected, RepositoryNotFound
from services.snapshot_service import SnapshotNotCancellable, SnapshotNotFound
from services.thread_service import ThreadNotFound

logger = logging.getLogger(__name__)


def register_exception_handlers(app: FastAPI) -> None:
    """Every handler here logs before responding — a typed exception
    reaching this module means a request is about to fail, and the
    previous absence of logging made every one of these silent."""

    @app.exception_handler(GitHubAppConfigError)
    @app.exception_handler(SessionConfigError)
    def _configuration_error(request: Request, exc: Exception) -> JSONResponse:
        logger.error("%s %s -> 503 configuration error: %s", request.method, request.url.path, exc)
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    @app.exception_handler(InvalidOAuthState)
    def _invalid_oauth_state(request: Request, exc: Exception) -> JSONResponse:
        logger.warning("%s %s -> 400 invalid OAuth state: %s", request.method, request.url.path, exc)
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(GitHubAppNotInstalled)
    @app.exception_handler(InstallationNotFound)
    @app.exception_handler(RepositoryNotFound)
    @app.exception_handler(SnapshotNotFound)
    @app.exception_handler(ThreadNotFound)
    def _not_found(request: Request, exc: Exception) -> JSONResponse:
        logger.warning("%s %s -> 404: %s", request.method, request.url.path, exc)
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(InstallationRevoked)
    @app.exception_handler(InsufficientPermissions)
    def _forbidden(request: Request, exc: Exception) -> JSONResponse:
        logger.warning("%s %s -> 403: %s", request.method, request.url.path, exc)
        return JSONResponse(status_code=403, content={"detail": str(exc)})

    @app.exception_handler(RepositoryAlreadyConnected)
    @app.exception_handler(SnapshotNotCancellable)
    def _conflict(request: Request, exc: Exception) -> JSONResponse:
        logger.info("%s %s -> 409: %s", request.method, request.url.path, exc)
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(GitHubRateLimited)
    def _rate_limited(request: Request, exc: GitHubRateLimited) -> JSONResponse:
        logger.warning("%s %s -> 429 rate limited: %s", request.method, request.url.path, exc)
        headers = {"Retry-After": str(int(exc.retry_after))} if exc.retry_after else {}
        return JSONResponse(status_code=429, content={"detail": str(exc)}, headers=headers)

    @app.exception_handler(InstallationTokenExpired)
    @app.exception_handler(GitHubIntegrationError)
    def _upstream_error(request: Request, exc: Exception) -> JSONResponse:
        logger.error("%s %s -> 502 upstream GitHub error: %s", request.method, request.url.path, exc)
        return JSONResponse(status_code=502, content={"detail": str(exc)})

    @app.exception_handler(RedisError)
    def _queue_unavailable(request: Request, exc: Exception) -> JSONResponse:
        logger.error("%s %s -> 503 Redis error: %s", request.method, request.url.path, exc)
        return JSONResponse(status_code=503, content={"detail": "Sync queue unavailable"})
