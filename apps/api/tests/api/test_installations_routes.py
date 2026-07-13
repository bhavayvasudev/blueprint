import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from api.dependencies import SESSION_COOKIE_NAME
from config import Settings
from models.installation import Installation
from models.repository import User
from models.types import AccountType, InstallationStatus
from services.auth_service import create_session_token


def _logged_in_user(client: TestClient, db_session: Session, test_settings: Settings) -> User:
    user = User(
        id=uuid.uuid4(), github_id=f"gh-{uuid.uuid4()}", email=f"{uuid.uuid4()}@example.com", name="Test"
    )
    db_session.add(user)
    db_session.flush()
    token = create_session_token(user.id, settings=test_settings)
    client.cookies.set(SESSION_COOKIE_NAME, token)
    return user


def test_list_installations_without_cookie_returns_401(client: TestClient) -> None:
    response = client.get("/api/v1/installations")
    assert response.status_code == 401


def test_list_installations_only_returns_active_ones_for_current_user(
    client: TestClient, db_session: Session, test_settings: Settings
) -> None:
    user = _logged_in_user(client, db_session, test_settings)
    other_user = User(
        id=uuid.uuid4(), github_id=f"gh-{uuid.uuid4()}", email=f"{uuid.uuid4()}@example.com", name="Other"
    )
    db_session.add(other_user)
    db_session.flush()

    active = Installation(
        id=uuid.uuid4(),
        user_id=user.id,
        provider="github",
        external_id=str(uuid.uuid4()),
        account_login="acme-corp",
        account_type=AccountType.ORGANIZATION,
        status=InstallationStatus.ACTIVE,
    )
    revoked = Installation(
        id=uuid.uuid4(),
        user_id=user.id,
        provider="github",
        external_id=str(uuid.uuid4()),
        account_login="old-account",
        account_type=AccountType.USER,
        status=InstallationStatus.REVOKED,
    )
    someone_elses = Installation(
        id=uuid.uuid4(),
        user_id=other_user.id,
        provider="github",
        external_id=str(uuid.uuid4()),
        account_login="not-mine",
        account_type=AccountType.USER,
        status=InstallationStatus.ACTIVE,
    )
    db_session.add_all([active, revoked, someone_elses])
    db_session.flush()

    response = client.get("/api/v1/installations")
    assert response.status_code == 200
    logins = [i["account_login"] for i in response.json()]
    assert logins == ["acme-corp"]
