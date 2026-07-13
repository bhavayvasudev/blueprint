"""add content column to code_chunks, fts indexes

DECISIONS.md ADR-020: code_chunks gets a content column (matching
doc_chunks) so hybrid retrieval's keyword/BM25 component doesn't depend
on a live repo checkout being available. Also adds Postgres full-text
search (GIN, to_tsvector) indexes on both chunk tables' content columns
— the concrete keyword-search backend for Stage 4 (ARCHITECTURE.md
§3.4) queries these directly.

Revision ID: c58a8fc2631c
Revises: 51198ced1801
Create Date: 2026-07-13 13:53:10.107864

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c58a8fc2631c"
down_revision: str | Sequence[str] | None = "51198ced1801"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "code_chunks", sa.Column("content", sa.String(), nullable=False, server_default="")
    )
    op.alter_column("code_chunks", "content", server_default=None)

    op.execute(
        "CREATE INDEX ix_code_chunks_content_fts ON code_chunks "
        "USING gin (to_tsvector('english', content))"
    )
    op.execute(
        "CREATE INDEX ix_doc_chunks_content_fts ON doc_chunks "
        "USING gin (to_tsvector('english', content))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX ix_doc_chunks_content_fts")
    op.execute("DROP INDEX ix_code_chunks_content_fts")
    op.drop_column("code_chunks", "content")
