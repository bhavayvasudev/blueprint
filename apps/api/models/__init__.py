"""SQLAlchemy models for Blueprint's persisted state (ARCHITECTURE.md §11).

Phase 0 scope only: users, repositories, repo_snapshots, files, code_chunks,
doc_chunks, graph_nodes, graph_edges (PHASES.md Phase 0 deliverables). The
`findings` / `finding_relations` / `maturity_scores` / `understanding_confidence`
/ `prompt_generations` tables described in ARCHITECTURE.md §11 belong to later
phases and are deliberately not modeled yet — see docs/MEMORY.md.
"""

from models.chunks import CodeChunk, DocChunk
from models.db import Base
from models.graph import GraphEdge, GraphNode
from models.repository import File, Repository, RepoSnapshot, User

__all__ = [
    "Base",
    "User",
    "Repository",
    "RepoSnapshot",
    "File",
    "CodeChunk",
    "DocChunk",
    "GraphNode",
    "GraphEdge",
]
