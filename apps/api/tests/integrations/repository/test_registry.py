import pytest

from config import Settings
from integrations.github.exceptions import GitHubAppConfigError
from integrations.repository.github_provider import GitHubRepositoryProvider
from integrations.repository.registry import build_repository_provider


def _settings(**overrides: object) -> Settings:
    base: dict[str, object] = {
        "_env_file": None,
        "github_app_id": "123",
        "github_app_private_key": (
            "-----BEGIN RSA PRIVATE KEY-----\nFAKEKEYBODYFORTESTSONLY\n-----END RSA PRIVATE KEY-----"
        ),
        "github_app_client_id": "client-id",
        "github_app_client_secret": "client-secret",
        "github_app_slug": "blueprint-dev",
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def test_github_is_the_default_and_only_mvp_provider() -> None:
    provider = build_repository_provider(_settings())
    assert isinstance(provider, GitHubRepositoryProvider)


def test_missing_github_app_config_fails_fast() -> None:
    settings = _settings(github_app_id="")
    with pytest.raises(GitHubAppConfigError):
        build_repository_provider(settings)


def test_unknown_provider_raises() -> None:
    settings = _settings(repository_provider="gitlab")
    with pytest.raises(ValueError, match="Unknown repository_provider"):
        build_repository_provider(settings)
