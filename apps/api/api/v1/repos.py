"""Repository connect/list routes (ARCHITECTURE.md §12). Thin per
RULES.md §6 — all business logic lives in
`services.repository_connection_service`, which depends only on the
`RepositoryProvider` abstraction (DECISIONS.md ADR-023), never on GitHub
directly.
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.dependencies import get_current_user
from api.v1.schemas import AvailableRepositoryOut, ConnectRepositoryRequest, RepositoryOut
from models.db import get_session
from models.repository import User
from services.repository_connection_service import (
    connect_repository,
    get_connected_repository,
    list_available_repositories,
    list_connected_repositories,
)

router = APIRouter(prefix="/repos", tags=["repos"])


@router.get("/available", response_model=list[AvailableRepositoryOut])
def available(
    installation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> list[AvailableRepositoryOut]:
    metadata = list_available_repositories(db, user=user, installation_id=installation_id)
    return [AvailableRepositoryOut(**item.model_dump()) for item in metadata]


@router.post("/connect", response_model=RepositoryOut, status_code=201)
def connect(
    body: ConnectRepositoryRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> RepositoryOut:
    repository = connect_repository(
        db, user=user, installation_id=body.installation_id, full_name=body.full_name
    )
    db.commit()
    return RepositoryOut.model_validate(repository)


@router.get("", response_model=list[RepositoryOut])
def list_repos(
    user: User = Depends(get_current_user), db: Session = Depends(get_session)
) -> list[RepositoryOut]:
    return [
        RepositoryOut.model_validate(repo) for repo in list_connected_repositories(db, user=user)
    ]


@router.get("/{repository_id}", response_model=RepositoryOut)
def get_repo(
    repository_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> RepositoryOut:
    repository = get_connected_repository(db, user=user, repository_id=repository_id)
    return RepositoryOut.model_validate(repository)
