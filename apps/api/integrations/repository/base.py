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

    def get_clone_credentials(self, installation_id: str, full_name: str) -> CloneCredentials:
        """Mints a fresh, short-lived credential authorized to clone this
        one repository — never a token with broader scope than the
        installation already grants, and never reused past its `expires_at`."""
        ...
