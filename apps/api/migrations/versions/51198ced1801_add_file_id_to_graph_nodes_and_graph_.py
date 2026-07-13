"""add file_id to graph_nodes and graph_edges

DECISIONS.md ADR-019: file-level attribution ahead of incremental
indexing being wired up (v1.1, PHASES.md Phase 8) — the indexed answer
to "which graph rows does this changed file own," so that work doesn't
require a schema change of its own when it lands.

Revision ID: 51198ced1801
Revises: f7826c23e482
Create Date: 2026-07-13 13:32:12.999432

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "51198ced1801"
down_revision: str | Sequence[str] | None = "f7826c23e482"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "graph_nodes", sa.Column("file_id", postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        "fk_graph_nodes_file_id_files", "graph_nodes", "files", ["file_id"], ["id"]
    )
    op.create_index("ix_graph_nodes_file_id", "graph_nodes", ["file_id"])

    op.add_column(
        "graph_edges", sa.Column("file_id", postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        "fk_graph_edges_file_id_files", "graph_edges", "files", ["file_id"], ["id"]
    )
    op.create_index("ix_graph_edges_file_id", "graph_edges", ["file_id"])


def downgrade() -> None:
    op.drop_index("ix_graph_edges_file_id", table_name="graph_edges")
    op.drop_constraint("fk_graph_edges_file_id_files", "graph_edges", type_="foreignkey")
    op.drop_column("graph_edges", "file_id")

    op.drop_index("ix_graph_nodes_file_id", table_name="graph_nodes")
    op.drop_constraint("fk_graph_nodes_file_id_files", "graph_nodes", type_="foreignkey")
    op.drop_column("graph_nodes", "file_id")
