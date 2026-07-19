"""Aggregates every v1 route module (ARCHITECTURE.md §12). New endpoints
register a router here rather than being added directly to the app."""

from fastapi import APIRouter

from api.v1 import auth, health, installations, repos, threads

router = APIRouter(prefix="/api/v1")
router.include_router(health.router)
router.include_router(auth.router)
router.include_router(installations.router)
router.include_router(repos.router)
router.include_router(threads.router)
