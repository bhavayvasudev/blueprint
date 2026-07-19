"""Threads — a conversation *with a repository* (PRODUCT.md §4: "what am I
trying to find out?"). Not a chat log: each `Thread` is an investigation
into one repository that grows richer as it goes, and every `assistant`
message is grounded in real retrieved evidence (services/thread_service.py),
never free-floating model prose.

These tables are additive to the ARCHITECTURE.md §11 schema — Threads is a
serving-plane feature (a light, request-path retrieval + one LLM call, the
Stage-11 exception of §13), so its state lives alongside the pipeline's
output, not inside a snapshot. A thread references the immutable
`repo_snapshot` its answers were grounded in (`snapshot_id`) so a citation
stays meaningful even after a later re-sync produces a new snapshot.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.db import Base
from models.types import MessageRole, MessageStatus, ThreadStatus

if TYPE_CHECKING:
    from models.repository import Repository, User


class Thread(Base):
    __tablename__ = "threads"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("repositories.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    # The snapshot this investigation's answers are grounded in — the repo's
    # latest READY snapshot at the moment the thread's first question was
    # asked. Nullable: a thread can be created before the repo has ever been
    # studied (the empty state still lets you open one), and gets bound to a
    # snapshot on its first answered question.
    snapshot_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("repo_snapshots.id"), nullable=True, index=True
    )
    # An intelligent, generated title ("Authentication Flow"), never "New
    # Chat" (services/thread_service.py). Provisional (a cleaned form of the
    # first question) until the first answer refines it.
    title: Mapped[str] = mapped_column(String)
    status: Mapped[ThreadStatus] = mapped_column(String, default=ThreadStatus.EXPLORING)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    repository: Mapped["Repository"] = relationship()
    user: Mapped["User"] = relationship()
    messages: Mapped[list["ThreadMessage"]] = relationship(
        back_populates="thread", order_by="ThreadMessage.created_at", cascade="all, delete-orphan"
    )


class ThreadMessage(Base):
    __tablename__ = "thread_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("threads.id"), index=True)
    role: Mapped[MessageRole] = mapped_column(String)
    # The message's prose: a user's question, or Blueprint's editorial answer
    # (markdown, sectioned — never one giant paragraph). Citation markers in
    # the prose ([1], [2]) index into `evidence`.
    content: Mapped[str] = mapped_column(String)
    # The resolved retrieval set the answer was grounded in — a list of
    # {index, file_path, symbol_name, symbol_type, start_line, end_line,
    # chunk_type, sources, excerpt}. This is the *actual* hybrid-retrieval
    # output resolved to files/symbols (services/thread_service.py), not the
    # model's claims about what it used, so every citation is verifiable and
    # clickable. Null for `user` messages.
    evidence: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)
    # Repository-specific suggested next questions the model proposed for
    # this answer (PRODUCT-spec: "never show generic suggestions"). Null for
    # `user` messages.
    followups: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[MessageStatus] = mapped_column(String, default=MessageStatus.COMPLETE)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    thread: Mapped["Thread"] = relationship(back_populates="messages")
