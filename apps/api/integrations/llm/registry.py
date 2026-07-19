"""Factory: config value -> concrete `ChatProvider` (or `None`). The only
module that imports a concrete chat provider class directly — everywhere
else (services/) depends on `integrations.llm.base.ChatProvider`
(DECISIONS.md ADR-021, same pattern as the embeddings registry).

`llm_provider="none"` is a first-class, supported value, not an error: it
returns `None`, and `services/thread_service.py` treats that as "no
reasoning model is configured" — an honest degraded state for local dev and
CI, never a 500. This mirrors how the whole product stays honest about its
own territory (PRODUCT.md §5).
"""

from functools import lru_cache

from config import Settings, get_settings
from integrations.llm.base import ChatProvider
from integrations.llm.nvidia import NvidiaChatProvider


def build_chat_provider(settings: Settings) -> ChatProvider | None:
    """Pure, uncached — takes `Settings` explicitly so callers and tests can
    construct a provider for arbitrary settings without the process-wide
    singleton below."""
    if settings.llm_provider == "none":
        return None
    if settings.llm_provider == "nvidia":
        if not settings.nvidia_api_key:
            # No key configured is the same honest degraded state as
            # explicitly choosing "none" — return None rather than raising, so
            # the room renders "no reasoning model configured" instead of the
            # whole page 500ing on a missing credential.
            return None
        return NvidiaChatProvider(
            api_key=settings.nvidia_api_key,
            model=settings.nvidia_model,
            base_url=settings.nvidia_base_url,
            top_p=settings.nvidia_top_p,
            max_tokens=settings.nvidia_max_output_tokens,
            enable_reasoning=settings.nvidia_enable_reasoning,
        )
    raise ValueError(
        f"Unknown llm_provider {settings.llm_provider!r} — expected 'nvidia' or 'none'."
    )


@lru_cache
def get_chat_provider() -> ChatProvider | None:
    """Process-wide singleton so the provider's httpx connection pool is
    reused across requests rather than rebuilt per call."""
    return build_chat_provider(get_settings())
