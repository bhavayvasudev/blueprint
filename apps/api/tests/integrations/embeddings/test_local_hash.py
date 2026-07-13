import math

from integrations.embeddings.base import EmbeddingProvider
from integrations.embeddings.local_hash import LocalHashEmbeddingProvider


def test_implements_embedding_provider_protocol() -> None:
    provider = LocalHashEmbeddingProvider(dimensions=64)
    assert isinstance(provider, EmbeddingProvider)


def test_deterministic_across_calls() -> None:
    provider = LocalHashEmbeddingProvider(dimensions=64)
    first = provider.embed_query("hello world")
    second = provider.embed_query("hello world")
    assert first == second


def test_different_text_produces_different_vectors() -> None:
    provider = LocalHashEmbeddingProvider(dimensions=64)
    assert provider.embed_query("hello world") != provider.embed_query("goodbye world")


def test_output_dimensions_and_normalization() -> None:
    provider = LocalHashEmbeddingProvider(dimensions=64)
    vector = provider.embed_query("some reasonably long piece of text to embed")
    assert len(vector) == 64
    norm = math.sqrt(sum(v * v for v in vector))
    assert math.isclose(norm, 1.0, abs_tol=1e-9)


def test_empty_text_returns_zero_vector_without_error() -> None:
    provider = LocalHashEmbeddingProvider(dimensions=32)
    vector = provider.embed_query("")
    assert vector == [0.0] * 32


def test_embed_documents_matches_embed_query_per_text() -> None:
    provider = LocalHashEmbeddingProvider(dimensions=32)
    texts = ["alpha", "beta", "gamma"]
    batch = provider.embed_documents(texts)
    individually = [provider.embed_query(t) for t in texts]
    assert batch == individually


def test_model_name_and_dimensions_properties() -> None:
    provider = LocalHashEmbeddingProvider(dimensions=128)
    assert provider.dimensions == 128
    assert isinstance(provider.model_name, str) and provider.model_name
