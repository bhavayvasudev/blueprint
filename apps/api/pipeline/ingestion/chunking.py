"""Stage 4 chunking (ARCHITECTURE.md §3.4): code chunked at function/
class granularity, docs chunked at section granularity — never
fixed-token windows. Pure functions over already-extracted Stage 1
facts (code) or raw markdown text (docs); no embedding happens here —
that's `integrations/embeddings/`, kept deliberately separate so chunk
boundaries don't change if the embedding provider does (DECISIONS.md
ADR-021).
"""

import hashlib
import re

from pipeline.ingestion.chunk_specs import CodeChunkSpec, DocChunkSpec
from pipeline.ingestion.facts import SourceFileFacts


def _slice_lines(source_lines: list[str], start_line: int, end_line: int) -> str:
    # start_line/end_line are 1-indexed and inclusive, matching
    # FunctionFact/ClassFact (pipeline/ingestion/facts.py).
    return "\n".join(source_lines[start_line - 1 : end_line])


def _content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def build_code_chunks(facts: SourceFileFacts, source_text: str) -> list[CodeChunkSpec]:
    """Pure function of one file's Stage 1 facts plus its own source
    text — the same per-file boundary `pipeline/graph/knowledge.py`'s
    `build_file_nodes` keeps, and for the same reason (DECISIONS.md
    ADR-019): a future content-hash cache can memoize this per file
    without touching any other file's chunks.

    Emits a chunk per top-level function, per class (the class's full
    source, for "give me the whole class" retrieval), and per method
    (for "give me this specific method" retrieval) — deliberately
    overlapping for classes with methods, since hybrid retrieval +
    reranking naturally prefers the more specific chunk when it's the
    better match, and dropping either granularity would make some real
    retrieval queries strictly worse.
    """
    source_lines = source_text.splitlines()
    chunks: list[CodeChunkSpec] = []

    for fn in facts.functions:
        content = _slice_lines(source_lines, fn.start_line, fn.end_line)
        chunks.append(
            CodeChunkSpec(
                file_path=facts.path,
                symbol_name=fn.qualified_name,
                symbol_type="function",
                start_line=fn.start_line,
                end_line=fn.end_line,
                content=content,
                content_hash=_content_hash(content),
            )
        )

    for cls in facts.classes:
        class_content = _slice_lines(source_lines, cls.start_line, cls.end_line)
        chunks.append(
            CodeChunkSpec(
                file_path=facts.path,
                symbol_name=cls.name,
                symbol_type="class",
                start_line=cls.start_line,
                end_line=cls.end_line,
                content=class_content,
                content_hash=_content_hash(class_content),
            )
        )
        for method in cls.methods:
            method_content = _slice_lines(source_lines, method.start_line, method.end_line)
            chunks.append(
                CodeChunkSpec(
                    file_path=facts.path,
                    symbol_name=method.qualified_name,
                    symbol_type="method",
                    start_line=method.start_line,
                    end_line=method.end_line,
                    content=method_content,
                    content_hash=_content_hash(method_content),
                )
            )

    return chunks


_HEADING_PATTERN = re.compile(r"^(#{1,6})\s+(.*)$")


def build_doc_chunks(source_path: str, content: str) -> list[DocChunkSpec]:
    """Section-granularity chunking (ARCHITECTURE.md §3.4) — splits on
    Markdown headings of any level. Content before the first heading
    becomes its own chunk (`section_title == ""`) rather than being
    silently dropped."""
    sections: list[tuple[str, list[str]]] = []
    current_title = ""
    current_lines: list[str] = []

    for line in content.splitlines():
        match = _HEADING_PATTERN.match(line)
        if match:
            if current_lines:
                sections.append((current_title, current_lines))
            current_title = match.group(2).strip()
            current_lines = [line]
        else:
            current_lines.append(line)
    if current_lines:
        sections.append((current_title, current_lines))

    chunks: list[DocChunkSpec] = []
    for title, section_lines in sections:
        text = "\n".join(section_lines).strip()
        if not text:
            continue
        chunks.append(DocChunkSpec(source_path=source_path, section_title=title, content=text))
    return chunks
