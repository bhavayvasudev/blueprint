"""Stage 2: Knowledge Graph construction (ARCHITECTURE.md §3.2, §5).

Two-pass, deliberately. `build_file_nodes` is a pure function of exactly
one file's Stage 1 facts — the cacheable unit ADR-019/§9 designs toward.
Import edges need the *whole* repository's file set to resolve against,
so that's a separate, explicit second pass (`build_import_edges`) that
only ever looks at each file's path and its already-extracted
`ImportFact`s, never its parsed structure. This split is what keeps a
future "only file X changed" incremental recompute from forcing a full
graph rebuild: pass 1 reruns for the changed file only; pass 2 reruns
only for edges whose source is that file, given the unchanged files'
paths (cheap) rather than their full facts.

Deliberately out of scope for Phase 0, documented rather than silently
dropped: "calls" and "references" edges (ARCHITECTURE.md §3.2 lists
imports/calls/references as the three Knowledge Graph edge types).
Resolving calls needs call-expression facts Stage 1 doesn't currently
extract (`FunctionFact` captures signatures, not bodies) — a Stage 1
extension and a follow-up PR, not a Stage 2 gap.
"""

import posixpath

from models.types import GraphType
from pipeline.graph.specs import EdgeSpec, NodeSpec
from pipeline.ingestion.facts import SourceFileFacts

_JS_EXTENSIONS = (".ts", ".tsx", ".js", ".jsx")


def _symbol_label(file_path: str, qualified_name: str) -> str:
    return f"{file_path}::{qualified_name}"


def build_file_nodes(facts: SourceFileFacts) -> list[NodeSpec]:
    """Pure function of one file's Stage 1 facts — no other file's state
    is consulted. This purity is the property ADR-019 exists to preserve."""
    nodes = [
        NodeSpec(
            graph_type=GraphType.KNOWLEDGE,
            node_type="module",
            label=facts.path,
            metadata={"language": facts.language, "loc": facts.loc},
            source_file_path=facts.path,
        )
    ]

    for fn in facts.functions:
        nodes.append(
            NodeSpec(
                graph_type=GraphType.KNOWLEDGE,
                node_type="function",
                label=_symbol_label(facts.path, fn.qualified_name),
                metadata={
                    "name": fn.name,
                    "parameters": [p.model_dump() for p in fn.parameters],
                    "return_type": fn.return_type,
                    "start_line": fn.start_line,
                    "end_line": fn.end_line,
                },
                source_file_path=facts.path,
            )
        )

    for cls in facts.classes:
        nodes.append(
            NodeSpec(
                graph_type=GraphType.KNOWLEDGE,
                node_type="class",
                label=_symbol_label(facts.path, cls.name),
                metadata={"start_line": cls.start_line, "end_line": cls.end_line},
                source_file_path=facts.path,
            )
        )
        for method in cls.methods:
            nodes.append(
                NodeSpec(
                    graph_type=GraphType.KNOWLEDGE,
                    node_type="method",
                    label=_symbol_label(facts.path, method.qualified_name),
                    metadata={
                        "name": method.name,
                        "parameters": [p.model_dump() for p in method.parameters],
                        "return_type": method.return_type,
                        "start_line": method.start_line,
                        "end_line": method.end_line,
                    },
                    source_file_path=facts.path,
                )
            )

    return nodes


def _python_import_candidates(module: str) -> list[str]:
    as_path = module.replace(".", "/")
    return [f"{as_path}.py", f"{as_path}/__init__.py"]


def _resolve_python_import(module: str, all_paths: frozenset[str]) -> str | None:
    """Suffix-matches the dotted import against every known file path,
    rather than requiring the exact Python package root to be known —
    correct for typical non-colliding layouts, honestly a heuristic
    (not a full sys.path-aware import resolver) for ambiguous ones.
    Deterministic: ties broken by sorted path order."""
    candidates = _python_import_candidates(module)
    matches = sorted(
        path
        for path in all_paths
        for candidate in candidates
        if path == candidate or path.endswith("/" + candidate)
    )
    return matches[0] if matches else None


def _resolve_relative_js_import(
    module: str, importing_path: str, all_paths: frozenset[str]
) -> str | None:
    """Only resolves relative specifiers (`./x`, `../x`) — bare/aliased
    specifiers (`react`, `@/lib/utils`) would need tsconfig `paths`
    resolution, not implemented; a follow-up, not a silent gap."""
    if not (module.startswith("./") or module.startswith("../")):
        return None

    base = posixpath.normpath(posixpath.join(posixpath.dirname(importing_path), module))

    if any(base.endswith(ext) for ext in _JS_EXTENSIONS):
        return base if base in all_paths else None

    for ext in _JS_EXTENSIONS:
        candidate = f"{base}{ext}"
        if candidate in all_paths:
            return candidate
    for ext in _JS_EXTENSIONS:
        candidate = f"{base}/index{ext}"
        if candidate in all_paths:
            return candidate
    return None


def build_import_edges(all_facts: list[SourceFileFacts]) -> list[EdgeSpec]:
    """Second pass: needs every file's *path* (for resolution) but only
    each file's own `ImportFact`s, not its parsed structure."""
    all_paths = frozenset(f.path for f in all_facts)
    edges: list[EdgeSpec] = []

    for facts in all_facts:
        for imp in facts.imports:
            target: str | None = None
            if facts.language == "python":
                target = _resolve_python_import(imp.module, all_paths)
            elif facts.language in ("typescript", "javascript"):
                target = _resolve_relative_js_import(imp.module, facts.path, all_paths)
            # Go import-path resolution needs go.mod's module name to map
            # package paths to local files — not implemented (module
            # docstring).

            if target is not None and target != facts.path:
                edges.append(
                    EdgeSpec(
                        graph_type=GraphType.KNOWLEDGE,
                        source_label=facts.path,
                        target_label=target,
                        edge_type="imports",
                        source_file_path=facts.path,
                    )
                )

    return edges


def build_knowledge_graph(all_facts: list[SourceFileFacts]) -> tuple[list[NodeSpec], list[EdgeSpec]]:
    """Full-repository convenience wrapper — what Phase 0's full-resync
    path uses today (PHASES.md: "MVP ships with full re-index only").
    Not the unit a future incremental recompute calls: that's
    `build_file_nodes` per changed file plus a rerun of
    `build_import_edges`, which this function is deliberately built out
    of rather than duplicating their logic inline."""
    nodes = [node for facts in all_facts for node in build_file_nodes(facts)]
    edges = build_import_edges(all_facts)
    return nodes, edges
