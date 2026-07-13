"""Stage 3: Repository Graph construction (ARCHITECTURE.md §3.3, §5).

A deliberately pure function over already-computed Knowledge Graph specs
plus a set of manifest-bearing directories (DECISIONS.md ADR-004: this
is a distinct, persisted artifact, not a Stage 2 view computed on the
fly) — no filesystem access happens here; `find_manifest_directories`
(pipeline/ingestion/discovery.py) does that separately, so this module
stays as testable as knowledge.py.

Module/service boundaries are the nearest ancestor manifest-bearing
directory to a file (a `package.json`, `pyproject.toml`, `go.mod`,
`Cargo.toml`, `Dockerfile`, or `setup.py`) — ARCHITECTURE.md §3.3's
"conventional services/packages layout" signal, applied literally
rather than guessed at with a fixed folder-depth heuristic. Files with
no manifest-bearing ancestor fall back to their top-level directory.

Every input this rollup depends on (`knowledge_nodes`, `knowledge_edges`,
`manifest_dirs`) is already scoped per file — a future incremental
rollup for "only module M changed" only needs the files belonging to M
and manifest_dirs, not the whole repository's Knowledge Graph, though
wiring that scoping up is v1.1 work (ARCHITECTURE.md §9), not this PR's.
"""

from pathlib import PurePosixPath

from models.types import GraphType
from pipeline.graph.specs import EdgeSpec, NodeSpec


def _module_key_for_file(file_path: str, manifest_dirs: frozenset[str]) -> str:
    """Nearest ancestor manifest-bearing directory; "." if the file
    itself is at a manifest-bearing repo root; the top-level directory
    (or "." for a root-level file) if no ancestor is manifest-bearing."""
    directory_parts = PurePosixPath(file_path).parts[:-1]
    for depth in range(len(directory_parts), -1, -1):
        candidate = "/".join(directory_parts[:depth]) if depth else "."
        if candidate in manifest_dirs:
            return candidate
    return directory_parts[0] if directory_parts else "."


def build_repository_graph(
    knowledge_nodes: list[NodeSpec],
    knowledge_edges: list[EdgeSpec],
    manifest_dirs: frozenset[str],
) -> tuple[list[NodeSpec], list[EdgeSpec]]:
    module_files: dict[str, list[str]] = {}
    for node in knowledge_nodes:
        if node.node_type != "module" or node.source_file_path is None:
            continue
        key = _module_key_for_file(node.source_file_path, manifest_dirs)
        module_files.setdefault(key, []).append(node.source_file_path)

    nodes = [
        NodeSpec(
            graph_type=GraphType.REPOSITORY,
            node_type="service" if key in manifest_dirs else "module",
            label=key,
            metadata={"file_paths": sorted(paths)},
        )
        for key, paths in sorted(module_files.items())
    ]

    file_to_module = {path: key for key, paths in module_files.items() for path in paths}

    edge_pairs: set[tuple[str, str]] = set()
    for edge in knowledge_edges:
        if edge.edge_type != "imports":
            continue
        source_module = file_to_module.get(edge.source_label)
        target_module = file_to_module.get(edge.target_label)
        if (
            source_module is not None
            and target_module is not None
            and source_module != target_module
        ):
            edge_pairs.add((source_module, target_module))

    edges = [
        EdgeSpec(
            graph_type=GraphType.REPOSITORY,
            source_label=source,
            target_label=target,
            edge_type="depends_on",
        )
        for source, target in sorted(edge_pairs)
    ]

    return nodes, edges
