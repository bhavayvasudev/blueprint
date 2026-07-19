"""Chunks Stage 1 facts (code) or raw doc text, embeds them via an
injected `EmbeddingProvider`, and persists `code_chunks`/`doc_chunks`
rows. DB write logic lives here per RULES.md §6 — `pipeline/` stays
storage-agnostic and `integrations/embeddings/` stays provider-agnostic
(DECISIONS.md ADR-021); this module is where those two pure layers meet
the database.
"""

import uuid
from collections.abc import Iterable

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


def embed_and_persist_repository_code_chunks(
    session: Session,
    embedding_provider: EmbeddingProvider,
    sources: Iterable[tuple[File, SourceFileFacts, str]],
    *,
    max_chunks: int | None = None,
) -> tuple[list[CodeChunk], bool]:
    """The whole-repository counterpart to `embed_and_persist_code_chunks`,
    used by the sync pipeline. Returns the persisted rows and whether
    `max_chunks` truncated the pass.

    It exists for one reason: batching. The per-file function issues at least
    one embedding request per file, so a 1,300-file repository costs ~1,300
    round trips to the provider. Collecting every chunk spec first lets the
    provider batch across file boundaries, turning the same work into a few
    hundred requests. Chunk *boundaries* are unchanged — this reuses
    `build_code_chunks` verbatim — so retrieval quality is identical; only the
    request pattern differs.

    Chunks are collected in the caller's file order and truncated from the
    end, so a truncated pass keeps a deterministic prefix rather than an
    arbitrary sample.
    """
    specs: list[tuple[File, object]] = []
    for file_row, facts, source_text in sources:
        for spec in build_code_chunks(facts, source_text):
            specs.append((file_row, spec))
            if max_chunks is not None and len(specs) >= max_chunks:
                return _persist_code_specs(session, embedding_provider, specs), True
    return _persist_code_specs(session, embedding_provider, specs), False


def _persist_code_specs(
    session: Session, embedding_provider: EmbeddingProvider, specs: list[tuple[File, object]]
) -> list[CodeChunk]:
    if not specs:
        return []
    embeddings = embedding_provider.embed_documents([spec.content for _, spec in specs])
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
        for (file_row, spec), embedding in zip(specs, embeddings, strict=True)
    ]
    session.add_all(rows)
    session.flush()
    return rows


def embed_and_persist_repository_doc_chunks(
    session: Session,
    embedding_provider: EmbeddingProvider,
    snapshot_id: uuid.UUID,
    documents: Iterable[tuple[str, str]],
    *,
    max_chunks: int | None = None,
) -> tuple[list[DocChunk], bool]:
    """Whole-repository doc indexing from `(source_path, content)` pairs, for
    the same batching reason as the code counterpart above. Returns the
    persisted rows and whether `max_chunks` truncated the pass.

    The caller (`services/pipeline_runner`) passes documents README-first, so
    a truncated pass still indexes the one document repository-level questions
    most depend on."""
    specs = []
    truncated = False
    for source_path, content in documents:
        for spec in build_doc_chunks(source_path, content):
            specs.append(spec)
            if max_chunks is not None and len(specs) >= max_chunks:
                truncated = True
                break
        if truncated:
            break

    if not specs:
        return [], truncated

    embeddings = embedding_provider.embed_documents([spec.content for spec in specs])
    rows = [
        DocChunk(
            snapshot_id=snapshot_id,
            source_path=spec.source_path,
            section_title=spec.section_title,
            content=spec.content,
            embedding=embedding,
        )
        for spec, embedding in zip(specs, embeddings, strict=True)
    ]
    session.add_all(rows)
    session.flush()
    return rows, truncated


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
