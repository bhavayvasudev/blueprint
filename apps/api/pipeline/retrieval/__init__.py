"""Stage 4's hybrid retrieval interface (ARCHITECTURE.md §3.4). Calling
code depends on `HybridRetriever` and the backend Protocols in
`interfaces.py`, never on a concrete storage/query implementation — see
`services/retrieval_service.py` for the concrete pgvector +
Postgres-full-text-search + Knowledge-Graph implementation, and
DECISIONS.md ADR-021 for why this is a separate seam from the embedding
provider abstraction (`integrations/embeddings/`).
"""
