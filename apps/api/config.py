"""Process-wide settings, read once from the environment.

Lives at the package root (not under ``api/``) because both the FastAPI
app and the worker/pipeline package need it, and ``pipeline/`` is not
permitted to import from ``api/`` (RULES.md §6).
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://blueprint:blueprint@localhost:5432/blueprint"
    redis_url: str = "redis://localhost:6379/0"

    github_app_id: str = ""
    github_app_private_key: str = ""
    github_app_client_id: str = ""
    github_app_client_secret: str = ""
    github_webhook_secret: str = ""

    jwt_secret: str = ""

    openrouter_api_key: str = ""

    environment: str = "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
