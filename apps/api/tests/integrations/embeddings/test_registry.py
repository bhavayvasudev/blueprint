import pytest

from config import Settings
from integrations.embeddings.local_hash import LocalHashEmbeddingProvider
from integrations.embeddings.openrouter import OpenRouterEmbeddingProvider
from integrations.embeddings.registry import build_embedding_provider


def test_local_hash_is_the_default() -> None:
    settings = Settings(_env_file=None)
    provider = build_embedding_provider(settings)
    assert isinstance(provider, LocalHashEmbeddingProvider)


def test_selects_openrouter_when_configured() -> None:
    settings = Settings(_env_file=None, embedding_provider="openrouter", openrouter_api_key="key")
    provider = build_embedding_provider(settings)
    assert isinstance(provider, OpenRouterEmbeddingProvider)


def test_unknown_provider_raises() -> None:
    settings = Settings(_env_file=None, embedding_provider="not-a-real-provider")
    with pytest.raises(ValueError, match="Unknown embedding_provider"):
        build_embedding_provider(settings)


def test_openrouter_without_api_key_raises() -> None:
    settings = Settings(_env_file=None, embedding_provider="openrouter", openrouter_api_key="")
    with pytest.raises(ValueError, match="API key"):
        build_embedding_provider(settings)


def test_swapping_provider_is_config_only_same_call_shape() -> None:
    """The point of DECISIONS.md ADR-021: both providers satisfy the same
    interface, so calling code doesn't change when the config does."""
    local_settings = Settings(_env_file=None, embedding_provider="local_hash")
    openrouter_settings = Settings(
        _env_file=None, embedding_provider="openrouter", openrouter_api_key="key"
    )

    for settings in (local_settings, openrouter_settings):
        provider = build_embedding_provider(settings)
        assert hasattr(provider, "embed_query")
        assert hasattr(provider, "embed_documents")
        assert hasattr(provider, "dimensions")
        assert hasattr(provider, "model_name")
