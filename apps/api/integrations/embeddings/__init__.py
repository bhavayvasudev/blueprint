"""Embedding provider abstraction (DECISIONS.md ADR-021).

`base.EmbeddingProvider` is the interface every concrete provider
implements identically; `registry.get_embedding_provider()` is the only
place that should ever import a concrete provider class — everywhere
else (pipeline/, services/) depends on the protocol.
"""
