"""Threads orchestration: the CRUD behind the thread list, and the grounded
streaming answer that is the room's whole point (ARCHITECTURE.md §13's
Stage-11 exception — a light request-path retrieval + one LLM call, never
the full reasoning pipeline). Business logic lives here; the route
(`api/v1/threads.py`) stays thin (RULES.md §6) and is the only thing that
knows the yielded `StreamEvent`s become `text/event-stream` frames.

The grounding contract, restated because it is the product: the model only
ever sees the repository evidence `thread_retrieval.retrieve_evidence`
genuinely surfaced, and is told to cite nothing else and to admit when that
evidence is insufficient. Blueprint answering "I couldn't find that in this
repository" is a correct outcome here, not a failure — an ungrounded answer
would be the failure (PRODUCT.md: calibrated trust)."""

import logging
import uuid
from collections.abc import Iterator

from sqlalchemy import select
from sqlalchemy.orm import Session

from integrations.embeddings.base import EmbeddingProvider
from integrations.llm.base import ChatMessage, ChatProvider, Role
from models.repository import Repository, RepoSnapshot, User
from models.thread import Thread, ThreadMessage
from models.types import MessageRole, MessageStatus, SnapshotStatus, ThreadStatus
from pipeline.retrieval.grounding import (
    AnswerStreamSplitter,
    Evidence,
    StreamEvent,
    build_chat_messages,
    build_title_messages,
    clean_title,
    heuristic_title,
)
from pipeline.retrieval.intent import (
    QuestionIntent,
    build_intent_messages,
    classify_intent,
    parse_intent,
)
from services.thread_retrieval import RetrievalDiagnostic, retrieve_evidence

logger = logging.getLogger(__name__)

# Thread memory: how many prior messages to feed back as context so an
# investigation continues rather than restarts (PRODUCT-spec: "Blueprint
# continues using the previous investigation instead of starting over").
# Bounded so a long thread doesn't blow the prompt budget.
_HISTORY_MESSAGES = 6
_EVIDENCE_LIMIT = 8

# The honest suggestion set for the two degraded paths (repo not studied, or
# no reasoning model configured) — the same starter questions the empty
# state shows, since there's no investigation-specific context to derive
# sharper ones from yet.
_STARTER_FOLLOWUPS = [
    "Explain this project",
    "How does authentication work?",
    "Show the API endpoints",
    "Where does the app start?",
]


class ThreadNotFound(Exception):
    """No thread with this ID exists for this repository/user — a dedicated
    type, like `SnapshotNotFound`, so the route maps it to a 404 rather than
    a bare 500."""


# The empty-state starter chips (PRODUCT-spec examples). A curated static
# set on purpose: with no investigation yet, there is no thread-specific
# context to derive sharper questions from — the *follow-ups* after each
# answer are the model-generated, repository-specific ones. Kept behind a
# function so per-repo derivation (from a snapshot's detected stack/routes)
# is a one-place change later, not a route rewrite.
_STARTER_SUGGESTIONS = [
    "Explain this project",
    "How does authentication work?",
    "Where does the application start?",
    "Show the API endpoints",
    "Explain the architecture",
    "Find technical debt",
    "Generate an onboarding guide",
    "What are the main services?",
]


def starter_suggestions(db: Session, *, repository: Repository) -> list[str]:
    return list(_STARTER_SUGGESTIONS)


def list_threads(db: Session, *, user: User, repository: Repository) -> list[Thread]:
    """Pinned first, then most-recently-active — the Apple-Notes ordering the
    thread list renders (PRODUCT-spec)."""
    return list(
        db.execute(
            select(Thread)
            .where(Thread.repository_id == repository.id, Thread.user_id == user.id)
            .order_by(Thread.pinned.desc(), Thread.updated_at.desc())
        )
        .scalars()
        .all()
    )


def get_thread(db: Session, *, user: User, repository: Repository, thread_id: uuid.UUID) -> Thread:
    thread = db.execute(
        select(Thread).where(
            Thread.id == thread_id,
            Thread.repository_id == repository.id,
            Thread.user_id == user.id,
        )
    ).scalar_one_or_none()
    if thread is None:
        raise ThreadNotFound(f"No thread {thread_id} for this repository")
    return thread


def create_thread(
    db: Session, *, user: User, repository: Repository, first_question: str | None = None
) -> Thread:
    """A new investigation. The title starts as a cleaned form of the first
    question (instant, never "New Chat") and is refined by the model on the
    first answer. An empty thread (no first_question) is allowed — the empty
    state opens one before anything is asked."""
    title = heuristic_title(first_question) if first_question else "New investigation"
    thread = Thread(
        repository_id=repository.id, user_id=user.id, title=title, status=ThreadStatus.EXPLORING
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


def update_thread(
    db: Session,
    *,
    thread: Thread,
    pinned: bool | None = None,
    title: str | None = None,
    status: ThreadStatus | None = None,
) -> Thread:
    if pinned is not None:
        thread.pinned = pinned
    if title is not None:
        thread.title = title.strip()[:120] or thread.title
    if status is not None:
        thread.status = status
    db.commit()
    db.refresh(thread)
    return thread


def delete_thread(db: Session, *, thread: Thread) -> None:
    db.delete(thread)
    db.commit()


def _latest_ready_snapshot(db: Session, repository: Repository) -> RepoSnapshot | None:
    return db.execute(
        select(RepoSnapshot)
        .where(
            RepoSnapshot.repository_id == repository.id,
            RepoSnapshot.status == SnapshotStatus.READY,
        )
        .order_by(RepoSnapshot.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()


def _history(thread: Thread, *, exclude_id: uuid.UUID) -> list[ChatMessage]:
    """The last few turns as chat messages, so the model continues the
    investigation. Excludes the just-inserted current question (it becomes
    the grounded final turn instead)."""
    prior = [m for m in thread.messages if m.id != exclude_id and m.content.strip()]
    trimmed = prior[-_HISTORY_MESSAGES:]
    role_map: dict[MessageRole, Role] = {
        MessageRole.USER: "user",
        MessageRole.ASSISTANT: "assistant",
    }
    return [ChatMessage(role=role_map[m.role], content=m.content) for m in trimmed]


def _resolve_intent(chat_provider: ChatProvider | None, question: str) -> QuestionIntent:
    """The two-tier intent decision (`pipeline/retrieval/intent.py`):
    deterministic rules first; on an abstention, one LLM classification when a
    provider exists; `CODE` otherwise. Never fatal — a misclassification only
    picks a less-ideal retrieval strategy, and `CODE` (the hybrid path) is
    correct for any question, so any failure here degrades to it silently."""
    intent = classify_intent(question)
    if intent is not None:
        return intent
    if chat_provider is None:
        return QuestionIntent.CODE
    try:
        raw = chat_provider.complete(build_intent_messages(question), max_tokens=8)
        return parse_intent(raw) or QuestionIntent.CODE
    except Exception:
        logger.warning("thread intent classification failed; defaulting to CODE", exc_info=True)
        return QuestionIntent.CODE


def _refine_title(chat_provider: ChatProvider, question: str) -> str | None:
    """Best-effort intelligent title ("Authentication Flow") from the first
    question. Never fatal — a title is cosmetic, and the heuristic one is
    already in place — so any failure just leaves that fallback."""
    try:
        raw = chat_provider.complete(build_title_messages(question), max_tokens=24)
        cleaned = clean_title(raw)
        return cleaned or None
    except Exception:
        logger.warning("thread title refinement failed; keeping heuristic title", exc_info=True)
        return None


def _no_evidence_answer(repo_full_name: str, diagnostic: RetrievalDiagnostic) -> str:
    """The written answer for a question that retrieved nothing — built from
    the checked diagnostic, so it names the real cause and the real remedy.

    Deliberately composed here rather than asked of the model: the model has
    no evidence by definition in this branch, so anything it wrote about
    *why* would be invention — precisely the failure mode this whole path
    exists to remove (PRODUCT.md §5, calibrated trust)."""
    detail = diagnostic.detail or "Nothing in this repository matched the question."
    remedy = diagnostic.remedy or ""
    lines = [
        "## Summary",
        f"I have no grounded evidence to answer this from, and here is exactly why: {detail}",
        "",
        "## What Blueprint checked",
        f"- Searchable code chunks: **{diagnostic.code_chunks_available}**",
        f"- Searchable documentation chunks: **{diagnostic.doc_chunks_available}**",
        f"- README indexed: **{'yes' if diagnostic.readme_indexed else 'no'}**",
    ]
    if diagnostic.error:
        lines += ["", f"The underlying error was: `{diagnostic.error}`"]
    if remedy:
        lines += ["", "## What to do", remedy]
    lines += [
        "",
        f"Blueprint only answers from what a completed study of **{repo_full_name}** "
        "actually found — it will not guess at an answer it cannot trace to a file.",
    ]
    return "\n".join(lines)


def _persist_answer(
    db: Session,
    *,
    thread: Thread,
    message: ThreadMessage,
    content: str,
    evidence: list[Evidence],
    followups: list[str],
    status: MessageStatus,
    thread_status: ThreadStatus,
) -> None:
    message.content = content
    message.evidence = [e.model_dump() for e in evidence]
    message.followups = followups
    message.status = status
    thread.status = thread_status
    db.commit()


def stream_answer(
    db: Session,
    *,
    thread: Thread,
    question: str,
    embedding_provider: EmbeddingProvider,
    chat_provider: ChatProvider | None,
) -> Iterator[StreamEvent]:
    """Persist the question, ground it in real repository evidence, and
    stream the answer as `StreamEvent`s. The `phase` events describe *real*
    work (searching the graph, reading matched modules, composing) with real
    counts — repository thinking, not a fake typing indicator (PRODUCT.md
    bans "performed cognition")."""
    question = question.strip()
    user_msg = ThreadMessage(
        thread_id=thread.id,
        role=MessageRole.USER,
        content=question,
        status=MessageStatus.COMPLETE,
    )
    db.add(user_msg)
    db.commit()
    db.refresh(thread)
    is_first_answer = not any(m.role == MessageRole.ASSISTANT for m in thread.messages)

    yield StreamEvent(event="phase", data={"phase": "searching", "label": "Searching the knowledge graph"})

    snapshot = (
        db.get(RepoSnapshot, thread.snapshot_id) if thread.snapshot_id else None
    ) or _latest_ready_snapshot(db, thread.repository)
    if snapshot is None:
        yield from _degraded_answer(
            db,
            thread=thread,
            text=(
                "## Summary\nThis repository hasn't finished being studied yet, so I have no "
                "grounded evidence to answer from.\n\n## Explanation\nThreads answers are traced "
                "to real files and symbols from a completed study of "
                f"**{thread.repository.full_name}**. Run a sync from the Atlas and, once it "
                "reaches *ready*, ask again — I'll answer from what the study actually found, "
                "not from guesswork."
            ),
            thread_status=ThreadStatus.NEEDS_CONTEXT,
            is_first_answer=is_first_answer,
            question=question,
            chat_provider=chat_provider,
        )
        return

    if thread.snapshot_id is None:
        thread.snapshot_id = snapshot.id
        db.commit()

    intent = _resolve_intent(chat_provider, question)
    result = retrieve_evidence(
        db, snapshot=snapshot, query=question,
        embedding_provider=embedding_provider, limit=_EVIDENCE_LIMIT,
        intent=intent,
    )
    evidence, diagnostic = result.evidence, result.diagnostic
    reading_label = (
        f"Reading {len(evidence)} matched {'module' if len(evidence) == 1 else 'modules'}"
        if evidence
        else "No matching modules found in the study"
    )
    yield StreamEvent(event="phase", data={"phase": "reading", "label": reading_label})
    yield StreamEvent(event="evidence", data={"evidence": [e.model_dump() for e in evidence]})
    # Always emitted, success included: the client renders coverage caveats
    # (a truncated index, a missing README) next to a *good* answer too, not
    # only on failure.
    yield StreamEvent(event="diagnostic", data=diagnostic.to_dict())

    # No evidence at all: answer from the diagnostic rather than handing an
    # empty context to the model and letting it improvise a reason. This is
    # the fix for Threads' single worst behaviour — replying "I couldn't
    # retrieve repository context" to every question, which was true but told
    # the user nothing about which of six very different causes it was, or
    # what to do about any of them.
    if not evidence:
        yield from _degraded_answer(
            db,
            thread=thread,
            text=_no_evidence_answer(thread.repository.full_name, diagnostic),
            thread_status=ThreadStatus.NEEDS_CONTEXT,
            is_first_answer=is_first_answer,
            question=question,
            chat_provider=chat_provider,
        )
        return

    if chat_provider is None:
        yield from _degraded_answer(
            db,
            thread=thread,
            text=(
                "## Summary\nNo reasoning model is configured for this deployment, so I can't "
                "compose a written answer — but the repository evidence your question matches is "
                "shown above.\n\n## Explanation\nEach citation opens the file and symbol it points "
                "to. Configure a reasoning model (an NVIDIA API key) to have me synthesize these "
                "into an explanation."
            ),
            thread_status=ThreadStatus.NEEDS_CONTEXT,
            is_first_answer=is_first_answer,
            question=question,
            chat_provider=None,
            evidence=evidence,
        )
        return

    yield StreamEvent(event="phase", data={"phase": "generating", "label": "Composing the answer"})
    messages = build_chat_messages(
        repo_full_name=thread.repository.full_name,
        question=question,
        evidence=evidence,
        history=_history(thread, exclude_id=user_msg.id),
        intent=intent,
    )

    assistant_msg = ThreadMessage(
        thread_id=thread.id, role=MessageRole.ASSISTANT, content="", status=MessageStatus.STREAMING
    )
    db.add(assistant_msg)
    db.commit()

    splitter = AnswerStreamSplitter()
    answer = ""
    try:
        for delta in chat_provider.stream_chat(messages, max_tokens=1400):
            visible = splitter.feed(delta)
            if visible:
                answer += visible
                yield StreamEvent(event="token", data={"text": visible})
        tail = splitter.finish()
        if tail:
            answer += tail
            yield StreamEvent(event="token", data={"text": tail})
    except Exception:
        logger.exception("thread=%s answer generation failed", thread.id)
        assistant_msg.content = answer
        assistant_msg.status = MessageStatus.ERROR
        thread.status = ThreadStatus.NEEDS_CONTEXT
        db.commit()
        yield StreamEvent(
            event="error",
            data={"message": "The reasoning model failed while composing this answer. Please try again."},
        )
        return

    followups = splitter.followups
    thread_status = ThreadStatus.ANSWERED if evidence else ThreadStatus.NEEDS_CONTEXT
    _persist_answer(
        db, thread=thread, message=assistant_msg, content=answer.strip(), evidence=evidence,
        followups=followups, status=MessageStatus.COMPLETE, thread_status=thread_status,
    )

    if is_first_answer:
        refined = _refine_title(chat_provider, question)
        if refined:
            thread.title = refined
            db.commit()

    yield StreamEvent(event="followups", data={"questions": followups})
    yield StreamEvent(
        event="done",
        data={
            "message_id": str(assistant_msg.id),
            "thread_id": str(thread.id),
            "title": thread.title,
            "status": str(thread.status),
        },
    )


def _degraded_answer(
    db: Session,
    *,
    thread: Thread,
    text: str,
    thread_status: ThreadStatus,
    is_first_answer: bool,
    question: str,
    chat_provider: ChatProvider | None,
    evidence: list[Evidence] | None = None,
) -> Iterator[StreamEvent]:
    """The honest no-LLM / not-studied-yet path: a real, persisted assistant
    message (streamed for a consistent UI) that says plainly what Blueprint
    can and can't do right now, rather than faking an answer."""
    evidence = evidence or []
    assistant_msg = ThreadMessage(
        thread_id=thread.id, role=MessageRole.ASSISTANT, content="", status=MessageStatus.STREAMING
    )
    db.add(assistant_msg)
    db.commit()

    yield StreamEvent(event="phase", data={"phase": "generating", "label": "Composing the answer"})
    for line in text.split("\n"):
        yield StreamEvent(event="token", data={"text": line + "\n"})

    _persist_answer(
        db, thread=thread, message=assistant_msg, content=text, evidence=evidence,
        followups=_STARTER_FOLLOWUPS, status=MessageStatus.COMPLETE, thread_status=thread_status,
    )
    if is_first_answer and chat_provider is not None:
        refined = _refine_title(chat_provider, question)
        if refined:
            thread.title = refined
            db.commit()

    yield StreamEvent(event="followups", data={"questions": _STARTER_FOLLOWUPS})
    yield StreamEvent(
        event="done",
        data={
            "message_id": str(assistant_msg.id),
            "thread_id": str(thread.id),
            "title": thread.title,
            "status": str(thread.status),
        },
    )
