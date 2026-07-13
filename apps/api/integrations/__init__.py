"""Wrapped external calls only: GitHub API, LLM provider, embedding provider
(RULES.md §6). Never called directly from `services/` or `pipeline/` — this
is what makes retry logic and the eval harness implementable in one place."""
