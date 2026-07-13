"""Aggregates every v1 route module (ARCHITECTURE.md §12). New endpoints
register a router here rather than being added directly to the app."""

from fastapi import APIRouter

from api.v1 import health

router = APIRouter(prefix="/api/v1")
router.include_router(health.router)
