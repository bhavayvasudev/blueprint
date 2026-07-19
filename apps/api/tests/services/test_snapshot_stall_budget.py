"""The stall detector fails snapshots whose worker has gone silent. Its
budget per stage must track the budget the worker itself enforces for that
stage — if it doesn't, it fails syncs that are running perfectly.

That is not hypothetical: Stage 4 indexing is network-bound across hundreds
of embedding requests and legitimately runs for minutes, while every stage
before it is in-process and budgeted at 60 seconds. Reusing the 60s number
for indexing would have marked every real-sized repository "stalled" mid-sync
and reported "the worker process likely crashed" about a worker that was
busy doing exactly what it was asked to.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from models.repository import RepoSnapshot
from models.types import PipelineStage, SnapshotStatus
from services.pipeline_runner import (
    _CLONE_TIMEOUT_SECONDS,
    _INDEXING_TIMEOUT_SECONDS,
    _STAGE_TIMEOUT_SECONDS,
)
from services.snapshot_service import _mark_stalled_if_needed, _stage_budget_seconds


def test_each_stage_budget_matches_the_worker_that_enforces_it() -> None:
    assert _stage_budget_seconds(PipelineStage.CLONING) == _CLONE_TIMEOUT_SECONDS
    assert _stage_budget_seconds(PipelineStage.PARSING) == _STAGE_TIMEOUT_SECONDS
    assert _stage_budget_seconds(PipelineStage.INDEXING_DOCS) == _INDEXING_TIMEOUT_SECONDS
    assert _stage_budget_seconds(PipelineStage.INDEXING_CODE) == _INDEXING_TIMEOUT_SECONDS


def test_a_long_running_indexing_stage_is_not_mistaken_for_a_crashed_worker(
    db_session: Session, snapshot: RepoSnapshot
) -> None:
    """Five minutes into indexing is normal, not stalled — well past the 60s
    that every earlier stage is held to."""
    snapshot.status = SnapshotStatus.INDEXING
    snapshot.current_stage = PipelineStage.INDEXING_CODE
    snapshot.stage_started_at = datetime.now(UTC) - timedelta(minutes=5)
    db_session.commit()

    result = _mark_stalled_if_needed(db_session, snapshot)

    assert result.status == SnapshotStatus.INDEXING
    assert result.error_message is None


def test_an_indexing_stage_past_its_real_budget_is_still_failed(
    db_session: Session, snapshot: RepoSnapshot
) -> None:
    """The larger budget must not become no budget: a genuinely dead worker
    mid-indexing still has to be reported, or the UI polls forever."""
    snapshot.status = SnapshotStatus.INDEXING
    snapshot.current_stage = PipelineStage.INDEXING_CODE
    snapshot.stage_started_at = datetime.now(UTC) - timedelta(
        seconds=_INDEXING_TIMEOUT_SECONDS + 300
    )
    db_session.commit()

    result = _mark_stalled_if_needed(db_session, snapshot)

    assert result.status == SnapshotStatus.FAILED
    assert "indexing_code" in result.error_message


def test_a_short_stage_past_its_budget_is_failed_as_before(
    db_session: Session, snapshot: RepoSnapshot
) -> None:
    """The in-process stages keep the tight budget — widening indexing must
    not have widened everything."""
    snapshot.status = SnapshotStatus.INDEXING
    snapshot.current_stage = PipelineStage.PARSING
    snapshot.stage_started_at = datetime.now(UTC) - timedelta(
        seconds=_STAGE_TIMEOUT_SECONDS + 120
    )
    db_session.commit()

    result = _mark_stalled_if_needed(db_session, snapshot)

    assert result.status == SnapshotStatus.FAILED
    assert "parsing" in result.error_message
