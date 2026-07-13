"""`GET /installations` (PR8) — lists the current user's active GitHub App
installations, the piece the frontend's "connect a repository" flow needs
so it knows which `installation_id` to call `/repos/available` with.
Thin per RULES.md §6."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.dependencies import get_current_user
from api.v1.schemas import InstallationOut
from models.db import get_session
from models.repository import User
from services.installation_service import list_installations_for_user

router = APIRouter(prefix="/installations", tags=["installations"])


@router.get("", response_model=list[InstallationOut])
def list_installations(
    user: User = Depends(get_current_user), db: Session = Depends(get_session)
) -> list[InstallationOut]:
    return [
        InstallationOut.model_validate(installation)
        for installation in list_installations_for_user(db, user=user)
    ]
