"""Intent classification routes each question to the right retrieval
strategy. The deterministic tier must nail the spec's example questions; the
tie-break parser must be defensive."""

import pytest

from pipeline.retrieval.intent import (
    QuestionIntent,
    classify_intent,
    parse_intent,
)


@pytest.mark.parametrize(
    "question",
    [
        "What does this repository do?",
        "Explain this project.",
        "Summarize this codebase.",
        "How does this application work?",
        "Give me an overview.",
        "Generate onboarding.",
        "What is this repo?",
    ],
)
def test_overview_questions(question: str) -> None:
    assert classify_intent(question) == QuestionIntent.OVERVIEW


@pytest.mark.parametrize(
    "question",
    [
        "Give me an architecture overview.",
        "How is this repository structured?",
        "What are the dependencies?",
        "Explain the data flow.",
    ],
)
def test_architecture_questions(question: str) -> None:
    assert classify_intent(question) == QuestionIntent.ARCHITECTURE


@pytest.mark.parametrize(
    "question",
    [
        "How do I install this?",
        "Where is the README?",
        "Is this documented?",
        "How to run the project?",
    ],
)
def test_documentation_questions(question: str) -> None:
    assert classify_intent(question) == QuestionIntent.DOCUMENTATION


@pytest.mark.parametrize(
    "question",
    [
        "Where is authentication?",
        "Explain the OCR pipeline.",
        "Show me the API routes.",
        "Find dead code.",
        "Which function parses the invoice?",
    ],
)
def test_code_questions_abstain_for_the_default_path(question: str) -> None:
    # The rules deliberately return None (not CODE) so the caller can try the
    # LLM tie-break before defaulting to the hybrid path.
    assert classify_intent(question) is None


def test_architecture_beats_overview_when_both_could_match() -> None:
    # "explain ... architecture" hits both triggers; architecture wins by order.
    assert classify_intent("Explain the architecture of this project") == QuestionIntent.ARCHITECTURE


def test_parse_intent_is_defensive() -> None:
    assert parse_intent("OVERVIEW") == QuestionIntent.OVERVIEW
    assert parse_intent("  code.\n") == QuestionIntent.CODE
    assert parse_intent("I think this is ARCHITECTURE.") == QuestionIntent.ARCHITECTURE
    assert parse_intent("banana") is None
