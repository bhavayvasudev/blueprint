"""make repo_snapshots.commit_sha nullable

DECISIONS.md ADR-025: `POST /repos/{id}/sync` (ARCHITECTURE.md §12) creates
the `RepoSnapshot` row before the clone that would tell us the actual
commit SHA has happened — the sync job resolves the real HEAD sha itself
right after cloning (rather than trusting a separately-resolved value that
could race a branch moving between request time and job execution) and
populates this column once known, the same "starts null/indexing,
transitions once known" shape `status` already has. Additive/loosening
only — no ADR-worthy destructive change (RULES.md §8).

Revision ID: b7f421a9c6de
Revises: d5e76033c384
Create Date: 2026-07-13 15:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7f421a9c6de"
down_revision: str | Sequence[str] | None = "d5e76033c384"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("repo_snapshots", "commit_sha", existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    op.alter_column("repo_snapshots", "commit_sha", existing_type=sa.String(), nullable=False)
