"""Repository connect flow (PRD.md "Repository connection"): list what an
installation grants access to, and persist a `repositories` row for one
selected repo. This is "the rest of the system" ARCHITECTURE.md's
provider-abstraction requirement refers to — it depends only on
`integrations.repository.base.RepositoryProvider`
(`integrations.repository.registry.get_repository_provider()`), never on
GitHub-specific code, so a future non-GitHub provider needs no change
here (DECISIONS.md ADR-023).
"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from integrations.github.exceptions import GitHubAppNotInstalled
from integrations.repository.base import RepositoryMetadata
from integrations.repository.registry import get_repository_provider
from models.repository import Repository, User
from models.types import ConnectionStatus
from services.installation_service import get_installation_for_user, mark_installation_revoked


class RepositoryAlreadyConnected(Exception):
    """A `repositories` row for this `github_repo_id` already exists —
    surfaced as 409, not silently overwritten (RULES.md §8: no mutating
    another user's/installation's existing connection out from under it)."""


class RepositoryNotFound(Exception):
    """No repository with this ID exists for this user — a dedicated
    type rather than a bare `LookupError` (see
    `services.installation_service.InstallationNotFound` for why)."""


def list_available_repositories(
    db: Session, *, user: User, installation_id: uuid.UUID
) -> list[RepositoryMetadata]:
    installation = get_installation_for_user(db, user=user, installation_id=installation_id)
    provider = get_repository_provider()
    try:
        return provider.list_repositories(installation.external_id)
    except GitHubAppNotInstalled:
        mark_installation_revoked(db, installation)
        raise


def connect_repository(
    db: Session, *, user: User, installation_id: uuid.UUID, full_name: str
) -> Repository:
    installation = get_installation_for_user(db, user=user, installation_id=installation_id)
    provider = get_repository_provider()

    try:
        metadata = provider.get_repository(installation.external_id, full_name)
    except GitHubAppNotInstalled:
        mark_installation_revoked(db, installation)
        raise

    existing = db.execute(
        select(Repository).where(Repository.github_repo_id == metadata.external_id)
    ).scalar_one_or_none()
    if existing is not None:
        raise RepositoryAlreadyConnected(
            f"{metadata.full_name} is already connected to Blueprint"
        )

    repository = Repository(
        user_id=user.id,
        installation_id=installation.id,
        github_repo_id=metadata.external_id,
        full_name=metadata.full_name,
        default_branch=metadata.default_branch,
        private=metadata.private,
        connection_status=ConnectionStatus.CONNECTED,
    )
    db.add(repository)
    db.flush()
    return repository


def list_connected_repositories(db: Session, *, user: User) -> list[Repository]:
    return list(
        db.execute(select(Repository).where(Repository.user_id == user.id)).scalars().all()
    )


def get_connected_repository(db: Session, *, user: User, repository_id: uuid.UUID) -> Repository:
    repository = db.execute(
        select(Repository).where(Repository.id == repository_id, Repository.user_id == user.id)
    ).scalar_one_or_none()
    if repository is None:
        raise RepositoryNotFound(f"No repository {repository_id} for this user")
    return repository
