import httpx
import pytest

from integrations.github.config import GitHubAppConfig
from integrations.github.exceptions import GitHubIntegrationError
from integrations.github.oauth import GitHubOAuthClient, build_authorize_url, build_install_url

_CONFIG = GitHubAppConfig(
    app_id="123",
    private_key="irrelevant-for-oauth",
    client_id="client-id",
    client_secret="client-secret",
    slug="blueprint-dev",
)


def test_build_authorize_url_includes_client_id_redirect_and_state() -> None:
    url = build_authorize_url(_CONFIG, redirect_uri="https://api.example.com/callback", state="s1")
    assert url.startswith("https://github.com/login/oauth/authorize?")
    assert "client_id=client-id" in url
    assert "redirect_uri=https%3A%2F%2Fapi.example.com%2Fcallback" in url
    assert "state=s1" in url


def test_build_install_url_uses_app_slug() -> None:
    url = build_install_url(_CONFIG, state="s2")
    assert url == "https://github.com/apps/blueprint-dev/installations/new?state=s2"


def _oauth_client(handler: object) -> GitHubOAuthClient:
    return GitHubOAuthClient(_CONFIG, transport=httpx.MockTransport(handler))  # type: ignore[arg-type]


def test_exchange_code_for_user_token_returns_access_token() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "github.com"
        return httpx.Response(200, json={"access_token": "user-token-abc", "scope": ""})

    token = _oauth_client(handler).exchange_code_for_user_token("some-code")
    assert token == "user-token-abc"


def test_exchange_code_error_response_raises() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"error": "bad_verification_code"})

    with pytest.raises(GitHubIntegrationError, match="bad_verification_code"):
        _oauth_client(handler).exchange_code_for_user_token("bad-code")


def test_fetch_user_profile_uses_public_email_when_present() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer user-token"
        return httpx.Response(
            200, json={"id": 42, "login": "octocat", "name": "The Octocat", "email": "octo@example.com"}
        )

    profile = _oauth_client(handler).fetch_user_profile("user-token")
    assert profile.github_id == "42"
    assert profile.login == "octocat"
    assert profile.name == "The Octocat"
    assert profile.email == "octo@example.com"


def test_fetch_user_profile_falls_back_to_primary_verified_email() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/user":
            return httpx.Response(200, json={"id": 42, "login": "octocat", "name": None, "email": None})
        assert request.url.path == "/user/emails"
        return httpx.Response(
            200,
            json=[
                {"email": "secondary@example.com", "primary": False, "verified": True},
                {"email": "primary@example.com", "primary": True, "verified": True},
            ],
        )

    profile = _oauth_client(handler).fetch_user_profile("user-token")
    assert profile.email == "primary@example.com"
    assert profile.name == "octocat"  # falls back to login when name is null


def test_fetch_user_profile_raises_when_no_verified_primary_email() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/user":
            return httpx.Response(200, json={"id": 1, "login": "x", "name": "X", "email": None})
        return httpx.Response(200, json=[{"email": "a@b.com", "primary": False, "verified": True}])

    with pytest.raises(GitHubIntegrationError, match="no public or primary verified email"):
        _oauth_client(handler).fetch_user_profile("user-token")
