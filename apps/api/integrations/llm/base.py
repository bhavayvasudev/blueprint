"""The chat-LLM boundary the Threads room depends on. A `Protocol`, not a
base class — the same "callers depend on the interface, one module names
the concrete class" rule as `integrations.embeddings.base` (DECISIONS.md
ADR-021). `services/thread_service.py` never imports a concrete provider;
`integrations/llm/registry.py` is the only place one is named.

The interface is deliberately narrow: token-streaming chat over a list of
role-tagged messages, plus a non-streaming one-shot for short internal
calls (title generation). Everything the Threads product needs — grounding,
evidence, follow-ups — is assembled *above* this layer, in the service,
from the repository's own retrieval output; the provider only turns an
already-grounded prompt into text.
"""

from collections.abc import Iterator
from typing import Literal, Protocol, runtime_checkable

from pydantic import BaseModel

Role = Literal["system", "user", "assistant"]


class ChatMessage(BaseModel):
    role: Role
    content: str


@runtime_checkable
class ChatProvider(Protocol):
    def stream_chat(
        self, messages: list[ChatMessage], *, temperature: float = 0.2, max_tokens: int = 1024
    ) -> Iterator[str]:
        """Yield answer text incrementally (token/delta granularity). The
        caller is responsible for any structure (sections, citation markers)
        via the prompt — this only streams whatever text the model emits."""
        ...

    def complete(
        self, messages: list[ChatMessage], *, temperature: float = 0.2, max_tokens: int = 256
    ) -> str:
        """One-shot, non-streaming — for short internal calls (e.g. thread
        title generation) where progressive rendering buys nothing."""
        ...
