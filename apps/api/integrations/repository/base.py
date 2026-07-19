"""The RepositoryProvider abstraction (DECISIONS.md ADR-023) — the seam
that keeps Repository Intelligence from ever depending on GitHub's API
shape directly. Structural (`typing.Protocol`), matching
`integrations.embeddings.base.EmbeddingProvider`'s pattern (ADR-021):
a concrete provider doesn't inherit from anything here, it just needs the
right shape.

Every method takes provider-native identifiers as plain strings
(`installation_id`, `full_name`) rather than Blueprint's own DB IDs —
callers (`services/`) are responsible for resolving a Blueprint
`Installation`/`Repository` row to its `external_id` before calling in,
and for persisting whatever comes back. This keeps the protocol itself
free of any dependency on `models/`.
"""

from datetime import datetime
from typing import Protocol, runtime_checkable

from pydantic import BaseModel

from models.types import AccountType


class InstallationMetadata(BaseModel):
    external_id: str
    account_login: str
    account_type: AccountType


class RepositoryMetadata(BaseModel):
    external_id: str
    full_name: str
    default_branch: str
    private: bool
    html_url: str


class RepositoryStatusMetadata(BaseModel):
    """Live provider-side facts about one repository — the social and
    housekeeping numbers Blueprint itself never computes because they
    aren't derivable from the code (stars, forks, watchers, open issues,
    the declared license).

    Every field is read straight off the provider's response, never
    inferred or interpolated: an absent license really is `None` rather
    than "Unknown", and a repository with no commits yet has
    `last_commit_sha = None` rather than a placeholder. That's the same
    honesty bar `RULES.md` §23 applies to everything else Blueprint
    displays — this model just sources its facts from GitHub instead of
    from a study.
    """

    stars: int
    forks: int
    # GitHub's `watchers_count` is a legacy alias for the star count;
    # `subscribers_count` is the number of accounts actually watching for
    # notifications, which is what "Watchers" means to a person reading it.
    watchers: int
    open_issues: int
    primary_language: str | None
    license_name: str | None
    license_spdx_id: str | None
    default_branch: str
    private: bool
    html_url: str
    # The real tip commit of the default branch, resolved from the commits
    # endpoint rather than approximated from `pushed_at` (which moves on a
    # push to *any* branch, so it answers a different question).
    last_commit_sha: str | None
    last_commit_at: datetime | None
    last_commit_message: str | None
    last_commit_author: str | None


class ContributorMetadata(BaseModel):
    """One contributor as the provider reports them.

    `contributions` is a real commit count on the default branch, which is
    what makes a share-of-total percentage a derived fact rather than a
    fabricated one. There is deliberately no "last contribution" field:
    the contributors endpoint doesn't carry a date, and the statistics
    endpoint that does is computed asynchronously and returns 202 while it
    warms — inventing a date from either would be exactly the unearned
    number `RULES.md` §23 forbids.
    """

    login: str
    avatar_url: str
    html_url: str
    contributions: int


class CloneCredentials(BaseModel):
    """`clone_url` embeds a short-lived token (DECISIONS.md ADR-024) —
    never logged, never persisted. `expires_at` tells the caller (the
    ingestion worker) how long it has before it would need a fresh one;
    in practice a clone finishes well within an installation token's ~1
    hour lifetime, so no caller should need to renew mid-clone."""

    clone_url: str
    expires_at: datetime


@runtime_checkable
class RepositoryProvider(Protocol):
    @property
    def provider_name(self) -> str:
        """Identifies which backend this is ("github" today) — provenance
        on `installations.provider`, not used for routing."""
        ...

    def get_installation(self, installation_id: str) -> InstallationMetadata:
        """Fetches current installation metadata from the provider —
        used right after the install callback to confirm the installation
        is real and to record its account info. Raises
        `integrations.github.exceptions.GitHubAppNotInstalled` (or the
        equivalent for a future provider) if it no longer exists."""
        ...

    def list_repositories(self, installation_id: str) -> list[RepositoryMetadata]:
        """Every repository this installation currently grants access to
        — public and private alike, exactly as scoped by whatever the
        user selected during installation."""
        ...

    def get_repository(self, installation_id: str, full_name: str) -> RepositoryMetadata:
        """Fresh metadata for one specific repository, fetched at connect
        time rather than trusting `list_repositories`' cached shape."""
        ...

    def get_repository_status(self, installation_id: str, full_name: str) -> RepositoryStatusMetadata:
        """Live status for one repository — the provider-side numbers that
        change without Blueprint running a study, so they're read on
        demand rather than persisted against a snapshot."""
        ...

    def list_contributors(
        self, installation_id: str, full_name: str, *, limit: int = 100
    ) -> list[ContributorMetadata]:
        """Contributors to the default branch, provider-ordered (most
        commits first). Returns `[]` — never raises — for a repository
        with no commits yet, since "nobody has contributed" is a real
        answer, not a failure."""
        ...

    def get_clone_credentials(self, installation_id: str, full_name: str) -> CloneCredentials:
        """Mints a fresh, short-lived credential authorized to clone this
        one repository — never a token with broader scope than the
        installation already grants, and never reused past its `expires_at`."""
        ...
