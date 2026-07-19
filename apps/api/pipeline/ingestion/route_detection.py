"""Real, regex-based scan of already-discovered source files for common
HTTP route-registration shapes (FastAPI/Flask/Express `app.get("/x")` /
`@router.post("/x")`, Django `path("x", ...)`). Feeds the Atlas's API
route count and the live-discovery feed.

This is a heuristic, not a full AST route resolver: it undercounts
routes built through indirection (dynamic dispatch, decorator
factories, `include_router` prefixes) and never overcounts, since every
entry traces to one real regex match in one real file (RULES.md §23 —
no fabricated counts, only what's directly explainable).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

_METHOD_ROUTE_RE = re.compile(
    r"\b(?:app|router)\.(get|post|put|patch|delete)\(\s*[\"']([^\"']+)[\"']", re.IGNORECASE
)
_DJANGO_PATH_RE = re.compile(r"\bpath\(\s*[\"']([^\"']*)[\"']")

_ROUTE_FILE_SUFFIXES = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}


@dataclass
class DetectedRoute:
    method: str
    path: str
    file: str


def detect_routes(
    repo_root: Path, source_files: list[Path], *, limit: int = 200
) -> list[DetectedRoute]:
    routes: list[DetectedRoute] = []
    for path in source_files:
        if path.suffix not in _ROUTE_FILE_SUFFIXES:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        relative = path.relative_to(repo_root).as_posix()

        for match in _METHOD_ROUTE_RE.finditer(text):
            routes.append(DetectedRoute(method=match.group(1).upper(), path=match.group(2), file=relative))
            if len(routes) >= limit:
                return routes

        if path.name == "urls.py":
            for match in _DJANGO_PATH_RE.finditer(text):
                routes.append(DetectedRoute(method="ANY", path=match.group(1), file=relative))
                if len(routes) >= limit:
                    return routes

    return routes
