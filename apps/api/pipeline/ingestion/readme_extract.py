"""Real, extraction-only README parsing — the first-class evidence a
repository-overview question is answered from (`services/thread_retrieval.py`,
`OVERVIEW` intent). No LLM, no paraphrase: every field here is a verbatim,
truncated slice of the actual README, so the "knowledge card" a Threads
overview answer leans on is checkable line-for-line against the file it came
from (RULES.md §23 / PRODUCT.md: calibrated trust, never fabricated proof).

Sectioning reuses `chunking.build_doc_chunks`'s Markdown-heading splitter — the
same boundaries retrieval already uses for docs — so a README section here is
the same unit it would be if Stage 4 had chunked it. Headings are mapped to a
small fixed vocabulary of canonical fields by keyword; anything unmatched is
simply not surfaced (better an absent field than a guessed one)."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from pathlib import Path

from pipeline.ingestion.chunking import build_doc_chunks

# README filename candidates, highest priority first — the same set (and
# order) `doc_audit._PRESENCE_CHECKS` treats as "a README is present", so the
# manifest and the hygiene audit never disagree about whether one exists.
_README_CANDIDATES = ("README.md", "README.rst", "README", "README.txt")

# Canonical field -> heading keywords (lowercased, substring match). Order
# matters only for `architecture` vs a generic "overview": "architecture" is
# checked as its own field, and a bare "overview" heading is left to feed the
# description rather than a distinct section. First matching heading wins per
# field, so an earlier "Installation" isn't overwritten by a later "Install".
_SECTION_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("features", ("feature",)),
    ("installation", ("install", "setup", "getting started", "quick start", "quickstart")),
    ("architecture", ("architecture", "how it works", "design")),
    ("tech_stack", ("tech stack", "built with", "technolog", "stack")),
    ("usage", ("usage", "how to use", "example")),
    ("limitations", ("limitation", "known issue", "caveat", "roadmap")),
]

_MAX_DESCRIPTION_CHARS = 800
_MAX_SECTION_CHARS = 600
_HEADING_LINE_RE = re.compile(r"^#{1,6}\s+.*$", re.MULTILINE)


@dataclass
class ReadmeExtract:
    """The real, extracted shape of a repository's README. Every non-None
    field is a verbatim (truncated) slice of the file at `source_path`."""

    source_path: str
    title: str | None = None
    description: str | None = None
    features: str | None = None
    installation: str | None = None
    architecture: str | None = None
    tech_stack: str | None = None
    usage: str | None = None
    limitations: str | None = None

    def to_dict(self) -> dict[str, str]:
        # JSON-friendly and lossless: drop None fields so the stored manifest
        # only ever claims sections the README actually had.
        return {k: v for k, v in asdict(self).items() if v is not None}


def find_readme(repo_root: Path) -> Path | None:
    """The repository's README file, by the same candidate ordering the doc
    audit uses. Case-sensitive candidates first (the conventional casing),
    then a case-insensitive sweep so a `readme.md` is still found."""
    for candidate in _README_CANDIDATES:
        path = repo_root / candidate
        if path.is_file():
            return path
    lower = {c.lower() for c in _README_CANDIDATES}
    for child in sorted(repo_root.iterdir()):
        if child.is_file() and child.name.lower() in lower:
            return child
    return None


def _strip_heading_line(text: str) -> str:
    """Drop a leading Markdown heading line from a section body, so a section's
    excerpt is its prose rather than a repeat of its own title."""
    lines = text.splitlines()
    if lines and _HEADING_LINE_RE.match(lines[0]):
        lines = lines[1:]
    return "\n".join(lines).strip()


def _truncate(text: str, limit: int) -> str:
    text = text.strip()
    return text if len(text) <= limit else text[:limit].rstrip() + "\n…"


def extract_readme(content: str, *, source_path: str = "README.md") -> ReadmeExtract:
    """Parse a README's raw text into canonical, verbatim fields. Section
    boundaries come from `build_doc_chunks` (Markdown headings); the first
    heading whose text matches a field's keywords fills that field."""
    extract = ReadmeExtract(source_path=source_path)
    sections = build_doc_chunks(source_path, content)
    if not sections:
        return extract

    # Title + description: the first titled section carries the project name and
    # its intro prose. A section before any heading (section_title == "") is
    # preamble — its body feeds the description directly.
    for section in sections:
        if section.section_title:
            extract.title = section.section_title.strip() or None
            extract.description = _truncate(
                _strip_heading_line(section.content), _MAX_DESCRIPTION_CHARS
            ) or None
            break
        # Untitled preamble before the first heading.
        extract.description = _truncate(section.content, _MAX_DESCRIPTION_CHARS) or None

    for field, keywords in _SECTION_KEYWORDS:
        if getattr(extract, field) is not None:
            continue
        for section in sections:
            title = section.section_title.lower()
            if title and any(kw in title for kw in keywords):
                body = _truncate(_strip_heading_line(section.content), _MAX_SECTION_CHARS)
                if body:
                    setattr(extract, field, body)
                break
    return extract


def read_and_extract(repo_root: Path) -> ReadmeExtract | None:
    """Locate and parse the repository's README, or None if it has none.
    The one impure entrypoint (filesystem read); `extract_readme` stays a
    pure function of text for testing."""
    readme = find_readme(repo_root)
    if readme is None:
        return None
    try:
        text = readme.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return None
    return extract_readme(text, source_path=readme.relative_to(repo_root).as_posix())
