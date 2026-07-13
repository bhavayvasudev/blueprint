"""Stage 1 top-level entrypoint (ARCHITECTURE.md §3.1).

The one function other stages/services actually call. Routes each
discovered file to the Tree-sitter extractor when its language has a
grammar wired up, and to the heuristic fallback otherwise — the
`structural_confidence` distinction that caps downstream confidence
(ARCHITECTURE.md §4) is decided here, in one place, not duplicated at
every call site.
"""

from pathlib import Path

from pipeline.ingestion import discovery, heuristic_extractor, treesitter
from pipeline.ingestion.facts import SourceFileFacts


def extract_file(path: Path, *, repo_root: Path) -> SourceFileFacts | None:
    """Returns None if `path` isn't recognized as source code at all
    (see `discovery.classify_language`) — callers iterating a directory
    themselves rather than via `extract_repository` should skip Nones
    rather than treat them as extraction failures."""
    language = discovery.classify_language(path)
    if language is None:
        return None

    source = path.read_bytes()
    relative_path = path.relative_to(repo_root).as_posix()

    if language in discovery.SUPPORTED_LANGUAGES:
        return treesitter.extract_source_file(source, relative_path=relative_path, language=language)
    return heuristic_extractor.extract_heuristic(source, relative_path=relative_path, language=language)


def extract_repository(repo_root: Path) -> list[SourceFileFacts]:
    """Deterministic ordering (sorted by path) so repeated runs against
    an unchanged repository produce identical output — load-bearing for
    the content-hash caching design in ARCHITECTURE.md §9, even though
    the caching layer itself isn't wired up until v1.1."""
    facts = [
        extract_file(path, repo_root=repo_root)
        for path in sorted(discovery.discover_source_files(repo_root))
    ]
    return [f for f in facts if f is not None]
