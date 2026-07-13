"""Liveness/readiness check. Thin per RULES.md §6 — no business logic here."""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
