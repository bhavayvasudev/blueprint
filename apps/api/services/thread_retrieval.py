"""Gathers the real repository evidence a Threads answer is grounded in,
resolved to files and symbols. Two sources, composed:

1. The hybrid chunk retriever (`HybridRetrievalService`) — vector + keyword
   + graph-neighbor expansion over `code_chunks`/`doc_chunks`, with the
   chunk's actual source as the excerpt. This is the rich path.
2. A structural fallback over the Knowledge Graph (`graph_nodes`) and
   `files` — real symbols and file paths the question's keywords match.

The fallback matters because `/sync` today runs Stages 1–3 only (embeddings
are Stage 4, deferred — DECISIONS.md ADR-025), so a freshly-studied
repository has a full Knowledge Graph but no chunks yet. Rather than the
Threads room being dead until Stage 4 lands, it grounds on the structural
evidence that genuinely exists — honestly marked "name-level" (no source
body) so the model reasons only as far as that evidence supports. When
Stage 4 is wired in, source-level evidence appears automatically through
path 1, no change here. This is grounding degrading gracefully, never
faking (PRODUCT.md §5)."""

import logging
import re
import uuid
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from integrations.embeddings.base import EmbeddingProvider
from models.chunks import CodeChunk, DocChunk
from models.graph import GraphNode
from models.repository import File, RepoSnapshot
from models.types import GraphType
from pipeline.retrieval.grounding import Evidence
from pipeline.retrieval.intent import QuestionIntent
from pipeline.retrieval.interfaces import ScoredChunk
from services.retrieval_service import HybridRetrievalService

logger = logging.getLogger(__name__)

_MAX_EXCERPT_CHARS = 1200
_STOPWORDS = frozenset(
    {
        "the", "and", "for", "how", "does", "do", "is", "are", "was", "were", "what",
        "where", "when", "which", "who", "why", "this", "that", "these", "those",
        "with", "from", "into", "show", "explain", "find", "list", "all", "get",
        "can", "you", "use", "used", "using", "work", "works", "there", "have", "has",
        "about", "give", "tell", "any", "our", "its", "it's", "a", "an", "of", "in",
        "on", "to", "me", "my",
    }
)


class RetrievalFailure(StrEnum):
    """Why a retrieval produced no usable evidence — a specific, checked
    cause, never a shrug.

    This enum exists because every one of these conditions used to surface
    identically: the model received an empty evidence list, was correctly
    told to admit when evidence was insufficient, and said "I couldn't
    retrieve repository context". That sentence was true but useless — it
    conflated "this repository was never indexed" (a fixable system state)
    with "this repository has no answer to your question" (a real answer).
    Each member below is distinguishable by a real check against real state,
    and each carries a different remedy for the user.
    """

    NOT_INDEXED = "not_indexed"
    """The snapshot predates Stage 4, so no chunk was ever written for it."""

    INDEXING_FAILED = "indexing_failed"
    """Stage 4 ran and errored; `index_status["error"]` holds the reason."""

    INDEXING_TRUNCATED = "indexing_truncated"
    """Stage 4 hit its chunk ceiling, so coverage is real but incomplete."""

    NO_README = "no_readme"
    """No README was indexed — repository-level questions have no anchor."""

    EMBEDDINGS_MISSING = "embeddings_missing"
    """Indexing reported success but the chunk tables are empty anyway —
    a genuine inconsistency worth naming rather than silently retrying."""

    VECTOR_SEARCH_FAILED = "vector_search_failed"
    """The hybrid retriever raised (provider down, dimension mismatch, a
    pgvector error). Distinct from "searched and found nothing"."""

    RETRIEVAL_EMPTY = "retrieval_empty"
    """Everything is indexed and healthy; this question simply matched
    nothing. The one member here that is a legitimate answer, not a fault."""


# Failure -> (what happened, what the user can do). Kept as data next to the
# enum so the wording is reviewable in one place rather than interpolated at
# a dozen call sites, and so the API can serve the same text the prompt sees.
_FAILURE_COPY: dict[RetrievalFailure, tuple[str, str]] = {
    RetrievalFailure.NOT_INDEXED: (
        "This snapshot was studied before repository indexing existed, so no "
        "searchable content was ever created for it.",
        "Re-sync this repository to index it.",
    ),
    RetrievalFailure.INDEXING_FAILED: (
        "Indexing failed while this repository was being studied, so its "
        "content was never made searchable.",
        "Re-sync this repository. If it fails again, the error above is the cause.",
    ),
    RetrievalFailure.INDEXING_TRUNCATED: (
        "This repository was only partly indexed — it exceeded the per-study "
        "chunk limit, so later files were not made searchable.",
        "Answers cover the indexed portion only. Narrow the question to a specific "
        "file or module for better coverage.",
    ),
    RetrievalFailure.NO_README: (
        "No README was indexed for this repository, so there is no "
        "project-level description to ground an overview answer in.",
        "Add a README to the repository and re-sync, or ask about a specific "
        "file, symbol, or module instead.",
    ),
    RetrievalFailure.EMBEDDINGS_MISSING: (
        "Indexing reported success but no searchable content exists for this "
        "snapshot — the two disagree, which points at an interrupted study.",
        "Re-sync this repository.",
    ),
    RetrievalFailure.VECTOR_SEARCH_FAILED: (
        "The search backend failed while looking through this repository.",
        "This is a system fault, not a gap in the repository. Try again; if it "
        "persists, the error above is the cause.",
    ),
    RetrievalFailure.RETRIEVAL_EMPTY: (
        "This repository is fully indexed, but nothing in it matched the question.",
        "Try naming a specific file, function, or module.",
    ),
}


@dataclass
class RetrievalDiagnostic:
    """The checked, reportable state of one retrieval attempt.

    Always produced, including on success — `ok=True` with the counts is what
    makes "retrieval is working, your question just didn't match" a claim
    Blueprint can actually stand behind rather than a guess.
    """

    ok: bool
    evidence_count: int
    code_chunks_available: int
    doc_chunks_available: int
    readme_indexed: bool
    failure: RetrievalFailure | None = None
    detail: str | None = None
    remedy: str | None = None
    # Verbatim provider/stage error, when one exists. Surfaced rather than
    # swallowed — "return WHY" means the real message, not a category alone.
    error: str | None = None
    checks: dict[str, Any] = field(default_factory=dict)

    @property
    def message(self) -> str:
        parts = [p for p in (self.detail, self.error, self.remedy) if p]
        return " ".join(parts)

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "evidence_count": self.evidence_count,
            "failure": self.failure.value if self.failure else None,
            "detail": self.detail,
            "remedy": self.remedy,
            "error": self.error,
            "checks": self.checks,
        }


@dataclass
class RetrievalResult:
    """Evidence plus the reason there isn't more of it."""

    evidence: list[Evidence]
    diagnostic: RetrievalDiagnostic


def _index_health(db: Session, snapshot: RepoSnapshot) -> dict[str, Any]:
    """The real, counted state of a snapshot's searchable content. Counts
    come from the chunk tables themselves, not from `index_status`'s
    self-report, so a study that *claimed* success but wrote nothing is
    caught rather than believed."""
    code_available = db.execute(
        select(func.count(CodeChunk.id))
        .select_from(CodeChunk)
        .join(File, File.id == CodeChunk.file_id)
        .where(File.snapshot_id == snapshot.id)
    ).scalar_one()
    doc_available = db.execute(
        select(func.count(DocChunk.id)).where(DocChunk.snapshot_id == snapshot.id)
    ).scalar_one()

    status = snapshot.index_status or {}
    return {
        "code_chunks": int(code_available),
        "doc_chunks": int(doc_available),
        "index_status_present": snapshot.index_status is not None,
        "readme_indexed": bool(status.get("readme_indexed")),
        "manifest_present": snapshot.manifest is not None,
        "indexing_error": status.get("error"),
        "truncated": bool(status.get("truncated")),
        "docs_discovered": status.get("docs_discovered"),
    }


def diagnose_retrieval(
    db: Session,
    *,
    snapshot: RepoSnapshot,
    evidence_count: int,
    search_error: str | None = None,
) -> RetrievalDiagnostic:
    """Decide, from real state, why this retrieval returned what it did.

    Ordered most-fundamental cause first: a repository that was never indexed
    is not also "a question that matched nothing" — reporting the downstream
    symptom when the upstream cause is known is exactly the silent failure
    this function exists to end.
    """
    health = _index_health(db, snapshot)
    total_chunks = health["code_chunks"] + health["doc_chunks"]

    def build(failure: RetrievalFailure | None, error: str | None = None) -> RetrievalDiagnostic:
        detail, remedy = _FAILURE_COPY[failure] if failure else (None, None)
        return RetrievalDiagnostic(
            ok=failure is None,
            evidence_count=evidence_count,
            code_chunks_available=health["code_chunks"],
            doc_chunks_available=health["doc_chunks"],
            readme_indexed=health["readme_indexed"],
            failure=failure,
            detail=detail,
            remedy=remedy,
            error=error,
            checks=health,
        )

    # A search-backend fault outranks everything: the index may be perfect and
    # we still learned nothing, so no conclusion about coverage is warranted.
    if search_error is not None:
        return build(RetrievalFailure.VECTOR_SEARCH_FAILED, search_error)

    # Evidence in hand means retrieval worked. Coverage caveats still get
    # reported (truncated / no README), because an answer built on a partial
    # index should say so — but they never mark the result as failed.
    if evidence_count > 0:
        if health["truncated"]:
            diagnostic = build(RetrievalFailure.INDEXING_TRUNCATED)
            diagnostic.ok = True
            return diagnostic
        return build(None)

    if not health["index_status_present"] and total_chunks == 0:
        return build(RetrievalFailure.NOT_INDEXED)
    if health["indexing_error"]:
        return build(RetrievalFailure.INDEXING_FAILED, str(health["indexing_error"]))
    if total_chunks == 0:
        return build(RetrievalFailure.EMBEDDINGS_MISSING)
    if not health["readme_indexed"] and health["doc_chunks"] == 0:
        return build(RetrievalFailure.NO_README)
    if health["truncated"]:
        return build(RetrievalFailure.INDEXING_TRUNCATED)
    return build(RetrievalFailure.RETRIEVAL_EMPTY)


def _keywords(query: str) -> list[str]:
    """Content terms from the question for structural matching — lowercased,
    de-stopworded, short tokens dropped. Deterministic and dependency-free;
    good enough to turn "how does authentication work" into ["authentication"]."""
    terms = [t.lower() for t in re.findall(r"[A-Za-z0-9_]+", query)]
    seen: dict[str, None] = {}
    for term in terms:
        if len(term) >= 3 and term not in _STOPWORDS:
            seen.setdefault(term, None)
    return list(seen)


def _truncate(text: str) -> str:
    text = text.strip()
    return text if len(text) <= _MAX_EXCERPT_CHARS else text[:_MAX_EXCERPT_CHARS].rstrip() + "\n…"


def _resolve_chunk_evidence(
    db: Session, scored: list[ScoredChunk], *, index_start: int
) -> tuple[list[Evidence], set[str]]:
    """Resolve `ScoredChunk`s to `Evidence` with real file paths and source
    excerpts. Returns the evidence and the set of dedupe keys it occupies."""
    code_ids = [s.chunk_id for s in scored if s.chunk_type == "code"]
    doc_ids = [s.chunk_id for s in scored if s.chunk_type == "doc"]
    sources_by_id = {s.chunk_id: s.sources for s in scored}

    code_by_id: dict[uuid.UUID, tuple[CodeChunk, str]] = {}
    if code_ids:
        for chunk, path in db.execute(
            select(CodeChunk, File.path).join(File, File.id == CodeChunk.file_id).where(
                CodeChunk.id.in_(code_ids)
            )
        ).all():
            code_by_id[chunk.id] = (chunk, path)
    doc_by_id: dict[uuid.UUID, DocChunk] = {}
    if doc_ids:
        for chunk in db.execute(select(DocChunk).where(DocChunk.id.in_(doc_ids))).scalars().all():
            doc_by_id[chunk.id] = chunk

    evidence: list[Evidence] = []
    keys: set[str] = set()
    index = index_start
    for s in scored:  # preserve the retriever's fused ranking
        if s.chunk_type == "code" and s.chunk_id in code_by_id:
            chunk, path = code_by_id[s.chunk_id]
            key = f"code:{path}:{chunk.start_line}:{chunk.end_line}"
            if key in keys:
                continue
            keys.add(key)
            evidence.append(
                Evidence(
                    index=index,
                    chunk_type="code",
                    file_path=path,
                    symbol_name=chunk.symbol_name,
                    symbol_type=chunk.symbol_type,
                    start_line=chunk.start_line,
                    end_line=chunk.end_line,
                    excerpt=_truncate(chunk.content),
                    sources=sources_by_id.get(s.chunk_id, []),
                )
            )
            index += 1
        elif s.chunk_type == "doc" and s.chunk_id in doc_by_id:
            chunk = doc_by_id[s.chunk_id]
            key = f"doc:{chunk.source_path}:{chunk.section_title}"
            if key in keys:
                continue
            keys.add(key)
            evidence.append(
                Evidence(
                    index=index,
                    chunk_type="doc",
                    file_path=chunk.source_path,
                    symbol_name=chunk.section_title or None,
                    symbol_type="doc-section",
                    excerpt=_truncate(chunk.content),
                    sources=sources_by_id.get(s.chunk_id, []),
                )
            )
            index += 1
    return evidence, keys


def _structural_evidence(
    db: Session, *, snapshot_id: uuid.UUID, keywords: list[str], limit: int, index_start: int,
    taken_keys: set[str],
) -> list[Evidence]:
    """Real symbols (Knowledge Graph) and files whose name matches the
    question — the grounding that exists after Stages 1–3 alone. Name-level
    only (no source body), which the prompt discloses honestly."""
    if not keywords or limit <= 0:
        return []
    node_filters = [func.lower(GraphNode.label).like(f"%{kw}%") for kw in keywords]
    symbol_rows = db.execute(
        select(GraphNode.label, GraphNode.node_type, File.path)
        .join(File, File.id == GraphNode.file_id)
        .where(
            GraphNode.snapshot_id == snapshot_id,
            GraphNode.graph_type == GraphType.KNOWLEDGE,
            GraphNode.file_id.is_not(None),
            or_(*node_filters),
        )
        .limit(limit)
    ).all()

    evidence: list[Evidence] = []
    keys = set(taken_keys)
    index = index_start
    for label, node_type, path in symbol_rows:
        key = f"symbol:{path}:{label}"
        if key in keys:
            continue
        keys.add(key)
        evidence.append(
            Evidence(
                index=index,
                chunk_type="symbol",
                file_path=path,
                symbol_name=label,
                symbol_type=node_type,
                sources=["knowledge_graph"],
            )
        )
        index += 1
        if len(evidence) >= limit:
            return evidence

    remaining = limit - len(evidence)
    if remaining > 0:
        file_filters = [func.lower(File.path).like(f"%{kw}%") for kw in keywords]
        file_rows = db.execute(
            select(File.path)
            .where(
                File.snapshot_id == snapshot_id,
                or_(*file_filters),
            )
            .limit(remaining * 2)
        ).all()
        for (path,) in file_rows:
            key = f"file:{path}"
            if key in keys:
                continue
            keys.add(key)
            evidence.append(
                Evidence(index=index, chunk_type="file", file_path=path, sources=["file_match"])
            )
            index += 1
            if len(evidence) >= limit:
                break
    return evidence


# Which manifest cards each repository-level intent leads with, in priority
# order. A repository question is answered from the manifest *first* (the
# README and the project's real shape), then topped up with hybrid/structural
# evidence — the exact inversion of the code path, where the manifest never
# appears. `CODE` is absent on purpose: it takes the untouched hybrid path.
_MANIFEST_CARD_ORDER: dict[QuestionIntent, tuple[str, ...]] = {
    QuestionIntent.OVERVIEW: ("description", "features", "stack", "entrypoints", "modules", "usage"),
    QuestionIntent.ARCHITECTURE: ("modules", "architecture", "stack", "entrypoints", "description"),
    QuestionIntent.DOCUMENTATION: ("description", "installation", "usage", "features", "doc_audit"),
}


def _manifest_cards(manifest: dict[str, Any]) -> dict[str, tuple[str | None, str | None, str]]:
    """Every manifest card that has real content, keyed by name, as
    (file_path, label, excerpt). README-derived cards carry the README's real
    path so the citation opens the file; the rest are structural summaries of
    detections already made, located to no single file."""
    cards: dict[str, tuple[str | None, str | None, str]] = {}
    readme = manifest.get("readme") or {}
    readme_path = readme.get("source_path")

    if readme.get("description"):
        cards["description"] = (readme_path, readme.get("title") or "Overview", readme["description"])
    for readme_field, label in (
        ("features", "Features"),
        ("installation", "Installation"),
        ("architecture", "Architecture"),
        ("usage", "Usage"),
        ("limitations", "Known Limitations"),
    ):
        if readme.get(readme_field):
            cards[readme_field] = (readme_path, label, readme[readme_field])

    stack = manifest.get("tech_stack") or {}
    stack_parts = list(stack.get("languages") or []) + list(stack.get("frameworks") or [])
    if stack_parts:
        cards["stack"] = (None, "Tech Stack", ", ".join(stack_parts))

    entrypoints = manifest.get("entrypoints") or []
    if entrypoints:
        cards["entrypoints"] = (None, "Entrypoints", "\n".join(entrypoints))

    modules = manifest.get("modules") or []
    if modules:
        labels = [f"{m['name']} ({m['kind']})" for m in modules if m.get("name")]
        if labels:
            cards["modules"] = (None, "Modules", "\n".join(labels))

    audit = manifest.get("doc_audit") or {}
    if audit.get("present") or audit.get("missing"):
        summary = f"Present: {', '.join(audit.get('present') or []) or 'none'}\n"
        summary += f"Missing: {', '.join(audit.get('missing') or []) or 'none'}"
        cards["doc_audit"] = (None, "Project Hygiene", summary)

    return cards


def _manifest_evidence(
    manifest: dict[str, Any], intent: QuestionIntent, *, index_start: int, limit: int
) -> list[Evidence]:
    """The manifest cards this intent leads with, resolved to numbered
    `Evidence`. Real, verbatim content only (README slices, detected stack,
    the module rollup) — the same grounding contract as chunk evidence, just
    sourced from the precomputed card instead of a live search."""
    cards = _manifest_cards(manifest)
    ordered = _MANIFEST_CARD_ORDER.get(intent, ())
    evidence: list[Evidence] = []
    index = index_start
    for name in ordered:
        if name not in cards or len(evidence) >= limit:
            continue
        file_path, label, excerpt = cards[name]
        evidence.append(
            Evidence(
                index=index,
                chunk_type="manifest",
                file_path=file_path,
                symbol_name=label,
                symbol_type="manifest-section",
                excerpt=_truncate(excerpt),
                sources=["readme" if file_path else "repository_manifest"],
            )
        )
        index += 1
    return evidence


def _code_evidence(
    db: Session,
    *,
    snapshot_id: uuid.UUID,
    query: str,
    embedding_provider: EmbeddingProvider,
    limit: int,
    index_start: int = 1,
) -> tuple[list[Evidence], str | None]:
    """The hybrid-chunk + structural-fallback grounding set, plus the search
    backend's error if it raised. Factored out so the manifest-led intents can
    reuse it to top themselves up while `CODE` uses it alone."""
    if limit <= 0:
        return [], None
    retriever = HybridRetrievalService(db, embedding_provider)
    try:
        scored = retriever.search(query, snapshot_id=snapshot_id, top_k=limit)
    except Exception as exc:
        # A retriever fault (embedding provider down, dimension mismatch, a
        # pgvector error) must not read as "this repository has nothing" —
        # that's the exact conflation `RetrievalFailure` exists to prevent.
        # The structural fallback below still runs, so a question can often
        # be answered from the Knowledge Graph anyway; the error is reported
        # alongside whatever that produces rather than replacing it.
        logger.exception("hybrid retrieval failed for snapshot=%s", snapshot_id)
        structural = _structural_evidence(
            db, snapshot_id=snapshot_id, keywords=_keywords(query), limit=limit,
            index_start=index_start, taken_keys=set(),
        )
        return structural, f"{type(exc).__name__}: {exc}"[:300]

    chunk_evidence, keys = _resolve_chunk_evidence(db, scored, index_start=index_start)

    if len(chunk_evidence) < limit:
        structural = _structural_evidence(
            db,
            snapshot_id=snapshot_id,
            keywords=_keywords(query),
            limit=limit - len(chunk_evidence),
            index_start=index_start + len(chunk_evidence),
            taken_keys=keys,
        )
        return chunk_evidence + structural, None
    return chunk_evidence, None


def retrieve_evidence(
    db: Session,
    *,
    snapshot: RepoSnapshot,
    query: str,
    embedding_provider: EmbeddingProvider,
    limit: int = 8,
    intent: QuestionIntent = QuestionIntent.CODE,
) -> RetrievalResult:
    """The Threads grounding set for one question, routed by `intent`
    (`pipeline/retrieval/intent.py`), paired with a diagnostic explaining the
    result. A `CODE` question — or any question on a snapshot with no manifest
    — takes the untouched hybrid+structural path. A repository-level question
    (`OVERVIEW`/`ARCHITECTURE`/`DOCUMENTATION`) leads with the precomputed
    manifest cards its intent prioritizes, then tops up with hybrid evidence,
    all capped at `limit` and numbered 1..n for citation.

    Takes the `RepoSnapshot` rather than a bare `snapshot_id` because the
    diagnostic needs the snapshot's `index_status` and `manifest` to say
    anything true about *why* a retrieval came back the way it did.
    """
    manifest = snapshot.manifest
    if intent == QuestionIntent.CODE or not manifest:
        evidence, search_error = _code_evidence(
            db, snapshot_id=snapshot.id, query=query,
            embedding_provider=embedding_provider, limit=limit,
        )
    else:
        # Lead with the manifest, but reserve room so a repository answer is
        # never *only* the card — hybrid evidence still grounds the specific
        # claim.
        manifest_budget = max(1, limit - 2)
        manifest_ev = _manifest_evidence(
            manifest, intent, index_start=1, limit=manifest_budget
        )
        topped_up, search_error = _code_evidence(
            db, snapshot_id=snapshot.id, query=query, embedding_provider=embedding_provider,
            limit=limit - len(manifest_ev), index_start=len(manifest_ev) + 1,
        )
        evidence = manifest_ev + topped_up

    diagnostic = diagnose_retrieval(
        db, snapshot=snapshot, evidence_count=len(evidence), search_error=search_error
    )
    if not diagnostic.ok:
        logger.warning(
            "retrieval snapshot=%s failure=%s checks=%s",
            snapshot.id, diagnostic.failure, diagnostic.checks,
        )
    return RetrievalResult(evidence=evidence, diagnostic=diagnostic)
