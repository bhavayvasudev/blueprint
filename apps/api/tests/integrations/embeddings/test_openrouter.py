import json

import httpx
import pytest

from integrations.embeddings.base import EmbeddingProvider
from integrations.embeddings.openrouter import OpenRouterEmbeddingProvider


def _make_provider(
    transport: httpx.MockTransport | None = None, **overrides: object
) -> OpenRouterEmbeddingProvider:
    kwargs: dict[str, object] = {
        "api_key": "test-key",
        "model": "openai/text-embedding-3-small",
        "dimensions": 4,
    }
    kwargs.update(overrides)
    if transport is not None:
        kwargs["transport"] = transport
    return OpenRouterEmbeddingProvider(**kwargs)  # type: ignore[arg-type]


def test_implements_embedding_provider_protocol() -> None:
    assert isinstance(_make_provider(), EmbeddingProvider)


def test_requires_api_key() -> None:
    with pytest.raises(ValueError, match="API key"):
        OpenRouterEmbeddingProvider(api_key="", model="m", dimensions=4)


def test_embed_documents_sends_correct_request_and_parses_response() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["auth"] = request.headers.get("authorization")
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "data": [
                    {"embedding": [0.1, 0.2, 0.3, 0.4], "index": 0},
                    {"embedding": [0.5, 0.6, 0.7, 0.8], "index": 1},
                ]
            },
        )

    provider = _make_provider(httpx.MockTransport(handler))
    result = provider.embed_documents(["first text", "second text"])

    assert captured["url"] == "https://openrouter.ai/api/v1/embeddings"
    assert captured["auth"] == "Bearer test-key"
    assert captured["body"] == {
        "model": "openai/text-embedding-3-small",
        "input": ["first text", "second text"],
    }
    assert result == [[0.1, 0.2, 0.3, 0.4], [0.5, 0.6, 0.7, 0.8]]


def test_response_reordered_by_index_regardless_of_wire_order() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        # Deliberately out of order on the wire.
        return httpx.Response(
            200,
            json={
                "data": [
                    {"embedding": [9.0], "index": 1},
                    {"embedding": [1.0], "index": 0},
                ]
            },
        )

    provider = _make_provider(httpx.MockTransport(handler), dimensions=1)
    result = provider.embed_documents(["a", "b"])
    assert result == [[1.0], [9.0]]


def test_embed_query_returns_single_vector() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"embedding": [1.0, 2.0], "index": 0}]})

    provider = _make_provider(httpx.MockTransport(handler), dimensions=2)
    assert provider.embed_query("hello") == [1.0, 2.0]


def test_http_error_raises() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "unauthorized"})

    provider = _make_provider(httpx.MockTransport(handler))
    with pytest.raises(httpx.HTTPStatusError):
        provider.embed_query("hello")
