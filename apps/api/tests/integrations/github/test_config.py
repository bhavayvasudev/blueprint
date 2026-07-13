import pytest

from config import Settings
from integrations.github.config import REQUIRED_ENV_VARS, GitHubAppConfig
from integrations.github.exceptions import GitHubAppConfigError


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


def test_from_settings_builds_config_when_all_vars_present() -> None:
    config = GitHubAppConfig.from_settings(_settings())
    assert config.app_id == "123"
    assert config.client_id == "client-id"
    assert config.client_secret == "client-secret"
    assert config.slug == "blueprint-dev"
    assert "BEGIN" in config.private_key


def test_missing_vars_raise_with_exact_names() -> None:
    settings = _settings(github_app_id="", github_app_client_secret="")
    with pytest.raises(GitHubAppConfigError) as exc_info:
        GitHubAppConfig.from_settings(settings)
    assert "GITHUB_APP_ID" in exc_info.value.missing
    assert "GITHUB_APP_CLIENT_SECRET" in exc_info.value.missing
    assert "GITHUB_APP_CLIENT_ID" not in exc_info.value.missing


def test_required_env_vars_are_documented_on_the_class() -> None:
    assert GitHubAppConfig.REQUIRED_ENV_VARS == REQUIRED_ENV_VARS
    assert set(REQUIRED_ENV_VARS) == {
        "GITHUB_APP_ID",
        "GITHUB_APP_PRIVATE_KEY",
        "GITHUB_APP_CLIENT_ID",
        "GITHUB_APP_CLIENT_SECRET",
        "GITHUB_APP_SLUG",
    }


def test_private_key_with_escaped_newlines_is_normalized() -> None:
    settings = _settings(
        github_app_private_key=(
            "-----BEGIN RSA PRIVATE KEY-----\\nFAKEKEYBODYFORTESTSONLY\\n-----END RSA PRIVATE KEY-----"
        )
    )
    config = GitHubAppConfig.from_settings(settings)
    assert "\\n" not in config.private_key
    assert "\n" in config.private_key


def test_private_key_not_looking_like_pem_raises() -> None:
    settings = _settings(github_app_private_key="not-a-pem-at-all")
    with pytest.raises(GitHubAppConfigError, match="does not look like a"):
        GitHubAppConfig.from_settings(settings)


def test_private_key_truncated_to_begin_marker_only_raises() -> None:
    """The exact failure mode of pasting a raw, multi-line .pem directly
    into .env: python-dotenv silently keeps only the first line, which
    still contains "BEGIN" and "PRIVATE KEY" but is missing the body and
    END marker entirely. This must fail fast at config-build time, not
    deep inside JWT signing."""
    settings = _settings(github_app_private_key="-----BEGIN RSA PRIVATE KEY-----")
    with pytest.raises(GitHubAppConfigError, match="does not look like a complete"):
        GitHubAppConfig.from_settings(settings)
