"""Background worker entrypoint (ARCHITECTURE.md §13).

Same codebase as the API, different process. Consumes ingestion and
pipeline-run jobs from a Redis-backed RQ queue. LangGraph pipeline
execution happens exclusively here, never inline in a FastAPI request
handler, except Stage 11 (Prompt Generation) which is intentionally light
enough to run synchronously within the API process (added in Phase 7).

Run with: `uv run python worker.py`
"""

from redis import Redis
from rq import Queue, Worker

from config import get_settings

QUEUE_NAMES = ["ingestion", "pipeline"]


def main() -> None:
    settings = get_settings()
    connection = Redis.from_url(settings.redis_url)
    queues = [Queue(name, connection=connection) for name in QUEUE_NAMES]
    Worker(queues, connection=connection).work()


if __name__ == "__main__":
    main()
