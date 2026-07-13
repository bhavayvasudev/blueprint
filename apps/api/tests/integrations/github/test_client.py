import json

import httpx
import pytest

from integrations.github.client import GitHubClient
from integrations.github.exceptions import (
    GitHubAppNotInstalled,
    GitHubAuthError,
    GitHubIntegrationError,
    GitHubRateLimited,
    InsufficientPermissions,
)


def _client(handler: object) -> GitHubClient:
    return GitHubClient(token="test-token", transport=httpx.MockTransport(handler))  # type: ignore[arg-type]


def test_get_returns_parsed_json_on_success() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer test-token"
        assert request.headers["accept"] == "application/vnd.github+json"
        return httpx.Response(200, json={"ok": True})

    result = _client(handler).get("/some/path")
    assert result == {"ok": True}


def test_404_raises_not_installed() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"message": "Not Found"})

    with pytest.raises(GitHubAppNotInstalled):
        _client(handler).get("/app/installations/999")


def test_401_raises_auth_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": "Bad credentials"})

    with pytest.raises(GitHubAuthError):
        _client(handler).get("/user")


def test_403_with_zero_remaining_raises_rate_limited() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            403, headers={"X-RateLimit-Remaining": "0", "Retry-After": "42"}, json={}
        )

    with pytest.raises(GitHubRateLimited) as exc_info:
        _client(handler).get("/installation/repositories")
    assert exc_info.value.retry_after == 42.0


def test_429_raises_rate_limited() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={})

    with pytest.raises(GitHubRateLimited):
        _client(handler).get("/anything")


def test_403_without_rate_limit_headers_raises_insufficient_permissions() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"message": "Resource not accessible"})

    with pytest.raises(InsufficientPermissions):
        _client(handler).get("/repos/owner/repo")


def test_other_error_status_raises_base_integration_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"message": "Internal Server Error"})

    with pytest.raises(GitHubIntegrationError):
        _client(handler).get("/anything")


def test_post_sends_json_body() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content) if request.content else None
        return httpx.Response(201, json={"token": "abc"})

    result = _client(handler).post("/app/installations/1/access_tokens", json={"foo": "bar"})
    assert captured["body"] == {"foo": "bar"}
    assert result == {"token": "abc"}
