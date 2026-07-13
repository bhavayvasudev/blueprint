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
