"""Add `repo_snapshots.index_status` — Stage 4's real, reportable outcome.

Nullable and additive, like every other diagnostic column on this table.
NULL is meaningful rather than unknown: it marks a snapshot studied
before Stage 4 was wired into `/sync`, which is precisely why its
retrieval returns nothing, and is reported as that reason verbatim
(`services/thread_retrieval.diagnose_retrieval`).

Revision ID: f2a6b8d0c4e1
Revises: e4b7c9d1f3a2
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f2a6b8d0c4e1"
down_revision: str | Sequence[str] | None = "e4b7c9d1f3a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "repo_snapshots",
        sa.Column("index_status", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("repo_snapshots", "index_status")
