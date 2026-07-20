"""The one place `rq`/`redis` is imported for enqueueing (module docstring).
The job function itself (`services.pipeline_runner.run_ingestion_job`) is
referenced here only by its importable dotted path — RQ resolves and
imports that path inside the worker process (`worker.py`), never inside
the API process at enqueue time.

Beyond enqueueing, this module answers the two questions a *concurrent*
scheduler has that a serial one never had, both from real queue state
rather than from a clock:

  - `job_presence` — is a waiting job still alive? With one worker, a job
    that hadn't started could safely be assumed lost after a few seconds.
    With a pool and a queue, "hasn't started yet" is the normal, correct
    state of every study beyond the Nth, and the only honest way to tell it
    apart from a genuinely lost job is to ask Redis whether the job is still
    there.
  - `job_queue_position` — how many studies are ahead of this one. A real
    count from the queue, not an estimate (RULES.md §23).

Both degrade to "unknown" rather than to a guess when Redis is unreachable:
a queue we cannot reach tells us nothing about a job, and treating silence
as death would fail studies that are running perfectly.
"""

import logging
import uuid
from enum import StrEnum

from redis import Redis
from redis.exceptions import RedisError
from rq import Queue
from rq.exceptions import NoSuchJobError
from rq.job import Job, JobStatus

from config import get_settings

_INGESTION_QUEUE_NAME = "ingestion"
_INGESTION_JOB_PATH = "services.pipeline_runner.run_ingestion_job"

#: A study can legitimately outlive its own execution budget by a wide
#: margin while it waits, so RQ's default 180-second job timeout would kill
#: real work. Sized against `pipeline_runner`'s own per-stage budgets (a
#: 120s clone plus the 900s Stage 4 indexing budget dominate), with room
#: over the sum — the pipeline's own timeouts are the real guard, and this
#: exists only so a truly wedged work-horse cannot hold a pool slot forever.
_JOB_TIMEOUT_SECONDS = 2400

#: How long a finished job's result stays in Redis. Only needs to outlive
#: the frontend's poll interval — the snapshot row, not the RQ job, is the
#: durable record of what happened.
_RESULT_TTL_SECONDS = 600

logger = logging.getLogger(__name__)


class JobPresence(StrEnum):
    """What the queue actually knows about a job.

    The three-way split is load-bearing. `LOST` is the only value the stall
    detector may act on; `UNKNOWN` means Redis could not be reached and
    therefore proves nothing, and collapsing it into `LOST` would fail every
    in-flight study during a brief Redis blip.
    """

    #: Queued, deferred, or currently executing in a worker.
    LIVE = "live"
    #: The queue answered and has no record of this job — it was never
    #: enqueued, or it vanished without a worker ever claiming it.
    LOST = "lost"
    #: The queue could not be reached, or the snapshot has no job id.
    UNKNOWN = "unknown"


#: Job states that mean "this job still has somewhere to go". `FINISHED`,
#: `FAILED`, `CANCELED` and `STOPPED` are all terminal — by the time a job
#: reaches any of them, `pipeline_runner` has already written the snapshot's
#: own terminal status, so the snapshot is no longer the stall detector's
#: business either way.
_LIVE_JOB_STATUSES = frozenset(
    {JobStatus.QUEUED, JobStatus.STARTED, JobStatus.DEFERRED, JobStatus.SCHEDULED}
)


def _connection() -> Redis:
    return Redis.from_url(get_settings().redis_url)


def _queue(connection: Redis) -> Queue:
    return Queue(_INGESTION_QUEUE_NAME, connection=connection)


def enqueue_ingestion_job(snapshot_id: uuid.UUID) -> str:
    """Enqueues the ingestion pipeline for one snapshot; returns the RQ
    job ID. Raises whatever `redis`/`rq` raises on a connection failure —
    callers (the `/sync` route) let that propagate as a 502-class error
    rather than silently swallowing it (RULES.md §6).

    The job id is the snapshot id. They are one-to-one by construction, and
    making them the same string means a snapshot row can always be traced to
    its job (and back) without a lookup table — including from `rq info` or
    `redis-cli`, where the snapshot id is the only handle anyone has. It also
    makes enqueueing idempotent per snapshot: a duplicate `/sync` for the
    same snapshot cannot produce two jobs racing over the same rows.
    """
    connection = _connection()
    job = _queue(connection).enqueue(
        _INGESTION_JOB_PATH,
        str(snapshot_id),
        job_id=str(snapshot_id),
        job_timeout=_JOB_TIMEOUT_SECONDS,
        result_ttl=_RESULT_TTL_SECONDS,
    )
    return job.id


def job_presence(job_id: str | None) -> JobPresence:
    """Whether the queue still knows about this job. See `JobPresence` — the
    caller is `snapshot_service`'s stall detector, and the distinction
    between "gone" and "can't tell" is the whole point of the return type."""
    if not job_id:
        return JobPresence.UNKNOWN
    try:
        job = Job.fetch(job_id, connection=_connection())
    except NoSuchJobError:
        return JobPresence.LOST
    except RedisError as exc:
        logger.warning("job_presence: queue unreachable for job=%s: %s", job_id, exc)
        return JobPresence.UNKNOWN
    return JobPresence.LIVE if job.get_status() in _LIVE_JOB_STATUSES else JobPresence.LOST


def job_queue_position(job_id: str | None) -> int | None:
    """1-based position in the waiting line, or `None` when this job is not
    waiting — because it is already running, already done, or because the
    queue could not be reached. `None` is deliberately not `0`: "not waiting"
    and "next up" are different facts and the UI renders them differently."""
    if not job_id:
        return None
    try:
        position = _queue(_connection()).get_job_position(job_id)
    except (RedisError, NoSuchJobError) as exc:
        logger.warning("job_queue_position: queue unreachable for job=%s: %s", job_id, exc)
        return None
    # RQ counts from 0 for the job at the head of the queue; the UI says
    # "Position #1" for that job, not "#0".
    return None if position is None else position + 1


def cancel_ingestion_job(job_id: str | None) -> bool:
    """Removes a not-yet-started job from the queue so no worker ever picks
    it up. Returns whether the cancellation actually reached the queue.

    Only genuinely prevents work for a job still waiting. A job already
    executing is *not* killed here — the running pipeline observes
    cancellation cooperatively at its own stage boundaries
    (`pipeline_runner._raise_if_cancelled`), because a study killed
    mid-stage would leave partial rows behind, which is exactly the
    corruption `StageTimeoutExceeded` refuses to risk for the same reason.
    """
    if not job_id:
        return False
    try:
        Job.fetch(job_id, connection=_connection()).cancel()
    except NoSuchJobError:
        # Already finished, already cancelled, or past its result TTL. The
        # snapshot row is the durable record and the caller has already
        # written it — nothing to undo here.
        return False
    except RedisError as exc:
        logger.warning("cancel_ingestion_job: queue unreachable for job=%s: %s", job_id, exc)
        return False
    return True
