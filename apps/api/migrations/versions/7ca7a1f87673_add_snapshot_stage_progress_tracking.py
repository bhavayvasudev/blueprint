"""add snapshot stage progress tracking

The indexing UI had exactly one signal (`status=indexing`) and no way to
tell a slow-but-working sync apart from a stuck one, or to explain a
`failed` snapshot beyond the bare status. These columns are additive and
all nullable, only meaningful while `status == indexing`/`failed` (see
`models.types.PipelineStage`, `services/pipeline_runner.py`).

Revision ID: 7ca7a1f87673
Revises: b7f421a9c6de
Create Date: 2026-07-15 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "7ca7a1f87673"
down_revision: str | Sequence[str] | None = "b7f421a9c6de"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("repo_snapshots", sa.Column("current_stage", sa.String(), nullable=True))
    op.add_column(
        "repo_snapshots", sa.Column("stage_started_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("repo_snapshots", sa.Column("error_message", sa.String(), nullable=True))
    op.add_column("repo_snapshots", sa.Column("progress", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("repo_snapshots", "progress")
    op.drop_column("repo_snapshots", "error_message")
    op.drop_column("repo_snapshots", "stage_started_at")
    op.drop_column("repo_snapshots", "current_stage")
