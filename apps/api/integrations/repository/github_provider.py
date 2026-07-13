"""The MVP `RepositoryProvider` implementation (DECISIONS.md ADR-023).
Implements the protocol structurally — no inheritance — against GitHub's
REST API via `integrations.github.client.GitHubClient`, authenticated per
call with either the App JWT (installation-metadata lookups) or a cached
installation access token (everything scoped to one installation's repos).
"""

from collections.abc import Callable
from typing import Any, TypeVar

import httpx

from integrations.github.app_jwt import generate_app_jwt
from integrations.github.client import GitHubClient
from integrations.github.config import GitHubAppConfig
from integrations.github.exceptions import GitHubAuthError
from integrations.github.installation_tokens import InstallationTokenCache
from integrations.repository.base import CloneCredentials, InstallationMetadata, RepositoryMetadata
from models.types import AccountType

_PER_PAGE = 100

T = TypeVar("T")


class GitHubRepositoryProvider:
    provider_name = "github"

    def __init__(
        self,
        config: GitHubAppConfig,
        token_cache: InstallationTokenCache,
        *,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._config = config
        self._token_cache = token_cache
        self._transport = transport

    def get_installation(self, installation_id: str) -> InstallationMetadata:
        data = self._app_client().get(f"/app/installations/{installation_id}")
        return _to_installation_metadata(data)

    def list_repositories(self, installation_id: str) -> list[RepositoryMetadata]:
        def fetch(client: GitHubClient) -> list[dict[str, Any]]:
            repos: list[dict[str, Any]] = []
            page = 1
            while True:
                data = client.get(
                    "/installation/repositories", params={"per_page": _PER_PAGE, "page": page}
                )
                batch = data["repositories"]
                repos.extend(batch)
                if len(batch) < _PER_PAGE:
                    break
                page += 1
            return repos

        repos = self._with_installation_client(installation_id, fetch)
        return [_to_repository_metadata(repo) for repo in repos]

    def get_repository(self, installation_id: str, full_name: str) -> RepositoryMetadata:
        data = self._with_installation_client(
            installation_id, lambda client: client.get(f"/repos/{full_name}")
        )
        return _to_repository_metadata(data)

    def get_clone_credentials(self, installation_id: str, full_name: str) -> CloneCredentials:
        token = self._token_cache.get_token(installation_id)
        expires_at = self._token_cache.expires_at(installation_id)
        return CloneCredentials(
            clone_url=f"https://x-access-token:{token}@github.com/{full_name}.git",
            expires_at=expires_at,
        )

    def _app_client(self) -> GitHubClient:
        app_jwt = generate_app_jwt(self._config.app_id, self._config.private_key)
        return GitHubClient(token=app_jwt, transport=self._transport)

    def _with_installation_client(
        self, installation_id: str, fn: Callable[[GitHubClient], T]
    ) -> T:
        """Runs `fn(client)` against an installation-token-authenticated
        client; on a rejected token (`GitHubAuthError`), forces one token
        refresh and retries exactly once before giving up — the
        "expired tokens" graceful-handling requirement."""
        token = self._token_cache.get_token(installation_id)
        client = GitHubClient(token=token, transport=self._transport)
        try:
            return fn(client)
        except GitHubAuthError:
            token = self._token_cache.get_token(installation_id, force_refresh=True)
            client = GitHubClient(token=token, transport=self._transport)
            return fn(client)


def _to_installation_metadata(data: dict[str, Any]) -> InstallationMetadata:
    account = data["account"]
    account_type = (
        AccountType.ORGANIZATION if account.get("type") == "Organization" else AccountType.USER
    )
    return InstallationMetadata(
        external_id=str(data["id"]),
        account_login=account["login"],
        account_type=account_type,
    )


def _to_repository_metadata(data: dict[str, Any]) -> RepositoryMetadata:
    return RepositoryMetadata(
        external_id=str(data["id"]),
        full_name=data["full_name"],
        default_branch=data["default_branch"],
        private=data["private"],
        html_url=data["html_url"],
    )
