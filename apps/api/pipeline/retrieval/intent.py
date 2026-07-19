"""Question-intent classification — the switch that stops Threads from
running one retrieval strategy for every question. A repository-*level*
question ("what does this repo do?") needs repository-wide context (the
README, the manifest, the project's shape); a code question ("where is auth?")
needs the hybrid RAG path. Answering the first from a handful of matched
symbols is the exact failure this module exists to prevent.

Two-tier, by design (chosen approach): deterministic keyword/pattern rules
first — fast, free, unit-testable, and matching the codebase's "every
detection traces to a real rule, never a guess" discipline (`stack_detection`
et al.). When the rules don't match confidently, `classify_intent` returns
`None`, and the caller (`services/thread_service.py`) may fall back to a single
LLM classification when a chat provider is configured — otherwise it defaults
to `CODE`, the strategy that is never *wrong*, only sometimes less optimal.

Pure and DB-free (like `grounding.py` next door): the rules are text-only and
the LLM tie-break is expressed as prompt-building + response-parsing here, with
the actual call made above this layer."""

from __future__ import annotations

import re
from enum import StrEnum

from integrations.llm.base import ChatMessage


class QuestionIntent(StrEnum):
    """What a Threads question is really asking for — the retrieval strategy
    selector, not a UI label. `CODE` is the safe default: the existing hybrid
    pipeline, correct for any question, ideal for symbol-level ones."""

    OVERVIEW = "overview"          # "what does this repo do", "explain this project"
    ARCHITECTURE = "architecture"  # "how is this structured", "the dependencies"
    DOCUMENTATION = "documentation"  # "how do I install", "is this documented"
    CODE = "code"                  # everything else — the hybrid RAG path


# Ordered rules: the first intent whose pattern matches wins. Order encodes
# priority deliberately — an "explain the architecture" question is
# ARCHITECTURE, not the more generic OVERVIEW "explain" trigger, so
# ARCHITECTURE is checked first. Patterns are matched against the lowercased
# question. Kept as one flat, reviewable table (same stance as the detectors).
_RULES: list[tuple[QuestionIntent, re.Pattern[str]]] = [
    (
        QuestionIntent.ARCHITECTURE,
        re.compile(
            r"\b(architecture|architectural|(structured|organi[sz]ed|laid out)\b|"
            r"how is\b.{0,40}\b(structured|organi[sz]ed|laid out)|dependenc(y|ies)|"
            r"data ?flow|component diagram|module structure|system design|design overview)\b"
        ),
    ),
    (
        QuestionIntent.DOCUMENTATION,
        re.compile(
            r"\b(readme|documentation|documented|the docs?|how (do i|to) (install|set ?up|run|configure|"
            r"deploy|build)|installation|getting started|contribut(e|ing)|license|changelog)\b"
        ),
    ),
    (
        QuestionIntent.OVERVIEW,
        re.compile(
            r"\b(what does (this|the) (repo|repository|project|codebase|app|application) do|"
            r"what is (this|the) (repo|repository|project|codebase|app|application)|"
            r"explain (this|the) (project|repo|repository|codebase|app|application)|"
            r"summar(y|i[sz]e)|overview|onboard(ing)?|high[- ]level|purpose of (this|the)|"
            r"how does (this|the) (app|application|project|system|repo|repository|codebase) work|"
            r"tell me about (this|the) (repo|repository|project|codebase|app))\b"
        ),
    ),
]


def classify_intent(question: str) -> QuestionIntent | None:
    """The deterministic tier: the first rule that matches, or `None` when
    nothing matches confidently (the caller's cue to try the LLM tie-break,
    then fall back to `CODE`). Never returns `CODE` itself — `CODE` is the
    absence of a confident non-code match, expressed by the caller as the
    default, so "unmatched" and "confidently code" stay distinguishable."""
    text = " ".join(question.lower().split())
    for intent, pattern in _RULES:
        if pattern.search(text):
            return intent
    return None


# ── LLM tie-break (only reached when the rules abstain and a provider exists) ──

_INTENT_SYSTEM_PROMPT = (
    "You classify a single question a user asked about one software repository. "
    "Reply with EXACTLY ONE of these words and nothing else:\n"
    "OVERVIEW — they want to know what the repository is or does, a summary, or onboarding.\n"
    "ARCHITECTURE — they want the structure, modules, dependencies, or how it fits together.\n"
    "DOCUMENTATION — they want docs, the README, install/setup/run instructions.\n"
    "CODE — anything about specific code: where something is, how a function works, finding logic.\n"
    "Answer with one word: OVERVIEW, ARCHITECTURE, DOCUMENTATION, or CODE."
)

_INTENT_BY_TOKEN = {i.name: i for i in QuestionIntent}


def build_intent_messages(question: str) -> list[ChatMessage]:
    return [
        ChatMessage(role="system", content=_INTENT_SYSTEM_PROMPT),
        ChatMessage(role="user", content=question.strip()),
    ]


def parse_intent(raw: str) -> QuestionIntent | None:
    """Map an LLM classification reply to an intent, defensively — the model
    may add punctuation or a stray word. `None` if nothing recognizable, so
    the caller still falls back to `CODE`."""
    for token in re.findall(r"[A-Za-z]+", raw.upper()):
        if token in _INTENT_BY_TOKEN:
            return _INTENT_BY_TOKEN[token]
    return None
