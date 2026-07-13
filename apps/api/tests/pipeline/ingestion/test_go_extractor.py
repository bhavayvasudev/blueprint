from pathlib import Path

from models.types import StructuralConfidence
from pipeline.ingestion.extract import extract_file

FIXTURE_REPO = Path(__file__).parent / "fixtures" / "sample_repo"


def test_extract_server_go() -> None:
    facts = extract_file(FIXTURE_REPO / "service" / "server.go", repo_root=FIXTURE_REPO)
    assert facts is not None

    assert facts.language == "go"
    assert facts.structural_confidence == StructuralConfidence.FULL

    assert len(facts.imports) == 1
    assert facts.imports[0].module == "fmt"

    top_level_names = {f.name for f in facts.functions}
    assert "StartServer" in top_level_names
    start_server = next(f for f in facts.functions if f.name == "StartServer")
    assert start_server.parameters[0].type_annotation == "int"
    assert start_server.return_type == "error"

    assert len(facts.classes) == 1
    server = facts.classes[0]
    assert server.name == "Server"
    assert len(server.methods) == 1
    stop = server.methods[0]
    assert stop.name == "Stop"
    assert stop.qualified_name == "Server.Stop"
    assert stop.is_method is True

    todo = next(t for t in facts.todos if "graceful shutdown" in t.text)
    # Package-level TODO, above the function it precedes but outside its
    # line range — correctly resolves to no enclosing symbol.
    assert todo.enclosing_symbol is None
