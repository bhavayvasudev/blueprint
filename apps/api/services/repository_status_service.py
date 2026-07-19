"""Live repository status and contributors (PRD.md "Repository connection").

These are the only numbers Blueprint shows that a study does *not* produce.
Everything else on the Briefing is derived from a snapshot — counted files,
detected frameworks, audited docs — and is therefore immutable and
snapshot-scoped (`ARCHITECTURE.md` §2). Stars, forks, watchers, open issues
and the contributor list all change while Blueprint is doing nothing, so
persisting them against a snapshot would be storing a fact that is stale the
moment it lands. They're read live, per request, and cached only by the
provider's own HTTP layer.

Like every other service here this depends solely on the
`RepositoryProvider` abstraction (DECISIONS.md ADR-023), never on GitHub
directly — the word "GitHub" does not appear below by design.
"""

import logging
import uuid
from collections.abc import Callable

from pydantic import BaseModel
from sqlalchemy.orm import Session

from integrations.github.exceptions import GitHubAppNotInstalled
from integrations.repository.base import RepositoryProvider, RepositoryStatusMetadata
from integrations.repository.registry import get_repository_provider
from models.repository import Repository, User
from services.installation_service import mark_installation_revoked
from services.repository_connection_service import get_connected_repository

logger = logging.getLogger(__name__)

#: How many contributors the Briefing asks for. GitHub returns them in
#: commit-count order, so this is the top of a real ranking, not a sample.
#: The section renders a handful and expands; fetching more than this to
#: populate a list nobody scrolls would just spend rate limit.
CONTRIBUTOR_LIMIT = 30


class ContributorReading(BaseModel):
    """A contributor plus their share of the commits this list covers.

    `share` is a real quotient — this contributor's commits over the summed
    commits of the returned contributors — not a modelled or smoothed
    number. It is deliberately *not* a share of the repository's entire
    history: when the list is truncated at `CONTRIBUTOR_LIMIT` the
    denominator is the visible set, and `truncated` on the envelope tells
    the UI to say so rather than implying the percentages cover everything.
    """

    login: str
    avatar_url: str
    html_url: str
    contributions: int
    share: float


class ContributorsReading(BaseModel):
    contributors: list[ContributorReading]
    total_contributions: int
    #: More contributors exist than were fetched, so `share` is a share of
    #: the listed set. The UI must not present these as whole-history
    #: percentages when this is true.
    truncated: bool


def get_repository_status(
    db: Session, *, user: User, repository_id: uuid.UUID
) -> RepositoryStatusMetadata:
    repository = get_connected_repository(db, user=user, repository_id=repository_id)
    return _provider_call(
        db,
        repository,
        lambda provider, installation_external_id: provider.get_repository_status(
            installation_external_id, repository.full_name
        ),
    )


def list_contributors(
    db: Session, *, user: User, repository_id: uuid.UUID
) -> ContributorsReading:
    repository = get_connected_repository(db, user=user, repository_id=repository_id)
    contributors = _provider_call(
        db,
        repository,
        lambda provider, installation_external_id: provider.list_contributors(
            installation_external_id, repository.full_name, limit=CONTRIBUTOR_LIMIT
        ),
    )

    total = sum(entry.contributions for entry in contributors)
    return ContributorsReading(
        contributors=[
            ContributorReading(
                login=entry.login,
                avatar_url=entry.avatar_url,
                html_url=entry.html_url,
                contributions=entry.contributions,
                # Guarded rather than assumed non-zero: a repository whose
                # contributors all report 0 commits would otherwise divide
                # by zero here.
                share=(entry.contributions / total) if total else 0.0,
            )
            for entry in contributors
        ],
        total_contributions=total,
        truncated=len(contributors) >= CONTRIBUTOR_LIMIT,
    )


def _provider_call[T](
    db: Session,
    repository: Repository,
    call: Callable[[RepositoryProvider, str], T],
) -> T:
    """Runs one provider call for this repository, reconciling a "not
    installed" answer against our own `installations` row the same way
    `repository_connection_service` does — GitHub telling us the
    installation is gone is the authoritative signal that our record is
    stale, wherever we happen to hear it."""
    provider = get_repository_provider()
    try:
        return call(provider, repository.installation.external_id)
    except GitHubAppNotInstalled:
        logger.warning(
            "repository_status: installation %s reported not installed — marking revoked",
            repository.installation_id,
        )
        mark_installation_revoked(db, repository.installation)
        db.commit()
        raise
