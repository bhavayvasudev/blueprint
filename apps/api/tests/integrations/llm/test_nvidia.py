"""NVIDIA chat provider — exercised against `httpx.MockTransport` wired
through the `openai` SDK's `http_client` hook, so the OpenAI-compatible
request shape is verified without a live endpoint or credentials."""

import json

import httpx
import openai
import pytest

from integrations.llm.base import ChatMessage, ChatProvider
from integrations.llm.nvidia import NvidiaChatProvider


def _make_provider(transport: httpx.MockTransport, **kwargs: object) -> NvidiaChatProvider:
    return NvidiaChatProvider(
        api_key="test-key",
        model="nvidia/nemotron",
        http_client=httpx.Client(transport=transport),
        **kwargs,  # type: ignore[arg-type]
    )


def _sse(*chunks: dict[str, object]) -> str:
    body = "".join(f"data: {json.dumps(c)}\n\n" for c in chunks)
    return body + "data: [DONE]\n\n"


def test_implements_chat_provider_protocol() -> None:
    provider = _make_provider(httpx.MockTransport(lambda r: httpx.Response(200)))
    assert isinstance(provider, ChatProvider)


def test_requires_api_key() -> None:
    with pytest.raises(ValueError, match="API key"):
        NvidiaChatProvider(api_key="", model="m")


def test_client_is_built_once_and_reused() -> None:
    provider = _make_provider(httpx.MockTransport(lambda r: httpx.Response(200)))
    assert provider._client is provider._client


def test_stream_chat_sends_openai_shape_and_yields_deltas() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["auth"] = request.headers.get("authorization")
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            text=_sse(
                {"choices": [{"delta": {"role": "assistant"}, "index": 0}]},
                {"choices": [{"delta": {"content": "Hello"}, "index": 0}]},
                {"choices": [{"delta": {"content": " world"}, "index": 0}]},
            ),
            headers={"content-type": "text/event-stream"},
        )

    provider = _make_provider(httpx.MockTransport(handler))
    tokens = list(provider.stream_chat([ChatMessage(role="user", content="hi")]))

    assert tokens == ["Hello", " world"]
    assert captured["url"] == "https://integrate.api.nvidia.com/v1/chat/completions"
    assert captured["auth"] == "Bearer test-key"
    body = captured["body"]
    assert body["model"] == "nvidia/nemotron"  # type: ignore[index]
    assert body["stream"] is True  # type: ignore[index]
    assert body["top_p"] == 0.9  # type: ignore[index]
    assert body["max_tokens"] == 4096  # type: ignore[index]
    assert body["messages"] == [{"role": "user", "content": "hi"}]  # type: ignore[index]
    assert body["chat_template_kwargs"] == {"thinking": True}  # type: ignore[index]


def test_reasoning_can_be_disabled() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, text=_sse({"choices": [{"delta": {"content": "hi"}, "index": 0}]}))

    provider = _make_provider(httpx.MockTransport(handler), enable_reasoning=False)
    list(provider.stream_chat([ChatMessage(role="user", content="hi")]))

    assert "chat_template_kwargs" not in captured["body"]  # type: ignore[operator]


def test_complete_returns_message_content() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content)["stream"] is False
        return httpx.Response(
            200,
            json={
                "id": "x",
                "object": "chat.completion",
                "created": 0,
                "model": "nvidia/nemotron",
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "stop",
                        "message": {"role": "assistant", "content": "  Auth Flow  "},
                    }
                ],
            },
        )

    provider = _make_provider(httpx.MockTransport(handler))
    assert provider.complete([ChatMessage(role="user", content="title this")]) == "Auth Flow"


def test_http_error_raises() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": {"message": "no"}})

    provider = _make_provider(httpx.MockTransport(handler))
    with pytest.raises(openai.APIStatusError):
        list(provider.stream_chat([ChatMessage(role="user", content="hi")]))
