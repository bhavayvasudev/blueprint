"""`services.pipeline_runner` orchestrates Stages 1-3 against a cloned
repository (ARCHITECTURE.md §12 `POST /repos/{id}/sync`). These tests clone
a real, local, throwaway git repository (built from the same fixture
`pipeline/ingestion/extract.py`'s own tests use) via a real `git clone`
subprocess call — no mocking of git itself, matching this project's
"real execution over mocks" testing philosophy (see docs/MEMORY.md's
ADR-022 entry) — and exercise the full clone -> extract -> graph ->
persist -> status transition path against a real (pgserver-backed)
database.
"""

import shutil
import subprocess
import uuid
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from integrations.repository.base import CloneCredentials, InstallationMetadata, RepositoryMetadata
from models.chunks import CodeChunk, DocChunk
from models.graph import GraphEdge, GraphNode
from models.repository import File, Repository, RepoSnapshot
from models.types import EMBEDDING_DIM, GraphType, SnapshotStatus, StructuralConfidence
from services.pipeline_runner import CloneFailed, run_ingestion_pipeline

FIXTURE_REPO = Path(__file__).parent.parent / "pipeline" / "ingestion" / "fixtures" / "sample_repo"

_GIT_ENV = {
    "GIT_AUTHOR_NAME": "Blueprint Test",
    "GIT_AUTHOR_EMAIL": "test@example.com",
    "GIT_COMMITTER_NAME": "Blueprint Test",
    "GIT_COMMITTER_EMAIL": "test@example.com",
}


class FakeRepositoryProvider:
    provider_name = "fake"

    def __init__(self, clone_url: str) -> None:
        self._clone_url = clone_url

    def get_installation(self, installation_id: str) -> InstallationMetadata:
        raise NotImplementedError

    def list_repositories(self, installation_id: str) -> list[RepositoryMetadata]:
        raise NotImplementedError

    def get_repository(self, installation_id: str, full_name: str) -> RepositoryMetadata:
        raise NotImplementedError

    def get_clone_credentials(self, installation_id: str, full_name: str) -> CloneCredentials:
        return CloneCredentials(clone_url=self._clone_url, expires_at=datetime.now())


@pytest.fixture
def local_git_repo(tmp_path: Path) -> Iterator[Path]:
    """A real, local git repository on `main`, seeded with the same
    fixture files `pipeline/ingestion/extract.py`'s own tests use —
    cloneable via a plain filesystem path, no network involved."""
    repo_dir = tmp_path / "origin"
    shutil.copytree(FIXTURE_REPO, repo_dir)

    def run(*args: str) -> None:
        import os

        env = {**os.environ, **_GIT_ENV}
        subprocess.run(["git", *args], cwd=repo_dir, check=True, capture_output=True, env=env)

    run("init", "--quiet", "--initial-branch=main")
    run("add", "-A")
    run("commit", "--quiet", "-m", "seed fixture repo")
    yield repo_dir


def test_run_ingestion_pipeline_persists_files_and_both_graphs(
    db_session: Session, snapshot: RepoSnapshot, local_git_repo: Path
) -> None:
    provider = FakeRepositoryProvider(str(local_git_repo))

    run_ingestion_pipeline(db_session, snapshot_id=snapshot.id, provider=provider)

    db_session.refresh(snapshot)
    assert snapshot.status == SnapshotStatus.READY
    assert snapshot.commit_sha is not None
    assert len(snapshot.commit_sha) == 40  # a real, resolved git sha, not a placeholder

    repository = db_session.get(Repository, snapshot.repository_id)
    assert repository is not None
    assert repository.last_synced_sha == snapshot.commit_sha
    assert repository.last_synced_at is not None

    files = db_session.query(File).filter(File.snapshot_id == snapshot.id).all()
    paths = {f.path for f in files}
    assert paths == {
        "importer.py",
        "legacy/Old.java",
        "main.py",
        "service/server.go",
        "utils/helper.py",
        "web/app.tsx",
        "web/component.tsx",
    }
    # The heuristic-fallback Java file is tagged low structural confidence
    # (ARCHITECTURE.md §4); everything Tree-sitter-supported is full.
    by_path = {f.path: f for f in files}
    assert by_path["legacy/Old.java"].structural_confidence == StructuralConfidence.LOW
    assert by_path["main.py"].structural_confidence == StructuralConfidence.FULL

    knowledge_nodes = (
        db_session.query(GraphNode)
        .filter(GraphNode.snapshot_id == snapshot.id, GraphNode.graph_type == GraphType.KNOWLEDGE)
        .all()
    )
    repository_nodes = (
        db_session.query(GraphNode)
        .filter(GraphNode.snapshot_id == snapshot.id, GraphNode.graph_type == GraphType.REPOSITORY)
        .all()
    )
    assert len(knowledge_nodes) > len(files)  # functions/classes on top of one node per file
    assert {n.label for n in repository_nodes} == {".", "legacy", "utils", "web", "service"}

    knowledge_edges = (
        db_session.query(GraphEdge)
        .filter(GraphEdge.snapshot_id == snapshot.id, GraphEdge.graph_type == GraphType.KNOWLEDGE)
        .all()
    )
    assert any(e.edge_type == "imports" for e in knowledge_edges)


def test_run_ingestion_pipeline_records_real_progress_counts_and_clears_stage_on_success(
    db_session: Session, snapshot: RepoSnapshot, local_git_repo: Path
) -> None:
    """These numbers are the exact reason `progress` exists: a live poller
    should see real, directly-counted numbers (RULES.md §23) as each stage
    finishes, not a fabricated percentage. `current_stage`/`stage_started_at`
    are only meaningful mid-run — a `ready` snapshot has neither set."""
    provider = FakeRepositoryProvider(str(local_git_repo))

    run_ingestion_pipeline(db_session, snapshot_id=snapshot.id, provider=provider)

    db_session.refresh(snapshot)
    assert snapshot.current_stage is None
    assert snapshot.stage_started_at is None
    assert snapshot.error_message is None
    assert snapshot.completed_at is not None
    # The manifest stage ran and composed a real card from the detections.
    assert snapshot.manifest is not None
    assert snapshot.manifest["full_name"] == snapshot.repository.full_name
    progress = snapshot.progress
    assert progress is not None
    assert progress.keys() == {
        "files_discovered",
        "manifest_directories",
        "languages_detected",
        "frameworks_detected",
        "files_parsed",
        "symbols_parsed",
        "api_routes_discovered",
        "knowledge_graph_nodes",
        "knowledge_graph_edges",
        "repository_graph_nodes",
        "repository_graph_edges",
        "docs_present",
        "docs_missing",
        "readme_indexed",
        # Stage 4 — chunk counts are real rows written, not an estimate.
        "doc_chunks_indexed",
        "code_chunks_indexed",
    }
    # Known-exact against the fixture repo (7 source files; pyproject.toml/
    # package.json/go.mod under utils, web, service = 3 manifest dirs; 5
    # rolled-up modules matches this same test file's existing assertion
    # of `{".", "legacy", "utils", "web", "service"}`).
    assert progress["files_discovered"] == 7
    assert progress["files_parsed"] == 7
    assert progress["manifest_directories"] == 3
    assert progress["repository_graph_nodes"] == 5
    assert progress["symbols_parsed"] > 0
    assert progress["knowledge_graph_nodes"] > 0
    assert progress["knowledge_graph_edges"] > 0
    assert progress["repository_graph_edges"] > 0
    assert progress["languages_detected"] > 0
    assert progress["docs_present"] + progress["docs_missing"] > 0

    # `detect_stack`/`detect_routes`/`audit_docs`'s real, directly-computed
    # output — shapes documented in `pipeline/ingestion/*.py`, never
    # LLM-generated (RULES.md §23).
    assert snapshot.detected_stack is not None
    assert "languages" in snapshot.detected_stack
    assert "frameworks" in snapshot.detected_stack
    assert snapshot.api_routes is not None
    assert "count" in snapshot.api_routes
    assert snapshot.doc_audit is not None
    assert set(snapshot.doc_audit.keys()) == {"present", "missing"}


def test_run_ingestion_pipeline_indexes_docs_and_code_for_retrieval(
    db_session: Session, snapshot: RepoSnapshot, local_git_repo: Path
) -> None:
    """Stage 4's regression test, and the one that matters most here.

    Before Stage 4 was wired into `/sync`, `code_chunks` and `doc_chunks` were
    empty for every snapshot in every environment, so hybrid retrieval could
    not return a single row no matter the question — the Threads room replied
    "I couldn't retrieve repository context" to everything. Asserting the
    chunks exist *and* that the README specifically is among them is the check
    that would have caught it: a repository whose README isn't retrievable
    cannot answer a repository-level question at all.
    """
    provider = FakeRepositoryProvider(str(local_git_repo))

    run_ingestion_pipeline(db_session, snapshot_id=snapshot.id, provider=provider)

    db_session.refresh(snapshot)
    assert snapshot.status == SnapshotStatus.READY

    doc_chunks = db_session.query(DocChunk).filter(DocChunk.snapshot_id == snapshot.id).all()
    code_chunks = (
        db_session.query(CodeChunk)
        .join(File, File.id == CodeChunk.file_id)
        .filter(File.snapshot_id == snapshot.id)
        .all()
    )
    assert doc_chunks, "no doc chunks indexed — the README is not retrievable"
    assert code_chunks, "no code chunks indexed — hybrid retrieval has nothing to search"

    indexed_docs = {c.source_path for c in doc_chunks}
    assert "README.md" in indexed_docs
    assert "docs/overview.md" in indexed_docs
    # Vendored prose must not become repository evidence: the fixture ships a
    # `node_modules/` directory, and discovery's exclusion list is the only
    # thing keeping its contents out of the index.
    assert not any(path.startswith("node_modules/") for path in indexed_docs)

    # Every chunk carries a real vector of the configured width — the
    # dimension agreement that pgvector would otherwise reject at insert.
    assert all(len(c.embedding) == EMBEDDING_DIM for c in doc_chunks)

    status = snapshot.index_status
    assert status is not None
    assert status["readme_indexed"] is True
    assert status["error"] is None
    assert status["doc_chunks"] == len(doc_chunks)
    assert status["code_chunks"] == len(code_chunks)


def test_run_ingestion_pipeline_survives_an_embedding_provider_failure(
    db_session: Session, snapshot: RepoSnapshot, local_git_repo: Path
) -> None:
    """Stage 4 is the only failure-tolerant stage, deliberately: everything
    Stages 1-3 produced is independently useful and already committed, so a
    dead embedding provider must cost the repository its retrieval, not its
    entire study. The reason is recorded verbatim rather than swallowed —
    that recorded reason is what retrieval later reports to the user."""

    class ExplodingEmbeddingProvider:
        model_name = "exploding"
        dimensions = EMBEDDING_DIM

        def embed_documents(self, texts: list[str]) -> list[list[float]]:
            raise RuntimeError("embedding backend unreachable")

        def embed_query(self, text: str) -> list[float]:
            raise RuntimeError("embedding backend unreachable")

    provider = FakeRepositoryProvider(str(local_git_repo))

    run_ingestion_pipeline(
        db_session,
        snapshot_id=snapshot.id,
        provider=provider,
        embedding_provider=ExplodingEmbeddingProvider(),
    )

    db_session.refresh(snapshot)
    # The study still succeeded — graphs and manifest are intact.
    assert snapshot.status == SnapshotStatus.READY
    assert snapshot.manifest is not None
    assert db_session.query(GraphNode).filter(GraphNode.snapshot_id == snapshot.id).count() > 0

    status = snapshot.index_status
    assert status is not None
    assert status["error"] is not None
    assert "embedding backend unreachable" in status["error"]
    assert status["doc_chunks"] == 0


def test_run_ingestion_pipeline_marks_snapshot_failed_on_clone_error(
    db_session: Session, snapshot: RepoSnapshot, tmp_path: Path
) -> None:
    # Commits the fixture-created rows first so that `run_ingestion_pipeline`'s
    # own `db.rollback()` on failure (a real requirement — see
    # ARCHITECTURE.md §16) only reverts its own partial writes, not the
    # snapshot/repository rows themselves; in production these are always
    # already committed (by `sync_service.trigger_sync`) before the job's
    # own session ever begins, so this mirrors that real transaction
    # boundary rather than working around a test-only artifact.
    db_session.commit()
    provider = FakeRepositoryProvider(str(tmp_path / "does-not-exist"))

    with pytest.raises(CloneFailed):
        run_ingestion_pipeline(db_session, snapshot_id=snapshot.id, provider=provider)

    db_session.refresh(snapshot)
    assert snapshot.status == SnapshotStatus.FAILED
    # The whole point of `error_message`: a repository stuck-looking
    # `failed` snapshot now says *which* real stage it died in and why,
    # instead of leaving the frontend/an operator to guess.
    assert snapshot.current_stage is None
    assert snapshot.stage_started_at is None
    assert snapshot.error_message is not None
    assert snapshot.error_message.startswith("cloning:")


def test_run_ingestion_pipeline_fails_when_a_stage_exceeds_its_time_budget(
    db_session: Session,
    snapshot: RepoSnapshot,
    local_git_repo: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Forces the budget to 0s so the first non-clone stage to take any
    measurable wall-clock time at all trips it — proving a stage that runs
    long is failed loudly rather than the pipeline silently reporting
    `ready` over an abnormally slow pass. Deliberately doesn't assert
    *which* real stage trips first: at a 0s budget that's a coin flip on
    `time.monotonic()`'s resolution (`discovering_files` on most runs, but
    not guaranteed), and asserting an exact stage here would be testing
    timer jitter, not the behavior this test exists to verify."""
    import services.pipeline_runner as pipeline_runner_module

    monkeypatch.setattr(pipeline_runner_module, "_STAGE_TIMEOUT_SECONDS", 0)
    provider = FakeRepositoryProvider(str(local_git_repo))

    with pytest.raises(pipeline_runner_module.StageTimeoutExceeded):
        run_ingestion_pipeline(db_session, snapshot_id=snapshot.id, provider=provider)

    db_session.refresh(snapshot)
    assert snapshot.status == SnapshotStatus.FAILED
    assert snapshot.current_stage is None
    assert snapshot.stage_started_at is None
    assert snapshot.error_message is not None
    failed_stage = snapshot.error_message.split(":")[0]
    assert failed_stage in {
        "discovering_files",
        "detecting_stack",
        "parsing",
        "detecting_routes",
        "persisting",
        "building_knowledge_graph",
        "building_repository_graph",
        "auditing_docs",
    }


def test_run_ingestion_pipeline_raises_for_unknown_snapshot(db_session: Session) -> None:
    from services.pipeline_runner import SnapshotNotFound

    with pytest.raises(SnapshotNotFound):
        run_ingestion_pipeline(db_session, snapshot_id=uuid.uuid4(), provider=FakeRepositoryProvider("x"))
