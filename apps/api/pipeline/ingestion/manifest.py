"""The Repository Manifest — a precomputed, entirely real "knowledge card"
for a snapshot, assembled once during a study from the detections the pipeline
already produced (`stack_detection`, `route_detection`, `doc_audit`, the
Repository Graph module rollup) plus a verbatim README extract and a real
entrypoint filename scan.

This is the first-class evidence source a repository-*level* Threads question
answers from (`services/thread_retrieval.py`). Its whole reason to exist: a
question like "what does this repository do?" should be answered from the
README and the project's actual shape, not inferred from a handful of matched
function names. Every field traces to a real file — README lines, manifest
dependency names, regex route matches, filesystem presence, discovered
entrypoint files — so the card is checkable, never fabricated (RULES.md §23).

Pure and DB-free (like its sibling detectors): it takes already-computed data
structures in and returns a JSON-serializable dict, so it is unit-testable
without a clone, a database, or a live pipeline run."""

from __future__ import annotations

from pathlib import Path

from pipeline.graph.specs import NodeSpec
from pipeline.ingestion.readme_extract import ReadmeExtract

# Real entrypoint filenames, by ecosystem — a file "is an entrypoint" only if
# one of these literal names is present among the discovered source files
# (RULES.md §23: a name match against a real file, never an inference from
# content). Basename match, plus a couple of conventional nested shapes.
_ENTRYPOINT_BASENAMES = frozenset(
    {
        "main.py", "__main__.py", "manage.py", "wsgi.py", "asgi.py", "app.py",
        "worker.py", "cli.py", "server.py", "server.ts", "server.js",
        "index.ts", "index.js", "main.ts", "main.js", "main.go",
        "app.tsx", "app.ts", "main.tsx", "index.tsx",
    }
)


def _detect_entrypoints(source_files: list[Path], repo_root: Path, *, limit: int = 20) -> list[str]:
    """Repo-relative paths of files whose basename is a known entrypoint —
    the real "where does the app start" signal, honestly undercounting (a
    custom entrypoint with an unconventional name won't match) rather than
    guessing (RULES.md §23)."""
    found: list[str] = []
    for path in source_files:
        if path.name in _ENTRYPOINT_BASENAMES:
            found.append(path.relative_to(repo_root).as_posix())
            if len(found) >= limit:
                break
    return sorted(found)


def _named(section: dict[str, object] | None, key: str) -> list[str]:
    """Pull the `name` field out of a list-of-dicts detection section (the
    shape `stack_detection` writes), defensively — a JSONB column is `object`
    to the type checker, so every access is guarded rather than trusted."""
    if not section:
        return []
    raw = section.get(key)
    if not isinstance(raw, list):
        return []
    names: list[str] = []
    for item in raw:
        if isinstance(item, dict):
            name = item.get("name")
            if isinstance(name, str) and name:
                names.append(name)
    return names


def _modules(repository_nodes: list[NodeSpec], *, limit: int = 40) -> list[dict[str, str]]:
    """The repository's module/service rollup, from the Repository Graph nodes
    already built (`pipeline/graph/repository.py`). Each is a real directory
    boundary (a manifest-bearing dir = service, else a module), so this is the
    project's actual top-level shape, not a guessed one."""
    modules: list[dict[str, str]] = []
    for node in repository_nodes:
        if node.node_type not in {"module", "service"}:
            continue
        modules.append({"name": node.label, "kind": node.node_type})
        if len(modules) >= limit:
            break
    return sorted(modules, key=lambda m: (m["kind"], m["name"]))


def build_manifest(
    *,
    full_name: str,
    readme: ReadmeExtract | None,
    detected_stack: dict[str, object] | None,
    api_routes: dict[str, object] | None,
    doc_audit: dict[str, object] | None,
    repository_nodes: list[NodeSpec],
    source_files: list[Path],
    repo_root: Path,
) -> dict[str, object]:
    """Assemble the manifest dict stored on `repo_snapshots.manifest`. Every
    argument is data the pipeline has already computed for this snapshot; this
    function only composes and lightly summarizes it — it invents nothing."""
    languages = _named(detected_stack, "languages")
    frameworks = _named(detected_stack, "frameworks")

    route_count = 0
    if api_routes:
        raw_count = api_routes.get("count")
        if isinstance(raw_count, int):
            route_count = raw_count

    return {
        "full_name": full_name,
        "name": full_name.split("/")[-1],
        # README is the primary evidence for overview questions when present —
        # a dict of real, verbatim sections, or None when the repo has none.
        "readme": readme.to_dict() if readme else None,
        "tech_stack": {"languages": languages, "frameworks": frameworks},
        "entrypoints": _detect_entrypoints(source_files, repo_root),
        "modules": _modules(repository_nodes),
        "api_route_count": route_count,
        "doc_audit": doc_audit or None,
    }
