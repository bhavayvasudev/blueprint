from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from api.main import app
from config import Settings, get_settings
from models.db import get_session


@pytest.fixture
def test_settings() -> Settings:
    return Settings(
        _env_file=None,
        jwt_secret="test-secret-at-least-32-bytes-long",
        github_app_id="123",
        github_app_private_key=(
            "-----BEGIN RSA PRIVATE KEY-----\nFAKEKEYBODYFORTESTSONLY\n-----END RSA PRIVATE KEY-----"
        ),
        github_app_client_id="client-id",
        github_app_client_secret="client-secret",
        github_app_slug="blueprint-dev",
        frontend_url="https://app.example.com",
        api_base_url="https://api.example.com",
    )


@pytest.fixture
def client(db_session: Session, test_settings: Settings) -> Iterator[TestClient]:
    app.dependency_overrides[get_session] = lambda: db_session
    app.dependency_overrides[get_settings] = lambda: test_settings
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
