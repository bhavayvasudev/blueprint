import uuid

import pytest
from sqlalchemy.orm import Session

from models.installation import Installation
from models.repository import Repository, RepoSnapshot, User
from models.types import AccountType, ConnectionStatus, InstallationStatus, SnapshotStatus


@pytest.fixture
def user(db_session: Session) -> User:
    """A real, persisted (flushed, uncommitted) User with no installations
    or repositories — the minimal starting point for auth/installation/
    repository-connection service tests."""
    new_user = User(
        id=uuid.uuid4(),
        github_id=f"test-{uuid.uuid4()}",
        email=f"{uuid.uuid4()}@example.com",
        name="Test",
    )
    db_session.add(new_user)
    db_session.flush()
    return new_user


@pytest.fixture
def snapshot(db_session: Session, user: User) -> RepoSnapshot:
    """A real, persisted (flushed, uncommitted) RepoSnapshot with its
    required User/Installation/Repository parents — shared setup for every
    ingestion/graph/retrieval integration test under tests/services/."""
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
        full_name="test/sample",
        default_branch="main",
        private=False,
        connection_status=ConnectionStatus.CONNECTED,
    )
    db_session.add(repository)
    db_session.flush()

    # `QUEUED`, matching what `sync_service.trigger_sync` really creates: a
    # snapshot enters the world waiting for a worker, and it is
    # `pipeline_runner._claim_snapshot` that promotes it to `INDEXING`.
    # Tests that exercise the pipeline therefore start from the same state a
    # worker actually finds. The stall-detector tests, which are about a
    # snapshot a worker has already claimed, set `INDEXING` themselves.
    repo_snapshot = RepoSnapshot(
        id=uuid.uuid4(),
        repository_id=repository.id,
        commit_sha="deadbeef",
        status=SnapshotStatus.QUEUED,
    )
    db_session.add(repo_snapshot)
    db_session.flush()
    return repo_snapshot
