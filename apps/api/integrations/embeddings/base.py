"""The embedding provider abstraction (DECISIONS.md ADR-021).

Every concrete embedding backend implements this Protocol identically;
pipeline/service code depends only on this interface, obtained via
`registry.get_embedding_provider()`, never on a concrete provider class
directly. This is what makes swapping providers (OpenRouter-routed
models, a dependency-free local provider, or — not yet implemented but
slottable without interface changes — direct Voyage/Jina/
sentence-transformers backends) a config change, not a rewrite of
every call site.

Structural (`typing.Protocol`), not an ABC: a concrete provider doesn't
need to inherit from anything here, it just needs to have the right
shape — one less coupling point between this module and every provider
implementation.
"""

from typing import Protocol, runtime_checkable


@runtime_checkable
class EmbeddingProvider(Protocol):
    @property
    def model_name(self) -> str:
        """Identifies which model produced a vector — provenance, not
        used for routing."""
        ...

    @property
    def dimensions(self) -> int:
        """Output vector width. Must match the configured pgvector
        column width (`models.types.EMBEDDING_DIM`) for a provider to be
        usable without a migration — see DECISIONS.md ADR-018, ADR-021."""
        ...

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Batch-embeds text meant to be *indexed* (code/doc chunks)."""
        ...

    def embed_query(self, text: str) -> list[float]:
        """Embeds a single search query. A separate method from
        `embed_documents` deliberately: several real providers (Voyage,
        Jina, many sentence-transformers models) use a different,
        retrieval-optimized mode for queries than for the documents
        being indexed — collapsing both into one method would make that
        distinction impossible to express through this interface."""
        ...
