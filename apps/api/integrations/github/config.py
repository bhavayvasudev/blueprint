"""Strongly typed, validated GitHub App configuration (DECISIONS.md
ADR-024). `GitHubAppConfig.from_settings` is the single place that turns
`config.Settings`'s flat, all-defaulted-to-empty-string GitHub fields into
a config object that is guaranteed complete — constructing one at all is
the fail-fast check the rest of this PR's requirements ask for. Nothing
downstream needs to re-check "is this field set."
"""

from dataclasses import dataclass
from typing import TYPE_CHECKING, ClassVar

from integrations.github.exceptions import GitHubAppConfigError

if TYPE_CHECKING:
    from config import Settings

# Documents every environment variable GitHub authentication requires —
# the "required environment variables should be documented automatically"
# requirement. `.env.example` lists these for humans; this tuple is what
# `from_settings` actually checks and what a test can introspect.
REQUIRED_ENV_VARS: tuple[str, ...] = (
    "GITHUB_APP_ID",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_APP_CLIENT_ID",
    "GITHUB_APP_CLIENT_SECRET",
    "GITHUB_APP_SLUG",
)


@dataclass(frozen=True)
class GitHubAppConfig:
    app_id: str
    private_key: str
    client_id: str
    client_secret: str
    slug: str

    REQUIRED_ENV_VARS: ClassVar[tuple[str, ...]] = REQUIRED_ENV_VARS

    @classmethod
    def from_settings(cls, settings: "Settings") -> "GitHubAppConfig":
        values = {
            "GITHUB_APP_ID": settings.github_app_id,
            "GITHUB_APP_PRIVATE_KEY": settings.github_app_private_key,
            "GITHUB_APP_CLIENT_ID": settings.github_app_client_id,
            "GITHUB_APP_CLIENT_SECRET": settings.github_app_client_secret,
            "GITHUB_APP_SLUG": settings.github_app_slug,
        }
        missing = [name for name in REQUIRED_ENV_VARS if not values[name]]
        if missing:
            raise GitHubAppConfigError(missing)

        return cls(
            app_id=values["GITHUB_APP_ID"],
            private_key=_normalize_private_key(values["GITHUB_APP_PRIVATE_KEY"]),
            client_id=values["GITHUB_APP_CLIENT_ID"],
            client_secret=values["GITHUB_APP_CLIENT_SECRET"],
            slug=values["GITHUB_APP_SLUG"],
        )


def _normalize_private_key(raw: str) -> str:
    """Accepts a PEM either with real newlines or with literal `\\n`
    escapes — the latter is how most PaaS providers (Railway, Vercel,
    Render) require multi-line secrets to be entered as a single-line
    environment variable, and the only form that survives an unquoted
    .env value: python-dotenv reads .env line by line and has no
    support for a raw multi-line value, so pasting one directly
    silently truncates to just the "-----BEGIN...-----" line — no
    parse error, just a key that's missing its body and END marker.
    Checking for both markers here (not just "BEGIN"/"PRIVATE KEY",
    which a truncated key still contains) turns that into a fail-fast
    error instead of a confusing failure deep inside `generate_app_jwt`.
    """
    key = raw.replace("\\n", "\n").strip()
    has_begin = "BEGIN" in key and "PRIVATE KEY" in key
    has_end = "END" in key and "PRIVATE KEY" in key
    if not has_begin or not has_end:
        raise GitHubAppConfigError(
            ["GITHUB_APP_PRIVATE_KEY"],
            detail=(
                "GITHUB_APP_PRIVATE_KEY does not look like a complete PEM-encoded "
                "private key (expected both '-----BEGIN ... PRIVATE KEY-----' and "
                "'-----END ... PRIVATE KEY-----' markers). If you pasted a raw, "
                "multi-line .pem file directly into .env, this is likely "
                "truncation, not a bad key — use "
                "`uv run python scripts/format_private_key.py path/to/key.pem` "
                "to produce a single-line, correctly escaped value instead."
            ),
        )
    return key
