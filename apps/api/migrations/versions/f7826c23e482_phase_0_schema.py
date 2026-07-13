"""phase 0 schema

Users, repositories, repo_snapshots, files, code_chunks, doc_chunks,
graph_nodes, graph_edges — exactly the tables PHASES.md Phase 0 scopes
(ARCHITECTURE.md §11 documents the fuller v2 schema; findings,
finding_relations, maturity_scores, understanding_confidence,
prompt_generations, commits, and issues are later-phase tables and are
deliberately not created here — see docs/MEMORY.md for the noted
drift between §3.1's Stage 1 description and Phase 0's stated
deliverable list on the commits/issues tables specifically).

Revision ID: f7826c23e482
Revises:
Create Date: 2026-07-13 13:07:28.675708

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision: str = "f7826c23e482"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# DECISIONS.md ADR-018: provisional pending Stage 4's embedding model
# comparison.
EMBEDDING_DIM = 1536


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("github_id", sa.String(), nullable=False, unique=True),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "repositories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("github_repo_id", sa.String(), nullable=False, unique=True),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("default_branch", sa.String(), nullable=False),
        sa.Column("private", sa.Boolean(), nullable=False),
        sa.Column("last_synced_sha", sa.String(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("connection_status", sa.String(), nullable=False, server_default="connected"),
    )
    op.create_index("ix_repositories_user_id", "repositories", ["user_id"])

    op.create_table(
        "repo_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "repository_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("repositories.id"),
            nullable=False,
        ),
        sa.Column("commit_sha", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="indexing"),
    )
    op.create_index("ix_repo_snapshots_repository_id", "repo_snapshots", ["repository_id"])

    op.create_table(
        "files",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "snapshot_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("repo_snapshots.id"),
            nullable=False,
        ),
        sa.Column("path", sa.String(), nullable=False),
        sa.Column("language", sa.String(), nullable=False),
        sa.Column("loc", sa.Integer(), nullable=False),
        sa.Column("is_generated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("content_hash", sa.String(), nullable=False),
        sa.Column("structural_confidence", sa.String(), nullable=False),
    )
    op.create_index("ix_files_snapshot_id", "files", ["snapshot_id"])
    op.create_index("ix_files_content_hash", "files", ["content_hash"])

    op.create_table(
        "code_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("file_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("files.id"), nullable=False),
        sa.Column("symbol_name", sa.String(), nullable=False),
        sa.Column("symbol_type", sa.String(), nullable=False),
        sa.Column("start_line", sa.Integer(), nullable=False),
        sa.Column("end_line", sa.Integer(), nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=False),
        sa.Column("content_hash", sa.String(), nullable=False),
    )
    op.create_index("ix_code_chunks_file_id", "code_chunks", ["file_id"])
    op.create_index("ix_code_chunks_content_hash", "code_chunks", ["content_hash"])

    op.create_table(
        "doc_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "snapshot_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("repo_snapshots.id"),
            nullable=False,
        ),
        sa.Column("source_path", sa.String(), nullable=False),
        sa.Column("section_title", sa.String(), nullable=False),
        sa.Column("content", sa.String(), nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=False),
    )
    op.create_index("ix_doc_chunks_snapshot_id", "doc_chunks", ["snapshot_id"])

    # ARCHITECTURE.md §11: HNSW on all embedding columns.
    op.create_index(
        "ix_code_chunks_embedding_hnsw",
        "code_chunks",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )
    op.create_index(
        "ix_doc_chunks_embedding_hnsw",
        "doc_chunks",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )

    op.create_table(
        "graph_nodes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "snapshot_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("repo_snapshots.id"),
            nullable=False,
        ),
        sa.Column("graph_type", sa.String(), nullable=False),
        sa.Column("node_type", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default="{}"),
    )
    op.create_index("ix_graph_nodes_snapshot_id", "graph_nodes", ["snapshot_id"])
    op.create_index("ix_graph_nodes_graph_type", "graph_nodes", ["graph_type"])

    op.create_table(
        "graph_edges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "snapshot_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("repo_snapshots.id"),
            nullable=False,
        ),
        sa.Column("graph_type", sa.String(), nullable=False),
        sa.Column(
            "source_node_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("graph_nodes.id"), nullable=False
        ),
        sa.Column(
            "target_node_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("graph_nodes.id"), nullable=False
        ),
        sa.Column("edge_type", sa.String(), nullable=False),
    )
    op.create_index("ix_graph_edges_snapshot_id", "graph_edges", ["snapshot_id"])
    op.create_index("ix_graph_edges_graph_type", "graph_edges", ["graph_type"])
    op.create_index("ix_graph_edges_source_node_id", "graph_edges", ["source_node_id"])
    op.create_index("ix_graph_edges_target_node_id", "graph_edges", ["target_node_id"])


def downgrade() -> None:
    op.drop_table("graph_edges")
    op.drop_table("graph_nodes")
    op.drop_table("doc_chunks")
    op.drop_table("code_chunks")
    op.drop_table("files")
    op.drop_table("repo_snapshots")
    op.drop_table("repositories")
    op.drop_table("users")
