"""FastAPI application factory. Serving-plane entrypoint only (ARCHITECTURE.md
§1) — no LLM reasoning runs here except Stage 11, added in Phase 7."""

from fastapi import FastAPI

from api.errors import register_exception_handlers
from api.v1.router import router as v1_router
from config import get_settings
from integrations.github.config import GitHubAppConfig


def create_app() -> FastAPI:
    settings = get_settings()

    if settings.environment == "production":
        # Fail fast at process startup, not on the first request that
        # happens to need GitHub auth (RULES.md §22's "no repository
        # content is sent... requires updating the documented posture"
        # spirit applied to config: a production deploy with a broken
        # GitHub App config should never come up looking healthy).
        GitHubAppConfig.from_settings(settings)

    app = FastAPI(
        title="Blueprint API", version="0.1.0", debug=settings.environment == "development"
    )
    register_exception_handlers(app)
    app.include_router(v1_router)
    return app


app = create_app()
