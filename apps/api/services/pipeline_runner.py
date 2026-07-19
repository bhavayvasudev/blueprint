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

Every real stage below is bracketed by `_enter_stage`/`_exit_stage`, which
commit `current_stage`/`stage_started_at` onto the snapshot row (so a
separate request polling `GET .../snapshots/{id}` sees live progress, not
just `indexing`) and log start/complete/elapsed. A stage that runs longer
than `_STAGE_TIMEOUT_SECONDS` is logged as a warning and the run is failed
rather than silently reported `ready` over an abnormally slow or stuck
pass — this is the direct fix for "a repository stuck on STUDYING forever
with zero signal why": previously, a hang anywhere in here had no way to
surface itself short of the whole worker process dying silently.
"""

import logging
import os
import subprocess
import tempfile
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from integrations.embeddings.base import EmbeddingProvider
from integrations.embeddings.registry import get_embedding_provider
from integrations.repository.base import RepositoryProvider
from integrations.repository.registry import get_repository_provider
from models.repository import File, Repository, RepoSnapshot
from models.types import PipelineStage, SnapshotStatus
from pipeline.graph.knowledge import build_knowledge_graph
from pipeline.graph.repository import build_repository_graph
from pipeline.ingestion import discovery
from pipeline.ingestion.discovery import discover_doc_files, find_manifest_directories
from pipeline.ingestion.doc_audit import audit_docs
from pipeline.ingestion.extract import extract_repository
from pipeline.ingestion.manifest import build_manifest
from pipeline.ingestion.readme_extract import read_and_extract
from pipeline.ingestion.route_detection import detect_routes
from pipeline.ingestion.stack_detection import detect_stack
from services.embedding_service import (
    embed_and_persist_repository_code_chunks,
    embed_and_persist_repository_doc_chunks,
)
from services.graph_service import persist_graph
from services.ingestion_service import persist_files

logger = logging.getLogger(__name__)


class SnapshotNotFound(Exception):
    """No `RepoSnapshot` with this ID exists — the job was enqueued for a
    row that's since been removed, or was called with a bad ID directly."""


class CloneFailed(Exception):
    """`git clone`/`git rev-parse` exited non-zero. Deliberately does not
    include the failing command's argv in its message — the clone URL
    embeds a short-lived installation token (DECISIONS.md ADR-024: "never
    logged, never persisted") and argv is exactly where a naïve
    `CalledProcessError` would leak it."""


class StageTimeoutExceeded(Exception):
    """A single pipeline stage ran longer than `_STAGE_TIMEOUT_SECONDS`.

    Deliberately a post-hoc check (raised once the stage call returns), not
    a preemptive kill mid-stage — the stages this guards (extraction, graph
    building) are synchronous, in-process Python with no safe cancellation
    point, and forcibly killing a thread mid-parse risks a corrupt partial
    write, which is worse than a slow one. The clone stage is the one
    genuinely unbounded operation (network I/O) and already gets a real
    preemptive `subprocess` timeout below — this class exists for every
    stage after it."""


_CLONE_TIMEOUT_SECONDS = 120
_STAGE_TIMEOUT_SECONDS = 60

# Stage 4 is network-bound across hundreds of embedding requests, so it gets
# its own far larger budget than the in-process stages (see `_exit_stage`).
_INDEXING_TIMEOUT_SECONDS = 900

# Ceilings on one indexing pass. These bound real cost and real latency: every
# chunk is a paid, rate-limited embedding call, and a monorepo can produce tens
# of thousands. Hitting a ceiling is recorded as `truncated: true` in
# `index_status` and reported to the user as a real, named limitation — never
# silently swallowed, which would be indistinguishable from a repository that
# simply had less code (RULES.md §23).
_MAX_CODE_CHUNKS = 4000
_MAX_DOC_CHUNKS = 1500


def _clone_repository(clone_url: str, branch: str, dest: Path) -> str:
    """Shallow-clones `branch` into `dest` and returns the resulting HEAD
    sha — resolved from the actual clone rather than trusted from an
    earlier lookup, so there's no window for the branch to have moved
    between resolving a sha and cloning it (ARCHITECTURE.md's snapshots
    are meant to reflect a real, fetched commit, not a claimed one).

    `subprocess.run` gets an explicit timeout and `GIT_TERMINAL_PROMPT=0` —
    without either, a stalled connection or a rejected credential (git
    falling back to an interactive username/password prompt with no
    terminal attached) blocks this call, and therefore the whole
    ingestion job, forever."""
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    try:
        subprocess.run(
            ["git", "clone", "--depth", "1", "--branch", branch, "--single-branch", "--quiet",
             clone_url, str(dest)],
            check=True, capture_output=True, timeout=_CLONE_TIMEOUT_SECONDS, env=env,
        )
        result = subprocess.run(
            ["git", "-C", str(dest), "rev-parse", "HEAD"],
            check=True, capture_output=True, text=True, timeout=_CLONE_TIMEOUT_SECONDS, env=env,
        )
    except subprocess.TimeoutExpired:
        raise CloneFailed(
            f"git clone/rev-parse did not complete within {_CLONE_TIMEOUT_SECONDS}s"
        ) from None
    except subprocess.CalledProcessError as exc:
        raise CloneFailed(f"git clone/rev-parse failed with exit code {exc.returncode}") from None
    return result.stdout.strip()


def _enter_stage(db: Session, snapshot: RepoSnapshot, stage: PipelineStage) -> float:
    snapshot.current_stage = stage
    snapshot.stage_started_at = datetime.now(UTC)
    db.commit()
    logger.info("snapshot=%s stage=%s event=start", snapshot.id, stage.value)
    return time.monotonic()


def _record_progress(db: Session, snapshot: RepoSnapshot, progress: dict[str, int]) -> None:
    """Commits real, directly-counted numbers (RULES.md §23: no fabricated
    percentages) as soon as each stage produces them, so a poller watching
    a still-running later stage already sees the earlier stage's counts —
    not just whichever stage happens to be current."""
    snapshot.progress = dict(progress)
    db.commit()


def _exit_stage(
    snapshot: RepoSnapshot,
    stage: PipelineStage,
    started_at: float,
    *,
    budget_seconds: int | None = None,
) -> None:
    """`budget_seconds` is overridable because the Stage 4 indexing stages are
    network-bound over hundreds of embedding requests, not in-process CPU like
    every stage before them — holding them to the same 60s budget would fail
    every repository above toy size. See `_INDEXING_TIMEOUT_SECONDS`.

    `None` resolves to `_STAGE_TIMEOUT_SECONDS` at call time rather than as a
    default argument value: a default binds once at definition, which would
    silently ignore any later reassignment of the module global — including
    the monkeypatch the timeout test uses to prove this guard fires at all."""
    if budget_seconds is None:
        budget_seconds = _STAGE_TIMEOUT_SECONDS
    elapsed = time.monotonic() - started_at
    if elapsed > budget_seconds:
        logger.warning(
            "snapshot=%s stage=%s event=exceeded_budget elapsed=%.1fs budget=%ss",
            snapshot.id, stage.value, elapsed, budget_seconds,
        )
        raise StageTimeoutExceeded(
            f"{stage.value} took {elapsed:.1f}s, exceeding the {budget_seconds}s budget"
        )
    logger.info("snapshot=%s stage=%s event=complete elapsed=%.1fs", snapshot.id, stage.value, elapsed)


def _read_text(path: Path) -> str | None:
    """Best-effort UTF-8 read. A file that isn't decodable text isn't
    indexable content, and one unreadable file must never fail a whole
    repository's indexing pass — it's skipped and counted."""
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None


def _readme_first(repo_root: Path, doc_paths: list[Path]) -> list[Path]:
    """README first, then everything else in stable sorted order. Ordering is
    load-bearing, not cosmetic: `_MAX_DOC_CHUNKS` truncates from the end, and
    the README is the single document repository-level questions lean on most
    (`services/thread_retrieval._MANIFEST_CARD_ORDER`). A truncated pass must
    never be the one that drops it."""
    def sort_key(path: Path) -> tuple[int, str]:
        relative = path.relative_to(repo_root).as_posix()
        is_root_readme = "/" not in relative and path.stem.upper() == "README"
        return (0 if is_root_readme else 1, relative)

    return sorted(doc_paths, key=sort_key)


def _index_chunks(
    db: Session,
    snapshot: RepoSnapshot,
    *,
    clone_path: Path,
    facts: list[Any],
    files_by_path: dict[str, File],
    embedding_provider: EmbeddingProvider,
    progress: dict[str, int],
) -> dict[str, object]:
    """Stage 4: chunk and embed the repository's docs and code so hybrid
    retrieval has something to retrieve.

    Returns the `index_status` payload persisted on the snapshot:

        {"docs_discovered": int, "doc_chunks": int, "code_chunks": int,
         "readme_indexed": bool, "provider": str, "model": str,
         "truncated": bool, "error": str | None}

    A failure here is deliberately *not* fatal to the sync. Everything Stages
    1-3 produced — the Knowledge Graph, the Repository Graph, the manifest —
    is independently useful and already committed; failing the whole study
    because an embedding provider was down would throw all of it away and
    leave the repository unusable rather than partly usable. The error is
    recorded verbatim in `index_status` instead, which is what lets retrieval
    tell the user "embeddings failed: <reason>" rather than the far less
    honest "I couldn't retrieve repository context" (PRODUCT.md §5).
    """
    status: dict[str, object] = {
        "docs_discovered": 0,
        "doc_chunks": 0,
        "code_chunks": 0,
        "readme_indexed": False,
        "provider": type(embedding_provider).__name__,
        "model": embedding_provider.model_name,
        "truncated": False,
        "error": None,
    }

    # --- Docs first: the README is the highest-value evidence in the repo.
    current = PipelineStage.INDEXING_DOCS
    started = _enter_stage(db, snapshot, current)
    try:
        doc_paths = _readme_first(clone_path, list(discover_doc_files(clone_path)))
        status["docs_discovered"] = len(doc_paths)

        documents: list[tuple[str, str]] = []
        for path in doc_paths:
            text = _read_text(path)
            if text and text.strip():
                documents.append((path.relative_to(clone_path).as_posix(), text))

        doc_rows, doc_truncated = embed_and_persist_repository_doc_chunks(
            db, embedding_provider, snapshot.id, documents, max_chunks=_MAX_DOC_CHUNKS
        )
        status["doc_chunks"] = len(doc_rows)
        status["truncated"] = bool(status["truncated"]) or doc_truncated
        # Recorded from the rows that were actually written, not from the
        # file having been discovered — discovery and successful indexing are
        # different claims, and only the second one makes the README
        # retrievable.
        status["readme_indexed"] = any(
            "/" not in row.source_path and row.source_path.upper().startswith("README")
            for row in doc_rows
        )
        progress["doc_chunks_indexed"] = len(doc_rows)
        _record_progress(db, snapshot, progress)
        db.commit()
        _exit_stage(snapshot, current, started, budget_seconds=_INDEXING_TIMEOUT_SECONDS)
    except Exception as exc:
        db.rollback()
        logger.exception("snapshot=%s stage=%s event=failed", snapshot.id, current.value)
        status["error"] = f"{current.value}: {exc}"[:500]
        return status

    # --- Then code.
    current = PipelineStage.INDEXING_CODE
    started = _enter_stage(db, snapshot, current)
    try:
        sources: list[tuple[File, Any, str]] = []
        for file_facts in facts:
            file_row = files_by_path.get(file_facts.path)
            if file_row is None:
                continue
            text = _read_text(clone_path / file_facts.path)
            if text:
                sources.append((file_row, file_facts, text))

        code_rows, code_truncated = embed_and_persist_repository_code_chunks(
            db, embedding_provider, sources, max_chunks=_MAX_CODE_CHUNKS
        )
        status["code_chunks"] = len(code_rows)
        status["truncated"] = bool(status["truncated"]) or code_truncated
        progress["code_chunks_indexed"] = len(code_rows)
        _record_progress(db, snapshot, progress)
        db.commit()
        _exit_stage(snapshot, current, started, budget_seconds=_INDEXING_TIMEOUT_SECONDS)
    except Exception as exc:
        db.rollback()
        logger.exception("snapshot=%s stage=%s event=failed", snapshot.id, current.value)
        status["error"] = f"{current.value}: {exc}"[:500]

    return status


def run_ingestion_pipeline(
    db: Session,
    *,
    snapshot_id: uuid.UUID,
    provider: RepositoryProvider | None = None,
    embedding_provider: EmbeddingProvider | None = None,
) -> None:
    """The pure orchestration function — takes its `Session` explicitly so
    tests (and `run_ingestion_job`) control the transaction boundary.
    `embedding_provider` is injectable on the same principle as `provider`,
    so a test can exercise Stage 4 without network or credentials.
    ARCHITECTURE.md §16: a failure is caught here and recorded against
    this snapshot (`status=failed`); it never touches a prior snapshot's
    rows, since every write this function makes is scoped to
    `snapshot_id` alone."""
    snapshot = db.get(RepoSnapshot, snapshot_id)
    if snapshot is None:
        raise SnapshotNotFound(f"No snapshot {snapshot_id}")

    repository = db.get(Repository, snapshot.repository_id)
    assert repository is not None  # FK guarantees this

    logger.info(
        "snapshot=%s stage=repository_selected event=start repository=%s",
        snapshot.id, repository.full_name,
    )
    progress: dict[str, int] = {}
    current_stage: PipelineStage | None = None

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

            current_stage = PipelineStage.CLONING
            started = _enter_stage(db, snapshot, current_stage)
            sha = _clone_repository(credentials.clone_url, repository.default_branch, clone_path)
            snapshot.commit_sha = sha
            db.flush()
            # No `_STAGE_TIMEOUT_SECONDS` check here: `_clone_repository`
            # already enforces its own real, preemptive `_CLONE_TIMEOUT_SECONDS`
            # (120s) subprocess timeout, which is the actual protection —
            # this just logs completion on the same start/elapsed contract
            # every other stage uses.
            elapsed = time.monotonic() - started
            logger.info(
                "snapshot=%s stage=%s event=complete elapsed=%.1fs sha=%s",
                snapshot.id, current_stage.value, elapsed, sha[:7],
            )

            current_stage = PipelineStage.DISCOVERING_FILES
            started = _enter_stage(db, snapshot, current_stage)
            source_files = list(discovery.discover_source_files(clone_path))
            manifest_dirs = find_manifest_directories(clone_path)
            progress["files_discovered"] = len(source_files)
            progress["manifest_directories"] = len(manifest_dirs)
            _record_progress(db, snapshot, progress)
            _exit_stage(snapshot, current_stage, started)

            current_stage = PipelineStage.DETECTING_STACK
            started = _enter_stage(db, snapshot, current_stage)
            stack = detect_stack(clone_path, source_files, manifest_dirs)
            snapshot.detected_stack = {
                "languages": [{"name": lang.name, "file_count": lang.file_count} for lang in stack.languages],
                "frameworks": [
                    {"name": fw.name, "category": fw.category, "manifest_path": fw.manifest_path}
                    for fw in stack.frameworks
                ],
            }
            progress["languages_detected"] = len(stack.languages)
            progress["frameworks_detected"] = len(stack.frameworks)
            _record_progress(db, snapshot, progress)
            _exit_stage(snapshot, current_stage, started)

            current_stage = PipelineStage.PARSING
            started = _enter_stage(db, snapshot, current_stage)
            facts = extract_repository(clone_path)
            progress["files_parsed"] = len(facts)
            progress["symbols_parsed"] = sum(
                len(f.functions) + len(f.classes) + sum(len(c.methods) for c in f.classes)
                for f in facts
            )
            _record_progress(db, snapshot, progress)
            _exit_stage(snapshot, current_stage, started)

            current_stage = PipelineStage.DETECTING_ROUTES
            started = _enter_stage(db, snapshot, current_stage)
            routes = detect_routes(clone_path, source_files)
            snapshot.api_routes = {
                "count": len(routes),
                "routes": [
                    {"method": r.method, "path": r.path, "file": r.file} for r in routes[:50]
                ],
            }
            progress["api_routes_discovered"] = len(routes)
            _record_progress(db, snapshot, progress)
            _exit_stage(snapshot, current_stage, started)

            current_stage = PipelineStage.PERSISTING
            started = _enter_stage(db, snapshot, current_stage)
            files_by_path = persist_files(db, snapshot, facts)
            _exit_stage(snapshot, current_stage, started)

            current_stage = PipelineStage.BUILDING_KNOWLEDGE_GRAPH
            started = _enter_stage(db, snapshot, current_stage)
            knowledge_nodes, knowledge_edges = build_knowledge_graph(facts)
            persist_graph(db, snapshot.id, knowledge_nodes, knowledge_edges, files_by_path)
            progress["knowledge_graph_nodes"] = len(knowledge_nodes)
            progress["knowledge_graph_edges"] = len(knowledge_edges)
            _record_progress(db, snapshot, progress)
            _exit_stage(snapshot, current_stage, started)

            current_stage = PipelineStage.BUILDING_REPOSITORY_GRAPH
            started = _enter_stage(db, snapshot, current_stage)
            repository_nodes, repository_edges = build_repository_graph(
                knowledge_nodes, knowledge_edges, manifest_dirs
            )
            persist_graph(db, snapshot.id, repository_nodes, repository_edges, files_by_path)
            progress["repository_graph_nodes"] = len(repository_nodes)
            progress["repository_graph_edges"] = len(repository_edges)
            _record_progress(db, snapshot, progress)
            _exit_stage(snapshot, current_stage, started)

            current_stage = PipelineStage.AUDITING_DOCS
            started = _enter_stage(db, snapshot, current_stage)
            audit = audit_docs(clone_path, source_files, api_route_count=len(routes))
            snapshot.doc_audit = {"present": audit.present, "missing": audit.missing}
            progress["docs_present"] = len(audit.present)
            progress["docs_missing"] = len(audit.missing)
            _record_progress(db, snapshot, progress)
            _exit_stage(snapshot, current_stage, started)

            # Repository Manifest — composed from the detections above plus a
            # verbatim README parse, while the clone is still mounted. The
            # first-class evidence source for repository-level Threads
            # questions (services/thread_retrieval.py). Real, checkable,
            # LLM-free — same discipline as every detector it draws on.
            current_stage = PipelineStage.BUILDING_MANIFEST
            started = _enter_stage(db, snapshot, current_stage)
            readme = read_and_extract(clone_path)
            snapshot.manifest = build_manifest(
                full_name=repository.full_name,
                readme=readme,
                detected_stack=snapshot.detected_stack,
                api_routes=snapshot.api_routes,
                doc_audit=snapshot.doc_audit,
                repository_nodes=repository_nodes,
                source_files=source_files,
                repo_root=clone_path,
            )
            progress["readme_indexed"] = 1 if readme else 0
            _record_progress(db, snapshot, progress)
            _exit_stage(snapshot, current_stage, started)

            # Stage 4 — inside the clone context, since chunking needs the
            # real file contents. Runs last because everything above is
            # cheap, deterministic and local, while this is the slow,
            # network-bound, and only failure-tolerant stage: by the time it
            # runs, a failure costs the repository its retrieval, not its
            # study. `_index_chunks` swallows its own errors by design and
            # reports them through `index_status`.
            current_stage = PipelineStage.INDEXING_DOCS
            index_status = _index_chunks(
                db,
                snapshot,
                clone_path=clone_path,
                facts=facts,
                files_by_path=files_by_path,
                embedding_provider=embedding_provider or get_embedding_provider(),
                progress=progress,
            )
            snapshot.index_status = index_status
            db.commit()
            logger.info(
                "snapshot=%s stage=indexing event=complete doc_chunks=%s code_chunks=%s "
                "readme_indexed=%s error=%s",
                snapshot.id, index_status["doc_chunks"], index_status["code_chunks"],
                index_status["readme_indexed"], index_status["error"],
            )

        snapshot.status = SnapshotStatus.READY
        snapshot.current_stage = None
        snapshot.stage_started_at = None
        snapshot.completed_at = datetime.now(UTC)
        repository.last_synced_sha = sha
        repository.last_synced_at = datetime.now(UTC)
        db.commit()
        logger.info("snapshot=%s stage=finalize event=status_changed status=ready", snapshot.id)
    except Exception as exc:
        db.rollback()
        failed_snapshot = db.get(RepoSnapshot, snapshot_id)
        assert failed_snapshot is not None
        failed_snapshot.status = SnapshotStatus.FAILED
        failed_snapshot.current_stage = None
        failed_snapshot.stage_started_at = None
        failed_snapshot.completed_at = datetime.now(UTC)
        # Bounded length: an unexpected exception's message could in theory
        # embed something it shouldn't (RULES.md §22) — the same
        # "never leak the argv/URL" discipline `CloneFailed` already
        # applies, extended defensively to any exception type.
        stage_label = current_stage.value if current_stage else "startup"
        failed_snapshot.error_message = f"{stage_label}: {exc}"[:500]
        db.commit()
        logger.error("snapshot=%s stage=%s event=failed error=%s", snapshot_id, stage_label, exc)
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
