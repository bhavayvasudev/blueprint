from collections.abc import Callable

import httpx
import pytest

from integrations.github.config import GitHubAppConfig
from integrations.github.exceptions import GitHubAppNotInstalled
from integrations.github.installation_tokens import InstallationTokenCache
from integrations.repository.base import RepositoryProvider
from integrations.repository.github_provider import GitHubRepositoryProvider
from models.types import AccountType

_Handler = Callable[[httpx.Request], httpx.Response]


def _provider(
    test_private_key_pem: str, handler: _Handler, *, token_handler: _Handler | None = None
) -> GitHubRepositoryProvider:
    config = GitHubAppConfig(
        app_id="123",
        private_key=test_private_key_pem,
        client_id="client-id",
        client_secret="client-secret",
        slug="blueprint-dev",
    )
    token_cache = InstallationTokenCache(
        config, transport=httpx.MockTransport(token_handler or _default_token_handler)
    )
    return GitHubRepositoryProvider(config, token_cache, transport=httpx.MockTransport(handler))


def _default_token_handler(request: httpx.Request) -> httpx.Response:
    return httpx.Response(201, json={"token": "ghs_test", "expires_at": "2999-01-01T00:00:00Z"})


def test_implements_repository_provider_protocol(test_private_key_pem: str) -> None:
    provider = _provider(test_private_key_pem, lambda r: httpx.Response(200, json={}))
    assert isinstance(provider, RepositoryProvider)
    assert provider.provider_name == "github"


def test_get_installation_returns_account_metadata(test_private_key_pem: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/app/installations/42"
        return httpx.Response(
            200, json={"id": 42, "account": {"login": "acme-corp", "type": "Organization"}}
        )

    provider = _provider(test_private_key_pem, handler)
    metadata = provider.get_installation("42")
    assert metadata.external_id == "42"
    assert metadata.account_login == "acme-corp"
    assert metadata.account_type == AccountType.ORGANIZATION


def test_get_installation_not_found_raises(test_private_key_pem: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"message": "Not Found"})

    provider = _provider(test_private_key_pem, handler)
    with pytest.raises(GitHubAppNotInstalled):
        provider.get_installation("999")


def test_list_repositories_paginates_until_short_page(test_private_key_pem: str) -> None:
    def repo(idx: int) -> dict[str, object]:
        return {
            "id": idx,
            "full_name": f"acme/repo-{idx}",
            "default_branch": "main",
            "private": False,
            "html_url": f"https://github.com/acme/repo-{idx}",
        }

    per_page = 100

    def handler(request: httpx.Request) -> httpx.Response:
        page = int(request.url.params["page"])
        if page == 1:
            return httpx.Response(200, json={"repositories": [repo(i) for i in range(per_page)]})
        return httpx.Response(200, json={"repositories": [repo(per_page)]})

    provider = _provider(test_private_key_pem, handler)
    repos = provider.list_repositories("42")
    assert len(repos) == per_page + 1
    assert repos[0].full_name == "acme/repo-0"
    assert repos[-1].full_name == f"acme/repo-{per_page}"


def test_get_repository_returns_metadata(test_private_key_pem: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/repos/acme/widgets"
        return httpx.Response(
            200,
            json={
                "id": 7,
                "full_name": "acme/widgets",
                "default_branch": "develop",
                "private": True,
                "html_url": "https://github.com/acme/widgets",
            },
        )

    provider = _provider(test_private_key_pem, handler)
    metadata = provider.get_repository("42", "acme/widgets")
    assert metadata.external_id == "7"
    assert metadata.private is True
    assert metadata.default_branch == "develop"


_STATUS_REPO = {
    "id": 7,
    "full_name": "acme/widgets",
    "default_branch": "main",
    "private": False,
    "html_url": "https://github.com/acme/widgets",
    "stargazers_count": 1280,
    "forks_count": 96,
    "subscribers_count": 41,
    "watchers_count": 1280,  # GitHub's legacy star alias — must not be read
    "open_issues_count": 12,
    "language": "Python",
    "license": {"name": "MIT License", "spdx_id": "MIT"},
}

_HEAD_COMMIT = {
    "sha": "abc1234def5678",
    "commit": {
        "message": "fix: resolve the token refresh race\n\nLonger body text.",
        "author": {"name": "Ada Lovelace", "date": "2026-07-18T09:30:00Z"},
    },
}


def test_get_repository_status_reads_real_counts(test_private_key_pem: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/repos/acme/widgets":
            return httpx.Response(200, json=_STATUS_REPO)
        assert request.url.path == "/repos/acme/widgets/commits"
        assert request.url.params["sha"] == "main"
        return httpx.Response(200, json=[_HEAD_COMMIT])

    status = _provider(test_private_key_pem, handler).get_repository_status("42", "acme/widgets")

    assert status.stars == 1280
    assert status.forks == 96
    # `subscribers_count`, not the star-aliased `watchers_count`.
    assert status.watchers == 41
    assert status.open_issues == 12
    assert status.primary_language == "Python"
    assert status.license_spdx_id == "MIT"
    assert status.last_commit_sha == "abc1234def5678"
    assert status.last_commit_author == "Ada Lovelace"
    # Subject line only — the body is dropped.
    assert status.last_commit_message == "fix: resolve the token refresh race"


def test_get_repository_status_tolerates_repository_with_no_commits(
    test_private_key_pem: str,
) -> None:
    """An empty repository answers 409 on `/commits`. That's a real state
    ("nothing committed yet"), not a failure — status still renders."""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/repos/acme/widgets":
            return httpx.Response(200, json=_STATUS_REPO)
        return httpx.Response(409, json={"message": "Git Repository is empty."})

    status = _provider(test_private_key_pem, handler).get_repository_status("42", "acme/widgets")

    assert status.stars == 1280
    assert status.last_commit_sha is None
    assert status.last_commit_at is None


def test_get_repository_status_reports_missing_license_as_none(
    test_private_key_pem: str,
) -> None:
    """No license is `None`, never a fabricated "Unknown" — the UI decides
    how to phrase an absence, the provider only reports it."""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/repos/acme/widgets":
            return httpx.Response(200, json={**_STATUS_REPO, "license": None, "language": None})
        return httpx.Response(200, json=[_HEAD_COMMIT])

    status = _provider(test_private_key_pem, handler).get_repository_status("42", "acme/widgets")

    assert status.license_name is None
    assert status.license_spdx_id is None
    assert status.primary_language is None


def test_list_contributors_returns_provider_ordering(test_private_key_pem: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/repos/acme/widgets/contributors"
        return httpx.Response(
            200,
            json=[
                {
                    "login": "ada",
                    "avatar_url": "https://avatars.example/ada",
                    "html_url": "https://github.com/ada",
                    "contributions": 300,
                },
                {
                    "login": "grace",
                    "avatar_url": "https://avatars.example/grace",
                    "html_url": "https://github.com/grace",
                    "contributions": 100,
                },
            ],
        )

    contributors = _provider(test_private_key_pem, handler).list_contributors("42", "acme/widgets")

    assert [c.login for c in contributors] == ["ada", "grace"]
    assert contributors[0].contributions == 300


def test_list_contributors_empty_repository_returns_empty_list(
    test_private_key_pem: str,
) -> None:
    """204 No Content — "nobody has contributed" is an answer, not an error."""
    provider = _provider(test_private_key_pem, lambda r: httpx.Response(204))
    assert provider.list_contributors("42", "acme/widgets") == []


def test_status_auth_failure_still_refreshes_token(test_private_key_pem: str) -> None:
    """The empty-repository tolerance must not swallow a 401 — it has to
    reach the retry wrapper, or an expired token would silently degrade
    into "this repository has no commits"."""
    attempts = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/repos/acme/widgets":
            return httpx.Response(200, json=_STATUS_REPO)
        attempts["count"] += 1
        if attempts["count"] == 1:
            return httpx.Response(401, json={"message": "Bad credentials"})
        return httpx.Response(200, json=[_HEAD_COMMIT])

    status = _provider(test_private_key_pem, handler).get_repository_status("42", "acme/widgets")

    assert attempts["count"] == 2
    assert status.last_commit_sha == "abc1234def5678"


def test_expired_installation_token_is_refreshed_and_retried(test_private_key_pem: str) -> None:
    attempts = {"count": 0}

    def repo_handler(request: httpx.Request) -> httpx.Response:
        attempts["count"] += 1
        if attempts["count"] == 1:
            return httpx.Response(401, json={"message": "Bad credentials"})
        return httpx.Response(
            200,
            json={
                "id": 7,
                "full_name": "acme/widgets",
                "default_branch": "main",
                "private": False,
                "html_url": "https://github.com/acme/widgets",
            },
        )

    token_calls = {"count": 0}

    def token_handler(request: httpx.Request) -> httpx.Response:
        token_calls["count"] += 1
        return httpx.Response(
            201, json={"token": f"token-{token_calls['count']}", "expires_at": "2999-01-01T00:00:00Z"}
        )

    provider = _provider(test_private_key_pem, repo_handler, token_handler=token_handler)
    metadata = provider.get_repository("42", "acme/widgets")

    assert metadata.full_name == "acme/widgets"
    assert attempts["count"] == 2  # first 401, then a successful retry
    assert token_calls["count"] == 2  # forced refresh minted a second token


def test_get_clone_credentials_embeds_token_in_url(test_private_key_pem: str) -> None:
    provider = _provider(test_private_key_pem, lambda r: httpx.Response(200, json={}))
    creds = provider.get_clone_credentials("42", "acme/widgets")
    assert creds.clone_url == "https://x-access-token:ghs_test@github.com/acme/widgets.git"
