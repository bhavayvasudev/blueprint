"""ARCHITECTURE.md §3.4: "Retrieval for any downstream stage is hybrid:
vector similarity + keyword/BM25 filtering + graph-neighbor expansion
... no stage is permitted to use pure vector similarity as its only
retrieval mechanism." This module is that contract, expressed as
Protocols rather than a concrete implementation — Stage 5+ agents
(once they exist, Phase 1+) depend on `HybridRetriever`, never on
"pgvector" or a SQL query shape directly (DECISIONS.md ADR-021).

`merge_hybrid_results` is pure and lives here (not in the concrete
service) because Reciprocal Rank Fusion doesn't know or care which
backend produced which ranking — it's part of the interface's contract
("how results from heterogeneous rankers get combined"), not a storage
detail.
"""

import uuid
from typing import Literal, Protocol

from pydantic import BaseModel

ChunkType = Literal["code", "doc"]


class ScoredChunk(BaseModel):
    chunk_id: uuid.UUID
    chunk_type: ChunkType
    score: float
    # Which backend(s) contributed this chunk — provenance for the
    # UI-visible disclosure Stage 11 needs (ARCHITECTURE.md §3.11).
    sources: list[str] = []


class VectorSearchBackend(Protocol):
    def search(
        self, query_embedding: list[float], *, snapshot_id: uuid.UUID, top_k: int
    ) -> list[ScoredChunk]: ...


class KeywordSearchBackend(Protocol):
    def search(self, query: str, *, snapshot_id: uuid.UUID, top_k: int) -> list[ScoredChunk]: ...


class GraphExpansionBackend(Protocol):
    def expand(
        self, chunk_ids: list[uuid.UUID], *, snapshot_id: uuid.UUID, max_neighbors: int
    ) -> list[ScoredChunk]: ...


class HybridRetriever(Protocol):
    """The interface calling code actually depends on. A concrete
    implementation composes a VectorSearchBackend + KeywordSearchBackend
    + GraphExpansionBackend and `merge_hybrid_results` internally —
    callers never see those three separately."""

    def search(self, query: str, *, snapshot_id: uuid.UUID, top_k: int) -> list[ScoredChunk]: ...


_RRF_K = 60  # standard Reciprocal Rank Fusion constant (e.g. Elasticsearch's default)


def merge_hybrid_results(
    *,
    vector_results: list[ScoredChunk],
    keyword_results: list[ScoredChunk],
    graph_results: list[ScoredChunk],
    top_k: int,
) -> list[ScoredChunk]:
    """Reciprocal Rank Fusion: combines rankers with incompatible raw
    score scales (cosine similarity, ts_rank, hop distance) without
    needing to calibrate them against each other — each result's
    contribution is 1/(k + rank), so only relative *position* within
    each ranking matters, not its raw score. Pure and deterministic:
    identical inputs always produce an identical merged ranking.
    """
    fused_score: dict[uuid.UUID, float] = {}
    contributors: dict[uuid.UUID, set[str]] = {}
    chunk_by_id: dict[uuid.UUID, ScoredChunk] = {}

    for source_name, results in (
        ("vector", vector_results),
        ("keyword", keyword_results),
        ("graph_expansion", graph_results),
    ):
        for rank, chunk in enumerate(results):
            fused_score[chunk.chunk_id] = fused_score.get(chunk.chunk_id, 0.0) + 1.0 / (
                _RRF_K + rank + 1
            )
            contributors.setdefault(chunk.chunk_id, set()).add(source_name)
            chunk_by_id[chunk.chunk_id] = chunk

    ranked_ids = sorted(fused_score, key=lambda chunk_id: fused_score[chunk_id], reverse=True)
    merged = [
        chunk_by_id[chunk_id].model_copy(
            update={"score": fused_score[chunk_id], "sources": sorted(contributors[chunk_id])}
        )
        for chunk_id in ranked_ids
    ]
    return merged[:top_k]
