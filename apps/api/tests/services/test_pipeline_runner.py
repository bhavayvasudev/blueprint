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
from models.graph import GraphEdge, GraphNode
from models.repository import File, Repository, RepoSnapshot
from models.types import GraphType, SnapshotStatus, StructuralConfidence
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


def test_run_ingestion_pipeline_raises_for_unknown_snapshot(db_session: Session) -> None:
    from services.pipeline_runner import SnapshotNotFound

    with pytest.raises(SnapshotNotFound):
        run_ingestion_pipeline(db_session, snapshot_id=uuid.uuid4(), provider=FakeRepositoryProvider("x"))
