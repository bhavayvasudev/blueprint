"""GitHub App authentication and API access (DECISIONS.md ADR-024).

Everything here is GitHub-specific and talks to GitHub's REST API directly
— it is deliberately the *only* place that does. `services/` and
`pipeline/` never import from this package directly; they depend on
`integrations.repository.base.RepositoryProvider` instead (DECISIONS.md
ADR-023), obtained via `integrations.repository.registry`. The one
exception is OAuth *login* (`oauth.py`), which is inherently GitHub-specific
identity, not repository access, and is used directly by
`services/auth_service.py` — there is no login-provider abstraction
requirement in ARCHITECTURE.md, only a repository-access one.
"""
