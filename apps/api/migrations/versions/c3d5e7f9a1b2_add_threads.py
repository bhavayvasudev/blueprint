"""add threads and thread_messages

Threads — the repository-conversation room (PRODUCT.md §4). Serving-plane
state that hangs off `repositories`/`users` and references the immutable
`repo_snapshot` an investigation's answers were grounded in, so a citation
stays meaningful across later re-syncs. Additive to the ARCHITECTURE.md §11
schema; see `models/thread.py` for the column rationale.

Revision ID: c3d5e7f9a1b2
Revises: a1f9c3e5b2d4
Create Date: 2026-07-15 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c3d5e7f9a1b2"
down_revision: str | Sequence[str] | None = "a1f9c3e5b2d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "threads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "repository_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("repositories.id"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "snapshot_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("repo_snapshots.id"),
            nullable=True,
        ),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="exploring"),
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_threads_repository_id", "threads", ["repository_id"])
    op.create_index("ix_threads_user_id", "threads", ["user_id"])
    op.create_index("ix_threads_snapshot_id", "threads", ["snapshot_id"])

    op.create_table(
        "thread_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "thread_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("threads.id"),
            nullable=False,
        ),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.String(), nullable=False),
        sa.Column("evidence", postgresql.JSONB(), nullable=True),
        sa.Column("followups", postgresql.JSONB(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="complete"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_thread_messages_thread_id", "thread_messages", ["thread_id"])


def downgrade() -> None:
    op.drop_index("ix_thread_messages_thread_id", table_name="thread_messages")
    op.drop_table("thread_messages")
    op.drop_index("ix_threads_snapshot_id", table_name="threads")
    op.drop_index("ix_threads_user_id", table_name="threads")
    op.drop_index("ix_threads_repository_id", table_name="threads")
    op.drop_table("threads")
