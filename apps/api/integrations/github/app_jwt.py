"""GitHub App JWT generation — the credential that authenticates Blueprint
*as the App itself* (not as any installation), used only to mint
installation access tokens and to read installation metadata. Per GitHub's
documented best practice: signed RS256 with the App's private key, `iss`
is the App ID, lifetime capped at 10 minutes, `iat` backdated by 60s to
tolerate clock drift between this process and GitHub's servers. Never
cached or persisted — cheap to mint fresh every time it's needed.
"""

import time

import jwt

_CLOCK_DRIFT_BUFFER_SECONDS = 60
_MAX_LIFETIME_SECONDS = 9 * 60  # GitHub's cap is 10 minutes; stay under it


def generate_app_jwt(app_id: str, private_key_pem: str, *, now: float | None = None) -> str:
    issued_at = int(now if now is not None else time.time()) - _CLOCK_DRIFT_BUFFER_SECONDS
    payload = {
        "iat": issued_at,
        "exp": issued_at + _CLOCK_DRIFT_BUFFER_SECONDS + _MAX_LIFETIME_SECONDS,
        "iss": app_id,
    }
    return jwt.encode(payload, private_key_pem, algorithm="RS256")
