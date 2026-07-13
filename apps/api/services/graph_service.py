"""Converts pure pipeline/graph specs (NodeSpec/EdgeSpec) into persisted
`GraphNode`/`GraphEdge` rows for one snapshot. This is where label -> DB
ID resolution happens — `pipeline/graph/` never touches a database ID,
only natural-key labels (DECISIONS.md ADR-019), which is what keeps that
package pure and testable without a database.
"""

import uuid

from sqlalchemy.orm import Session

from models.graph import GraphEdge, GraphNode
from models.repository import File
from pipeline.graph.specs import EdgeSpec, NodeSpec


def persist_graph(
    session: Session,
    snapshot_id: uuid.UUID,
    node_specs: list[NodeSpec],
    edge_specs: list[EdgeSpec],
    files_by_path: dict[str, File],
) -> None:
    """`files_by_path` must already have flushed IDs (see
    `ingestion_service.persist_files`) — nodes/edges resolve `file_id`
    against it directly rather than querying."""
    label_to_id: dict[str, uuid.UUID] = {}

    for node_spec in node_specs:
        node_id = uuid.uuid4()
        file_row = (
            files_by_path.get(node_spec.source_file_path) if node_spec.source_file_path else None
        )
        session.add(
            GraphNode(
                id=node_id,
                snapshot_id=snapshot_id,
                graph_type=node_spec.graph_type,
                node_type=node_spec.node_type,
                label=node_spec.label,
                node_metadata=node_spec.metadata,
                file_id=file_row.id if file_row else None,
            )
        )
        label_to_id[node_spec.label] = node_id

    for edge_spec in edge_specs:
        source_id = label_to_id.get(edge_spec.source_label)
        target_id = label_to_id.get(edge_spec.target_label)
        if source_id is None or target_id is None:
            # Defensive only: every EdgeSpec produced by pipeline/graph/
            # references labels from the NodeSpecs built alongside it in
            # the same pass, so this shouldn't happen for well-formed
            # input — but persistence is the wrong layer to silently drop
            # a real bug, so this stays an explicit skip, not a bare pass.
            continue
        file_row = (
            files_by_path.get(edge_spec.source_file_path) if edge_spec.source_file_path else None
        )
        session.add(
            GraphEdge(
                id=uuid.uuid4(),
                snapshot_id=snapshot_id,
                graph_type=edge_spec.graph_type,
                source_node_id=source_id,
                target_node_id=target_id,
                edge_type=edge_spec.edge_type,
                file_id=file_row.id if file_row else None,
            )
        )
