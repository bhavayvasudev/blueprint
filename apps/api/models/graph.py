"""ARCHITECTURE.md §5, §11: Knowledge Graph and Repository Graph, stored as
adjacency tables discriminated by `graph_type` (DECISIONS.md ADR-003, ADR-004)
— never a dedicated graph database, never conflated with each other."""

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.db import Base
from models.types import GraphType


class GraphNode(Base):
    __tablename__ = "graph_nodes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    snapshot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("repo_snapshots.id"), index=True)
    graph_type: Mapped[GraphType] = mapped_column(String, index=True)
    node_type: Mapped[str] = mapped_column(String)
    label: Mapped[str] = mapped_column(String)
    # attribute named `node_metadata` because `metadata` is reserved by
    # SQLAlchemy's declarative Base; the actual DB column is `metadata`,
    # matching ARCHITECTURE.md §11.
    node_metadata: Mapped[dict[str, object]] = mapped_column("metadata", JSONB, default=dict)
    # DECISIONS.md ADR-019: populated for Knowledge Graph nodes (1:1 with a
    # file), null for Repository Graph nodes (roll up many files) — the
    # indexed answer to "which nodes does this changed file own" that
    # future incremental invalidation needs.
    file_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("files.id"), nullable=True, index=True
    )


class GraphEdge(Base):
    __tablename__ = "graph_edges"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    snapshot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("repo_snapshots.id"), index=True)
    graph_type: Mapped[GraphType] = mapped_column(String, index=True)
    source_node_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("graph_nodes.id"), index=True)
    target_node_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("graph_nodes.id"), index=True)
    edge_type: Mapped[str] = mapped_column(String)
    # DECISIONS.md ADR-019: the source node's file — the file whose parse
    # produced this edge. Null for Repository Graph edges.
    file_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("files.id"), nullable=True, index=True
    )

    source: Mapped["GraphNode"] = relationship(foreign_keys=[source_node_id])
    target: Mapped["GraphNode"] = relationship(foreign_keys=[target_node_id])
