"""File discovery and language classification (ARCHITECTURE.md §4).

The exclusion list is deliberately versioned and reviewable here, in one
place, rather than scattered — "a wrong exclusion silently blinds the
whole pipeline to real code" (ARCHITECTURE.md §4).
"""

from collections.abc import Iterator
from pathlib import Path

# Directories never walked into, regardless of depth. Generated/vendored/
# dependency output, never hand-authored source.
EXCLUDED_DIRS = {
    "node_modules",
    "dist",
    "build",
    ".venv",
    "venv",
    "__pycache__",
    ".git",
    ".next",
    ".turbo",
    "vendor",
    "coverage",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    "site-packages",
}

# Manifests/lockfiles: real signal for Stage 1's dependency-manifest
# parsing, but not source code for AST extraction.
EXCLUDED_FILENAMES = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "poetry.lock",
    "uv.lock",
    "Cargo.lock",
    "go.sum",
}

# ARCHITECTURE.md §4: "Initial language support: Python, TypeScript/
# JavaScript, Go" — these get a full Tree-sitter parse. Every other
# recognized source extension below still gets discovered and produces
# facts, just via the heuristic fallback extractor
# (models.types.StructuralConfidence.LOW, §4's failure-mode handling) —
# a language being outside the initial three is not the same as a file
# not being source code, and treating it that way would silently blind
# the pipeline to real code, exactly what §4 warns against.
LANGUAGE_BY_EXTENSION = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".go": "go",
    # Recognized but not yet Tree-sitter-supported — heuristic fallback only.
    ".java": "java",
    ".kt": "kotlin",
    ".rb": "ruby",
    ".rs": "rust",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".php": "php",
    ".swift": "swift",
}

# The subset of LANGUAGE_BY_EXTENSION's values with a real Tree-sitter
# grammar wired up in pipeline/ingestion/treesitter.py. Everything else
# recognized by classify_language() still gets discovered, just routed
# to the heuristic extractor instead.
SUPPORTED_LANGUAGES = frozenset({"python", "javascript", "typescript", "go"})


def classify_language(path: Path) -> str | None:
    """None means "not source code" (a manifest, an asset, a doc) rather
    than "unsupported language" — callers that want Stage 1 facts for
    every source file, including unsupported ones, should treat a
    non-None-but-unsupported language differently from None."""
    return LANGUAGE_BY_EXTENSION.get(path.suffix)


def discover_source_files(repo_root: Path) -> Iterator[Path]:
    """Yields every file under `repo_root` classified as source code by
    `classify_language`, skipping excluded directories and lockfiles.
    Ordering is filesystem-dependent; callers needing determinism should
    sort the result.
    """
    for path in repo_root.rglob("*"):
        if not path.is_file():
            continue
        if path.name in EXCLUDED_FILENAMES:
            continue
        if any(part in EXCLUDED_DIRS for part in path.relative_to(repo_root).parts):
            continue
        if classify_language(path) is not None:
            yield path


# Prose documentation, discovered separately from source because it feeds a
# different Stage 4 chunker (`build_doc_chunks`, section granularity) than
# code does (`build_code_chunks`, symbol granularity). `classify_language`
# deliberately returns None for these — "not source code" — so they would
# otherwise never be discovered at all, which is exactly why the README was
# absent from retrieval before Stage 4 was wired in.
DOC_EXTENSIONS = {".md", ".mdx", ".rst", ".txt", ".adoc"}

# Extensionless documentation files worth indexing. Kept to conventional
# all-caps root-level names: a bare lowercase extensionless file is far more
# likely to be a script or a binary than prose.
DOC_FILENAMES = {"README", "CHANGELOG", "CONTRIBUTING", "LICENSE", "AUTHORS", "NOTICE"}

# Documentation is prose, so an oversized file is almost always generated
# (a bundled changelog, an API dump) rather than something a human wrote for
# another human. Indexing those buries real docs under noise and costs real
# embedding spend. 512 KB is far above any hand-written README.
_MAX_DOC_BYTES = 512 * 1024


def is_doc_file(path: Path) -> bool:
    return path.suffix.lower() in DOC_EXTENSIONS or path.name in DOC_FILENAMES


def discover_doc_files(repo_root: Path) -> Iterator[Path]:
    """Yields every prose documentation file under `repo_root` — the README,
    `docs/**`, ADRs, changelogs — honouring the same exclusion list source
    discovery uses, so a vendored `node_modules/**/README.md` never becomes
    repository evidence.

    Ordering is filesystem-dependent; callers needing determinism should
    sort the result (`services/pipeline_runner.py` does, so that the README
    is embedded first and a truncated indexing pass still has it)."""
    for path in repo_root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in EXCLUDED_DIRS for part in path.relative_to(repo_root).parts):
            continue
        if not is_doc_file(path):
            continue
        try:
            if path.stat().st_size > _MAX_DOC_BYTES:
                continue
        except OSError:
            continue
        yield path


# ARCHITECTURE.md §3.3: "config/manifest signals (Dockerfiles, entrypoints,
# conventional services/packages layout)" — the module/service boundary
# signal Stage 3's Repository Graph rollup groups files by
# (pipeline/graph/repository.py).
MANIFEST_FILENAMES = {
    "package.json",
    "pyproject.toml",
    "go.mod",
    "Cargo.toml",
    "Dockerfile",
    "setup.py",
}


def find_manifest_directories(repo_root: Path) -> frozenset[str]:
    """Repo-relative (posix-style) directories directly containing one of
    `MANIFEST_FILENAMES`. A thin filesystem scan kept separate from Stage
    3's actual rollup logic (`pipeline/graph/repository.py`), which takes
    this as a plain `frozenset[str]` input instead of doing its own I/O —
    that's what keeps the rollup itself a pure, easily-tested function."""
    found: set[str] = set()
    for path in repo_root.rglob("*"):
        if not path.is_file() or path.name not in MANIFEST_FILENAMES:
            continue
        relative_dir = path.parent.relative_to(repo_root)
        if any(part in EXCLUDED_DIRS for part in relative_dir.parts):
            continue
        found.add(relative_dir.as_posix())
    return frozenset(found)
