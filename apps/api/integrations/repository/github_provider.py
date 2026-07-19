"""The MVP `RepositoryProvider` implementation (DECISIONS.md ADR-023).
Implements the protocol structurally — no inheritance — against GitHub's
REST API via `integrations.github.client.GitHubClient`, authenticated per
call with either the App JWT (installation-metadata lookups) or a cached
installation access token (everything scoped to one installation's repos).
"""

import logging
from collections.abc import Callable
from datetime import datetime
from typing import Any, TypeVar

import httpx

from integrations.github.app_jwt import generate_app_jwt
from integrations.github.client import GitHubClient
from integrations.github.config import GitHubAppConfig
from integrations.github.exceptions import (
    GitHubAppNotInstalled,
    GitHubAuthError,
    GitHubIntegrationError,
    GitHubRateLimited,
    InsufficientPermissions,
)
from integrations.github.installation_tokens import InstallationTokenCache
from integrations.repository.base import (
    CloneCredentials,
    ContributorMetadata,
    InstallationMetadata,
    RepositoryMetadata,
    RepositoryStatusMetadata,
)
from models.types import AccountType

logger = logging.getLogger(__name__)

_PER_PAGE = 100

#: Errors that always mean "this request genuinely failed" and must never
#: be swallowed by the empty-repository tolerance below — an auth failure
#: in particular has to reach `_with_installation_client` for its one
#: token-refresh retry, and a rate limit has to reach the client so the
#: response carries `Retry-After`.
_FATAL = (GitHubAuthError, GitHubRateLimited, InsufficientPermissions, GitHubAppNotInstalled)

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
                total_count = data.get("total_count")
                batch = data["repositories"]
                logger.info(
                    "list_repositories: installation_id=%s page=%d got %d repos (total_count=%s)",
                    installation_id, page, len(batch), total_count,
                )
                repos.extend(batch)
                if len(batch) < _PER_PAGE:
                    break
                page += 1
            return repos

        repos = self._with_installation_client(installation_id, fetch)
        logger.info("list_repositories: installation_id=%s -> %d repositories total", installation_id, len(repos))
        return [_to_repository_metadata(repo) for repo in repos]

    def get_repository(self, installation_id: str, full_name: str) -> RepositoryMetadata:
        data = self._with_installation_client(
            installation_id, lambda client: client.get(f"/repos/{full_name}")
        )
        return _to_repository_metadata(data)

    def get_repository_status(
        self, installation_id: str, full_name: str
    ) -> RepositoryStatusMetadata:
        def fetch(client: GitHubClient) -> RepositoryStatusMetadata:
            repo = client.get(f"/repos/{full_name}")
            commit = _tolerate_empty_repository(
                lambda: client.get(
                    f"/repos/{full_name}/commits",
                    params={"per_page": 1, "sha": repo["default_branch"]},
                ),
                what=f"tip commit of {full_name}",
            )
            head = commit[0] if commit else None
            return _to_repository_status(repo, head)

        return self._with_installation_client(installation_id, fetch)

    def list_contributors(
        self, installation_id: str, full_name: str, *, limit: int = 100
    ) -> list[ContributorMetadata]:
        def fetch(client: GitHubClient) -> list[ContributorMetadata]:
            data = _tolerate_empty_repository(
                lambda: client.get(
                    f"/repos/{full_name}/contributors",
                    # One page only. GitHub orders contributors by commit
                    # count descending, so the first page is already the
                    # meaningful part of the list, and paging a
                    # thousand-contributor repository to render a top-N
                    # list would spend rate limit on rows nobody sees.
                    params={"per_page": min(limit, _PER_PAGE), "anon": "false"},
                ),
                what=f"contributors of {full_name}",
            )
            # A repository with no commits answers 204 No Content, which the
            # client surfaces as `None` — an empty list, not an error.
            return [_to_contributor(entry) for entry in (data or [])[:limit]]

        return self._with_installation_client(installation_id, fetch)

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
            logger.warning(
                "installation_id=%s token rejected — forcing refresh and retrying once",
                installation_id,
            )
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


def _tolerate_empty_repository[R](fn: Callable[[], R], *, what: str) -> R | None:
    """Runs `fn`, returning `None` if GitHub refused because the repository
    has no commits yet (409 Git Repository is empty). Genuine failures in
    `_FATAL` still propagate — this narrows a known, expected, benign
    upstream refusal, it does not blanket-swallow errors."""
    try:
        return fn()
    except _FATAL:
        raise
    except GitHubIntegrationError as exc:
        logger.info("No %s available (treating as empty): %s", what, exc)
        return None


def _to_repository_status(
    repo: dict[str, Any], head: dict[str, Any] | None
) -> RepositoryStatusMetadata:
    license_data = repo.get("license") or {}
    commit = (head or {}).get("commit") or {}
    author = commit.get("author") or {}
    raw_date = author.get("date")
    return RepositoryStatusMetadata(
        stars=repo.get("stargazers_count", 0),
        forks=repo.get("forks_count", 0),
        # See `RepositoryStatusMetadata.watchers` — `subscribers_count`, not
        # the star-aliased `watchers_count`.
        watchers=repo.get("subscribers_count", 0),
        # GitHub counts open PRs inside `open_issues_count`; there is no
        # issues-only field on this endpoint. The UI labels it "Open issues"
        # because that is what GitHub itself calls the number.
        open_issues=repo.get("open_issues_count", 0),
        primary_language=repo.get("language"),
        license_name=license_data.get("name"),
        license_spdx_id=license_data.get("spdx_id"),
        default_branch=repo["default_branch"],
        private=repo["private"],
        html_url=repo["html_url"],
        last_commit_sha=(head or {}).get("sha"),
        last_commit_at=datetime.fromisoformat(raw_date) if raw_date else None,
        # First line only: the subject. A commit body belongs in the commit,
        # not in a status pill.
        last_commit_message=(commit.get("message") or "").split("\n", 1)[0] or None,
        last_commit_author=author.get("name"),
    )


def _to_contributor(data: dict[str, Any]) -> ContributorMetadata:
    return ContributorMetadata(
        login=data.get("login") or "unknown",
        avatar_url=data.get("avatar_url") or "",
        html_url=data.get("html_url") or "",
        contributions=data.get("contributions", 0),
    )


def _to_repository_metadata(data: dict[str, Any]) -> RepositoryMetadata:
    return RepositoryMetadata(
        external_id=str(data["id"]),
        full_name=data["full_name"],
        default_branch=data["default_branch"],
        private=data["private"],
        html_url=data["html_url"],
    )
