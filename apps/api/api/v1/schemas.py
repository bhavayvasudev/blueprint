"""Request/response models for the auth and repos routers (RULES.md §2:
Pydantic models at every API boundary)."""

import uuid
from datetime import datetime

from pydantic import BaseModel

from models.types import (
    AccountType,
    ConnectionStatus,
    MessageRole,
    MessageStatus,
    PipelineStage,
    SnapshotStatus,
    ThreadStatus,
)


class UserOut(BaseModel):
    id: uuid.UUID
    github_id: str
    email: str
    name: str

    model_config = {"from_attributes": True}


class InstallationOut(BaseModel):
    id: uuid.UUID
    account_login: str
    account_type: AccountType

    model_config = {"from_attributes": True}


class AvailableRepositoryOut(BaseModel):
    external_id: str
    full_name: str
    default_branch: str
    private: bool
    html_url: str


class ConnectRepositoryRequest(BaseModel):
    installation_id: uuid.UUID
    full_name: str


class RepositoryOut(BaseModel):
    id: uuid.UUID
    installation_id: uuid.UUID
    full_name: str
    default_branch: str
    private: bool
    connection_status: ConnectionStatus
    last_synced_sha: str | None
    last_synced_at: datetime | None

    model_config = {"from_attributes": True}


class RepositoryStatusOut(BaseModel):
    """Live provider-side repository metadata — read on request, never
    snapshot-scoped, because every field here changes without Blueprint
    running anything. See `services.repository_status_service`."""

    stars: int
    forks: int
    watchers: int
    open_issues: int
    primary_language: str | None
    license_name: str | None
    license_spdx_id: str | None
    default_branch: str
    private: bool
    html_url: str
    last_commit_sha: str | None
    last_commit_at: datetime | None
    last_commit_message: str | None
    last_commit_author: str | None

    model_config = {"from_attributes": True}


class ContributorOut(BaseModel):
    login: str
    avatar_url: str
    html_url: str
    contributions: int
    #: Share of the commits across the contributors in this response — a
    #: real quotient, and a share of the *listed* set when `truncated`.
    share: float

    model_config = {"from_attributes": True}


class ContributorsOut(BaseModel):
    contributors: list[ContributorOut]
    total_contributions: int
    truncated: bool

    model_config = {"from_attributes": True}


class SnapshotOut(BaseModel):
    id: uuid.UUID
    commit_sha: str | None
    status: SnapshotStatus
    created_at: datetime
    # When a worker actually claimed this study, as opposed to when it was
    # enqueued (`created_at`). Null while it is still `queued`, and on rows
    # that predate concurrent studies. The gap between the two is real
    # queue wait, which is why the UI can time a study's own work honestly
    # rather than counting the wait against it.
    started_at: datetime | None = None
    # Only meaningful while `status == indexing`/`failed` — see
    # `models.types.PipelineStage`. All nullable: a `ready` snapshot (or one
    # from before this column existed) simply has none of these set.
    current_stage: PipelineStage | None
    stage_started_at: datetime | None
    error_message: str | None
    progress: dict[str, int] | None
    completed_at: datetime | None = None
    detected_stack: dict[str, object] | None = None
    api_routes: dict[str, object] | None = None
    doc_audit: dict[str, object] | None = None
    # Stage 4's real outcome (chunk counts, README coverage, any error) —
    # what the UI needs to explain *why* a repository can or cannot be
    # asked questions about. Shape in `services/pipeline_runner._index_chunks`.
    index_status: dict[str, object] | None = None
    # The study's "knowledge card" (`pipeline/ingestion/manifest.py`) — the
    # Briefing reads its verbatim README extract so its summary can lead
    # with what the project says it does, not only with what its file tree
    # looks like.
    manifest: dict[str, object] | None = None
    # A computed, real historical average (services.snapshot_service.
    # _estimate_total_seconds), not a stored column — attached to the ORM
    # instance as a plain attribute before validation, hence the default
    # (routes that skip `get_snapshot`/`list_snapshots`, e.g. `POST
    # .../sync`'s immediate response, never set it).
    estimated_total_seconds: int | None = None
    # This study's place in the waiting line, 1-based, counted from the real
    # queue (`services.snapshot_service._queue_position`) — set only while
    # `status == queued`, and null when the queue can't be asked, so the UI
    # can say "waiting for a worker" without inventing a position it does
    # not know (RULES.md §23). Like `estimated_total_seconds`, a computed
    # attribute rather than a column.
    queue_position: int | None = None

    model_config = {"from_attributes": True}


class GraphNodeOut(BaseModel):
    id: uuid.UUID
    node_type: str
    label: str
    metadata: dict[str, object]


class GraphEdgeOut(BaseModel):
    id: uuid.UUID
    source_node_id: uuid.UUID
    target_node_id: uuid.UUID
    edge_type: str

    model_config = {"from_attributes": True}


class LanguageStatOut(BaseModel):
    language: str
    file_count: int
    loc: int

    model_config = {"from_attributes": True}


class TreeSitterStatusOut(BaseModel):
    full_confidence_files: int
    low_confidence_files: int

    model_config = {"from_attributes": True}


class KnowledgeGraphStatusOut(BaseModel):
    node_count: int
    edge_count: int

    model_config = {"from_attributes": True}


class ArchitectureGraphOut(BaseModel):
    snapshot: SnapshotOut
    file_count: int
    language_mix: list[LanguageStatOut]
    tree_sitter_status: TreeSitterStatusOut
    knowledge_graph_status: KnowledgeGraphStatusOut
    repository_graph_nodes: list[GraphNodeOut]
    repository_graph_edges: list[GraphEdgeOut]


# --- Threads (PRODUCT.md §4: the repository-conversation room). ------------


class EvidenceOut(BaseModel):
    """One resolved, clickable citation — mirrors
    `pipeline.retrieval.grounding.Evidence`, validated from the JSONB stored
    on a `thread_messages` row."""

    index: int
    chunk_type: str
    file_path: str | None = None
    symbol_name: str | None = None
    symbol_type: str | None = None
    start_line: int | None = None
    end_line: int | None = None
    excerpt: str | None = None
    sources: list[str] = []


class ThreadMessageOut(BaseModel):
    id: uuid.UUID
    role: MessageRole
    content: str
    evidence: list[EvidenceOut] | None = None
    followups: list[str] | None = None
    status: MessageStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class ThreadOut(BaseModel):
    """A thread as it appears in the list — no messages, just the spine."""

    id: uuid.UUID
    title: str
    status: ThreadStatus
    pinned: bool
    snapshot_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ThreadDetailOut(ThreadOut):
    """A thread opened in the main pane — the full investigation timeline."""

    messages: list[ThreadMessageOut]


class CreateThreadRequest(BaseModel):
    # The first question, so the thread opens with a provisional title. A
    # thread can also be created empty (the empty state opens one first).
    first_question: str | None = None


class AskRequest(BaseModel):
    question: str


class UpdateThreadRequest(BaseModel):
    pinned: bool | None = None
    title: str | None = None
    status: ThreadStatus | None = None


# --- Global search (the ⌘K palette's data). --------------------------------


class SearchHitOut(BaseModel):
    """One navigable result. `target` is a resolvable pointer (a repo-relative
    path, a thread UUID), never a URL — routing is the frontend's business."""

    kind: str
    label: str
    detail: str | None
    target: str
    start_line: int | None = None
    end_line: int | None = None

    model_config = {"from_attributes": True}


class SearchGroupOut(BaseModel):
    kind: str
    label: str
    hits: list[SearchHitOut]

    model_config = {"from_attributes": True}


class SearchResultsOut(BaseModel):
    groups: list[SearchGroupOut]
    # The study these results came from, or None when the repository has
    # never been indexed — the palette needs to tell those two apart to
    # explain an empty result honestly rather than shrugging.
    snapshot_id: uuid.UUID | None
    indexed: bool
