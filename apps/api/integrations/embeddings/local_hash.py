"""A dependency-free, deterministic local embedding provider.

Not accuracy-competitive with a real model — it exists for three real
reasons, not as a placeholder: (1) local development and CI need zero
external credentials to exercise the full retrieval pipeline end to
end; (2) it's the concrete "local, no-network" provider category named
alongside OpenRouter/Voyage/Jina/sentence-transformers in DECISIONS.md
ADR-021, proving the `EmbeddingProvider` protocol actually varies in
implementation, not just in name; (3) unlike a real model, its output
is exactly reproducible, which matters for tests that assert on
retrieval ordering without a live model dependency.

The scheme: hashed character-trigram bag-of-features, projected into a
fixed-width vector via a signed hashing trick (the same idea behind
scikit-learn's `HashingVectorizer`), L2-normalized so cosine similarity
behaves sensibly. Swap this for a real sentence-transformers-backed
local provider by implementing the same protocol — no downstream code
changes required (that guarantee is the whole point of ADR-021).

Implements `integrations.embeddings.base.EmbeddingProvider` structurally
(no inheritance).
"""

import hashlib
import math

from models.types import EMBEDDING_DIM

_NGRAM_SIZE = 3


def _ngrams(text: str, n: int = _NGRAM_SIZE) -> list[str]:
    normalized = text.lower()
    if len(normalized) < n:
        return [normalized] if normalized else []
    return [normalized[i : i + n] for i in range(len(normalized) - n + 1)]


def _hash_embed(text: str, dimensions: int) -> list[float]:
    vector = [0.0] * dimensions
    for gram in _ngrams(text):
        digest = hashlib.sha256(gram.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimensions
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign

    norm = math.sqrt(sum(component * component for component in vector))
    if norm == 0.0:
        return vector
    return [component / norm for component in vector]


class LocalHashEmbeddingProvider:
    def __init__(self, *, dimensions: int = EMBEDDING_DIM) -> None:
        self._dimensions = dimensions

    @property
    def model_name(self) -> str:
        return "local-hash-ngram-v1"

    @property
    def dimensions(self) -> int:
        return self._dimensions

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [_hash_embed(text, self._dimensions) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        return _hash_embed(text, self._dimensions)
