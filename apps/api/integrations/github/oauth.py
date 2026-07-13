"""GitHub OAuth (login/identity only — DECISIONS.md ADR-024). Deliberately
narrow: this exchanges a code for a user access token and fetches just
enough profile data to identify the person, then the token is discarded by
the caller. It is never used for repository access (that's installation
tokens, `installation_tokens.py`) and never persisted (`services/auth_service.py`
holds it only for the duration of the login callback request).
"""

from urllib.parse import urlencode

import httpx
from pydantic import BaseModel

from integrations.github.config import GitHubAppConfig
from integrations.github.exceptions import GitHubIntegrationError

_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
_TOKEN_URL = "https://github.com/login/oauth/access_token"
_API_BASE_URL = "https://api.github.com"


class GitHubUserProfile(BaseModel):
    github_id: str
    login: str
    name: str
    email: str


def build_authorize_url(config: GitHubAppConfig, *, redirect_uri: str, state: str) -> str:
    params = urlencode(
        {"client_id": config.client_id, "redirect_uri": redirect_uri, "state": state}
    )
    return f"{_AUTHORIZE_URL}?{params}"


def build_install_url(config: GitHubAppConfig, *, state: str) -> str:
    params = urlencode({"state": state})
    return f"https://github.com/apps/{config.slug}/installations/new?{params}"


class GitHubOAuthClient:
    """One `httpx.Client` with no `base_url`, since token exchange
    (`github.com`) and profile lookup (`api.github.com`) are different
    hosts — every call here passes a full URL. `transport` is the test
    seam (`httpx.MockTransport`), matching `OpenRouterEmbeddingProvider`'s
    pattern."""

    def __init__(
        self,
        config: GitHubAppConfig,
        *,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._config = config
        self._client = httpx.Client(
            headers={"Accept": "application/vnd.github+json"}, timeout=30.0, transport=transport
        )

    def exchange_code_for_user_token(self, code: str) -> str:
        response = self._client.post(
            _TOKEN_URL,
            data={
                "client_id": self._config.client_id,
                "client_secret": self._config.client_secret,
                "code": code,
            },
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        payload = response.json()
        if "error" in payload:
            raise GitHubIntegrationError(
                "GitHub OAuth token exchange failed: "
                f"{payload.get('error_description', payload['error'])}"
            )
        token = payload.get("access_token")
        if not token:
            raise GitHubIntegrationError("GitHub OAuth token exchange returned no access_token")
        return str(token)

    def fetch_user_profile(self, user_access_token: str) -> GitHubUserProfile:
        auth_header = {"Authorization": f"Bearer {user_access_token}"}
        response = self._client.get(f"{_API_BASE_URL}/user", headers=auth_header)
        response.raise_for_status()
        data = response.json()

        email = data.get("email")
        if not email:
            email = self._fetch_primary_email(auth_header)

        return GitHubUserProfile(
            github_id=str(data["id"]),
            login=data["login"],
            name=data.get("name") or data["login"],
            email=email,
        )

    def _fetch_primary_email(self, auth_header: dict[str, str]) -> str:
        response = self._client.get(f"{_API_BASE_URL}/user/emails", headers=auth_header)
        response.raise_for_status()
        for entry in response.json():
            if entry.get("primary") and entry.get("verified"):
                return str(entry["email"])
        raise GitHubIntegrationError(
            "GitHub account has no public or primary verified email — cannot identify user"
        )
