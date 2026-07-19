"""Factory: config value -> concrete `EmbeddingProvider` (DECISIONS.md
ADR-021). The only module in the codebase that imports a concrete
provider class directly — everywhere else (pipeline/, services/)
depends on `integrations.embeddings.base.EmbeddingProvider`.
"""

from functools import lru_cache

from config import Settings, get_settings
from integrations.embeddings.base import EmbeddingProvider
from integrations.embeddings.local_hash import LocalHashEmbeddingProvider
from integrations.embeddings.nvidia import NvidiaEmbeddingProvider
from integrations.embeddings.openrouter import OpenRouterEmbeddingProvider
from models.types import EMBEDDING_DIM


def build_embedding_provider(settings: Settings) -> EmbeddingProvider:
    """Pure, uncached — takes `Settings` explicitly so callers (and
    tests) can construct a provider for arbitrary settings without going
    through the process-wide singleton below."""
    if settings.embedding_provider == "local_hash":
        return LocalHashEmbeddingProvider(dimensions=EMBEDDING_DIM)
    if settings.embedding_provider == "openrouter":
        return OpenRouterEmbeddingProvider(
            api_key=settings.openrouter_api_key,
            model=settings.embedding_model,
            dimensions=EMBEDDING_DIM,
        )
    if settings.embedding_provider == "nvidia":
        return NvidiaEmbeddingProvider(
            api_key=settings.nvidia_api_key,
            model=settings.nvidia_embedding_model,
            dimensions=EMBEDDING_DIM,
            base_url=settings.nvidia_base_url,
        )
    raise ValueError(
        f"Unknown embedding_provider {settings.embedding_provider!r} — "
        "expected 'local_hash', 'nvidia', or 'openrouter'."
    )


@lru_cache
def get_embedding_provider() -> EmbeddingProvider:
    return build_embedding_provider(get_settings())
