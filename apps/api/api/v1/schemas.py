"""Request/response models for the auth and repos routers (RULES.md §2:
Pydantic models at every API boundary)."""

import uuid
from datetime import datetime

from pydantic import BaseModel

from models.types import AccountType, ConnectionStatus


class UserOut(BaseModel):
    id: uuid.UUID
    github_id: str
    email: str
    name: str

    model_config = {"from_attributes": True}


class InstallationOut(BaseModel):
    id: uuid.UUID
    account_login: str
    account_type: AccountType

    model_config = {"from_attributes": True}


class AvailableRepositoryOut(BaseModel):
    external_id: str
    full_name: str
    default_branch: str
    private: bool
    html_url: str


class ConnectRepositoryRequest(BaseModel):
    installation_id: uuid.UUID
    full_name: str


class RepositoryOut(BaseModel):
    id: uuid.UUID
    installation_id: uuid.UUID
    full_name: str
    default_branch: str
    private: bool
    connection_status: ConnectionStatus
    last_synced_sha: str | None
    last_synced_at: datetime | None

    model_config = {"from_attributes": True}
