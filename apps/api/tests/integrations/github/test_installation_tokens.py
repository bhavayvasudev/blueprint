from datetime import datetime, timedelta

import httpx
import pytest

import integrations.github.installation_tokens as installation_tokens_module
from integrations.github.config import GitHubAppConfig
from integrations.github.exceptions import InstallationTokenExpired
from integrations.github.installation_tokens import InstallationTokenCache


def _config(private_key_pem: str) -> GitHubAppConfig:
    return GitHubAppConfig(
        app_id="123",
        private_key=private_key_pem,
        client_id="client-id",
        client_secret="client-secret",
        slug="blueprint-dev",
    )


def test_mints_and_caches_token(test_private_key_pem: str) -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(
            201, json={"token": "ghs_abc123", "expires_at": "2999-01-01T00:00:00Z"}
        )

    cache = InstallationTokenCache(_config(test_private_key_pem), transport=httpx.MockTransport(handler))

    token1 = cache.get_token("42")
    token2 = cache.get_token("42")

    assert token1 == "ghs_abc123"
    assert token2 == "ghs_abc123"
    assert call_count == 1  # second call served from cache, not re-minted


def test_force_refresh_mints_a_new_token(test_private_key_pem: str) -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(
            201, json={"token": f"token-{call_count}", "expires_at": "2999-01-01T00:00:00Z"}
        )

    cache = InstallationTokenCache(_config(test_private_key_pem), transport=httpx.MockTransport(handler))
    first = cache.get_token("42")
    second = cache.get_token("42", force_refresh=True)

    assert first == "token-1"
    assert second == "token-2"
    assert call_count == 2


def test_near_expiry_token_is_refreshed_automatically(
    test_private_key_pem: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(
            201, json={"token": f"token-{call_count}", "expires_at": "2026-01-01T00:10:00Z"}
        )

    cache = InstallationTokenCache(_config(test_private_key_pem), transport=httpx.MockTransport(handler))
    cache.get_token("42")

    # Fast-forward past the refresh margin relative to the minted token's expiry.
    monkeypatch.setattr(
        installation_tokens_module, "_utcnow", lambda: datetime(2026, 1, 1, 0, 9, 30)
    )
    cache.get_token("42")

    assert call_count == 2


def test_expires_at_without_a_prior_get_token_raises() -> None:
    cache = InstallationTokenCache(_config("irrelevant"))
    with pytest.raises(InstallationTokenExpired):
        cache.expires_at("never-minted")


def test_rejected_app_jwt_raises_installation_token_expired(test_private_key_pem: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": "Bad credentials"})

    cache = InstallationTokenCache(_config(test_private_key_pem), transport=httpx.MockTransport(handler))
    with pytest.raises(InstallationTokenExpired):
        cache.get_token("42")


def test_expires_at_returns_the_cached_expiry(test_private_key_pem: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            201, json={"token": "ghs_abc123", "expires_at": "2030-06-15T12:00:00Z"}
        )

    cache = InstallationTokenCache(_config(test_private_key_pem), transport=httpx.MockTransport(handler))
    cache.get_token("42")
    expiry = cache.expires_at("42")
    assert expiry == datetime(2030, 6, 15, 12, 0, 0)
    assert isinstance(expiry - timedelta(0), datetime)
