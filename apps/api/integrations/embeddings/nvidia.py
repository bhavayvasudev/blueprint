"""NVIDIA-hosted embedding provider (DECISIONS.md ADR-021), speaking the
OpenAI-compatible `/embeddings` shape NVIDIA exposes at
`integrate.api.nvidia.com` — the same endpoint family
`integrations.llm.nvidia` already uses for chat, so Blueprint needs one
credential, not two.

Why this provider exists alongside `openrouter.py`, which already speaks
an OpenAI-compatible embeddings API: NVIDIA's retrieval models require a
non-standard `input_type` field ("query" vs "passage") on every request,
and asymmetric-embedding models return materially worse retrieval when
it's wrong — a question embedded as a passage lands in the wrong part of
the space. That field is exactly the distinction
`EmbeddingProvider.embed_documents` / `.embed_query` was defined to
express (see `base.py`), so this provider is where the protocol's
existing two-method split finally earns its keep rather than being
ceremony.

`truncate="END"` is set deliberately: the retrieval models cap input at
512 tokens, and a long code chunk that exceeds it would otherwise fail
the whole batch with a 400. Truncating the tail of an over-long chunk
degrades that one chunk's recall; erroring would take down indexing for
the entire repository. Chunk boundaries are the real fix and they live
in `pipeline/ingestion/chunking.py`, not here.

Implements `integrations.embeddings.base.EmbeddingProvider` structurally
(no inheritance).
"""

import httpx

_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1"

# NVIDIA's hosted embedding endpoints reject oversized batches outright,
# and the limit is not documented as a stable contract. 32 is well under
# every observed limit while still amortizing request overhead across a
# repository-sized indexing pass — a repo with 4,000 chunks costs 125
# requests, not 4,000.
_BATCH_SIZE = 32

# Indexing a repository is a long, all-or-nothing background job, so a
# single transient 5xx should not fail the whole sync.
_MAX_ATTEMPTS = 3


class NvidiaEmbeddingProvider:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        dimensions: int,
        base_url: str = _DEFAULT_BASE_URL,
        batch_size: int = _BATCH_SIZE,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        """`transport` is the test seam (`httpx.MockTransport`) — the
        provider always builds its own client so auth headers are set
        exactly once, in one place, regardless of whether a test injects
        a transport (same contract as `OpenRouterEmbeddingProvider`)."""
        if not api_key:
            raise ValueError(
                "NvidiaEmbeddingProvider requires an API key "
                "(config.Settings.nvidia_api_key) — use the local_hash provider "
                "for credential-free local development and CI."
            )
        self._model = model
        self._dimensions = dimensions
        self._batch_size = batch_size
        self._client = httpx.Client(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            # Generous relative to a chat call: a 32-item batch of code
            # chunks is a much larger payload than a single query.
            timeout=60.0,
            transport=transport,
        )

    @property
    def model_name(self) -> str:
        return self._model

    @property
    def dimensions(self) -> int:
        return self._dimensions

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Indexed content — embedded as "passage"."""
        if not texts:
            return []
        vectors: list[list[float]] = []
        for start in range(0, len(texts), self._batch_size):
            vectors.extend(self._embed(texts[start : start + self._batch_size], "passage"))
        return vectors

    def embed_query(self, text: str) -> list[float]:
        """A search query — embedded as "query". See the module docstring
        for why this is not interchangeable with `embed_documents`."""
        return self._embed([text], "query")[0]

    def _embed(self, texts: list[str], input_type: str) -> list[list[float]]:
        payload = {
            "model": self._model,
            "input": texts,
            "input_type": input_type,
            "encoding_format": "float",
            "truncate": "END",
        }
        response = self._request(payload)
        # OpenAI-compatible response shape:
        # {"data": [{"embedding": [...], "index": 0}, ...]}
        by_index = sorted(response["data"], key=lambda item: item["index"])
        vectors = [item["embedding"] for item in by_index]

        # A dimension mismatch here means the configured model disagrees
        # with the pgvector column width, which pgvector would otherwise
        # reject deep inside a bulk insert with a far less obvious error.
        # Fail at the boundary, naming both sides (DECISIONS.md ADR-018).
        if vectors and len(vectors[0]) != self._dimensions:
            raise ValueError(
                f"Model {self._model!r} returned {len(vectors[0])}-dimensional "
                f"vectors, but Blueprint's embedding columns are "
                f"{self._dimensions}-dimensional (models.types.EMBEDDING_DIM). "
                "Change the model or migrate the column width — they must match."
            )
        return vectors

    def _request(self, payload: dict) -> dict:
        last_error: Exception | None = None
        for attempt in range(_MAX_ATTEMPTS):
            try:
                response = self._client.post("/embeddings", json=payload)
                # 4xx is a request the server will never accept (bad model,
                # bad key, oversized batch) — retrying only delays the real
                # error. Retry 5xx and transport failures only.
                if response.status_code < 500:
                    response.raise_for_status()
                    return response.json()
                last_error = httpx.HTTPStatusError(
                    f"NVIDIA embeddings returned {response.status_code}",
                    request=response.request,
                    response=response,
                )
            except httpx.RequestError as exc:
                last_error = exc
            if attempt == _MAX_ATTEMPTS - 1:
                break
        assert last_error is not None
        raise last_error
