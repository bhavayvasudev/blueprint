"""The RepositoryProvider abstraction (DECISIONS.md ADR-023).

`base.RepositoryProvider` is the interface every concrete Git-hosting
backend implements identically; `registry.get_repository_provider()` is
the only place that should ever import a concrete provider class —
everywhere else (`services/`, and eventually `pipeline/`) depends on the
protocol. `github_provider.GitHubRepositoryProvider` is the only MVP
implementation; a future GitLab/Bitbucket/Azure DevOps backend is a new
module here plus one line in `registry.py`, never a change to a caller.
"""
