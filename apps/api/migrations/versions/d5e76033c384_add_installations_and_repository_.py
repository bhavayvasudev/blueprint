"""add installations and repositories.installation_id

DECISIONS.md ADR-024: `installations` is not in ARCHITECTURE.md's original
§11 schema — minting a GitHub App installation token requires knowing
which installation owns a repository, and nothing in the original schema
recorded that. This migration adds the table plus a required
`repositories.installation_id` FK; not nullable because Phase 0 has no
production data yet (same reasoning as ADR-019/ADR-020's additive
migrations), so every repository row is created with a real installation
from the moment this migration lands.

Revision ID: d5e76033c384
Revises: c58a8fc2631c
Create Date: 2026-07-13 15:05:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d5e76033c384"
down_revision: str | Sequence[str] | None = "c58a8fc2631c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "installations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(), nullable=False, server_default="github"),
        sa.Column("external_id", sa.String(), nullable=False),
        sa.Column("account_login", sa.String(), nullable=False),
        sa.Column("account_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_foreign_key(
        "fk_installations_user_id_users", "installations", "users", ["user_id"], ["id"]
    )
    op.create_index("ix_installations_user_id", "installations", ["user_id"])
    op.create_unique_constraint(
        "uq_installations_external_id", "installations", ["external_id"]
    )

    op.add_column(
        "repositories", sa.Column("installation_id", postgresql.UUID(as_uuid=True), nullable=False)
    )
    op.create_foreign_key(
        "fk_repositories_installation_id_installations",
        "repositories",
        "installations",
        ["installation_id"],
        ["id"],
    )
    op.create_index("ix_repositories_installation_id", "repositories", ["installation_id"])


def downgrade() -> None:
    op.drop_index("ix_repositories_installation_id", table_name="repositories")
    op.drop_constraint(
        "fk_repositories_installation_id_installations", "repositories", type_="foreignkey"
    )
    op.drop_column("repositories", "installation_id")

    op.drop_constraint("uq_installations_external_id", "installations", type_="unique")
    op.drop_index("ix_installations_user_id", table_name="installations")
    op.drop_constraint("fk_installations_user_id_users", "installations", type_="foreignkey")
    op.drop_table("installations")
