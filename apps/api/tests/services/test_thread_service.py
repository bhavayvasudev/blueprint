"""Integration tests for the Threads service against a real Postgres (see
tests/conftest.py). Uses a stub `ChatProvider` so the grounding, evidence
resolution, persistence, and event stream are verified deterministically —
without a live NVIDIA endpoint. Embeddings use the dependency-free
`LocalHashEmbeddingProvider`.
"""

from collections.abc import Iterator

from sqlalchemy.orm import Session

from integrations.embeddings.local_hash import LocalHashEmbeddingProvider
from integrations.llm.base import ChatMessage
from models.graph import GraphNode
from models.repository import File, RepoSnapshot
from models.types import (
    GraphType,
    MessageRole,
    MessageStatus,
    SnapshotStatus,
    StructuralConfidence,
    ThreadStatus,
)
from pipeline.retrieval.grounding import FOLLOWUPS_SENTINEL
from services.thread_service import create_thread, stream_answer


class _StubChat:
    """A deterministic stand-in for the NVIDIA provider: emits a grounded
    answer with a citation, then the follow-up block. `complete` returns a
    fixed title."""

    def __init__(self) -> None:
        self.stream_calls = 0

    def stream_chat(self, messages: list[ChatMessage], **_: object) -> Iterator[str]:
        self.stream_calls += 1
        yield "## Summary\nAccess tokens are issued in generate_access_token [1].\n"
        yield f"{FOLLOWUPS_SENTINEL}\n- Where are refresh tokens made?\n- Show the auth middleware"

    def complete(self, messages: list[ChatMessage], **_: object) -> str:
        return "Authentication Flow"


def _make_ready_snapshot_with_symbol(db: Session, snapshot: RepoSnapshot) -> None:
    snapshot.status = SnapshotStatus.READY
    file_row = File(
        snapshot_id=snapshot.id,
        path="backend/auth/service.py",
        language="python",
        loc=120,
        content_hash="hash-1",
        structural_confidence=StructuralConfidence.FULL,
    )
    db.add(file_row)
    db.flush()
    db.add(
        GraphNode(
            snapshot_id=snapshot.id,
            graph_type=GraphType.KNOWLEDGE,
            node_type="function",
            label="generate_access_token",
            file_id=file_row.id,
        )
    )
    db.flush()


def test_grounded_answer_persists_evidence_and_followups(
    db_session: Session, snapshot: RepoSnapshot
) -> None:
    _make_ready_snapshot_with_symbol(db_session, snapshot)
    thread = create_thread(
        db_session, user=snapshot.repository.user, repository=snapshot.repository
    )
    chat = _StubChat()

    events = list(
        stream_answer(
            db_session,
            thread=thread,
            question="How is the access token generated?",
            embedding_provider=LocalHashEmbeddingProvider(),
            chat_provider=chat,
        )
    )
    kinds = [e.event for e in events]

    assert chat.stream_calls == 1
    assert kinds[0] == "phase"  # repository thinking starts before any token
    assert "evidence" in kinds
    assert "token" in kinds
    assert kinds[-1] == "done"

    # The evidence event carries the real structural citation (a Knowledge
    # Graph symbol), since this snapshot has no chunks yet.
    evidence_event = next(e for e in events if e.event == "evidence")
    evidence = evidence_event.data["evidence"]
    assert any(e["symbol_name"] == "generate_access_token" for e in evidence)

    # The assistant message was persisted with its evidence, follow-ups, and
    # a resolved status — and the thread bound itself to the snapshot.
    db_session.refresh(thread)
    assert thread.snapshot_id == snapshot.id
    assert thread.status == ThreadStatus.ANSWERED
    assert thread.title == "Authentication Flow"  # refined on first answer

    roles = [(m.role, m.status) for m in thread.messages]
    assert (MessageRole.USER, MessageStatus.COMPLETE) in roles
    answer = next(m for m in thread.messages if m.role == MessageRole.ASSISTANT)
    assert answer.status == MessageStatus.COMPLETE
    assert "generate_access_token" in answer.content
    assert FOLLOWUPS_SENTINEL not in answer.content  # sentinel never leaks into prose
    assert answer.followups == ["Where are refresh tokens made?", "Show the auth middleware"]
    assert answer.evidence


def test_no_ready_snapshot_gives_honest_needs_context(
    db_session: Session, snapshot: RepoSnapshot
) -> None:
    # snapshot stays INDEXING (the fixture default) — nothing is READY.
    thread = create_thread(
        db_session, user=snapshot.repository.user, repository=snapshot.repository
    )
    chat = _StubChat()

    events = list(
        stream_answer(
            db_session,
            thread=thread,
            question="How does auth work?",
            embedding_provider=LocalHashEmbeddingProvider(),
            chat_provider=chat,
        )
    )

    assert chat.stream_calls == 0  # never calls the model with nothing to ground on
    assert events[-1].event == "done"
    db_session.refresh(thread)
    assert thread.status == ThreadStatus.NEEDS_CONTEXT
    answer = next(m for m in thread.messages if m.role == MessageRole.ASSISTANT)
    assert "hasn't finished being studied" in answer.content


def test_overview_question_leads_with_the_manifest(
    db_session: Session, snapshot: RepoSnapshot
) -> None:
    _make_ready_snapshot_with_symbol(db_session, snapshot)
    # A studied snapshot carries its precomputed manifest (the pipeline's
    # BUILDING_MANIFEST stage writes this for real).
    snapshot.manifest = {
        "full_name": snapshot.repository.full_name,
        "name": snapshot.repository.full_name.split("/")[-1],
        "readme": {
            "source_path": "README.md",
            "title": "ClaimSight",
            "description": "An AI-powered insurance claims intelligence platform.",
            "features": "- Damage detection\n- Policy validation",
        },
        "tech_stack": {"languages": ["Python"], "frameworks": ["FastAPI"]},
        "entrypoints": ["main.py"],
        "modules": [{"name": "api", "kind": "service"}],
        "api_route_count": 3,
        "doc_audit": {"present": ["README"], "missing": ["Tests"]},
    }
    db_session.flush()

    thread = create_thread(
        db_session, user=snapshot.repository.user, repository=snapshot.repository
    )

    events = list(
        stream_answer(
            db_session,
            thread=thread,
            question="What does this repository do?",  # OVERVIEW by the deterministic rules
            embedding_provider=LocalHashEmbeddingProvider(),
            chat_provider=_StubChat(),
        )
    )

    evidence = next(e for e in events if e.event == "evidence").data["evidence"]
    # The very first citation is the README/manifest, not an incidental symbol.
    assert evidence[0]["chunk_type"] == "manifest"
    assert evidence[0]["file_path"] == "README.md"
    assert "AI-powered insurance claims" in evidence[0]["excerpt"]
    # And the whole-repository cards are present in the grounding set.
    labels = {e.get("symbol_name") for e in evidence if e["chunk_type"] == "manifest"}
    assert {"ClaimSight", "Tech Stack"} <= labels


def test_code_question_ignores_the_manifest(
    db_session: Session, snapshot: RepoSnapshot
) -> None:
    _make_ready_snapshot_with_symbol(db_session, snapshot)
    snapshot.manifest = {"readme": {"source_path": "README.md", "description": "x"}, "modules": []}
    db_session.flush()
    thread = create_thread(
        db_session, user=snapshot.repository.user, repository=snapshot.repository
    )

    events = list(
        stream_answer(
            db_session,
            thread=thread,
            question="How is the access token generated?",  # CODE path, unchanged
            embedding_provider=LocalHashEmbeddingProvider(),
            chat_provider=_StubChat(),
        )
    )

    evidence = next(e for e in events if e.event == "evidence").data["evidence"]
    # No manifest cards leak into a code question's grounding set.
    assert all(e["chunk_type"] != "manifest" for e in evidence)
    assert any(e.get("symbol_name") == "generate_access_token" for e in evidence)


def test_no_llm_configured_still_shows_evidence(
    db_session: Session, snapshot: RepoSnapshot
) -> None:
    _make_ready_snapshot_with_symbol(db_session, snapshot)
    thread = create_thread(
        db_session, user=snapshot.repository.user, repository=snapshot.repository
    )

    events = list(
        stream_answer(
            db_session,
            thread=thread,
            question="How is the access token generated?",
            embedding_provider=LocalHashEmbeddingProvider(),
            chat_provider=None,
        )
    )

    evidence_event = next(e for e in events if e.event == "evidence")
    assert evidence_event.data["evidence"]  # evidence surfaced even without a model
    db_session.refresh(thread)
    assert thread.status == ThreadStatus.NEEDS_CONTEXT
    answer = next(m for m in thread.messages if m.role == MessageRole.ASSISTANT)
    assert "No reasoning model" in answer.content
