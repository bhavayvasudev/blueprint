"""Missing-documentation / project-hygiene audit — real filesystem
presence checks only, run once during a study. Every entry in
`present`/`missing` traces to a literal file-existence check against a
fixed, versioned list, or (for `Tests`) a real filename/path pattern
match against the files Stage 1 already discovered — nothing inferred
from file content (RULES.md §23).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

# label -> candidate relative paths checked, in order; any match counts
# as present. Kept as one flat, reviewable list rather than scattered
# checks, matching `discovery.py`'s own "one place, reviewable" stance.
_PRESENCE_CHECKS: list[tuple[str, list[str]]] = [
    ("README", ["README.md", "README.rst", "README", "README.txt"]),
    ("License", ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING"]),
    ("Contributing guide", ["CONTRIBUTING.md", "CONTRIBUTING.rst", ".github/CONTRIBUTING.md"]),
    ("Security policy", ["SECURITY.md", ".github/SECURITY.md"]),
    ("Issue templates", [".github/ISSUE_TEMPLATE", ".github/ISSUE_TEMPLATE.md"]),
    ("CI/CD pipeline", [".github/workflows", ".gitlab-ci.yml", ".circleci/config.yml"]),
    ("Environment template", [".env.example", ".env.sample", ".env.template"]),
    ("Docker support", ["Dockerfile", "docker-compose.yml", "docker-compose.yaml"]),
    ("Documentation", ["docs", "doc", "documentation", "wiki"]),
]


@dataclass
class DocAudit:
    present: list[str]
    missing: list[str]


def _looks_like_test(relative_path: str) -> bool:
    parts = relative_path.split("/")
    name = parts[-1]
    if any(part in {"test", "tests", "__tests__", "spec"} for part in parts[:-1]):
        return True
    return (
        name.startswith("test_")
        or name.endswith("_test.py")
        or name.endswith("_test.go")
        or ".test." in name
        or ".spec." in name
    )


def audit_docs(
    repo_root: Path, source_files: list[Path], *, api_route_count: int | None = None
) -> DocAudit:
    """`api_route_count` is `route_detection`'s real match count for this
    study, when it has already run. Passed in rather than re-derived because
    "does this project expose an HTTP API" is not a filesystem question — the
    only honest evidence is a route that was actually matched. When it's None
    (a caller that hasn't run route detection), the API row is simply absent
    from both lists rather than being reported as missing, since "we didn't
    look" and "it isn't there" are different claims (RULES.md §12)."""
    present: list[str] = []
    missing: list[str] = []
    for label, candidates in _PRESENCE_CHECKS:
        if any((repo_root / candidate).exists() for candidate in candidates):
            present.append(label)
        else:
            missing.append(label)

    has_tests = any(_looks_like_test(path.relative_to(repo_root).as_posix()) for path in source_files)
    (present if has_tests else missing).append("Tests")

    if api_route_count is not None:
        (present if api_route_count > 0 else missing).append("API")

    return DocAudit(present=present, missing=missing)
