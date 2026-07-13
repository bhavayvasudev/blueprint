from pathlib import Path

from models.types import GraphType
from pipeline.graph.knowledge import build_knowledge_graph
from pipeline.graph.repository import build_repository_graph
from pipeline.ingestion.discovery import find_manifest_directories
from pipeline.ingestion.extract import extract_repository

FIXTURE_REPO = Path(__file__).parent.parent / "ingestion" / "fixtures" / "sample_repo"


def test_find_manifest_directories() -> None:
    manifest_dirs = find_manifest_directories(FIXTURE_REPO)
    assert manifest_dirs == {"utils", "web", "service"}


def test_build_repository_graph_groups_by_manifest_and_toplevel_fallback() -> None:
    all_facts = extract_repository(FIXTURE_REPO)
    kg_nodes, kg_edges = build_knowledge_graph(all_facts)
    manifest_dirs = find_manifest_directories(FIXTURE_REPO)

    repo_nodes, repo_edges = build_repository_graph(kg_nodes, kg_edges, manifest_dirs)

    nodes_by_label = {n.label: n for n in repo_nodes}
    assert set(nodes_by_label) == {".", "legacy", "utils", "web", "service"}
    assert all(n.graph_type == GraphType.REPOSITORY for n in repo_nodes)

    # Manifest-bearing directories are "service" nodes; fallback groupings
    # (no manifest ancestor) are plain "module" nodes.
    assert nodes_by_label["utils"].node_type == "service"
    assert nodes_by_label["web"].node_type == "service"
    assert nodes_by_label["service"].node_type == "service"
    assert nodes_by_label["."].node_type == "module"
    assert nodes_by_label["legacy"].node_type == "module"

    assert set(nodes_by_label["."].metadata["file_paths"]) == {"main.py", "importer.py"}  # type: ignore[call-overload]
    assert set(nodes_by_label["web"].metadata["file_paths"]) == {  # type: ignore[call-overload]
        "web/component.tsx",
        "web/app.tsx",
    }
    assert nodes_by_label["utils"].metadata["file_paths"] == ["utils/helper.py"]
    assert nodes_by_label["legacy"].metadata["file_paths"] == ["legacy/Old.java"]

    # Repository Graph nodes roll up multiple files — never attributed to one.
    assert all(n.source_file_path is None for n in repo_nodes)


def test_build_repository_graph_edges_cross_module_only() -> None:
    all_facts = extract_repository(FIXTURE_REPO)
    kg_nodes, kg_edges = build_knowledge_graph(all_facts)
    manifest_dirs = find_manifest_directories(FIXTURE_REPO)

    _, repo_edges = build_repository_graph(kg_nodes, kg_edges, manifest_dirs)

    # importer.py (module ".") -> utils/helper.py (module "utils"): cross-module.
    assert (".", "utils") in {(e.source_label, e.target_label) for e in repo_edges}
    # web/app.tsx -> web/component.tsx: same module ("web") — correctly
    # excluded, not a self-referential "web depends on web" edge.
    assert not any(e.source_label == "web" and e.target_label == "web" for e in repo_edges)
    assert len(repo_edges) == 1
    assert repo_edges[0].edge_type == "depends_on"
