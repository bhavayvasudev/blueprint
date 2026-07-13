import uuid

import pytest
from sqlalchemy.orm import Session

from integrations.github.exceptions import InstallationRevoked
from integrations.repository.base import InstallationMetadata
from models.repository import User
from models.types import AccountType, InstallationStatus
from services.installation_service import (
    InstallationNotFound,
    get_installation_for_user,
    mark_installation_revoked,
    upsert_installation,
)


def _metadata(**overrides: object) -> InstallationMetadata:
    base: dict[str, object] = {
        "external_id": "1001",
        "account_login": "acme-corp",
        "account_type": AccountType.ORGANIZATION,
    }
    base.update(overrides)
    return InstallationMetadata(**base)  # type: ignore[arg-type]


def test_upsert_installation_creates_new_row(db_session: Session, user: User) -> None:
    installation = upsert_installation(db_session, user=user, metadata=_metadata())
    assert installation.user_id == user.id
    assert installation.external_id == "1001"
    assert installation.account_login == "acme-corp"
    assert installation.account_type == AccountType.ORGANIZATION
    assert installation.status == InstallationStatus.ACTIVE


def test_upsert_installation_is_idempotent_on_external_id(db_session: Session, user: User) -> None:
    first = upsert_installation(db_session, user=user, metadata=_metadata())
    second = upsert_installation(
        db_session, user=user, metadata=_metadata(account_login="acme-corp-renamed")
    )
    assert first.id == second.id
    assert second.account_login == "acme-corp-renamed"


def test_upsert_installation_reactivates_a_revoked_installation(
    db_session: Session, user: User
) -> None:
    installation = upsert_installation(db_session, user=user, metadata=_metadata())
    mark_installation_revoked(db_session, installation)
    assert installation.status == InstallationStatus.REVOKED

    reinstalled = upsert_installation(db_session, user=user, metadata=_metadata())
    assert reinstalled.id == installation.id
    assert reinstalled.status == InstallationStatus.ACTIVE


def test_get_installation_for_user_returns_owned_active_installation(
    db_session: Session, user: User
) -> None:
    installation = upsert_installation(db_session, user=user, metadata=_metadata())
    found = get_installation_for_user(db_session, user=user, installation_id=installation.id)
    assert found.id == installation.id


def test_get_installation_for_user_raises_not_found_for_unknown_id(
    db_session: Session, user: User
) -> None:
    with pytest.raises(InstallationNotFound):
        get_installation_for_user(db_session, user=user, installation_id=uuid.uuid4())


def test_get_installation_for_user_raises_not_found_for_a_different_users_installation(
    db_session: Session, user: User
) -> None:
    other_user = User(
        id=uuid.uuid4(),
        github_id=f"other-{uuid.uuid4()}",
        email=f"{uuid.uuid4()}@example.com",
        name="Other",
    )
    db_session.add(other_user)
    db_session.flush()

    installation = upsert_installation(db_session, user=other_user, metadata=_metadata())

    with pytest.raises(InstallationNotFound):
        get_installation_for_user(db_session, user=user, installation_id=installation.id)


def test_get_installation_for_user_raises_revoked_for_a_revoked_installation(
    db_session: Session, user: User
) -> None:
    installation = upsert_installation(db_session, user=user, metadata=_metadata())
    mark_installation_revoked(db_session, installation)

    with pytest.raises(InstallationRevoked):
        get_installation_for_user(db_session, user=user, installation_id=installation.id)
