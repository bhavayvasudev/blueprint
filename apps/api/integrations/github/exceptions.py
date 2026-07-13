"""Typed error vocabulary for every GitHub-App-related failure mode this
PR is required to handle gracefully (missing installation, revoked
installation, expired tokens, missing permissions, rate limiting, invalid
callback state). `api/errors.py` maps each of these to an HTTP response —
callers here never construct an HTTP response directly (RULES.md §6:
route handlers stay thin, external-call error mapping lives in
`integrations/`).
"""


class GitHubIntegrationError(Exception):
    """Base class for every error this package raises."""


class GitHubAppConfigError(GitHubIntegrationError):
    """Required GitHub App configuration is missing or malformed
    (`integrations.github.config.GitHubAppConfig.from_settings`) — the
    "fail fast on missing credentials" requirement."""

    def __init__(self, missing: list[str], *, detail: str | None = None) -> None:
        self.missing = missing
        message = detail or (
            "Missing required GitHub App configuration: "
            + ", ".join(missing)
            + ". Set these environment variables (see .env.example) before "
            "using GitHub authentication."
        )
        super().__init__(message)


class GitHubAppNotInstalled(GitHubIntegrationError):
    """The referenced installation does not exist from GitHub's point of
    view (404 on an installation-scoped call) — either it was never real,
    or it was deleted after Blueprint last saw it."""


class InstallationRevoked(GitHubIntegrationError):
    """Blueprint's own record shows this installation as revoked. Raised
    by the service layer (not the raw client) after it has already
    reconciled a GitHubAppNotInstalled failure against the `installations`
    table (DECISIONS.md ADR-024) — a distinct case from "never existed"."""


class GitHubAuthError(GitHubIntegrationError):
    """401 from GitHub on an authenticated request — the token used
    (installation or App JWT) was rejected. Callers get one chance to
    force-refresh the token and retry before this surfaces further."""


class InstallationTokenExpired(GitHubIntegrationError):
    """A 401 persisted even after a forced token refresh and retry —
    distinct from `GitHubAuthError`, which is the pre-retry signal."""


class InsufficientPermissions(GitHubIntegrationError):
    """403 from GitHub that is not a rate-limit response (see
    `GitHubRateLimited`) — the installation exists and the token is valid,
    but lacks the permission the request needs."""


class GitHubRateLimited(GitHubIntegrationError):
    """403 with `X-RateLimit-Remaining: 0`, or 429. `retry_after` is the
    number of seconds GitHub suggests waiting, when it told us; `api/errors.py`
    surfaces this on the `Retry-After` response header."""

    def __init__(self, retry_after: float | None = None) -> None:
        self.retry_after = retry_after
        super().__init__(
            "GitHub API rate limit exceeded"
            + (f"; retry after {retry_after:.0f}s" if retry_after else "")
        )


class InvalidOAuthState(GitHubIntegrationError):
    """The `state` parameter on an OAuth or installation callback failed
    signature verification, expired, or was issued for a different
    purpose/subject than the one it's being used for — the CSRF guard for
    both the login and install flows."""
