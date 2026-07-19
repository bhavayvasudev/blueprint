"""Global search over one snapshot's real, already-extracted index — the
data behind the ⌘K palette.

Deliberately **lexical, not semantic** (RULES.md §1: deterministic before
probabilistic). Every hit here is a literal match against a name Blueprint
actually stored during a study: a file path, a symbol name Tree-sitter
parsed, a Markdown heading, a regex-matched route, a thread title. There is
no embedding call in this path, which is exactly why it can answer while
the user is still typing — a vector search would add a network round-trip
to the provider and turn an instant palette into a laggy one. Semantic,
"what does this repo do" search is Threads' job (`thread_retrieval.py`);
this is "take me to the thing I can already name".

Nothing here is invented: a group is absent when the underlying detection
found nothing, rather than being padded to look complete (RULES.md §23).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from models.chunks import CodeChunk, DocChunk
from models.repository import File, RepoSnapshot
from models.thread import Thread

# What a hit is, which drives both its group heading and how the frontend
# navigates to it. Kept as a closed vocabulary shared with the TypeScript
# `SearchHitKind` in `packages/shared-types` — adding a kind means adding it
# in both places, on purpose, so the two can't silently drift.
SearchHitKind = Literal[
    "file",
    "folder",
    "function",
    "class",
    "symbol",
    "route",
    "documentation",
    "readme",
    "thread",
]

# Per-group cap. The palette shows a handful per group and the whole point is
# to retype a better query, not to scroll a thousand rows.
_PER_GROUP_LIMIT = 6

# How many rows we're willing to pull out of Postgres per source before
# ranking in Python. Ranking needs to see more than it shows (an exact match
# could otherwise be cut off by an alphabetical LIMIT), but this stays bounded
# so a one-character query can't drag the whole index into memory.
_SCAN_LIMIT = 400

_MIN_QUERY_CHARS = 1


@dataclass(frozen=True)
class SearchHit:
    """One navigable result. `target` is a real, resolvable pointer — a
    repo-relative file path, a route path, a thread UUID — never a
    pre-baked URL: the frontend owns routing, this owns facts."""

    kind: SearchHitKind
    label: str
    # Secondary line: the owning file path, the route's handler file, the
    # doc's source. None when the label already says everything.
    detail: str | None
    target: str
    # Line range for symbol hits, so selecting one can open the exact slice
    # rather than the top of a file.
    start_line: int | None = None
    end_line: int | None = None
    score: int = 0


@dataclass(frozen=True)
class SearchGroup:
    kind: SearchHitKind
    label: str
    hits: list[SearchHit]


def _score(needle: str, haystack: str) -> int | None:
    """Lexical relevance, or None when there's no match at all.

    The ordering encodes what a developer means when they type into a
    palette: an exact name beats a name that starts with what you typed,
    which beats a match at a path/word boundary, which beats an incidental
    substring. Shorter matches win ties because `auth` matching `auth` is a
    better answer than `auth` matching `authenticate_user_session_token`.
    """
    hay = haystack.lower()
    if needle not in hay:
        return None

    if hay == needle:
        base = 1000
    elif hay.startswith(needle):
        base = 800
    elif any(hay.startswith(sep) or f"{sep}{needle}" in hay for sep in ("/", "_", "-", ".", " ")):
        # A match that begins a path segment or word — `main.py` for "main",
        # not `domain.py`.
        base = 600
    else:
        base = 300

    # Tie-break toward concision, floored so a very long name can't invert
    # the band it earned above.
    return base + max(0, 100 - len(hay))


def _rank(hits: list[SearchHit], limit: int = _PER_GROUP_LIMIT) -> list[SearchHit]:
    return sorted(hits, key=lambda h: (-h.score, h.label))[:limit]


def _search_files(db: Session, snapshot_id: uuid.UUID, needle: str) -> list[SearchGroup]:
    """Files and folders in one pass — both come from the same `files.path`
    column, folders being the distinct directory prefixes of those paths
    (the same derivation the Briefing's folder count uses, so the two
    surfaces never disagree about what a folder is)."""
    paths = (
        db.execute(
            select(File.path)
            .where(File.snapshot_id == snapshot_id, File.path.ilike(f"%{needle}%"))
            .limit(_SCAN_LIMIT)
        )
        .scalars()
        .all()
    )

    file_hits: list[SearchHit] = []
    for path in paths:
        name = path.rsplit("/", 1)[-1]
        # Score against the basename when it matches — typing "main" should
        # rank `app/main.py` on the strength of `main.py`, not on the noise
        # of its full path.
        score = _score(needle, name) or _score(needle, path)
        if score is None:
            continue
        file_hits.append(
            SearchHit(kind="file", label=name, detail=path, target=path, score=score)
        )

    # Folders are derived from *all* paths, not just matching ones: a folder
    # named `auth` matches the query even when no file under it does.
    all_paths = (
        db.execute(select(File.path).where(File.snapshot_id == snapshot_id).limit(_SCAN_LIMIT * 5))
        .scalars()
        .all()
    )
    folder_scores: dict[str, int] = {}
    for path in all_paths:
        parts = path.split("/")
        for i in range(1, len(parts)):
            folder = "/".join(parts[:i])
            if folder in folder_scores:
                continue
            score = _score(needle, parts[i - 1])
            if score is not None:
                folder_scores[folder] = score

    folder_hits = [
        SearchHit(
            kind="folder",
            label=folder.rsplit("/", 1)[-1],
            detail=folder if "/" in folder else None,
            target=folder,
            score=score,
        )
        for folder, score in folder_scores.items()
    ]

    groups = []
    if folder_hits:
        groups.append(SearchGroup(kind="folder", label="Folders", hits=_rank(folder_hits)))
    if file_hits:
        groups.append(SearchGroup(kind="file", label="Files", hits=_rank(file_hits)))
    return groups


def _search_symbols(db: Session, snapshot_id: uuid.UUID, needle: str) -> list[SearchGroup]:
    """Functions, classes and everything else Tree-sitter named, split into
    their own groups so "Functions" and "Classes" read as distinct answers
    the way the brief asks — one query, three headings."""
    rows = db.execute(
        select(CodeChunk, File.path)
        .join(File, File.id == CodeChunk.file_id)
        .where(File.snapshot_id == snapshot_id, CodeChunk.symbol_name.ilike(f"%{needle}%"))
        .limit(_SCAN_LIMIT)
    ).all()

    buckets: dict[SearchHitKind, list[SearchHit]] = {"function": [], "class": [], "symbol": []}
    for chunk, path in rows:
        score = _score(needle, chunk.symbol_name)
        if score is None:
            continue
        symbol_type = (chunk.symbol_type or "").lower()
        if symbol_type in {"function", "method"}:
            kind: SearchHitKind = "function"
            label = f"{chunk.symbol_name}()"
        elif symbol_type in {"class", "interface", "struct", "type"}:
            kind = "class"
            label = chunk.symbol_name
        else:
            kind = "symbol"
            label = chunk.symbol_name
        buckets[kind].append(
            SearchHit(
                kind=kind,
                label=label,
                detail=path,
                target=path,
                start_line=chunk.start_line,
                end_line=chunk.end_line,
                score=score,
            )
        )

    headings: dict[SearchHitKind, str] = {
        "function": "Functions",
        "class": "Classes",
        "symbol": "Symbols",
    }
    return [
        SearchGroup(kind=kind, label=headings[kind], hits=_rank(hits))
        for kind, hits in buckets.items()
        if hits
    ]


def _search_docs(db: Session, snapshot_id: uuid.UUID, needle: str) -> list[SearchGroup]:
    """Documentation sections, matched on their Markdown headings — the same
    section boundaries retrieval chunks on, so a doc hit here is a unit
    Threads could also cite."""
    rows = (
        db.execute(
            select(DocChunk)
            .where(
                DocChunk.snapshot_id == snapshot_id,
                DocChunk.section_title.ilike(f"%{needle}%"),
            )
            .limit(_SCAN_LIMIT)
        )
        .scalars()
        .all()
    )

    hits: list[SearchHit] = []
    for chunk in rows:
        score = _score(needle, chunk.section_title)
        if score is None:
            continue
        hits.append(
            SearchHit(
                kind="documentation",
                label=chunk.section_title,
                detail=chunk.source_path,
                target=chunk.source_path,
                score=score,
            )
        )
    return [SearchGroup(kind="documentation", label="Documentation", hits=_rank(hits))] if hits else []


def _search_readme(snapshot: RepoSnapshot, needle: str) -> list[SearchGroup]:
    """The README's canonical sections, from the manifest's verbatim extract
    (`pipeline/ingestion/readme_extract.py`). Separate from Documentation
    because the README is the one document every repository is expected to
    have, and it's the first place a newcomer looks."""
    manifest = snapshot.manifest or {}
    readme = manifest.get("readme")
    if not isinstance(readme, dict):
        return []

    source_path = readme.get("source_path")
    hits: list[SearchHit] = []
    for field, value in readme.items():
        if field in {"source_path", "title"} or not isinstance(value, str):
            continue
        label = field.replace("_", " ").capitalize()
        # Match the section's name *or* its text, so "install" finds the
        # Installation section and a phrase from the prose finds it too.
        score = _score(needle, label) or _score(needle, value)
        if score is None:
            continue
        hits.append(
            SearchHit(
                kind="readme",
                label=label,
                detail=source_path if isinstance(source_path, str) else "README",
                target=f"readme#{field}",
                score=score,
            )
        )
    return [SearchGroup(kind="readme", label="README", hits=_rank(hits))] if hits else []


def _search_routes(snapshot: RepoSnapshot, needle: str) -> list[SearchGroup]:
    """HTTP routes, from the regex route scan stored on the snapshot. Matched
    on the path and on `METHOD path` together, so both "claims" and "post
    /claims" find `POST /claims`."""
    api_routes = snapshot.api_routes or {}
    raw = api_routes.get("routes")
    if not isinstance(raw, list):
        return []

    hits: list[SearchHit] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        method = entry.get("method")
        path = entry.get("path")
        if not isinstance(method, str) or not isinstance(path, str):
            continue
        label = f"{method} {path}"
        score = _score(needle, path) or _score(needle, label)
        if score is None:
            continue
        file = entry.get("file")
        hits.append(
            SearchHit(
                kind="route",
                label=label,
                detail=file if isinstance(file, str) else None,
                target=file if isinstance(file, str) else label,
                score=score,
            )
        )
    return [SearchGroup(kind="route", label="Routes", hits=_rank(hits))] if hits else []


def _search_threads(
    db: Session, repository_id: uuid.UUID, user_id: uuid.UUID, needle: str
) -> list[SearchGroup]:
    """The user's own investigation history for this repository. Scoped to
    the requesting user (threads are per-user, RULES.md §22 row-level
    isolation), and matched on the generated title — the thing a user
    actually remembers about a past investigation."""
    threads = (
        db.execute(
            select(Thread)
            .where(
                Thread.repository_id == repository_id,
                Thread.user_id == user_id,
                Thread.title.ilike(f"%{needle}%"),
            )
            .order_by(Thread.updated_at.desc())
            .limit(_SCAN_LIMIT)
        )
        .scalars()
        .all()
    )

    hits: list[SearchHit] = []
    for thread in threads:
        score = _score(needle, thread.title)
        if score is None:
            continue
        hits.append(
            SearchHit(
                kind="thread",
                label=thread.title,
                detail=thread.status,
                target=str(thread.id),
                score=score,
            )
        )
    return [SearchGroup(kind="thread", label="Threads", hits=_rank(hits))] if hits else []


def search_repository(
    db: Session,
    *,
    repository_id: uuid.UUID,
    user_id: uuid.UUID,
    snapshot: RepoSnapshot | None,
    query: str,
) -> list[SearchGroup]:
    """Every group with at least one hit, in the order the palette shows
    them: the structural answers a developer usually wants first (files,
    symbols, routes), then the prose ones, then their own history.

    `snapshot` is optional and may be None when a repository has never been
    studied — threads still search, everything else is simply empty, which
    the palette reports as "this repository hasn't been indexed yet" rather
    than as "no results" (Priority 9: explain why, never just fail).
    """
    needle = query.strip().lower()
    if len(needle) < _MIN_QUERY_CHARS:
        return []

    groups: list[SearchGroup] = []
    if snapshot is not None:
        groups.extend(_search_files(db, snapshot.id, needle))
        groups.extend(_search_symbols(db, snapshot.id, needle))
        groups.extend(_search_routes(snapshot, needle))
        groups.extend(_search_readme(snapshot, needle))
        groups.extend(_search_docs(db, snapshot.id, needle))
    groups.extend(_search_threads(db, repository_id, user_id, needle))
    return groups
