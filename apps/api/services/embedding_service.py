"""Chunks Stage 1 facts (code) or raw doc text, embeds them via an
injected `EmbeddingProvider`, and persists `code_chunks`/`doc_chunks`
rows. DB write logic lives here per RULES.md §6 — `pipeline/` stays
storage-agnostic and `integrations/embeddings/` stays provider-agnostic
(DECISIONS.md ADR-021); this module is where those two pure layers meet
the database.
"""

import uuid

from sqlalchemy.orm import Session

from integrations.embeddings.base import EmbeddingProvider
from models.chunks import CodeChunk, DocChunk
from models.repository import File
from pipeline.ingestion.chunking import build_code_chunks, build_doc_chunks
from pipeline.ingestion.facts import SourceFileFacts


def embed_and_persist_code_chunks(
    session: Session,
    embedding_provider: EmbeddingProvider,
    file_row: File,
    facts: SourceFileFacts,
    source_text: str,
) -> list[CodeChunk]:
    chunk_specs = build_code_chunks(facts, source_text)
    if not chunk_specs:
        return []

    embeddings = embedding_provider.embed_documents([spec.content for spec in chunk_specs])

    rows = [
        CodeChunk(
            file_id=file_row.id,
            symbol_name=spec.symbol_name,
            symbol_type=spec.symbol_type,
            start_line=spec.start_line,
            end_line=spec.end_line,
            embedding=embedding,
            content_hash=spec.content_hash,
            content=spec.content,
        )
        for spec, embedding in zip(chunk_specs, embeddings, strict=True)
    ]
    session.add_all(rows)
    session.flush()
    return rows


def embed_and_persist_doc_chunks(
    session: Session,
    embedding_provider: EmbeddingProvider,
    snapshot_id: uuid.UUID,
    source_path: str,
    content: str,
) -> list[DocChunk]:
    chunk_specs = build_doc_chunks(source_path, content)
    if not chunk_specs:
        return []

    embeddings = embedding_provider.embed_documents([spec.content for spec in chunk_specs])

    rows = [
        DocChunk(
            snapshot_id=snapshot_id,
            source_path=spec.source_path,
            section_title=spec.section_title,
            content=spec.content,
            embedding=embedding,
        )
        for spec, embedding in zip(chunk_specs, embeddings, strict=True)
    ]
    session.add_all(rows)
    session.flush()
    return rows
