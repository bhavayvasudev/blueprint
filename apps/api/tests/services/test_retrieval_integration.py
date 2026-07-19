"""Real integration test against Postgres — skips here (no DB available
in this environment), runs for real in CI (see tests/conftest.py).

Exercises the whole Stage 4 chain for real: chunk -> embed (via the
dependency-free LocalHashEmbeddingProvider, so no external credentials
are needed even in CI) -> persist -> hybrid search (pgvector cosine
distance + Postgres full-text search + Knowledge Graph "imports"
expansion), against a real Postgres instance.
"""

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from integrations.embeddings.local_hash import LocalHashEmbeddingProvider
from models.chunks import CodeChunk
from models.repository import File, RepoSnapshot
from pipeline.graph.knowledge import build_knowledge_graph
from pipeline.ingestion.extract import extract_repository
from services.embedding_service import embed_and_persist_code_chunks, embed_and_persist_doc_chunks
from services.graph_service import persist_graph
from services.ingestion_service import persist_files
from services.retrieval_service import HybridRetrievalService, KnowledgeGraphExpansionBackend

FIXTURE_REPO = Path(__file__).parent.parent / "pipeline" / "ingestion" / "fixtures" / "sample_repo"


def _index_fixture_repo(
    session: Session, snapshot: RepoSnapshot, provider: LocalHashEmbeddingProvider
) -> None:
    facts = extract_repository(FIXTURE_REPO)
    files_by_path = persist_files(session, snapshot, facts)

    for file_facts in facts:
        source_text = (FIXTURE_REPO / file_facts.path).read_text()
        embed_and_persist_code_chunks(
            session, provider, files_by_path[file_facts.path], file_facts, source_text
        )

    kg_nodes, kg_edges = build_knowledge_graph(facts)
    persist_graph(session, snapshot.id, kg_nodes, kg_edges, files_by_path)

    embed_and_persist_doc_chunks(
        session,
        provider,
        snapshot.id,
        "README.md",
        "# Sample Repo\n\nA fixture repository for pipeline tests.\n",
    )
    session.flush()


def test_exact_content_query_ranks_itself_first(db_session: Session, snapshot: RepoSnapshot) -> None:
    provider = LocalHashEmbeddingProvider()
    _index_fixture_repo(db_session, snapshot, provider)
    retriever = HybridRetrievalService(db_session, provider)

    # local_hash's embed_query and embed_documents are the same function,
    # so a chunk queried with its own exact content has cosine similarity
    # 1.0 to itself — a deterministic, real assertion about vector search,
    # not a semantic-relevance guess.
    query_text = "def add(a: int, b: int) -> int:\n    return a + b"
    results = retriever.search(query_text, snapshot_id=snapshot.id, top_k=5)

    assert results
    assert "vector" in results[0].sources


def test_keyword_search_finds_lexical_match(db_session: Session, snapshot: RepoSnapshot) -> None:
    provider = LocalHashEmbeddingProvider()
    _index_fixture_repo(db_session, snapshot, provider)
    retriever = HybridRetrievalService(db_session, provider)

    results = retriever.search("excited", snapshot_id=snapshot.id, top_k=10)

    assert any("keyword" in r.sources for r in results)


def test_graph_expansion_surfaces_imported_file(db_session: Session, snapshot: RepoSnapshot) -> None:
    """Tests `KnowledgeGraphExpansionBackend` directly, seeded with
    exactly the chunk that imports the target file — not through the
    full `HybridRetrievalService.search()` stack.

    Why not go through the full stack: `search()`'s vector pass seeds
    graph expansion with its *top 5* hits (ARCHITECTURE.md §3.4: "top
    vector hits", plural, by design), which can legitimately include
    more than one file. `KnowledgeGraphExpansionBackend.expand()`
    excludes a seed's own module from its neighbor results (to avoid
    reporting a file as "expanded to" when it was already a seed) — so
    if the imported file (utils/helper.py) happens to *also* be a
    top-5 vector hit in its own right (real here: it shares the literal
    text "add(" with the query), it's correctly excluded from
    `graph_expansion`'s output, since it's already present via
    `vector`. That's correct behavior, not a bug, but it makes the
    full-stack path a nondeterministic way to test *this specific*
    mechanism — seeding the backend directly is the deterministic one.
    """
    provider = LocalHashEmbeddingProvider()
    _index_fixture_repo(db_session, snapshot, provider)

    # Scoped to this snapshot: `db_session` binds to the real configured
    # Postgres when one is reachable, so an unscoped symbol lookup also
    # matches chunks left behind by any other snapshot in that database —
    # the fixture repo's symbol names are not unique across snapshots.
    use_helper_chunk = db_session.execute(
        select(CodeChunk)
        .join(File, File.id == CodeChunk.file_id)
        .where(CodeChunk.symbol_name == "use_helper", File.snapshot_id == snapshot.id)
    ).scalar_one()
    helper_file_id = db_session.execute(
        select(File.id).where(File.path == "utils/helper.py", File.snapshot_id == snapshot.id)
    ).scalar_one()

    backend = KnowledgeGraphExpansionBackend(db_session)
    results = backend.expand([use_helper_chunk.id], snapshot_id=snapshot.id, max_neighbors=20)

    assert results
    assert all(r.sources == ["graph_expansion"] for r in results)
    expanded_chunks = db_session.execute(
        select(CodeChunk).where(CodeChunk.id.in_([r.chunk_id for r in results]))
    ).scalars().all()
    assert any(chunk.file_id == helper_file_id for chunk in expanded_chunks)


def test_doc_chunks_are_searchable_too(db_session: Session, snapshot: RepoSnapshot) -> None:
    provider = LocalHashEmbeddingProvider()
    _index_fixture_repo(db_session, snapshot, provider)
    retriever = HybridRetrievalService(db_session, provider)

    results = retriever.search("fixture repository", snapshot_id=snapshot.id, top_k=10)

    assert any(r.chunk_type == "doc" for r in results)
