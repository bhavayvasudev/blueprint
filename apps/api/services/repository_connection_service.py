"""Repository connect flow (PRD.md "Repository connection"): list what an
installation grants access to, and persist a `repositories` row for one
selected repo. This is "the rest of the system" ARCHITECTURE.md's
provider-abstraction requirement refers to — it depends only on
`integrations.repository.base.RepositoryProvider`
(`integrations.repository.registry.get_repository_provider()`), never on
GitHub-specific code, so a future non-GitHub provider needs no change
here (DECISIONS.md ADR-023).
"""

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from integrations.github.exceptions import GitHubAppNotInstalled
from integrations.repository.base import RepositoryMetadata
from integrations.repository.registry import get_repository_provider
from models.repository import Repository, User
from models.types import ConnectionStatus
from services.installation_service import get_installation_for_user, mark_installation_revoked

logger = logging.getLogger(__name__)


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
        repos = provider.list_repositories(installation.external_id)
        logger.info(
            "list_available_repositories: installation_id=%s returned %d repositories",
            installation.id,
            len(repos),
        )
        return repos
    except GitHubAppNotInstalled:
        logger.warning(
            "list_available_repositories: installation %s not installed on GitHub — marking revoked",
            installation.id,
        )
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


def connect_all_available_repositories(
    db: Session, *, user: User, installation_id: uuid.UUID
) -> list[Repository]:
    """Bulk variant of `connect_repository` for the install-completion flow
    and the "Sync from GitHub" action: repositories an installation grants
    access to should appear without a one-by-one manual step. Reuses the
    `RepositoryMetadata` `list_repositories` already returned instead of
    re-fetching each repo individually, and silently skips anything
    already connected (by anyone — `github_repo_id` is globally unique,
    same rule `connect_repository` enforces) rather than raising, since a
    batch shouldn't abort over one already-claimed repo."""
    installation = get_installation_for_user(db, user=user, installation_id=installation_id)
    logger.info(
        "connect_all_available_repositories: installation_id=%s external_id=%s",
        installation.id,
        installation.external_id,
    )
    provider = get_repository_provider()

    try:
        available = provider.list_repositories(installation.external_id)
    except GitHubAppNotInstalled:
        logger.warning(
            "connect_all_available_repositories: GitHub reports installation %s (external_id=%s) "
            "not installed — marking revoked",
            installation.id,
            installation.external_id,
        )
        mark_installation_revoked(db, installation)
        raise

    logger.info(
        "connect_all_available_repositories: provider returned %d repositories: %s",
        len(available),
        [metadata.full_name for metadata in available],
    )

    candidate_ids = {metadata.external_id for metadata in available}
    already_connected = set(
        db.execute(
            select(Repository.github_repo_id).where(Repository.github_repo_id.in_(candidate_ids))
        )
        .scalars()
        .all()
    )

    connected: list[Repository] = []
    for metadata in available:
        if metadata.external_id in already_connected:
            logger.info("connect_all_available_repositories: skipping already-connected %s", metadata.full_name)
            continue
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
        connected.append(repository)

    db.flush()
    logger.info(
        "connect_all_available_repositories: connected %d new repositories for installation_id=%s",
        len(connected),
        installation.id,
    )
    return connected


def list_connected_repositories(db: Session, *, user: User) -> list[Repository]:
    repos = list(
        db.execute(select(Repository).where(Repository.user_id == user.id)).scalars().all()
    )
    logger.info("list_connected_repositories: user_id=%s returned %d repositories", user.id, len(repos))
    return repos


def get_connected_repository(db: Session, *, user: User, repository_id: uuid.UUID) -> Repository:
    repository = db.execute(
        select(Repository).where(Repository.id == repository_id, Repository.user_id == user.id)
    ).scalar_one_or_none()
    if repository is None:
        raise RepositoryNotFound(f"No repository {repository_id} for this user")
    return repository
