"""NVIDIA-hosted chat provider (the Threads reasoning model — NVIDIA
Nemotron, per spec). Speaks NVIDIA's OpenAI-compatible `/chat/completions`
API (`integrate.api.nvidia.com`) via the official `openai` SDK, so
`base_url` is swappable to a self-hosted NIM without a new provider class
— the same reasoning as `integrations.embeddings.openrouter`.

Implements `integrations.llm.base.ChatProvider` structurally (no
inheritance). The `OpenAI` client is built exactly once, in the
constructor, and reused for every call — never recreated per request.
"""

from collections.abc import Iterator
from typing import cast

import httpx
from openai import OpenAI
from openai.types.chat import ChatCompletionMessageParam

from integrations.llm.base import ChatMessage

_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1"
_DEFAULT_TOP_P = 0.9
_DEFAULT_MAX_TOKENS = 4096


def _to_openai_messages(messages: list[ChatMessage]) -> list[ChatCompletionMessageParam]:
    # `ChatMessage.role` is already restricted to "system"/"user"/"assistant"
    # (integrations.llm.base.Role), which is exactly the subset of
    # `ChatCompletionMessageParam` this dict shape satisfies at runtime — the
    # cast just tells mypy what pydantic's `.model_dump()` can't express.
    return cast("list[ChatCompletionMessageParam]", [m.model_dump() for m in messages])


class NvidiaChatProvider:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        base_url: str = _DEFAULT_BASE_URL,
        top_p: float = _DEFAULT_TOP_P,
        max_tokens: int = _DEFAULT_MAX_TOKENS,
        enable_reasoning: bool = True,
        http_client: httpx.Client | None = None,
    ) -> None:
        if not api_key:
            raise ValueError(
                "NvidiaChatProvider requires an API key (config.Settings."
                "nvidia_api_key) — set llm_provider='none' for a credential-free "
                "local/CI setup, which makes the Threads room degrade to an "
                "honest 'no reasoning model configured' state instead."
            )
        self._model = model
        self._top_p = top_p
        self._max_tokens = max_tokens
        self._enable_reasoning = enable_reasoning
        # A generous read timeout: a grounded answer over a large context can
        # take tens of seconds to finish streaming. Connect stays short so a
        # dead endpoint fails fast rather than hanging the request.
        self._client = OpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=httpx.Timeout(120.0, connect=10.0),
            http_client=http_client,
        )

    @property
    def model_name(self) -> str:
        return self._model

    def _extra_body(self) -> dict[str, object] | None:
        # NVIDIA's Nemotron reasoning models toggle chain-of-thought via this
        # OpenAI-compatible `extra_body` passthrough — ignored (not an error)
        # by any model that doesn't support it.
        return {"chat_template_kwargs": {"thinking": True}} if self._enable_reasoning else None

    def stream_chat(
        self, messages: list[ChatMessage], *, temperature: float = 0.2, max_tokens: int | None = None
    ) -> Iterator[str]:
        stream = self._client.chat.completions.create(
            model=self._model,
            messages=_to_openai_messages(messages),
            temperature=temperature,
            top_p=self._top_p,
            max_tokens=max_tokens or self._max_tokens,
            stream=True,
            extra_body=self._extra_body(),
        )
        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    def complete(
        self, messages: list[ChatMessage], *, temperature: float = 0.2, max_tokens: int | None = None
    ) -> str:
        response = self._client.chat.completions.create(
            model=self._model,
            messages=_to_openai_messages(messages),
            temperature=temperature,
            top_p=self._top_p,
            max_tokens=max_tokens or self._max_tokens,
            stream=False,
            extra_body=self._extra_body(),
        )
        return (response.choices[0].message.content or "").strip()
