"""Maps typed integration/service exceptions to HTTP responses, in one
place (RULES.md §6: route handlers stay thin — they raise/propagate,
they don't build error responses inline). Registered once, in
`api.main.create_app`.
"""

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
from services.snapshot_service import SnapshotNotFound


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(GitHubAppConfigError)
    @app.exception_handler(SessionConfigError)
    def _configuration_error(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    @app.exception_handler(InvalidOAuthState)
    def _invalid_oauth_state(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(GitHubAppNotInstalled)
    @app.exception_handler(InstallationNotFound)
    @app.exception_handler(RepositoryNotFound)
    @app.exception_handler(SnapshotNotFound)
    def _not_found(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(InstallationRevoked)
    @app.exception_handler(InsufficientPermissions)
    def _forbidden(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=403, content={"detail": str(exc)})

    @app.exception_handler(RepositoryAlreadyConnected)
    def _conflict(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(GitHubRateLimited)
    def _rate_limited(_: Request, exc: GitHubRateLimited) -> JSONResponse:
        headers = {"Retry-After": str(int(exc.retry_after))} if exc.retry_after else {}
        return JSONResponse(status_code=429, content={"detail": str(exc)}, headers=headers)

    @app.exception_handler(InstallationTokenExpired)
    @app.exception_handler(GitHubIntegrationError)
    def _upstream_error(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=502, content={"detail": str(exc)})

    @app.exception_handler(RedisError)
    def _queue_unavailable(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": "Sync queue unavailable"})
