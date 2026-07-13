"""Shared fixtures.

`db_session` prefers the configured `DATABASE_URL` (real in CI, via a
`pgvector/pgvector:pg16` service container). When that's not reachable —
true in this development environment, and on any contributor machine
without Docker — it falls back to a real, ephemeral Postgres+pgvector
instance started via `pgserver` (a bundled binary, no Docker required),
rather than skipping. That fallback is what makes integration tests
genuinely *executed* verification everywhere, not just in CI.

The fallback creates tables via `Base.metadata.create_all()` against the
current ORM models, not by running Alembic migrations — migration
fidelity itself is already covered for real by CI's dedicated
`alembic upgrade head` step (.github/workflows/ci.yml); this fixture's
job is exercising business logic (persistence, retrieval) against a
real database, and using `create_all()` sidesteps `config.get_settings`'s
`@lru_cache`, which is already fixed to whatever `DATABASE_URL` was
first observed by the time any fixture runs.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from config import get_settings


def _configured_database_available() -> bool:
    try:
        engine = create_engine(get_settings().database_url, connect_args={"connect_timeout": 2})
        with engine.connect():
            pass
        return True
    except Exception:
        return False


@pytest.fixture(scope="session")
def _embedded_postgres_engine() -> Iterator[Engine]:
    import tempfile

    import pgserver

    pgdata = Path(tempfile.gettempdir()) / "blueprint-test-pgserver"
    server = pgserver.get_server(pgdata)  # type: ignore[attr-defined]
    try:
        # pgserver.get_uri() returns a plain postgresql:// URI (implying
        # psycopg2); the project's driver is psycopg (v3) — see
        # pyproject.toml and config.Settings.database_url's default.
        uri = server.get_uri().replace("postgresql://", "postgresql+psycopg://", 1)
        engine = create_engine(uri)
        with engine.connect() as connection:
            connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            connection.commit()

        from models.db import Base

        Base.metadata.create_all(engine)
        yield engine
    finally:
        server.cleanup()


@pytest.fixture
def db_session(request: pytest.FixtureRequest) -> Iterator[Session]:
    if _configured_database_available():
        from models.db import SessionLocal

        session = SessionLocal()
    else:
        engine = request.getfixturevalue("_embedded_postgres_engine")
        session = sessionmaker(bind=engine)()

    try:
        yield session
    finally:
        session.rollback()
        session.close()
