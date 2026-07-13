"""Thin GitHub REST API client — the single place an HTTP response's status
code gets mapped to a typed exception (RULES.md §6: external calls are
wrapped once, not re-interpreted at every call site). One instance is bound
to exactly one bearer token (either an App JWT or an installation access
token); callers construct a new instance per token rather than mutating
one across token refreshes, keeping the client itself stateless aside from
the underlying `httpx.Client`.
"""

from typing import Any

import httpx

from integrations.github.exceptions import (
    GitHubAppNotInstalled,
    GitHubAuthError,
    GitHubIntegrationError,
    GitHubRateLimited,
    InsufficientPermissions,
)

_DEFAULT_BASE_URL = "https://api.github.com"
_API_VERSION_HEADER = "2022-11-28"


class GitHubClient:
    def __init__(
        self,
        *,
        token: str,
        base_url: str = _DEFAULT_BASE_URL,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._client = httpx.Client(
            base_url=base_url,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": _API_VERSION_HEADER,
            },
            timeout=30.0,
            transport=transport,
        )

    def get(self, path: str, *, params: dict[str, Any] | None = None) -> Any:
        return self._request("GET", path, params=params)

    def post(self, path: str, *, json: dict[str, Any] | None = None) -> Any:
        return self._request("POST", path, json=json)

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> Any:
        response = self._client.request(method, path, params=params, json=json)

        if response.status_code == 404:
            raise GitHubAppNotInstalled(f"{method} {path} returned 404")

        if response.status_code == 401:
            raise GitHubAuthError(f"{method} {path} returned 401")

        if response.status_code in (403, 429):
            remaining = response.headers.get("X-RateLimit-Remaining")
            retry_after_header = response.headers.get("Retry-After")
            is_rate_limit = response.status_code == 429 or remaining == "0"
            if is_rate_limit:
                raise GitHubRateLimited(
                    retry_after=float(retry_after_header) if retry_after_header else None
                )
            raise InsufficientPermissions(f"{method} {path} returned 403: {response.text}")

        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise GitHubIntegrationError(
                f"{method} {path} returned {response.status_code}: {response.text}"
            ) from exc

        if not response.content:
            return None
        return response.json()
