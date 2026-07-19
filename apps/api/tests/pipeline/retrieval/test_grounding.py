"""Pure-logic tests for the Threads grounding core — no DB, no LLM. The
load-bearing bits are the stream splitter (getting follow-ups out without
leaking the sentinel into the visible answer) and the honest empty-context
prompt (which must forbid answering from general knowledge)."""

from integrations.llm.base import ChatMessage
from pipeline.retrieval.grounding import (
    FOLLOWUPS_SENTINEL,
    AnswerStreamSplitter,
    Evidence,
    build_chat_messages,
    build_context_block,
    clean_title,
    heuristic_title,
    parse_followups,
)


def _feed_all(splitter: AnswerStreamSplitter, deltas: list[str]) -> str:
    visible = "".join(splitter.feed(d) for d in deltas)
    return visible + splitter.finish()


def test_splitter_separates_prose_from_followups() -> None:
    splitter = AnswerStreamSplitter()
    visible = _feed_all(splitter, ["Answer text ", FOLLOWUPS_SENTINEL, "\n- one\n- two\n- three"])
    assert visible.strip() == "Answer text"
    assert splitter.followups == ["one", "two", "three"]


def test_splitter_handles_sentinel_split_across_deltas() -> None:
    splitter = AnswerStreamSplitter()
    # The sentinel arrives one character at a time, interleaved with prose.
    deltas = ["Grounded answer."] + list(FOLLOWUPS_SENTINEL) + ["\n- next question"]
    visible = _feed_all(splitter, deltas)
    assert visible == "Grounded answer."
    assert splitter.followups == ["next question"]


def test_splitter_without_sentinel_flushes_all_prose() -> None:
    splitter = AnswerStreamSplitter()
    visible = _feed_all(splitter, ["No follow", "ups here at all"])
    assert visible == "No followups here at all"
    assert splitter.followups == []


def test_parse_followups_tolerates_numbering_and_blank_lines() -> None:
    raw = "\n1. First question\n\n2) Second question\n- Third question\n"
    assert parse_followups(raw) == ["First question", "Second question", "Third question"]


def test_parse_followups_caps_at_four() -> None:
    raw = "\n".join(f"- q{i}" for i in range(10))
    assert len(parse_followups(raw)) == 4


def test_heuristic_title_cleans_and_truncates() -> None:
    assert heuristic_title("how does auth work?") == "How does auth work"
    long = heuristic_title("a " * 60)
    assert long.endswith("…")
    assert len(long) <= 62


def test_clean_title_strips_wrapping_punctuation() -> None:
    assert clean_title('"Authentication Flow".') == "Authentication Flow"
    assert clean_title("`OCR Pipeline`") == "OCR Pipeline"


def test_context_block_forbids_general_knowledge_when_empty() -> None:
    block = build_context_block("acme/app", "How does billing work?", [])
    assert "How does billing work?" in block
    assert "general knowledge" in block.lower()


def test_context_block_numbers_evidence_and_includes_excerpts() -> None:
    evidence = [
        Evidence(
            index=1,
            chunk_type="code",
            file_path="auth/service.py",
            symbol_name="issue_token",
            symbol_type="function",
            start_line=10,
            end_line=40,
            excerpt="def issue_token(): ...",
        ),
        Evidence(index=2, chunk_type="symbol", file_path="auth/models.py", symbol_name="User"),
    ]
    block = build_context_block("acme/app", "How are tokens issued?", evidence)
    assert "[1] auth/service.py — issue_token (function) — lines 10–40" in block
    assert "def issue_token(): ..." in block
    assert "[2] auth/models.py — User" in block
    # Name-level evidence with no source is honestly disclosed.
    assert "name-level evidence only" in block


def test_build_chat_messages_layers_system_history_and_question() -> None:
    history = [
        ChatMessage(role="user", content="earlier q"),
        ChatMessage(role="assistant", content="earlier a"),
    ]
    messages = build_chat_messages(
        repo_full_name="acme/app", question="new q", evidence=[], history=history
    )
    assert messages[0].role == "system"
    assert "Blueprint" in messages[0].content
    assert [m.content for m in messages[1:3]] == ["earlier q", "earlier a"]
    assert messages[-1].role == "user"
    assert "new q" in messages[-1].content
