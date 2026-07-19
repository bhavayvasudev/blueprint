"""add snapshot repository manifest

Adds `repo_snapshots.manifest` — the precomputed Repository Manifest
(`pipeline/ingestion/manifest.py`) assembled during a study from the
existing detection columns plus a verbatim README parse. Additive and
nullable, same contract as the detection columns added in `a1f9c3e5b2d4`.

Revision ID: b5e8d2c4f6a9
Revises: c3d5e7f9a1b2
Create Date: 2026-07-15 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b5e8d2c4f6a9"
down_revision: str | Sequence[str] | None = "c3d5e7f9a1b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("repo_snapshots", sa.Column("manifest", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("repo_snapshots", "manifest")
