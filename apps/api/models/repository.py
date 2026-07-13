"""ARCHITECTURE.md §11: users, repositories, repo_snapshots, files."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.db import Base
from models.types import ConnectionStatus, SnapshotStatus, StructuralConfidence

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
    commit_sha: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    status: Mapped[SnapshotStatus] = mapped_column(String, default=SnapshotStatus.INDEXING)

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
