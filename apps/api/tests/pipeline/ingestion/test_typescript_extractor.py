from pathlib import Path

from models.types import StructuralConfidence
from pipeline.ingestion.extract import extract_file

FIXTURE_REPO = Path(__file__).parent / "fixtures" / "sample_repo"


def test_extract_component_tsx() -> None:
    facts = extract_file(FIXTURE_REPO / "web" / "component.tsx", repo_root=FIXTURE_REPO)
    assert facts is not None

    assert facts.language == "typescript"
    assert facts.structural_confidence == StructuralConfidence.FULL

    assert len(facts.imports) == 1
    assert facts.imports[0].module == "react"
    assert "useState" in facts.imports[0].names

    function_names = {f.name for f in facts.functions}
    assert "Counter" in function_names
    assert "double" in function_names

    counter = next(f for f in facts.functions if f.name == "Counter")
    assert counter.return_type == "number"
    assert counter.parameters[0].type_annotation == "number"

    double = next(f for f in facts.functions if f.name == "double")
    assert double.return_type == "number"

    assert len(facts.classes) == 1
    widget = facts.classes[0]
    assert widget.name == "Widget"
    assert len(widget.methods) == 1
    assert widget.methods[0].name == "render"
    assert widget.methods[0].qualified_name == "Widget.render"

    todo = next(t for t in facts.todos if "wire this up" in t.text)
    assert todo.enclosing_symbol == "Counter"
