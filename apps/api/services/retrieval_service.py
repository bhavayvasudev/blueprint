"""Concrete hybrid retrieval backend (ARCHITECTURE.md §3.4): pgvector
for vector similarity, Postgres full-text search for keyword matching,
and Knowledge Graph "imports" edges for structural neighbor expansion.
Implements the Protocols in `pipeline/retrieval/interfaces.py` —
nothing outside this module (and its tests) should know these are the
concrete choices (DECISIONS.md ADR-021); everything else depends on
`HybridRetriever`.

Graph expansion works at *file* granularity today, not symbol
granularity: the Knowledge Graph only has "imports" edges so far
(pipeline/graph/knowledge.py's documented scope boundary — "calls"/
"references" need call-expression facts Stage 1 doesn't extract yet).
Given a code chunk, this expands to chunks from files it imports or is
imported by, not to specific called functions — an honest, current
limit, not a silent gap.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from integrations.embeddings.base import EmbeddingProvider
from models.chunks import CodeChunk, DocChunk
from models.graph import GraphEdge, GraphNode
from models.repository import File
from models.types import GraphType
from pipeline.retrieval.interfaces import ScoredChunk, merge_hybrid_results


class PgVectorSearchBackend:
    def __init__(self, session: Session) -> None:
        self._session = session

    def search(
        self, query_embedding: list[float], *, snapshot_id: uuid.UUID, top_k: int
    ) -> list[ScoredChunk]:
        code_distance = CodeChunk.embedding.cosine_distance(query_embedding)
        code_rows = self._session.execute(
            select(CodeChunk, code_distance.label("distance"))
            .join(File, File.id == CodeChunk.file_id)
            .where(File.snapshot_id == snapshot_id)
            .order_by(code_distance)
            .limit(top_k)
        ).all()

        doc_distance = DocChunk.embedding.cosine_distance(query_embedding)
        doc_rows = self._session.execute(
            select(DocChunk, doc_distance.label("distance"))
            .where(DocChunk.snapshot_id == snapshot_id)
            .order_by(doc_distance)
            .limit(top_k)
        ).all()

        results = [
            ScoredChunk(chunk_id=chunk.id, chunk_type="code", score=1.0 - distance)
            for chunk, distance in code_rows
        ] + [
            ScoredChunk(chunk_id=chunk.id, chunk_type="doc", score=1.0 - distance)
            for chunk, distance in doc_rows
        ]
        results.sort(key=lambda r: r.score, reverse=True)
        return results[:top_k]


class PostgresKeywordSearchBackend:
    """ARCHITECTURE.md §3.4's "keyword/BM25 filtering" component, via
    Postgres' built-in full-text search (`to_tsvector`/`ts_rank`) rather
    than a dedicated search engine — the same "adequate now, no new
    datastore" reasoning as DECISIONS.md ADR-003/ADR-006. Queries the
    exact expression (`to_tsvector('english', content)`) the GIN indexes
    from migration c58a8fc2631c were built on."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def search(self, query: str, *, snapshot_id: uuid.UUID, top_k: int) -> list[ScoredChunk]:
        tsquery = func.plainto_tsquery("english", query)

        code_tsv = func.to_tsvector("english", CodeChunk.content)
        code_rank = func.ts_rank(code_tsv, tsquery)
        code_rows = self._session.execute(
            select(CodeChunk, code_rank.label("rank"))
            .join(File, File.id == CodeChunk.file_id)
            .where(File.snapshot_id == snapshot_id, code_tsv.op("@@")(tsquery))
            .order_by(code_rank.desc())
            .limit(top_k)
        ).all()

        doc_tsv = func.to_tsvector("english", DocChunk.content)
        doc_rank = func.ts_rank(doc_tsv, tsquery)
        doc_rows = self._session.execute(
            select(DocChunk, doc_rank.label("rank"))
            .where(DocChunk.snapshot_id == snapshot_id, doc_tsv.op("@@")(tsquery))
            .order_by(doc_rank.desc())
            .limit(top_k)
        ).all()

        results = [
            ScoredChunk(chunk_id=chunk.id, chunk_type="code", score=float(rank))
            for chunk, rank in code_rows
        ] + [
            ScoredChunk(chunk_id=chunk.id, chunk_type="doc", score=float(rank))
            for chunk, rank in doc_rows
        ]
        results.sort(key=lambda r: r.score, reverse=True)
        return results[:top_k]


class KnowledgeGraphExpansionBackend:
    def __init__(self, session: Session) -> None:
        self._session = session

    def expand(
        self, chunk_ids: list[uuid.UUID], *, snapshot_id: uuid.UUID, max_neighbors: int
    ) -> list[ScoredChunk]:
        """Note: when `chunk_ids` spans multiple seed files (as
        `HybridRetrievalService.search()`'s top-5-vector-hit seeding
        can), a file that's already one of the seeds is excluded from
        its own neighbor results — deliberately: it's already directly
        relevant (it produced a seed chunk), so re-flagging it as
        "graph_expansion" would be redundant, not additive. This means
        a genuinely-adjacent file that also happens to be a top vector
        hit in its own right won't appear here, only in the vector
        results — correct, since RRF fusion (pipeline/retrieval/
        interfaces.py) already accounts for it via that path."""
        if not chunk_ids:
            return []

        file_ids = set(
            self._session.execute(select(CodeChunk.file_id).where(CodeChunk.id.in_(chunk_ids)))
            .scalars()
            .all()
        )
        if not file_ids:
            return []

        module_node_ids = set(
            self._session.execute(
                select(GraphNode.id).where(
                    GraphNode.snapshot_id == snapshot_id,
                    GraphNode.graph_type == GraphType.KNOWLEDGE,
                    GraphNode.node_type == "module",
                    GraphNode.file_id.in_(file_ids),
                )
            )
            .scalars()
            .all()
        )
        if not module_node_ids:
            return []

        outgoing = self._session.execute(
            select(GraphEdge.target_node_id).where(
                GraphEdge.snapshot_id == snapshot_id,
                GraphEdge.edge_type == "imports",
                GraphEdge.source_node_id.in_(module_node_ids),
            )
        ).scalars()
        incoming = self._session.execute(
            select(GraphEdge.source_node_id).where(
                GraphEdge.snapshot_id == snapshot_id,
                GraphEdge.edge_type == "imports",
                GraphEdge.target_node_id.in_(module_node_ids),
            )
        ).scalars()
        neighbor_node_ids = (set(outgoing) | set(incoming)) - module_node_ids
        if not neighbor_node_ids:
            return []

        neighbor_file_ids = set(
            self._session.execute(
                select(GraphNode.file_id).where(GraphNode.id.in_(neighbor_node_ids))
            )
            .scalars()
            .all()
        )
        neighbor_file_ids.discard(None)
        if not neighbor_file_ids:
            return []

        neighbor_chunks = (
            self._session.execute(
                select(CodeChunk).where(CodeChunk.file_id.in_(neighbor_file_ids)).limit(max_neighbors)
            )
            .scalars()
            .all()
        )

        return [
            ScoredChunk(chunk_id=chunk.id, chunk_type="code", score=0.0, sources=["graph_expansion"])
            for chunk in neighbor_chunks
        ]


class HybridRetrievalService:
    """Implements `pipeline.retrieval.interfaces.HybridRetriever` by
    composing the three backends above with the pure merge logic."""

    def __init__(
        self,
        session: Session,
        embedding_provider: EmbeddingProvider,
        *,
        top_k_per_backend: int = 20,
    ) -> None:
        self._vector_backend = PgVectorSearchBackend(session)
        self._keyword_backend = PostgresKeywordSearchBackend(session)
        self._graph_backend = KnowledgeGraphExpansionBackend(session)
        self._embedding_provider = embedding_provider
        self._top_k_per_backend = top_k_per_backend

    def search(self, query: str, *, snapshot_id: uuid.UUID, top_k: int) -> list[ScoredChunk]:
        query_embedding = self._embedding_provider.embed_query(query)

        vector_results = self._vector_backend.search(
            query_embedding, snapshot_id=snapshot_id, top_k=self._top_k_per_backend
        )
        keyword_results = self._keyword_backend.search(
            query, snapshot_id=snapshot_id, top_k=self._top_k_per_backend
        )
        seed_chunk_ids = [r.chunk_id for r in vector_results if r.chunk_type == "code"][:5]
        graph_results = self._graph_backend.expand(
            seed_chunk_ids, snapshot_id=snapshot_id, max_neighbors=self._top_k_per_backend
        )

        return merge_hybrid_results(
            vector_results=vector_results,
            keyword_results=keyword_results,
            graph_results=graph_results,
            top_k=top_k,
        )
