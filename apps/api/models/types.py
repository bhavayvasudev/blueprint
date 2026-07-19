"""Shared enums for Phase 0 model columns, kept out of individual model
modules so `pipeline/` code can import the vocabulary without importing
the ORM models themselves.
"""

from enum import StrEnum

# DECISIONS.md ADR-018: provisional pending Stage 4's embedding model
# comparison. Changing this requires a destructive migration on every
# `vector` column plus a full re-embedding pass — see the ADR.
#
# Resolved to 1024 when Stage 4 was actually wired into `/sync`: the
# default provider for a credentialed deployment is now NVIDIA
# `nv-embedqa-e5-v5` (config.Settings.nvidia_embedding_model), which emits
# 1024-dimensional vectors. The prior 1536 was sized for OpenAI
# `text-embedding-3-small` while no code path had ever written a vector —
# both chunk tables were empty in every environment, so the migration
# (e4b7c9d1f3a2) cost nothing and no re-embedding pass was needed.
# `local_hash` projects to whatever width it is given, so it follows along.
EMBEDDING_DIM = 1024


class ConnectionStatus(StrEnum):
    CONNECTED = "connected"
    ERROR = "error"
    REVOKED = "revoked"


class SnapshotStatus(StrEnum):
    """ARCHITECTURE.md §11: repo_snapshots.status."""

    INDEXING = "indexing"
    READY = "ready"
    FAILED = "failed"


class PipelineStage(StrEnum):
    """`repo_snapshots.current_stage` — set immediately before each stage of
    `services.pipeline_runner.run_ingestion_pipeline` begins and cleared once
    the snapshot reaches a terminal status. Exists so a slow or crashed job
    is diagnosable ("which of the real Stage 1-3 steps is it on, and for how
    long") instead of an opaque `indexing` with no further signal. Deliberately
    only covers work the pipeline actually performs today (ARCHITECTURE.md §3
    Stages 1-3, plus the manifest/filesystem-derived detectors in
    `pipeline/ingestion/{stack_detection,route_detection,doc_audit}.py` and the
    Repository Manifest assembled from them in `pipeline/ingestion/manifest.py`)
    — no `briefing`/etc. entries for stages that aren't wired into `/sync` yet
    (DECISIONS.md ADR-025).

    `INDEXING_DOCS`/`INDEXING_CODE` are Stage 4, wired in once it became clear
    that ADR-025's deferral had left the Threads room structurally unable to
    answer anything: both chunk tables were empty in every environment, so
    hybrid retrieval always returned zero results and every answer degraded to
    "I couldn't retrieve repository context". Docs are indexed before code so
    that a pass which exhausts its budget still has the README — the single
    highest-value document for a repository-level question."""

    CLONING = "cloning"
    DISCOVERING_FILES = "discovering_files"
    DETECTING_STACK = "detecting_stack"
    PARSING = "parsing"
    DETECTING_ROUTES = "detecting_routes"
    PERSISTING = "persisting"
    BUILDING_KNOWLEDGE_GRAPH = "building_knowledge_graph"
    BUILDING_REPOSITORY_GRAPH = "building_repository_graph"
    AUDITING_DOCS = "auditing_docs"
    BUILDING_MANIFEST = "building_manifest"
    INDEXING_DOCS = "indexing_docs"
    INDEXING_CODE = "indexing_code"


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


class ThreadStatus(StrEnum):
    """A Threads investigation's state (PRODUCT.md §4: Threads = "what am I
    trying to find out?"). An investigation is not a chat log — it has a
    disposition. EXPLORING is the honest default while the first answer is
    still being formed; ANSWERED/NEEDS_CONTEXT are set from whether the last
    answer was grounded in real retrieved evidence or the model had to say
    it couldn't determine something (services/thread_service.py). BLOCKED is
    user-set only — Blueprint never declares an investigation blocked on the
    user's behalf."""

    EXPLORING = "exploring"
    ANSWERED = "answered"
    NEEDS_CONTEXT = "needs_context"
    BLOCKED = "blocked"


class MessageRole(StrEnum):
    """Who authored a `thread_messages` row. `assistant` is Blueprint
    speaking as the architect (PRODUCT.md brand voice), never a generic
    chatbot — the distinction is enforced by the grounding contract in
    services/thread_service.py, not by this label."""

    USER = "user"
    ASSISTANT = "assistant"


class MessageStatus(StrEnum):
    """Lifecycle of an `assistant` message. Streaming answers are persisted
    as STREAMING first (so a dropped connection leaves a diagnosable partial
    row, never a silent gap — the same "a failure is recorded, never silent"
    rule as RULES.md §16 / snapshot_service), then flipped to COMPLETE once
    the full answer and its evidence are stored, or ERROR if generation
    failed. `user` messages are always COMPLETE."""

    STREAMING = "streaming"
    COMPLETE = "complete"
    ERROR = "error"
