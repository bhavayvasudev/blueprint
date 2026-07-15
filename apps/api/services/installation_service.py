"""Installation lifecycle (DECISIONS.md ADR-024): create/refresh an
`installations` row from provider metadata, enforce that a Blueprint user
only ever sees their own installations (application-layer row scoping —
see ADR-024's note on Postgres RLS not yet being wired up), and mark an
installation revoked when GitHub tells us it's gone.
"""

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from integrations.github.exceptions import InstallationRevoked
from integrations.repository.base import InstallationMetadata
from models.installation import Installation
from models.repository import User
from models.types import InstallationStatus

logger = logging.getLogger(__name__)


class InstallationNotFound(Exception):
    """No installation with this ID exists for this user — a dedicated
    type rather than a bare `LookupError`, so the global exception
    handler (`api/errors.py`) can't accidentally swallow an unrelated
    `KeyError`/`IndexError` elsewhere in the app (both are `LookupError`
    subclasses)."""


def upsert_installation(
    db: Session, *, user: User, metadata: InstallationMetadata, provider: str = "github"
) -> Installation:
    existing = db.execute(
        select(Installation).where(Installation.external_id == metadata.external_id)
    ).scalar_one_or_none()

    if existing is not None:
        existing.user_id = user.id
        existing.account_login = metadata.account_login
        existing.account_type = metadata.account_type
        existing.status = InstallationStatus.ACTIVE
        db.flush()
        logger.info(
            "upsert_installation: updated existing row id=%s external_id=%s for user_id=%s",
            existing.id,
            existing.external_id,
            user.id,
        )
        return existing

    installation = Installation(
        user_id=user.id,
        provider=provider,
        external_id=metadata.external_id,
        account_login=metadata.account_login,
        account_type=metadata.account_type,
        status=InstallationStatus.ACTIVE,
    )
    db.add(installation)
    db.flush()
    logger.info(
        "upsert_installation: created new row id=%s external_id=%s for user_id=%s",
        installation.id,
        installation.external_id,
        user.id,
    )
    return installation


def list_installations_for_user(db: Session, *, user: User) -> list[Installation]:
    """Every active installation the user has connected — backs
    `GET /installations` (PR8), the picker the "Connect a repository" flow
    needs to know which installation to call `/repos/available` with."""
    return list(
        db.execute(
            select(Installation).where(
                Installation.user_id == user.id, Installation.status == InstallationStatus.ACTIVE
            )
        )
        .scalars()
        .all()
    )


def get_installation_for_user(db: Session, *, user: User, installation_id: uuid.UUID) -> Installation:
    """Row-level ownership check at the application layer (ARCHITECTURE.md
    §17's Postgres RLS isn't wired up yet — see DECISIONS.md ADR-024).
    "Not found" and "not yours" both raise the same `InstallationNotFound`
    (mapped to 404) — not distinguishing the two to the caller is itself a
    minor security property (no existence oracle for other users'
    installations)."""
    installation = db.execute(
        select(Installation).where(
            Installation.id == installation_id, Installation.user_id == user.id
        )
    ).scalar_one_or_none()
    if installation is None:
        raise InstallationNotFound(f"No installation {installation_id} for this user")

    if installation.status != InstallationStatus.ACTIVE:
        raise InstallationRevoked(
            f"Installation {installation_id} was revoked; reinstall the GitHub App to reconnect."
        )
    return installation


def mark_installation_revoked(db: Session, installation: Installation) -> None:
    installation.status = InstallationStatus.REVOKED
    db.flush()
