"""Shared enums for Phase 0 model columns, kept out of individual model
modules so `pipeline/` code can import the vocabulary without importing
the ORM models themselves.
"""

from enum import StrEnum

# DECISIONS.md ADR-018: provisional pending Stage 4's embedding model
# comparison. Changing this requires a destructive migration on every
# `vector` column plus a full re-embedding pass — see the ADR.
EMBEDDING_DIM = 1536


class ConnectionStatus(StrEnum):
    CONNECTED = "connected"
    ERROR = "error"
    REVOKED = "revoked"


class SnapshotStatus(StrEnum):
    """ARCHITECTURE.md §11: repo_snapshots.status."""

    INDEXING = "indexing"
    READY = "ready"
    FAILED = "failed"


class StructuralConfidence(StrEnum):
    """ARCHITECTURE.md §4: Tree-sitter parse vs. heuristic-fallback extraction."""

    FULL = "full"
    LOW = "low"


class GraphType(StrEnum):
    """ARCHITECTURE.md §5: Knowledge Graph vs. Repository Graph, same tables,
    discriminated by this column — never conflated (DECISIONS.md ADR-004)."""

    KNOWLEDGE = "knowledge"
    REPOSITORY = "repository"


class InstallationStatus(StrEnum):
    """DECISIONS.md ADR-024: `installations.status`. Revocation is detected
    reactively (a 404 from GitHub on an installation-scoped call flips this
    to REVOKED) since webhook-driven detection is v1.1, not this PR."""

    ACTIVE = "active"
    REVOKED = "revoked"


class AccountType(StrEnum):
    """The GitHub account type an installation belongs to — a user account
    or an organization. Present now (DECISIONS.md ADR-024) so organization
    support is a data shape that already exists, not a later migration,
    even though no org-specific UI/permissions ship in this PR."""

    USER = "user"
    ORGANIZATION = "organization"
