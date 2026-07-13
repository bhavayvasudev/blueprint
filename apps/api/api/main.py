"""FastAPI application factory. Serving-plane entrypoint only (ARCHITECTURE.md
§1) — no LLM reasoning runs here except Stage 11, added in Phase 7."""

from fastapi import FastAPI

from api.v1.router import router as v1_router
from config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Blueprint API", version="0.1.0", debug=settings.environment == "development"
    )
    app.include_router(v1_router)
    return app


app = create_app()
