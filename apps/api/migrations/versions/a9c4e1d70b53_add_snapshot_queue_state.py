"""Add snapshot queue state: job_id, started_at.

The `queued`/`cancelled` values `SnapshotStatus` gains alongside these
columns need no DDL — `repo_snapshots.status` is a plain `String` column,
not a Postgres enum type (see `models/repository.py`), deliberately so that
the status vocabulary can grow without a type migration.

Existing rows are left alone: `job_id` and `started_at` are nullable and
additive, and no historical snapshot is rewritten into the new `queued`
state. A snapshot mid-flight across this migration keeps reporting
`indexing` and is judged by the pre-existing stage budgets, which is
correct — it really is being worked on.

Revision ID: a9c4e1d70b53
Revises: f2a6b8d0c4e1
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a9c4e1d70b53"
down_revision: str | Sequence[str] | None = "f2a6b8d0c4e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("repo_snapshots", sa.Column("job_id", sa.String(), nullable=True))
    op.add_column(
        "repo_snapshots",
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("repo_snapshots", "started_at")
    op.drop_column("repo_snapshots", "job_id")
