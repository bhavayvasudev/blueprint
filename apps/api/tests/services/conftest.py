import uuid

import pytest
from sqlalchemy.orm import Session

from models.repository import Repository, RepoSnapshot, User
from models.types import ConnectionStatus, SnapshotStatus


@pytest.fixture
def snapshot(db_session: Session) -> RepoSnapshot:
    """A real, persisted (flushed, uncommitted) RepoSnapshot with its
    required User/Repository parents — shared setup for every
    integration test under tests/services/."""
    user = User(
        id=uuid.uuid4(),
        github_id=f"test-{uuid.uuid4()}",
        email=f"{uuid.uuid4()}@example.com",
        name="Test",
    )
    db_session.add(user)
    db_session.flush()

    repository = Repository(
        id=uuid.uuid4(),
        user_id=user.id,
        github_repo_id=str(uuid.uuid4()),
        full_name="test/sample",
        default_branch="main",
        private=False,
        connection_status=ConnectionStatus.CONNECTED,
    )
    db_session.add(repository)
    db_session.flush()

    repo_snapshot = RepoSnapshot(
        id=uuid.uuid4(),
        repository_id=repository.id,
        commit_sha="deadbeef",
        status=SnapshotStatus.INDEXING,
    )
    db_session.add(repo_snapshot)
    db_session.flush()
    return repo_snapshot
