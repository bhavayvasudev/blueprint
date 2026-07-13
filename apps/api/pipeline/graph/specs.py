"""Pure, pre-persistence graph data (ARCHITECTURE.md §5, §11).

`NodeSpec`/`EdgeSpec` are keyed by a natural-language `label`, not a
database ID — nothing in `pipeline/graph/` ever talks to the database
(RULES.md §6, §24: pipeline/ stays importable and runnable standalone).
`services/graph_service.py` is what turns a list of specs into real
`GraphNode`/`GraphEdge` rows for a specific snapshot, assigning IDs at
that point and resolving edges' `source_label`/`target_label` against
the nodes it just inserted.

This label-keyed shape is deliberate, not incidental (DECISIONS.md
ADR-019): it's the exact input/output shape a future content-hash cache
would memoize per file — `build_file_nodes(facts) -> list[NodeSpec]` is
already a pure function of one file's facts, so slotting a cache lookup
in front of it later (v1.1, ARCHITECTURE.md §9) doesn't change this
module's shape at all.
"""

from pydantic import BaseModel

from models.types import GraphType


class NodeSpec(BaseModel):
    graph_type: GraphType
    node_type: str
    label: str
    metadata: dict[str, object] = {}
    # Repo-relative path of the file this node was derived from. Set for
    # every Knowledge Graph node (1:1 with a file); None for Repository
    # Graph nodes, which roll up many files (their file set lives in
    # `metadata["file_paths"]` instead — see repository.py).
    source_file_path: str | None = None


class EdgeSpec(BaseModel):
    graph_type: GraphType
    source_label: str
    target_label: str
    edge_type: str
    # The file whose parse produced this edge (its source node's file).
    # None for Repository Graph edges.
    source_file_path: str | None = None
