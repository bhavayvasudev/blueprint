"""Shared FastAPI dependencies. `get_current_user` is the one auth gate
every protected route depends on — reads the session cookie, verifies it,
loads the `User` row. Kept here (not duplicated per router) so there is
exactly one place that decides what "authenticated" means."""

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from config import Settings, get_settings
from models.db import get_session
from models.repository import User
from services.auth_service import InvalidSessionToken, verify_session_token

SESSION_COOKIE_NAME = "blueprint_session"


def get_current_user(
    request: Request,
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> User:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        user_id = verify_session_token(token, settings=settings)
    except InvalidSessionToken as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Session refers to a user that no longer exists")
    return user
