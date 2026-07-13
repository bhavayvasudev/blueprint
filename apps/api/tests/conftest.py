"""Shared fixtures.

`db_session` runs every test inside an outer transaction on a real
Postgres connection — real in CI, via a `pgvector/pgvector:pg16` service
container; real in local dev too, via whatever `DATABASE_URL` points at.
When *no* Postgres is reachable there, it falls back to a real, ephemeral
Postgres+pgvector instance started via `pgserver` (a bundled binary, no
Docker required), so integration tests are genuinely *executed*
verification everywhere, not just in CI (`docs/DECISIONS.md` ADR-022).

Route/service code under test routinely calls `db.commit()` (real
transactions, not just a fixture's own session) — naively binding a test
session directly to the engine would mean those commits are real and
permanent, which once caused a real problem: `DATABASE_URL` in a fresh
`.env.example` and in CI both defaulted to the same
`blueprint`/`blueprint`/`blueprint` connection string, so running the
test suite against a real local Postgres (set up for actual dev use, not
just CI) left permanent, real-looking `repositories`/`installations` rows
in what should have been a clean dev database.

The fix here is SQLAlchemy's documented pattern for exactly this case
("join a Session to an external transaction"): `db_session` opens one
connection, begins an outer transaction on it, and binds the test's
`Session` to that connection with `join_transaction_mode="create_savepoint"`
— every `session.commit()` the code under test calls becomes a SAVEPOINT
release/re-establish instead of a real commit, and the outer transaction
is always rolled back at teardown, undoing everything regardless of how
many times commit() was called. This was chosen over a separate sibling
`<database>_test` database (tried first) specifically because opening a
connection to a *second*, not-yet-connected-to database from inside
pytest's own fixture/collection machinery reproducibly triggered a
genuine Postgres password-authentication failure on this project's local
(Windows/Docker Desktop) dev setup — a real, thoroughly reproduced
environment quirk, not a config error (a raw `psycopg` connection with
identical credentials always succeeded outside of pytest; the identical
connection attempt inside pytest's fixture resolution did not, regardless
of pooling, retries, or timing). Never connecting to a second database at
all sidesteps that quirk entirely rather than working around its symptom.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session

from config import get_settings


def _configured_server_reachable() -> bool:
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
    if _configured_server_reachable():
        from models.db import _engine as engine
    else:
        engine = request.getfixturevalue("_embedded_postgres_engine")

    connection = engine.connect()
    trans = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        trans.rollback()
        connection.close()
