import httpx
import pytest

from integrations.github.config import GitHubAppConfig
from integrations.github.exceptions import GitHubAppNotInstalled
from integrations.github.installation_tokens import InstallationTokenCache
from integrations.repository.base import RepositoryProvider
from integrations.repository.github_provider import GitHubRepositoryProvider
from models.types import AccountType


def _provider(
    test_private_key_pem: str, handler: object, *, token_handler: object | None = None
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
    return GitHubRepositoryProvider(
        config, token_cache, transport=httpx.MockTransport(handler)  # type: ignore[arg-type]
    )


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
