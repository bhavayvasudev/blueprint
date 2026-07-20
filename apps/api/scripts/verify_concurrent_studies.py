"""Verification harness: prove that several repositories really are studied
at the same time, by a real worker pool, over a real queue.

This is not a unit test and is not part of the suite. It exists because the
claim "Blueprint can study N repositories concurrently" is about processes,
Redis and scheduling — none of which the pytest suite exercises, since that
runs everything in one process against one database connection.

What is real here: Redis, the RQ queue, `worker.py`'s `WorkerPool` and its
N OS processes, the Postgres database, the snapshot lifecycle
(queued -> claimed -> stages -> ready), and the full Stage 1-4 pipeline
including embeddings (the default `local_hash` provider, so no network or
credentials are needed).

The one substitution: repositories are cloned from throwaway local git
repositories instead of GitHub, injected through `run_ingestion_pipeline`'s
existing `provider=` parameter — the same seam `tests/services/
test_pipeline_runner.py` already uses. Nothing about scheduling,
concurrency or isolation is faked.

Every row this creates is deleted at the end (`--keep` opts out). The dev
database is not a scratch space; see tests/conftest.py for what happened
the last time something here wrote permanent rows.

Usage:

    # terminal 1
    MAX_CONCURRENT_STUDIES=3 uv run python worker.py

    # terminal 2
    uv run python scripts/verify_concurrent_studies.py --repos 5
"""

from __future__ import annotations

import argparse
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from redis import Redis  # noqa: E402
from rq import Queue  # noqa: E402
from sqlalchemy import delete, select  # noqa: E402

from config import get_settings  # noqa: E402
from integrations.repository.base import (  # noqa: E402
    CloneCredentials,
    InstallationMetadata,
    RepositoryMetadata,
)
from models.chunks import CodeChunk, DocChunk  # noqa: E402
from models.db import SessionLocal  # noqa: E402
from models.graph import GraphEdge, GraphNode  # noqa: E402
from models.installation import Installation  # noqa: E402
from models.repository import File, Repository, RepoSnapshot, User  # noqa: E402
from models.types import (  # noqa: E402
    AccountType,
    ConnectionStatus,
    InstallationStatus,
    SnapshotStatus,
)

FIXTURE_REPO = Path(__file__).resolve().parent.parent / "tests" / "pipeline" / "ingestion" / "fixtures" / "sample_repo"

_TERMINAL = {SnapshotStatus.READY, SnapshotStatus.FAILED, SnapshotStatus.CANCELLED}


class LocalPathProvider:
    """A `RepositoryProvider` that clones from a filesystem path.

    Exists only so this harness needs no GitHub App credentials. It is
    injected into `run_ingestion_pipeline` exactly where the real provider
    would go, so every other part of the pipeline — including the clone
    itself, which is a real `git clone` subprocess — runs unchanged.
    """

    provider_name = "local"

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


def run_local_study_job(snapshot_id: str, clone_url: str) -> None:
    """The enqueued job, resolved by dotted path inside each worker process.

    A thin wrapper around the real `run_ingestion_job`: same session
    handling, same claim, same pipeline, same terminal statuses — only the
    provider differs.
    """
    from services.pipeline_runner import (
        SnapshotAlreadyClaimed,
        run_ingestion_pipeline,
    )

    logger = logging.getLogger(__name__)
    session = SessionLocal()
    try:
        run_ingestion_pipeline(
            session,
            snapshot_id=uuid.UUID(snapshot_id),
            provider=LocalPathProvider(clone_url),
        )
    except SnapshotAlreadyClaimed as exc:
        logger.info("declining job: %s", exc)
    finally:
        session.close()


def _seed_git_repo(root: Path, name: str) -> Path:
    """A real local git repository on `main`, seeded from the same fixture
    the pipeline tests use, plus a file unique to this repository so the
    studies are demonstrably not identical work."""
    repo_dir = root / name
    shutil.copytree(FIXTURE_REPO, repo_dir)
    (repo_dir / f"{name}_marker.py").write_text(
        f'"""Unique to {name}."""\n\n\ndef {name}_entrypoint():\n    return "{name}"\n',
        encoding="utf-8",
    )
    env = {
        **os.environ,
        "GIT_AUTHOR_NAME": "Blueprint Verify",
        "GIT_AUTHOR_EMAIL": "verify@example.com",
        "GIT_COMMITTER_NAME": "Blueprint Verify",
        "GIT_COMMITTER_EMAIL": "verify@example.com",
    }
    for args in (
        ("init", "--quiet", "--initial-branch=main"),
        ("add", "-A"),
        ("commit", "--quiet", "-m", f"seed {name}"),
    ):
        subprocess.run(["git", *args], cwd=repo_dir, check=True, capture_output=True, env=env)
    return repo_dir


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repos", type=int, default=5, help="how many repositories to study at once")
    parser.add_argument("--timeout", type=int, default=300, help="seconds to wait for all studies")
    parser.add_argument("--keep", action="store_true", help="do not delete the rows this creates")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    settings = get_settings()
    print(f"worker pool size (MAX_CONCURRENT_STUDIES): {settings.worker_count}")
    print(f"repositories to study:                     {args.repos}")
    if args.repos > settings.worker_count:
        print(f"-> expect {args.repos - settings.worker_count} to queue behind the pool\n")
    else:
        print("-> expect all of them to run concurrently\n")

    connection = Redis.from_url(settings.redis_url)
    connection.ping()
    queue = Queue("ingestion", connection=connection)

    workspace = Path(tempfile.mkdtemp(prefix="blueprint-verify-"))
    session = SessionLocal()
    created_snapshot_ids: list[uuid.UUID] = []
    created_repo_ids: list[uuid.UUID] = []
    user_id: uuid.UUID | None = None
    installation_id: uuid.UUID | None = None

    try:
        marker = uuid.uuid4().hex[:8]
        user = User(
            id=uuid.uuid4(),
            github_id=f"verify-{marker}",
            email=f"verify-{marker}@example.com",
            name="Verification Harness",
        )
        session.add(user)
        session.flush()
        user_id = user.id

        installation = Installation(
            id=uuid.uuid4(),
            user_id=user.id,
            provider="local",
            external_id=f"verify-{marker}",
            account_login="verify",
            account_type=AccountType.USER,
            status=InstallationStatus.ACTIVE,
        )
        session.add(installation)
        session.flush()
        installation_id = installation.id

        # --- Enqueue every study back-to-back, as a user clicking Sync on
        #     several repositories in a row would.
        for index in range(args.repos):
            name = f"repo{index}"
            clone_path = _seed_git_repo(workspace, name)
            repository = Repository(
                id=uuid.uuid4(),
                user_id=user.id,
                installation_id=installation.id,
                github_repo_id=f"verify-{marker}-{index}",
                full_name=f"verify/{name}",
                default_branch="main",
                private=False,
                connection_status=ConnectionStatus.CONNECTED,
            )
            session.add(repository)
            session.flush()
            created_repo_ids.append(repository.id)

            snapshot = RepoSnapshot(
                id=uuid.uuid4(),
                repository_id=repository.id,
                commit_sha=None,
                status=SnapshotStatus.QUEUED,
            )
            session.add(snapshot)
            session.flush()
            snapshot.job_id = str(snapshot.id)
            session.commit()
            created_snapshot_ids.append(snapshot.id)

            queue.enqueue(
                "scripts.verify_concurrent_studies.run_local_study_job",
                str(snapshot.id),
                str(clone_path),
                job_id=str(snapshot.id),
                job_timeout=2400,
            )
            print(f"enqueued verify/{name}  snapshot={snapshot.id}")

        print("\nwatching (q=queued  S=studying  R=ready  F=failed  C=cancelled)\n")

        # --- Watch. The point of the readout is the middle column: how many
        #     studies are in `indexing` at the same instant.
        deadline = time.monotonic() + args.timeout
        max_concurrent = 0
        ever_queued_while_studying = False
        while time.monotonic() < deadline:
            session.expire_all()
            rows = session.execute(
                select(RepoSnapshot.id, RepoSnapshot.status, RepoSnapshot.current_stage)
                .where(RepoSnapshot.id.in_(created_snapshot_ids))
                .order_by(RepoSnapshot.created_at)
            ).all()

            statuses = [SnapshotStatus(status) for _, status, _ in rows]
            studying = sum(1 for s in statuses if s == SnapshotStatus.INDEXING)
            queued = sum(1 for s in statuses if s == SnapshotStatus.QUEUED)
            max_concurrent = max(max_concurrent, studying)
            if studying > 0 and queued > 0:
                ever_queued_while_studying = True

            glyphs = {
                SnapshotStatus.QUEUED: "q",
                SnapshotStatus.INDEXING: "S",
                SnapshotStatus.READY: "R",
                SnapshotStatus.FAILED: "F",
                SnapshotStatus.CANCELLED: "C",
            }
            line = " ".join(glyphs[s] for s in statuses)
            stage = next((str(st) for _, s, st in rows if st and SnapshotStatus(s) == SnapshotStatus.INDEXING), "")
            print(f"  [{line}]  studying={studying} queued={queued}  {stage[:28]:<28}", end="\r")

            if all(s in _TERMINAL for s in statuses):
                break
            time.sleep(0.5)

        print("\n")

        # --- Report.
        session.expire_all()
        final = session.execute(
            select(RepoSnapshot, Repository.full_name)
            .join(Repository, Repository.id == RepoSnapshot.repository_id)
            .where(RepoSnapshot.id.in_(created_snapshot_ids))
            .order_by(RepoSnapshot.created_at)
        ).all()

        print(f"{'repository':<20} {'status':<10} {'files':>6} {'chunks':>7}  queued  studied")
        ok = True
        for snapshot, full_name in final:
            file_ids = [
                row[0]
                for row in session.execute(select(File.id).where(File.snapshot_id == snapshot.id)).all()
            ]
            file_count = len(file_ids)
            # `code_chunks` hangs off `files`, not off the snapshot directly
            # (models/chunks.py), so it is reached through this study's files.
            code_chunks = (
                len(session.execute(select(CodeChunk.id).where(CodeChunk.file_id.in_(file_ids))).all())
                if file_ids
                else 0
            )
            chunk_count = code_chunks + len(
                session.execute(select(DocChunk.id).where(DocChunk.snapshot_id == snapshot.id)).all()
            )
            queue_wait = (
                (snapshot.started_at - snapshot.created_at).total_seconds()
                if snapshot.started_at
                else 0.0
            )
            study_time = (
                (snapshot.completed_at - snapshot.started_at).total_seconds()
                if snapshot.started_at and snapshot.completed_at
                else 0.0
            )
            status = SnapshotStatus(snapshot.status)
            if status != SnapshotStatus.READY:
                ok = False
            print(
                f"{full_name:<20} {status.value:<10} {file_count:>6} {chunk_count:>7}"
                f"  {queue_wait:>5.1f}s  {study_time:>6.1f}s"
            )
            if snapshot.error_message:
                print(f"  error: {snapshot.error_message}")

        print()
        print(f"peak concurrent studies observed: {max_concurrent}")
        print(f"queueing observed while studying: {ever_queued_while_studying}")

        expected_peak = min(args.repos, settings.worker_count)
        if max_concurrent < 2 and args.repos >= 2 and settings.worker_count >= 2:
            print("\nFAIL: never saw two studies running at once.")
            ok = False
        elif max_concurrent < expected_peak:
            # Not a failure: short studies can finish before the next is
            # observed, so the peak is a lower bound on real concurrency.
            print(
                f"note: peak {max_concurrent} < pool size {expected_peak} — studies may have "
                "completed faster than the 0.5s sampling interval."
            )
        print("\nRESULT:", "PASS" if ok else "FAIL")
        return 0 if ok else 1

    finally:
        if args.keep:
            print(f"\n--keep: rows left in place; clones under {workspace}")
        else:
            session.rollback()
            for snapshot_id in created_snapshot_ids:
                # Children before parents, and `code_chunks` before `files`
                # since it references them.
                session.execute(
                    delete(CodeChunk).where(
                        CodeChunk.file_id.in_(select(File.id).where(File.snapshot_id == snapshot_id))
                    )
                )
                for model in (DocChunk, GraphEdge, GraphNode, File):
                    session.execute(delete(model).where(model.snapshot_id == snapshot_id))
                session.execute(delete(RepoSnapshot).where(RepoSnapshot.id == snapshot_id))
            for repository_id in created_repo_ids:
                session.execute(delete(Repository).where(Repository.id == repository_id))
            if installation_id:
                session.execute(delete(Installation).where(Installation.id == installation_id))
            if user_id:
                session.execute(delete(User).where(User.id == user_id))
            session.commit()
            shutil.rmtree(workspace, ignore_errors=True)
            print("cleaned up every row and clone this harness created")
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
