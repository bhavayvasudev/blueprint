"""ARCHITECTURE.md §11: users, repositories, repo_snapshots, files."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.db import Base
from models.types import ConnectionStatus, PipelineStage, SnapshotStatus, StructuralConfidence

if TYPE_CHECKING:
    from models.installation import Installation


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    github_id: Mapped[str] = mapped_column(String, unique=True)
    email: Mapped[str] = mapped_column(String, unique=True)
    name: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    repositories: Mapped[list["Repository"]] = relationship(back_populates="user")
    installations: Mapped[list["Installation"]] = relationship(back_populates="user")


class Repository(Base):
    __tablename__ = "repositories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    # DECISIONS.md ADR-024: which installation grants Blueprint access to
    # this repository — required to mint the installation token that
    # ingestion clones with. Not nullable: every repository connected
    # through the GitHub App flow has exactly one owning installation,
    # and Phase 0 has no pre-existing data to backfill.
    installation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("installations.id"), index=True)
    github_repo_id: Mapped[str] = mapped_column(String, unique=True)
    full_name: Mapped[str] = mapped_column(String)
    default_branch: Mapped[str] = mapped_column(String)
    private: Mapped[bool] = mapped_column(Boolean)
    last_synced_sha: Mapped[str | None] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    connection_status: Mapped[ConnectionStatus] = mapped_column(
        String, default=ConnectionStatus.CONNECTED
    )

    user: Mapped["User"] = relationship(back_populates="repositories")
    installation: Mapped["Installation"] = relationship(back_populates="repositories")
    snapshots: Mapped[list["RepoSnapshot"]] = relationship(back_populates="repository")


class RepoSnapshot(Base):
    """Every downstream table hangs off a snapshot; snapshots are immutable
    and historical (ARCHITECTURE.md §2)."""

    __tablename__ = "repo_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("repositories.id"), index=True)
    # Nullable: DECISIONS.md ADR-025 — set once the sync job's clone
    # resolves the real HEAD sha, not at row-creation time.
    commit_sha: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    status: Mapped[SnapshotStatus] = mapped_column(String, default=SnapshotStatus.QUEUED)
    # The RQ job this snapshot was enqueued as. Stored so the two questions a
    # concurrent scheduler has to answer can be answered from real queue state
    # instead of a timer: "is this waiting job still alive?" (the stall
    # detector — a queued job that vanished from Redis without a worker ever
    # claiming it is genuinely lost) and "where is it in line?" (the queue
    # position the UI shows). Nullable: snapshots created before this column,
    # and any created if enqueueing itself fails, simply have none.
    job_id: Mapped[str | None] = mapped_column(String, nullable=True)
    # When a worker actually claimed this snapshot and began Stage 1 — as
    # distinct from `created_at`, which is when it was enqueued. The gap
    # between them is real queue wait, and keeping them separate is what
    # stops a long wait from being charged against the study's own elapsed
    # time (the historical ETA in `snapshot_service` measures work, not
    # queueing, or a busy queue would inflate every future estimate).
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # The remaining columns exist so a stuck/slow/crashed job is diagnosable
    # from the outside (frontend polling, `psql`) instead of an opaque
    # `indexing` with no further signal — see `models.types.PipelineStage`
    # and `services/pipeline_runner.py`. All nullable/additive; only ever
    # meaningful while `status == indexing` (current_stage/stage_started_at
    # are cleared on both READY and FAILED).
    current_stage: Mapped[PipelineStage | None] = mapped_column(String, nullable=True)
    stage_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String, nullable=True)
    # Real, directly-counted numbers only (RULES.md §23: no fabricated
    # percentages) — files discovered, symbols parsed, graph node/edge
    # counts, filled in as each real stage actually completes.
    progress: Mapped[dict[str, int] | None] = mapped_column(JSONB, nullable=True)
    # Set once, when the terminal `status` is reached (READY or FAILED) —
    # the input to `snapshot_service`'s historical-duration ETA estimate,
    # which is real elapsed time from past runs, never a fabricated
    # countdown (RULES.md §23).
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # `pipeline.ingestion.stack_detection`/`route_detection`/`doc_audit`'s
    # output — real, directly-computed detections (manifest dependency
    # names, regex route matches, filesystem presence checks), never
    # LLM-generated. Shapes documented in those modules; nullable/additive
    # like every other progress column here.
    detected_stack: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    api_routes: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    doc_audit: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    # The precomputed Repository Manifest (`pipeline/ingestion/manifest.py`) —
    # a real "knowledge card" (verbatim README sections, tech stack,
    # entrypoints, module rollup, route count) assembled from the detections
    # above plus a README parse. The first-class evidence source for
    # repository-level Threads questions (`services/thread_retrieval.py`,
    # OVERVIEW/ARCHITECTURE intents). Additive/nullable like its inputs.
    manifest: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    # Stage 4's real outcome: how many code/doc chunks were embedded, whether
    # the README specifically made it in, which provider/model produced the
    # vectors, and the verbatim error if the pass failed or was skipped.
    #
    # This column exists because Threads answering "I couldn't retrieve
    # repository context" was, for a long time, the *only* externally visible
    # symptom of an entire pipeline stage never having run — indistinguishable
    # from a question that genuinely had no answer in the repository. Retrieval
    # reads this to report which of those two it is
    # (`services/thread_retrieval.diagnose_retrieval`). NULL means the snapshot
    # predates Stage 4 being wired in, which is itself a real, reportable
    # reason — not an unknown. Shape documented in
    # `services/pipeline_runner._index_chunks`.
    index_status: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)

    repository: Mapped["Repository"] = relationship(back_populates="snapshots")
    files: Mapped[list["File"]] = relationship(back_populates="snapshot")


class File(Base):
    __tablename__ = "files"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    snapshot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("repo_snapshots.id"), index=True)
    path: Mapped[str] = mapped_column(String)
    language: Mapped[str] = mapped_column(String)
    loc: Mapped[int] = mapped_column(Integer)
    is_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    content_hash: Mapped[str] = mapped_column(String, index=True)
    structural_confidence: Mapped[StructuralConfidence] = mapped_column(String)

    snapshot: Mapped["RepoSnapshot"] = relationship(back_populates="files")
