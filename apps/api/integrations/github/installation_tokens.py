"""Installation access token minting and caching (DECISIONS.md ADR-024:
token lifecycle). GitHub App best practice: mint an installation token
only when one is actually needed, keep it in memory only, and let it
expire naturally (~1 hour) rather than tracking revocation ourselves.

`InstallationTokenCache` is process-local — deliberately not backed by
Redis or a database. A token is never written anywhere but this
in-memory dict, which is what "never store long-lived access tokens"
means in the strongest available sense: even short-lived tokens aren't
persisted, only cached for their own natural lifetime. Running multiple
API/worker processes just means each mints its own token independently
the first time it needs one — an acceptable, GitHub-permitted redundancy,
not a correctness problem.
"""

import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import httpx

from integrations.github.app_jwt import generate_app_jwt
from integrations.github.client import GitHubClient
from integrations.github.config import GitHubAppConfig
from integrations.github.exceptions import GitHubAuthError, InstallationTokenExpired

_REFRESH_MARGIN_SECONDS = 60


def _utcnow() -> datetime:
    """Module-level so tests can monkeypatch it directly, without needing
    a clock-injection parameter threaded through the cache's constructor.
    Naive (tzinfo stripped) to match `_mint`'s parsing of GitHub's
    `expires_at`, which does the same."""
    return datetime.now(UTC).replace(tzinfo=None)


@dataclass
class _CachedToken:
    token: str
    expires_at: datetime

    def is_near_expiry(self, *, now: datetime) -> bool:
        return now >= self.expires_at - timedelta(seconds=_REFRESH_MARGIN_SECONDS)


class InstallationTokenCache:
    def __init__(
        self,
        config: GitHubAppConfig,
        *,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._config = config
        self._transport = transport
        self._tokens: dict[str, _CachedToken] = {}

    def get_token(self, installation_id: str, *, force_refresh: bool = False) -> str:
        cached = self._tokens.get(installation_id)
        if not force_refresh and cached is not None and not cached.is_near_expiry(now=_utcnow()):
            return cached.token

        token, expires_at = self._mint(installation_id)
        self._tokens[installation_id] = _CachedToken(token=token, expires_at=expires_at)
        return token

    def expires_at(self, installation_id: str) -> datetime:
        cached = self._tokens.get(installation_id)
        if cached is None:
            raise InstallationTokenExpired(
                f"No cached token for installation {installation_id!r} — call get_token first."
            )
        return cached.expires_at

    def _mint(self, installation_id: str) -> tuple[str, datetime]:
        app_jwt = generate_app_jwt(self._config.app_id, self._config.private_key, now=time.time())
        client = GitHubClient(token=app_jwt, transport=self._transport)
        try:
            data = client.post(f"/app/installations/{installation_id}/access_tokens")
        except GitHubAuthError as exc:
            raise InstallationTokenExpired(
                f"App JWT was rejected while minting a token for installation "
                f"{installation_id!r} — check GITHUB_APP_ID/GITHUB_APP_PRIVATE_KEY."
            ) from exc
        expires_at = datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00")).replace(
            tzinfo=None
        )
        return str(data["token"]), expires_at
