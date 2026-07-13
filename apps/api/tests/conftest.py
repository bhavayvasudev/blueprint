"""Shared fixtures. `db_session` skips (rather than errors) when Postgres
isn't reachable — true in this development environment (see
docs/MEMORY.md), false in CI, which runs a real pgvector/pgvector:pg16
service container. Integration tests using it are real, executed
verification in CI even when they can't run locally here.
"""

from collections.abc import Iterator

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from config import get_settings


def _database_available() -> bool:
    try:
        engine = create_engine(get_settings().database_url, connect_args={"connect_timeout": 2})
        with engine.connect():
            pass
        return True
    except Exception:
        return False


@pytest.fixture
def db_session() -> Iterator[Session]:
    if not _database_available():
        pytest.skip("Postgres not reachable in this environment — see docs/MEMORY.md")

    from models.db import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
