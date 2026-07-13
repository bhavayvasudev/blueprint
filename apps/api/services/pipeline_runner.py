"""Sync orchestration (ARCHITECTURE.md §12 `POST /repos/{id}/sync`,
§13: "LangGraph pipeline execution happens exclusively in the worker").

`run_ingestion_pipeline` runs Stages 1-3 only (deterministic extraction,
Knowledge Graph, Repository Graph) — the stages a bare Architecture View
actually reads. Stage 4 (embeddings) is deliberately not part of the
scheduled sync path yet: nothing consumes retrieval until Stage 6 (Feature
Extraction, Phase 2), so running it here would add real latency with zero
current consumer (RULES.md §9's "does this improve a Finding" test, applied
to a pipeline stage rather than a Finding). Wiring Stage 4 into `/sync` is
a follow-up, not a silent gap.

`run_ingestion_job` is the RQ entrypoint (`integrations/queue/rq_queue.py`
references it by dotted path) — it owns its own DB session, since it runs
in the worker process, not inside a request.
"""

import subprocess
import tempfile
import uuid
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from integrations.repository.base import RepositoryProvider
from integrations.repository.registry import get_repository_provider
from models.repository import Repository, RepoSnapshot
from models.types import SnapshotStatus
from pipeline.graph.knowledge import build_knowledge_graph
from pipeline.graph.repository import build_repository_graph
from pipeline.ingestion.discovery import find_manifest_directories
from pipeline.ingestion.extract import extract_repository
from services.graph_service import persist_graph
from services.ingestion_service import persist_files


class SnapshotNotFound(Exception):
    """No `RepoSnapshot` with this ID exists — the job was enqueued for a
    row that's since been removed, or was called with a bad ID directly."""


class CloneFailed(Exception):
    """`git clone`/`git rev-parse` exited non-zero. Deliberately does not
    include the failing command's argv in its message — the clone URL
    embeds a short-lived installation token (DECISIONS.md ADR-024: "never
    logged, never persisted") and argv is exactly where a naïve
    `CalledProcessError` would leak it."""


def _clone_repository(clone_url: str, branch: str, dest: Path) -> str:
    """Shallow-clones `branch` into `dest` and returns the resulting HEAD
    sha — resolved from the actual clone rather than trusted from an
    earlier lookup, so there's no window for the branch to have moved
    between resolving a sha and cloning it (ARCHITECTURE.md's snapshots
    are meant to reflect a real, fetched commit, not a claimed one)."""
    try:
        subprocess.run(
            ["git", "clone", "--depth", "1", "--branch", branch, "--single-branch", "--quiet",
             clone_url, str(dest)],
            check=True, capture_output=True,
        )
        result = subprocess.run(
            ["git", "-C", str(dest), "rev-parse", "HEAD"],
            check=True, capture_output=True, text=True,
        )
    except subprocess.CalledProcessError as exc:
        raise CloneFailed(f"git clone/rev-parse failed with exit code {exc.returncode}") from None
    return result.stdout.strip()


def run_ingestion_pipeline(
    db: Session, *, snapshot_id: uuid.UUID, provider: RepositoryProvider | None = None
) -> None:
    """The pure orchestration function — takes its `Session` explicitly so
    tests (and `run_ingestion_job`) control the transaction boundary.
    ARCHITECTURE.md §16: a failure is caught here and recorded against
    this snapshot (`status=failed`); it never touches a prior snapshot's
    rows, since every write this function makes is scoped to
    `snapshot_id` alone."""
    snapshot = db.get(RepoSnapshot, snapshot_id)
    if snapshot is None:
        raise SnapshotNotFound(f"No snapshot {snapshot_id}")

    repository = db.get(Repository, snapshot.repository_id)
    assert repository is not None  # FK guarantees this

    try:
        repository_provider = provider or get_repository_provider()
        # `get_clone_credentials` takes the provider's own installation
        # identifier (`installations.external_id`), not Blueprint's
        # internal `installations.id` — matching every other
        # RepositoryProvider caller (services/repository_connection_service.py).
        credentials = repository_provider.get_clone_credentials(
            repository.installation.external_id, repository.full_name
        )

        with tempfile.TemporaryDirectory(prefix="blueprint-clone-") as clone_dir:
            clone_path = Path(clone_dir) / "repo"
            sha = _clone_repository(credentials.clone_url, repository.default_branch, clone_path)
            snapshot.commit_sha = sha
            db.flush()

            facts = extract_repository(clone_path)
            manifest_dirs = find_manifest_directories(clone_path)

            files_by_path = persist_files(db, snapshot, facts)

            knowledge_nodes, knowledge_edges = build_knowledge_graph(facts)
            persist_graph(db, snapshot.id, knowledge_nodes, knowledge_edges, files_by_path)

            repository_nodes, repository_edges = build_repository_graph(
                knowledge_nodes, knowledge_edges, manifest_dirs
            )
            persist_graph(db, snapshot.id, repository_nodes, repository_edges, files_by_path)

        snapshot.status = SnapshotStatus.READY
        repository.last_synced_sha = sha
        repository.last_synced_at = datetime.now(UTC)
        db.commit()
    except Exception:
        db.rollback()
        failed_snapshot = db.get(RepoSnapshot, snapshot_id)
        assert failed_snapshot is not None
        failed_snapshot.status = SnapshotStatus.FAILED
        db.commit()
        raise


def run_ingestion_job(snapshot_id: str) -> None:
    """RQ entrypoint (`integrations/queue/rq_queue.py`'s
    `_INGESTION_JOB_PATH`) — runs in the worker process, so it opens and
    closes its own session rather than depending on FastAPI's
    request-scoped `get_session` (ARCHITECTURE.md §13)."""
    from models.db import SessionLocal

    session = SessionLocal()
    try:
        run_ingestion_pipeline(session, snapshot_id=uuid.UUID(snapshot_id))
    finally:
        session.close()
