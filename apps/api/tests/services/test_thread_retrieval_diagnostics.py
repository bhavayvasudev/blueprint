"""`diagnose_retrieval` is the answer to "when Threads has nothing to say,
why?" — and every one of these cases used to be indistinguishable from the
others, all surfacing as the same useless sentence: "I couldn't retrieve
repository context."

Each test below pins one cause to one reportable reason. The reason a real
Postgres is used rather than mocks (project convention, ADR-022) is that the
diagnostic's whole value is that it counts *actual* rows rather than trusting
`index_status`'s self-report — a mocked session would test the mock.
"""


import pytest
from sqlalchemy.orm import Session

from integrations.embeddings.local_hash import LocalHashEmbeddingProvider
from models.chunks import DocChunk
from models.repository import RepoSnapshot
from models.types import EMBEDDING_DIM, SnapshotStatus
from pipeline.retrieval.intent import QuestionIntent
from services.thread_retrieval import (
    RetrievalFailure,
    diagnose_retrieval,
    retrieve_evidence,
)


@pytest.fixture
def ready_snapshot(db_session: Session, snapshot: RepoSnapshot) -> RepoSnapshot:
    snapshot.status = SnapshotStatus.READY
    db_session.commit()
    return snapshot


def _add_doc_chunk(db: Session, snapshot: RepoSnapshot, source_path: str) -> None:
    db.add(
        DocChunk(
            snapshot_id=snapshot.id,
            source_path=source_path,
            section_title="Overview",
            content="Blueprint explains repositories from real evidence.",
            embedding=LocalHashEmbeddingProvider(dimensions=EMBEDDING_DIM).embed_query("overview"),
        )
    )
    db.commit()


def test_snapshot_predating_stage_4_reports_not_indexed(
    db_session: Session, ready_snapshot: RepoSnapshot
) -> None:
    """A NULL `index_status` with no chunks is not an unknown — it is a
    snapshot studied before indexing existed, and saying so is what tells the
    user a re-sync fixes it."""
    ready_snapshot.index_status = None
    db_session.commit()

    diagnostic = diagnose_retrieval(db_session, snapshot=ready_snapshot, evidence_count=0)

    assert diagnostic.ok is False
    assert diagnostic.failure is RetrievalFailure.NOT_INDEXED
    assert "re-sync" in diagnostic.remedy.lower()


def test_failed_indexing_reports_the_verbatim_provider_error(
    db_session: Session, ready_snapshot: RepoSnapshot
) -> None:
    """"Return WHY" means the real message, not just a category — the
    underlying error is what makes the failure actionable."""
    ready_snapshot.index_status = {
        "error": "indexing_docs: ConnectError: embedding host unreachable",
        "doc_chunks": 0,
        "code_chunks": 0,
        "readme_indexed": False,
    }
    db_session.commit()

    diagnostic = diagnose_retrieval(db_session, snapshot=ready_snapshot, evidence_count=0)

    assert diagnostic.failure is RetrievalFailure.INDEXING_FAILED
    assert "embedding host unreachable" in diagnostic.error


def test_index_claiming_success_with_no_rows_reports_the_contradiction(
    db_session: Session, ready_snapshot: RepoSnapshot
) -> None:
    """`index_status` is a self-report; the chunk tables are the truth. When
    they disagree, the disagreement itself is the finding — believing the
    self-report would hide an interrupted study."""
    ready_snapshot.index_status = {
        "error": None,
        "doc_chunks": 12,
        "code_chunks": 40,
        "readme_indexed": True,
    }
    db_session.commit()

    diagnostic = diagnose_retrieval(db_session, snapshot=ready_snapshot, evidence_count=0)

    assert diagnostic.failure is RetrievalFailure.EMBEDDINGS_MISSING
    assert diagnostic.code_chunks_available == 0


def test_search_backend_failure_outranks_every_coverage_conclusion(
    db_session: Session, ready_snapshot: RepoSnapshot
) -> None:
    """If the search itself broke, we learned nothing about coverage, so no
    claim about the repository's contents is warranted — reporting
    "nothing matched" here would blame the repository for a system fault."""
    ready_snapshot.index_status = {"error": None, "readme_indexed": True}
    db_session.commit()

    diagnostic = diagnose_retrieval(
        db_session,
        snapshot=ready_snapshot,
        evidence_count=0,
        search_error="APIConnectionError: connection refused",
    )

    assert diagnostic.failure is RetrievalFailure.VECTOR_SEARCH_FAILED
    assert "connection refused" in diagnostic.error
    assert "system fault" in diagnostic.remedy


def test_healthy_index_with_no_match_is_reported_as_a_real_answer(
    db_session: Session, ready_snapshot: RepoSnapshot
) -> None:
    """The one failure that isn't a fault: everything works, the question just
    isn't answerable from this repository. Distinguishing it from the five
    system-level causes above is the entire point of this module."""
    ready_snapshot.index_status = {"error": None, "readme_indexed": True, "truncated": False}
    _add_doc_chunk(db_session, ready_snapshot, "README.md")

    diagnostic = diagnose_retrieval(db_session, snapshot=ready_snapshot, evidence_count=0)

    assert diagnostic.failure is RetrievalFailure.RETRIEVAL_EMPTY
    assert diagnostic.doc_chunks_available == 1


def test_truncated_index_is_a_caveat_on_success_not_a_failure(
    db_session: Session, ready_snapshot: RepoSnapshot
) -> None:
    """A partial index that still answered the question is a good outcome
    carrying a real limitation. It must stay `ok` — otherwise a working
    answer would be presented to the user as a broken one."""
    ready_snapshot.index_status = {"error": None, "readme_indexed": True, "truncated": True}
    _add_doc_chunk(db_session, ready_snapshot, "README.md")

    diagnostic = diagnose_retrieval(db_session, snapshot=ready_snapshot, evidence_count=3)

    assert diagnostic.ok is True
    assert diagnostic.failure is RetrievalFailure.INDEXING_TRUNCATED


def test_retrieve_evidence_reports_a_retriever_crash_without_losing_evidence(
    db_session: Session, ready_snapshot: RepoSnapshot
) -> None:
    """A dead embedding provider must degrade to the structural fallback and
    still say what broke — the failure and the partial result are both real,
    and reporting only one of them loses information the user needs."""

    class ExplodingEmbeddings:
        model_name = "exploding"
        dimensions = EMBEDDING_DIM

        def embed_documents(self, texts: list[str]) -> list[list[float]]:
            raise RuntimeError("embedding backend unreachable")

        def embed_query(self, text: str) -> list[float]:
            raise RuntimeError("embedding backend unreachable")

    result = retrieve_evidence(
        db_session,
        snapshot=ready_snapshot,
        query="how does authentication work",
        embedding_provider=ExplodingEmbeddings(),
        limit=5,
        intent=QuestionIntent.CODE,
    )

    assert result.diagnostic.failure is RetrievalFailure.VECTOR_SEARCH_FAILED
    assert "embedding backend unreachable" in result.diagnostic.error
