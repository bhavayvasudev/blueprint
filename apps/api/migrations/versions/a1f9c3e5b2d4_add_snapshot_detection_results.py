"""add snapshot detection results

Adds the columns the "study pipeline" redesign needs: `completed_at`
(real elapsed time, feeding the historical-duration ETA estimate in
`services/snapshot_service.py`) and the three real-detection result
columns (`detected_stack`, `api_routes`, `doc_audit`) written by
`pipeline.ingestion.{stack_detection,route_detection,doc_audit}`. All
additive and nullable, same contract as `7ca7a1f87673`.

Revision ID: a1f9c3e5b2d4
Revises: 7ca7a1f87673
Create Date: 2026-07-15 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a1f9c3e5b2d4"
down_revision: str | Sequence[str] | None = "7ca7a1f87673"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "repo_snapshots", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("repo_snapshots", sa.Column("detected_stack", postgresql.JSONB(), nullable=True))
    op.add_column("repo_snapshots", sa.Column("api_routes", postgresql.JSONB(), nullable=True))
    op.add_column("repo_snapshots", sa.Column("doc_audit", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("repo_snapshots", "doc_audit")
    op.drop_column("repo_snapshots", "api_routes")
    op.drop_column("repo_snapshots", "detected_stack")
    op.drop_column("repo_snapshots", "completed_at")
