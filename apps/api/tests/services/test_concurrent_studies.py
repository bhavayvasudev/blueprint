"""Concurrent repository studies — the scheduling layer only.

Blueprint could previously study exactly one repository at a time, and the
second attempt did not queue, it *failed*. Two things caused that together,
and both are covered here:

1. The worker was a single process, so a second study's job waited in Redis
   behind the first. That part is `worker.py`'s pool and is not testable
   without a real Redis; what *is* testable is everything the pool relies
   on, which is the rest of this file.
2. A waiting snapshot was recorded as `INDEXING` with no `current_stage` —
   the exact shape of a worker that died before its first stage — so
   `snapshot_service`'s 20-second not-started stall budget failed it while
   the first study was still running perfectly. That is
   `test_a_queued_study_is_not_failed_while_another_repository_is_studied`
   below, and it is the regression that matters most.

Nothing here touches Stages 1-4, retrieval, embeddings or the graph
builders. The pipeline is unchanged; only who runs it, and when.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from integrations.queue.rq_queue import JobPresence
from models.installation import Installation
from models.repository import Repository, RepoSnapshot, User
from models.types import (
    AccountType,
    ConnectionStatus,
    InstallationStatus,
    PipelineStage,
    SnapshotStatus,
)
from services import snapshot_service
from services.pipeline_runner import (
    SnapshotAlreadyClaimed,
    StudyCancelled,
    _claim_snapshot,
    _raise_if_cancelled,
)
from services.snapshot_service import (
    SnapshotNotCancellable,
    _mark_queued_lost_if_needed,
    _mark_stalled_if_needed,
    cancel_snapshot,
    get_snapshot,
)


def _repository(db_session: Session, user: User, name: str) -> Repository:
    """A second (third, …) connected repository, so isolation between
    studies can be asserted across genuinely different repositories rather
    than two snapshots of the same one."""
    installation = Installation(
        id=uuid.uuid4(),
        user_id=user.id,
        provider="github",
        external_id=str(uuid.uuid4()),
        account_login="test-account",
        account_type=AccountType.USER,
        status=InstallationStatus.ACTIVE,
    )
    db_session.add(installation)
    db_session.flush()

    repository = Repository(
        id=uuid.uuid4(),
        user_id=user.id,
        installation_id=installation.id,
        github_repo_id=str(uuid.uuid4()),
        full_name=name,
        default_branch="main",
        private=False,
        connection_status=ConnectionStatus.CONNECTED,
    )
    db_session.add(repository)
    db_session.flush()
    return repository


def _queued_snapshot(db_session: Session, repository: Repository, *, age_seconds: int = 0) -> RepoSnapshot:
    snapshot = RepoSnapshot(
        id=uuid.uuid4(),
        repository_id=repository.id,
        commit_sha=None,
        status=SnapshotStatus.QUEUED,
        job_id=str(uuid.uuid4()),
    )
    db_session.add(snapshot)
    db_session.flush()
    if age_seconds:
        snapshot.created_at = datetime.now(UTC) - timedelta(seconds=age_seconds)
        db_session.flush()
    return snapshot


@pytest.fixture
def queue_says(monkeypatch: pytest.MonkeyPatch):
    """Pins what the queue reports, so these tests assert on the scheduler's
    *decision* rather than on a live Redis (this environment has none — see
    docs/MEMORY.md). The real `job_presence` is exercised against Redis in
    the end-to-end verification, not here."""

    def _set(presence: JobPresence, position: int | None = None) -> None:
        monkeypatch.setattr(snapshot_service, "job_presence", lambda job_id: presence)
        monkeypatch.setattr(snapshot_service, "job_queue_position", lambda job_id: position)

    return _set


# --------------------------------------------------------------------------
# The regression: waiting is not dying.
# --------------------------------------------------------------------------


def test_a_queued_study_is_not_failed_while_another_repository_is_studied(
    db_session: Session, user: User, queue_says
) -> None:
    """The bug, stated directly.

    Repository A is mid-study; repository B was synced ten minutes ago and
    is still waiting for a free worker. Ten minutes is thirty times the old
    20-second not-started budget, and under the old model B would have been
    marked `failed` with "the worker process likely crashed or was never
    running" — about a queue that was working exactly as designed.
    """
    repo_a = _repository(db_session, user, "test/alpha")
    repo_b = _repository(db_session, user, "test/beta")

    studying = _queued_snapshot(db_session, repo_a)
    _claim_snapshot(db_session, studying.id)
    db_session.refresh(studying)
    studying.current_stage = PipelineStage.PARSING
    studying.stage_started_at = datetime.now(UTC)
    db_session.flush()

    waiting = _queued_snapshot(db_session, repo_b, age_seconds=600)
    queue_says(JobPresence.LIVE)

    result = _mark_queued_lost_if_needed(db_session, waiting)

    assert result.status == SnapshotStatus.QUEUED
    assert result.error_message is None
    # And the study that *is* running is untouched by the other's existence.
    db_session.refresh(studying)
    assert studying.status == SnapshotStatus.INDEXING


def test_a_queued_study_whose_job_vanished_is_failed(
    db_session: Session, user: User, queue_says
) -> None:
    """Removing the timer must not remove the guarantee. A job the queue has
    no record of will never be picked up by anyone, and saying so is the
    whole point of RULES.md §16."""
    repository = _repository(db_session, user, "test/gamma")
    waiting = _queued_snapshot(db_session, repository, age_seconds=5)
    queue_says(JobPresence.LOST)

    result = _mark_queued_lost_if_needed(db_session, waiting)

    assert result.status == SnapshotStatus.FAILED
    assert "no longer in the queue" in result.error_message
    assert result.completed_at is not None


def test_an_unreachable_queue_never_fails_a_waiting_study(
    db_session: Session, user: User, queue_says
) -> None:
    """A Redis blip proves nothing about a job. Treating "can't tell" as
    "dead" would fail every waiting study across a momentary outage."""
    repository = _repository(db_session, user, "test/delta")
    waiting = _queued_snapshot(db_session, repository, age_seconds=3600)
    queue_says(JobPresence.UNKNOWN)

    result = _mark_queued_lost_if_needed(db_session, waiting)

    assert result.status == SnapshotStatus.QUEUED


def test_the_stall_detector_ignores_queued_snapshots_entirely(
    db_session: Session, user: User
) -> None:
    """The two detectors must not overlap: a queued snapshot has no stage
    and no worker, so the stage-budget detector has nothing to say about
    it and must not fall through to the not-started branch."""
    repository = _repository(db_session, user, "test/epsilon")
    waiting = _queued_snapshot(db_session, repository, age_seconds=86_400)

    assert _mark_stalled_if_needed(db_session, waiting).status == SnapshotStatus.QUEUED


def test_a_claimed_snapshot_that_dies_before_its_first_stage_is_still_failed(
    db_session: Session, user: User
) -> None:
    """The narrowed not-started branch still fires for the case it was built
    for — a worker that took the row and then crashed — and measures from
    the claim, not from creation, so a long queue wait is never charged
    against it."""
    repository = _repository(db_session, user, "test/zeta")
    snapshot = _queued_snapshot(db_session, repository, age_seconds=7200)
    _claim_snapshot(db_session, snapshot.id)
    db_session.refresh(snapshot)
    snapshot.started_at = datetime.now(UTC) - timedelta(
        seconds=snapshot_service._NOT_STARTED_STALL_SECONDS + 30
    )
    db_session.flush()

    result = _mark_stalled_if_needed(db_session, snapshot)

    assert result.status == SnapshotStatus.FAILED
    assert "startup" in result.error_message


def test_a_freshly_claimed_snapshot_is_not_failed_for_its_long_queue_wait(
    db_session: Session, user: User
) -> None:
    """The counterpart: two hours queued then claimed one second ago is a
    healthy study. Measuring the not-started budget from `created_at` would
    fail it instantly."""
    repository = _repository(db_session, user, "test/eta")
    snapshot = _queued_snapshot(db_session, repository, age_seconds=7200)
    _claim_snapshot(db_session, snapshot.id)
    db_session.refresh(snapshot)

    assert _mark_stalled_if_needed(db_session, snapshot).status == SnapshotStatus.INDEXING


# --------------------------------------------------------------------------
# Claiming: exactly one worker per snapshot.
# --------------------------------------------------------------------------


def test_claiming_moves_a_queued_snapshot_to_indexing_and_stamps_started_at(
    db_session: Session, user: User
) -> None:
    repository = _repository(db_session, user, "test/theta")
    snapshot = _queued_snapshot(db_session, repository)

    _claim_snapshot(db_session, snapshot.id)

    db_session.refresh(snapshot)
    assert snapshot.status == SnapshotStatus.INDEXING
    assert snapshot.started_at is not None


def test_a_second_worker_cannot_claim_an_already_claimed_snapshot(
    db_session: Session, user: User
) -> None:
    """The conditional UPDATE is the race guard. Whichever worker's
    statement reaches the row first wins; the second sees `rowcount == 0`
    because the row is no longer `QUEUED`, and declines rather than running
    a duplicate study over the same snapshot's rows."""
    repository = _repository(db_session, user, "test/iota")
    snapshot = _queued_snapshot(db_session, repository)

    _claim_snapshot(db_session, snapshot.id)

    with pytest.raises(SnapshotAlreadyClaimed):
        _claim_snapshot(db_session, snapshot.id)


def test_a_cancelled_snapshot_is_never_claimed(db_session: Session, user: User) -> None:
    """Cancelling before a worker gets to it must actually prevent the
    study, not merely relabel it — the claim is conditional on `QUEUED`, so
    a cancelled row cannot be started."""
    repository = _repository(db_session, user, "test/kappa")
    snapshot = _queued_snapshot(db_session, repository)
    snapshot.status = SnapshotStatus.CANCELLED
    db_session.commit()

    with pytest.raises(SnapshotAlreadyClaimed):
        _claim_snapshot(db_session, snapshot.id)


# --------------------------------------------------------------------------
# Cancellation: one study, and only that one.
# --------------------------------------------------------------------------


def test_cancelling_one_study_leaves_every_other_study_untouched(
    db_session: Session, user: User, queue_says, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The isolation claim, asserted rather than assumed: three studies, one
    cancelled, and the other two carry on in exactly the state they were
    in."""
    monkeypatch.setattr(snapshot_service, "cancel_ingestion_job", lambda job_id: True)
    queue_says(JobPresence.LIVE)

    repo_a = _repository(db_session, user, "test/one")
    repo_b = _repository(db_session, user, "test/two")
    repo_c = _repository(db_session, user, "test/three")

    running = _queued_snapshot(db_session, repo_a)
    _claim_snapshot(db_session, running.id)
    doomed = _queued_snapshot(db_session, repo_b)
    waiting = _queued_snapshot(db_session, repo_c)

    cancelled = cancel_snapshot(db_session, repository=repo_b, snapshot_id=doomed.id)

    assert cancelled.status == SnapshotStatus.CANCELLED
    assert cancelled.completed_at is not None
    db_session.refresh(running)
    db_session.refresh(waiting)
    assert running.status == SnapshotStatus.INDEXING
    assert waiting.status == SnapshotStatus.QUEUED


def test_a_running_study_observes_cancellation_at_its_next_stage_boundary(
    db_session: Session, user: User
) -> None:
    """Cooperative cancellation: the pipeline checks the database, not its
    own in-session copy, because the cancel is written by the API process
    rather than by the worker."""
    repository = _repository(db_session, user, "test/lambda")
    snapshot = _queued_snapshot(db_session, repository)
    _claim_snapshot(db_session, snapshot.id)
    db_session.refresh(snapshot)

    _raise_if_cancelled(db_session, snapshot)  # still running: no raise

    db_session.execute(
        RepoSnapshot.__table__.update()
        .where(RepoSnapshot.id == snapshot.id)
        .values(status=SnapshotStatus.CANCELLED)
    )
    db_session.commit()

    with pytest.raises(StudyCancelled):
        _raise_if_cancelled(db_session, snapshot)


def test_a_finished_study_cannot_be_cancelled(
    db_session: Session, user: User, queue_says
) -> None:
    """409 rather than a false report — telling someone their completed
    study was cancelled would misdescribe what happened."""
    queue_says(JobPresence.UNKNOWN)
    repository = _repository(db_session, user, "test/mu")
    snapshot = _queued_snapshot(db_session, repository)
    snapshot.status = SnapshotStatus.READY
    db_session.commit()

    with pytest.raises(SnapshotNotCancellable):
        cancel_snapshot(db_session, repository=repository, snapshot_id=snapshot.id)


# --------------------------------------------------------------------------
# What the UI reads.
# --------------------------------------------------------------------------


def test_queue_position_is_reported_for_a_waiting_study(
    db_session: Session, user: User, queue_says
) -> None:
    queue_says(JobPresence.LIVE, position=3)
    repository = _repository(db_session, user, "test/nu")
    snapshot = _queued_snapshot(db_session, repository)

    result = get_snapshot(db_session, repository=repository, snapshot_id=snapshot.id)

    assert result.status == SnapshotStatus.QUEUED
    assert result.queue_position == 3


def test_queue_position_is_absent_once_a_worker_claims_the_study(
    db_session: Session, user: User, queue_says
) -> None:
    """A study being worked on is not in a queue, and must not report a
    position — "next up" and "running" are different facts."""
    queue_says(JobPresence.LIVE, position=1)
    repository = _repository(db_session, user, "test/xi")
    snapshot = _queued_snapshot(db_session, repository)
    _claim_snapshot(db_session, snapshot.id)

    result = get_snapshot(db_session, repository=repository, snapshot_id=snapshot.id)

    assert result.status == SnapshotStatus.INDEXING
    assert result.queue_position is None


def test_the_eta_average_excludes_time_a_past_study_spent_queued(
    db_session: Session, user: User, queue_says
) -> None:
    """A busy queue must not permanently inflate a repository's ETA. The
    historical average measures `completed_at - started_at` — real work —
    not `completed_at - created_at`, which would fold in an arbitrary wait.
    """
    queue_says(JobPresence.UNKNOWN)
    repository = _repository(db_session, user, "test/omicron")
    now = datetime.now(UTC)

    finished = RepoSnapshot(
        id=uuid.uuid4(),
        repository_id=repository.id,
        commit_sha="abc",
        status=SnapshotStatus.READY,
        # Queued for an hour, then studied for 60 seconds.
        started_at=now - timedelta(seconds=60),
        completed_at=now,
    )
    db_session.add(finished)
    db_session.flush()
    finished.created_at = now - timedelta(seconds=3660)
    db_session.flush()

    current = _queued_snapshot(db_session, repository)
    _claim_snapshot(db_session, current.id)

    result = get_snapshot(db_session, repository=repository, snapshot_id=current.id)

    assert result.estimated_total_seconds == 60
