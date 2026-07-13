"""Pure, pre-embedding chunk data (ARCHITECTURE.md §3.4, §11).

No embedding vector here — chunking (`chunking.py`'s output) and
embedding (`integrations/embeddings/`) are deliberately separate steps,
so chunk boundaries never change if the embedding provider does, and
vice versa (DECISIONS.md ADR-021).
"""

from pydantic import BaseModel


class CodeChunkSpec(BaseModel):
    file_path: str
    symbol_name: str
    symbol_type: str
    start_line: int
    end_line: int
    content: str
    content_hash: str


class DocChunkSpec(BaseModel):
    source_path: str
    section_title: str
    content: str
