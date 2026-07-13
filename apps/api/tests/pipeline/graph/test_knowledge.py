from pathlib import Path

from models.types import GraphType
from pipeline.graph.knowledge import build_file_nodes, build_import_edges, build_knowledge_graph
from pipeline.ingestion.extract import extract_file, extract_repository

FIXTURE_REPO = Path(__file__).parent.parent / "ingestion" / "fixtures" / "sample_repo"


def test_build_file_nodes_is_pure_and_deterministic() -> None:
    """The property DECISIONS.md ADR-019 exists to preserve: building
    nodes for one file never depends on any other file's state, and is
    stable across repeated calls — the exact shape a future content-hash
    cache would key on."""
    facts = extract_file(FIXTURE_REPO / "main.py", repo_root=FIXTURE_REPO)
    assert facts is not None

    standalone = build_file_nodes(facts)

    all_facts = extract_repository(FIXTURE_REPO)
    main_facts = next(f for f in all_facts if f.path == "main.py")
    as_part_of_repo = build_file_nodes(main_facts)

    assert standalone == as_part_of_repo
    assert build_file_nodes(facts) == standalone  # calling twice: identical output


def test_build_file_nodes_main_py() -> None:
    facts = extract_file(FIXTURE_REPO / "main.py", repo_root=FIXTURE_REPO)
    assert facts is not None
    nodes = build_file_nodes(facts)

    by_label = {n.label: n for n in nodes}
    assert by_label["main.py"].node_type == "module"
    assert by_label["main.py::greet"].node_type == "function"
    assert by_label["main.py::Greeter"].node_type == "class"
    assert by_label["main.py::Greeter.greet_default"].node_type == "method"

    assert all(n.graph_type == GraphType.KNOWLEDGE for n in nodes)
    assert all(n.source_file_path == "main.py" for n in nodes)
    # module(1) + greet(1) + Greeter(1) + __init__(1) + greet_default(1)
    assert len(nodes) == 5


def test_build_import_edges_resolves_python_dotted_import() -> None:
    all_facts = extract_repository(FIXTURE_REPO)
    edges = build_import_edges(all_facts)

    python_edge = next(e for e in edges if e.source_label == "importer.py")
    assert python_edge.target_label == "utils/helper.py"
    assert python_edge.edge_type == "imports"
    assert python_edge.source_file_path == "importer.py"


def test_build_import_edges_resolves_relative_typescript_import() -> None:
    all_facts = extract_repository(FIXTURE_REPO)
    edges = build_import_edges(all_facts)

    ts_edge = next(e for e in edges if e.source_label == "web/app.tsx")
    assert ts_edge.target_label == "web/component.tsx"


def test_build_import_edges_skips_unresolvable_and_external_imports() -> None:
    all_facts = extract_repository(FIXTURE_REPO)
    edges = build_import_edges(all_facts)

    # main.py imports os/typing (external) — no edges from it.
    assert not any(e.source_label == "main.py" for e in edges)
    # server.go imports "fmt" — Go resolution isn't implemented (documented
    # limitation), so no edge, not a wrong one.
    assert not any(e.source_label == "service/server.go" for e in edges)


def test_build_knowledge_graph_full_repository() -> None:
    all_facts = extract_repository(FIXTURE_REPO)
    nodes, edges = build_knowledge_graph(all_facts)

    assert len(nodes) == sum(len(build_file_nodes(f)) for f in all_facts)
    assert {e.source_label for e in edges} == {"importer.py", "web/app.tsx"}
