"""The pure core of a Threads answer: how retrieved repository evidence
becomes a grounded prompt, and how the model's streamed reply is split back
into visible prose and structured follow-ups. Pure and DB-free on purpose
(like `merge_hybrid_results` next door) — every function here is
unit-testable without a database, a snapshot, or a live LLM.

The load-bearing product decision lives in `SYSTEM_PROMPT` and
`build_chat_messages`: the model is handed the *actual* retrieval set as
numbered context and is forbidden to cite anything else. Evidence is not
what the model claims it used — it is what retrieval genuinely surfaced
(`services/thread_retrieval.py`), resolved to real files and symbols. That
is what makes every Threads citation verifiable and clickable, and what
keeps Blueprint honest rather than a codebase-flavoured chatbot
(PRODUCT.md: "Fabricated proof of any kind ... the product's entire value
is calibrated trust").
"""

from typing import Any

from pydantic import BaseModel

from integrations.llm.base import ChatMessage
from pipeline.retrieval.intent import QuestionIntent

# The model ends its answer with this sentinel, then its suggested next
# questions. The streaming layer stops emitting visible tokens at the
# sentinel and captures the rest as follow-ups (`AnswerStreamSplitter`).
FOLLOWUPS_SENTINEL = "<<<FOLLOWUPS>>>"

SYSTEM_PROMPT = """You are Blueprint — an expert software architect who has studied this repository.

How you answer:
- Answer ONLY using the supplied repository context. Never invent files, functions,
  classes, or behavior that the context does not support.
- If the repository evidence is insufficient to answer confidently, say so explicitly
  and plainly. An architect who never says "I don't know" is a salesman.
- Cite repository evidence inline as [n], matching the numbered context you are given.
  Do not cite anything that is not in that numbered list.
- Speak in the calm, precise register of a senior engineer. First person is the voice of
  reasoning only ("I traced this through..."), never of feeling. No emoji, no hype, no filler.

How you format every answer (editorial sections, never one long paragraph):
## Summary
One or two sentences: the direct answer.
## Key Findings
2–5 tight bullets, each a concrete claim grounded in a [n] citation.
## Explanation
2–4 short paragraphs of reasoning with inline [n] citations. Do NOT list files or restate
the evidence — the interface renders the evidence and related files from the retrieval set.
Refer to them only by their [n] markers.

Then, on its own line, output exactly:
<<<FOLLOWUPS>>>
followed by exactly 3 suggested next questions, one per line, each starting with "- ". These
continue this specific investigation into this specific repository — never generic ("tell me
more"), always concrete (a module, a function, a flow worth pulling on next)."""


class Evidence(BaseModel):
    """One resolved citation — a real slice of the repository the answer is
    grounded in. Serialized verbatim into `thread_messages.evidence` (JSONB)
    and returned to the frontend as clickable cards."""

    index: int  # 1-based citation number the prose refers to as [index]
    chunk_type: str  # code | doc | symbol | file — what kind of evidence this is
    file_path: str | None = None
    symbol_name: str | None = None
    symbol_type: str | None = None
    start_line: int | None = None
    end_line: int | None = None
    # The source slice, when we have it (code/doc chunks). None for
    # name-level structural evidence (a knowledge-graph symbol or a file the
    # query matched by path) — honestly marked as such in the prompt so the
    # model reasons at the level the evidence actually supports.
    excerpt: str | None = None
    # Which retrieval backend(s) surfaced this — provenance for the
    # UI-visible disclosure, same spirit as `ScoredChunk.sources`.
    sources: list[str] = []


class StreamEvent(BaseModel):
    """One server-sent event on the answer stream. `event` names the kind
    ("phase" | "evidence" | "token" | "followups" | "done" | "error");
    `data` is its JSON payload. Defined here (transport-agnostic) so the
    service yields these and the route is the only thing that knows they
    become `text/event-stream` frames (RULES.md §6)."""

    event: str
    data: dict[str, Any]


def _format_location(evidence: Evidence) -> str:
    parts: list[str] = []
    if evidence.file_path:
        parts.append(evidence.file_path)
    if evidence.symbol_name:
        symbol = evidence.symbol_name
        if evidence.symbol_type:
            symbol += f" ({evidence.symbol_type})"
        parts.append(symbol)
    if evidence.start_line and evidence.end_line:
        parts.append(f"lines {evidence.start_line}–{evidence.end_line}")
    return " — ".join(parts) if parts else "(unlocated)"


def build_context_block(repo_full_name: str, question: str, evidence: list[Evidence]) -> str:
    """The user-turn payload for the current question: the numbered
    retrieval set followed by the question. This is the only channel through
    which repository facts reach the model — there is no raw-repo side
    channel it could invent from."""
    if not evidence:
        return (
            f'No repository context could be retrieved from "{repo_full_name}" for this '
            "question — the repository may not be fully studied yet, or nothing in it "
            "matches. Do NOT answer from general knowledge. Explain plainly that you "
            "could not find supporting evidence in this repository, and suggest what to "
            "study or which question to ask next.\n\n"
            f"Question: {question}"
        )

    lines = [
        f'Repository context retrieved from "{repo_full_name}" for this question. '
        "Cite these as [1], [2], … and cite nothing else. If they are not sufficient "
        "to answer confidently, say so.\n"
    ]
    for e in evidence:
        lines.append(f"[{e.index}] {_format_location(e)}")
        if e.excerpt:
            lines.append(e.excerpt.strip())
        else:
            lines.append("(name-level evidence only — full source not indexed for this snapshot)")
        lines.append("")
    lines.append(f"Question: {question}")
    return "\n".join(lines)


# One intent-specific steer, prepended to the grounded context. Only for the
# repository-level intents, where the retrieval set leads with the manifest
# (README, tech stack, module rollup) and the answer should *start* from that
# whole-repository evidence rather than the incidental symbols topped up after
# it (services/thread_retrieval.py). `CODE` gets nothing extra — its evidence
# is already the right thing to reason from directly.
_INTENT_GUIDANCE: dict[QuestionIntent, str] = {
    QuestionIntent.OVERVIEW: (
        "This is a repository-overview question. Begin from the README and manifest evidence "
        "below (the [n] cards for the project's description, features, stack and modules); ground "
        "your Summary in what the project actually is and does, then reference implementation "
        "details only as needed.\n\n"
    ),
    QuestionIntent.ARCHITECTURE: (
        "This is an architecture question. Lead from the module/service rollup and structural "
        "evidence below, describing how the parts fit together before drilling into any single "
        "one.\n\n"
    ),
    QuestionIntent.DOCUMENTATION: (
        "This is a documentation question. Prioritize the README and documentation evidence "
        "below over source code when they answer it.\n\n"
    ),
}


def build_chat_messages(
    *,
    repo_full_name: str,
    question: str,
    evidence: list[Evidence],
    history: list[ChatMessage],
    intent: QuestionIntent = QuestionIntent.CODE,
) -> list[ChatMessage]:
    """Assemble the full prompt: system contract, prior turns (thread memory
    — an investigation continues, it doesn't restart), then this question's
    grounded context, optionally prefaced by an intent-specific steer.
    `history` is already trimmed by the caller."""
    messages = [ChatMessage(role="system", content=SYSTEM_PROMPT)]
    messages.extend(history)
    context = build_context_block(repo_full_name, question, evidence)
    guidance = _INTENT_GUIDANCE.get(intent, "")
    messages.append(ChatMessage(role="user", content=guidance + context))
    return messages


class AnswerStreamSplitter:
    """Splits the model's streamed reply at `FOLLOWUPS_SENTINEL`: everything
    before is visible answer prose (streamed to the user token by token);
    everything after is the follow-up block (captured, parsed once complete,
    never shown as answer text). Handles a sentinel that straddles two
    deltas by holding back a short tail until it can't be a partial match."""

    def __init__(self, sentinel: str = FOLLOWUPS_SENTINEL) -> None:
        self._sentinel = sentinel
        self._buffer = ""
        self._in_followups = False
        self._followups_raw = ""

    def feed(self, delta: str) -> str:
        """Consume one delta; return the text safe to show now (possibly "")."""
        if self._in_followups:
            self._followups_raw += delta
            return ""
        self._buffer += delta
        idx = self._buffer.find(self._sentinel)
        if idx != -1:
            visible = self._buffer[:idx]
            self._in_followups = True
            self._followups_raw = self._buffer[idx + len(self._sentinel) :]
            self._buffer = ""
            return visible
        hold = len(self._sentinel) - 1
        if len(self._buffer) > hold:
            emit = self._buffer[:-hold] if hold else self._buffer
            self._buffer = self._buffer[-hold:] if hold else ""
            return emit
        return ""

    def finish(self) -> str:
        """Flush any held-back tail once the stream ends (no sentinel seen)."""
        if self._in_followups:
            return ""
        emit = self._buffer
        self._buffer = ""
        return emit

    @property
    def followups(self) -> list[str]:
        return parse_followups(self._followups_raw)


def parse_followups(raw: str) -> list[str]:
    """Pull the `- question` lines out of the follow-up block, defensively:
    the model may or may not prefix them, may add stray blank lines, may emit
    fewer or more than three. We take what's there and cap it."""
    questions: list[str] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith(("- ", "* ")):
            line = line[2:].strip()
        elif line[:2].isdigit() or (line[:1].isdigit() and line[1:2] in {".", ")"}):
            line = line.split(maxsplit=1)[-1].strip()
        if line:
            questions.append(line)
    return questions[:4]


def heuristic_title(question: str) -> str:
    """The honest fallback title when no LLM is available to generate a
    sharper one — a cleaned, truncated form of the first question. Never
    "New Chat" (the product bans generic titles), but not pretending to be
    the model's smarter "Authentication Flow" either."""
    title = " ".join(question.strip().split())
    title = title.rstrip("?.!").strip()
    if not title:
        return "Untitled investigation"
    if len(title) > 60:
        title = title[:60].rsplit(" ", 1)[0] + "…"
    return title[0].upper() + title[1:]


TITLE_SYSTEM_PROMPT = (
    "You name a repository investigation. Given the first question, reply with a "
    "2–4 word noun-phrase title in Title Case that names the topic — e.g. "
    '"Authentication Flow", "OCR Pipeline", "Database Schema". No quotes, no '
    "punctuation, no trailing period. Just the title."
)


def build_title_messages(question: str) -> list[ChatMessage]:
    return [
        ChatMessage(role="system", content=TITLE_SYSTEM_PROMPT),
        ChatMessage(role="user", content=question),
    ]


def clean_title(raw: str) -> str:
    """Sanitize a model-generated title back to a short, punctuation-free
    line — models sometimes wrap it in quotes or add a trailing period
    despite the instruction. Empty after cleaning means the caller falls
    back to `heuristic_title`."""
    title = " ".join(raw.strip().split())
    # Strip any mix of surrounding quotes/periods/backticks/whitespace at
    # once (order-independent) — models wrap titles inconsistently.
    title = title.strip(" \"'.`")
    if len(title) > 60:
        title = title[:60].rsplit(" ", 1)[0] + "…"
    return title
