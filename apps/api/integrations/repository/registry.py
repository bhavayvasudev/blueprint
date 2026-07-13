"""Factory: config value -> concrete `RepositoryProvider` (DECISIONS.md
ADR-023). The only module in the codebase that imports a concrete
provider class directly — everywhere else (services/) depends on
`integrations.repository.base.RepositoryProvider`. Mirrors
`integrations.embeddings.registry` exactly.
"""

from functools import lru_cache

from config import Settings, get_settings
from integrations.github.config import GitHubAppConfig
from integrations.github.installation_tokens import InstallationTokenCache
from integrations.repository.base import RepositoryProvider
from integrations.repository.github_provider import GitHubRepositoryProvider


def build_repository_provider(settings: Settings) -> RepositoryProvider:
    """Pure, uncached — takes `Settings` explicitly so callers (and
    tests) can construct a provider for arbitrary settings without going
    through the process-wide singleton below. Raises
    `integrations.github.exceptions.GitHubAppConfigError` if
    `settings.repository_provider == "github"` and the required GitHub
    App environment variables aren't set — this is the "fail fast on
    missing credentials" behavior surfacing at the point the provider is
    actually needed."""
    if settings.repository_provider == "github":
        config = GitHubAppConfig.from_settings(settings)
        token_cache = InstallationTokenCache(config)
        return GitHubRepositoryProvider(config, token_cache)
    raise ValueError(
        f"Unknown repository_provider {settings.repository_provider!r} — expected 'github'."
    )


@lru_cache
def get_repository_provider() -> RepositoryProvider:
    return build_repository_provider(get_settings())
