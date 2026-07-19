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
    github_app_slug: str = ""
    github_webhook_secret: str = ""

    jwt_secret: str = ""

    # DECISIONS.md ADR-023: which RepositoryProvider implementation
    # integrations/repository/registry.py hands back. "github" is the
    # only MVP implementation; the value exists as a config seam so a
    # future GitLab/Bitbucket/Azure DevOps provider is a config change,
    # not a rewrite of services/repository_connection_service.py.
    repository_provider: str = "github"

    # Where GitHub redirects back to after OAuth/installation, and where
    # this API's own callback endpoints are reachable from GitHub's side
    # — both must be real, reachable URLs outside local dev.
    frontend_url: str = "http://localhost:3000"
    api_base_url: str = "http://localhost:8000"

    openrouter_api_key: str = ""

    # DECISIONS.md ADR-021: which EmbeddingProvider implementation
    # integrations/embeddings/registry.py hands back — swapping providers
    # is this one config value, never a code change in callers.
    # "local_hash" (no API key, no network) is the default so local dev
    # and tests work with zero configuration; production deployments set
    # this to "openrouter" explicitly (ARCHITECTURE.md §10).
    embedding_provider: str = "local_hash"
    # Only consulted by the "openrouter" provider — an OpenRouter model
    # identifier, not fixed by this document (ARCHITECTURE.md §10: model
    # choice left open pending Stage 4's own accuracy/cost comparison).
    embedding_model: str = "openai/text-embedding-3-small"
    # Only consulted by the "nvidia" provider. An asymmetric retrieval-QA
    # model: it distinguishes "query" from "passage" at embed time, which is
    # what `EmbeddingProvider`'s two-method split expresses. Emits
    # 1024-dimensional vectors, matching `models.types.EMBEDDING_DIM` — the
    # two must agree or indexing fails at the pgvector insert.
    nvidia_embedding_model: str = "nvidia/nv-embedqa-e5-v5"

    # --- Threads: the repository-conversation LLM (ARCHITECTURE.md §13's
    # Stage-11-style exception — a light, grounded retrieval + one LLM call
    # in the request path, never the full reasoning pipeline). The provider
    # is a config seam like `embedding_provider`: "nvidia" is the only
    # implementation today (integrations/llm/registry.py). "none" is a
    # first-class value, not an error — it makes the Threads room degrade
    # to an honest "no reasoning model is configured" state rather than
    # 500ing, so local dev and CI work with zero credentials.
    llm_provider: str = "nvidia"
    # NVIDIA's OpenAI-compatible inference endpoint. Swappable so the same
    # client also works against a self-hosted NIM without a new provider
    # class. The chat model is NVIDIA Nemotron (the spec's "Nemotron 3
    # Ultra") — kept configurable, not hardcoded, since model ids on the
    # hosted catalog change and the accuracy/cost pick isn't frozen here.
    nvidia_api_key: str = ""
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_model: str = "nvidia/nemotron-3-ultra-550b-a55b"
    # Sampling/output defaults for the NVIDIA chat provider. Not exposed as
    # env vars (no product need to tune these per-deployment yet) — just a
    # single place to change them if that changes.
    nvidia_top_p: float = 0.9
    nvidia_max_output_tokens: int = 4096
    nvidia_enable_reasoning: bool = True

    environment: str = "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
