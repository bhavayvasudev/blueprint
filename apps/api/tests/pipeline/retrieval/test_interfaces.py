import uuid

from pipeline.retrieval.interfaces import ScoredChunk, merge_hybrid_results


def _chunk(chunk_id: uuid.UUID, chunk_type: str = "code", score: float = 0.0) -> ScoredChunk:
    return ScoredChunk(chunk_id=chunk_id, chunk_type=chunk_type, score=score)  # type: ignore[arg-type]


def test_merge_deterministic_for_identical_inputs() -> None:
    a, b = uuid.uuid4(), uuid.uuid4()
    vector = [_chunk(a, score=0.9), _chunk(b, score=0.5)]
    keyword: list[ScoredChunk] = []
    graph: list[ScoredChunk] = []

    first = merge_hybrid_results(
        vector_results=vector, keyword_results=keyword, graph_results=graph, top_k=10
    )
    second = merge_hybrid_results(
        vector_results=vector, keyword_results=keyword, graph_results=graph, top_k=10
    )
    assert first == second


def test_chunk_appearing_in_multiple_backends_ranks_higher() -> None:
    """RRF: a chunk that's top-ranked in two rankers should outrank one
    that's top-ranked in only one, even with no raw-score information."""
    agreed = uuid.uuid4()
    vector_only = uuid.uuid4()

    vector_results = [_chunk(agreed), _chunk(vector_only)]
    keyword_results = [_chunk(agreed)]
    graph_results: list[ScoredChunk] = []

    merged = merge_hybrid_results(
        vector_results=vector_results,
        keyword_results=keyword_results,
        graph_results=graph_results,
        top_k=10,
    )

    assert merged[0].chunk_id == agreed
    assert merged[0].sources == ["vector"] or "keyword" in merged[0].sources
    assert set(merged[0].sources) == {"vector", "keyword"}


def test_rank_within_a_list_matters_more_than_which_list() -> None:
    """A chunk ranked #1 in one backend should generally outrank a chunk
    ranked far down in another, all else equal."""
    top_of_vector = uuid.uuid4()
    bottom_of_keyword = uuid.uuid4()

    vector_results = [_chunk(top_of_vector)]
    keyword_results = [_chunk(uuid.uuid4()) for _ in range(20)] + [_chunk(bottom_of_keyword)]

    merged = merge_hybrid_results(
        vector_results=vector_results,
        keyword_results=keyword_results,
        graph_results=[],
        top_k=30,
    )
    ranked_ids = [c.chunk_id for c in merged]
    assert ranked_ids.index(top_of_vector) < ranked_ids.index(bottom_of_keyword)


def test_respects_top_k() -> None:
    vector_results = [_chunk(uuid.uuid4()) for _ in range(10)]
    merged = merge_hybrid_results(
        vector_results=vector_results, keyword_results=[], graph_results=[], top_k=3
    )
    assert len(merged) == 3


def test_provenance_tracks_every_contributing_backend() -> None:
    only_graph = uuid.uuid4()
    merged = merge_hybrid_results(
        vector_results=[],
        keyword_results=[],
        graph_results=[_chunk(only_graph)],
        top_k=10,
    )
    assert merged[0].sources == ["graph_expansion"]


def test_empty_inputs_produce_empty_result() -> None:
    assert merge_hybrid_results(vector_results=[], keyword_results=[], graph_results=[], top_k=10) == []
