"""OpenRouter-routed embedding provider (ARCHITECTURE.md §10: "Embedding
model: routed via OpenRouter"). Speaks the OpenAI-compatible embeddings
API shape OpenRouter exposes; `base_url` is swappable so this same
client also works against any other OpenAI-compatible embeddings
endpoint, not only OpenRouter specifically — one less reason to add a
near-duplicate provider class later.

Implements `integrations.embeddings.base.EmbeddingProvider` structurally
(no inheritance).
"""

import httpx

_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"


class OpenRouterEmbeddingProvider:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        dimensions: int,
        base_url: str = _DEFAULT_BASE_URL,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        """`transport` is the test seam (`httpx.MockTransport`) — the
        provider always builds its own client so auth headers are set
        exactly once, in one place, regardless of whether a test injects
        a transport."""
        if not api_key:
            raise ValueError(
                "OpenRouterEmbeddingProvider requires an API key "
                "(config.Settings.openrouter_api_key) — use the local_hash "
                "provider (the default) for credential-free local development."
            )
        self._model = model
        self._dimensions = dimensions
        self._client = httpx.Client(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30.0,
            transport=transport,
        )

    @property
    def model_name(self) -> str:
        return self._model

    @property
    def dimensions(self) -> int:
        return self._dimensions

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._embed(texts)

    def embed_query(self, text: str) -> list[float]:
        return self._embed([text])[0]

    def _embed(self, texts: list[str]) -> list[list[float]]:
        response = self._client.post("/embeddings", json={"model": self._model, "input": texts})
        response.raise_for_status()
        payload = response.json()
        # OpenAI-compatible response shape:
        # {"data": [{"embedding": [...], "index": 0}, ...]}
        by_index = sorted(payload["data"], key=lambda item: item["index"])
        return [item["embedding"] for item in by_index]
