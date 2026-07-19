"""Narrow both embedding columns from vector(1536) to vector(1024).

Stage 4 was never wired into `/sync` (DECISIONS.md ADR-025), so no code
path had ever written an embedding: `code_chunks` and `doc_chunks` were
empty in every environment when this ran. That is what makes an otherwise
destructive change (ADR-018 explicitly calls out that changing
`EMBEDDING_DIM` needs a destructive migration plus a full re-embedding
pass) a no-op on data here — there is nothing to re-embed. The
`DELETE FROM` statements below are therefore belt-and-braces, not the
plan: if an environment somehow does hold rows, dropping them is correct,
because vectors from a 1536-dimensional model are not comparable to the
1024-dimensional ones the new provider emits. Silently keeping them would
poison every cosine-distance ranking with garbage neighbours.

1024 is the width of NVIDIA `nv-embedqa-e5-v5`, now the provider for a
credentialed deployment (config.Settings.nvidia_embedding_model).

The HNSW indexes must be dropped before the type change and rebuilt
after: pgvector binds the operator class to a specific column width, so
`ALTER COLUMN TYPE` against an indexed vector column fails outright.

Revision ID: e4b7c9d1f3a2
Revises: b5e8d2c4f6a9
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "e4b7c9d1f3a2"
down_revision: str | Sequence[str] | None = "b5e8d2c4f6a9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NEW_DIM = 1024
_OLD_DIM = 1536

_TABLES = ("code_chunks", "doc_chunks")
_HNSW_INDEXES = {
    "code_chunks": "ix_code_chunks_embedding_hnsw",
    "doc_chunks": "ix_doc_chunks_embedding_hnsw",
}


def _rewrite(from_dim: int, to_dim: int) -> None:
    for table in _TABLES:
        op.drop_index(_HNSW_INDEXES[table], table_name=table)
        # Vectors of the old width cannot be cast to the new one, and are
        # meaningless across models regardless — see the module docstring.
        op.execute(sa.text(f"DELETE FROM {table}"))
        op.alter_column(
            table,
            "embedding",
            existing_type=Vector(from_dim),
            type_=Vector(to_dim),
            existing_nullable=False,
            postgresql_using=f"embedding::vector({to_dim})",
        )
        # ARCHITECTURE.md §11: HNSW on all embedding columns.
        op.create_index(
            _HNSW_INDEXES[table],
            table,
            ["embedding"],
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        )


def upgrade() -> None:
    _rewrite(_OLD_DIM, _NEW_DIM)


def downgrade() -> None:
    _rewrite(_NEW_DIM, _OLD_DIM)
