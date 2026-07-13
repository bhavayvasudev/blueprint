from pathlib import Path

from models.types import StructuralConfidence
from pipeline.ingestion.extract import extract_file

FIXTURE_REPO = Path(__file__).parent / "fixtures" / "sample_repo"


def test_extract_java_falls_back_to_heuristic() -> None:
    facts = extract_file(FIXTURE_REPO / "legacy" / "Old.java", repo_root=FIXTURE_REPO)
    assert facts is not None

    assert facts.language == "java"
    assert facts.structural_confidence == StructuralConfidence.LOW

    assert len(facts.classes) == 1
    assert facts.classes[0].name == "Old"

    assert len(facts.functions) == 1
    add = facts.functions[0]
    assert add.name == "add"
    # Heuristic mode never claims parameter/return types it can't verify.
    assert add.parameters == []
    assert add.return_type is None

    assert len(facts.todos) == 1
    assert "migrate to Go" in facts.todos[0].text
    # No AST in heuristic mode — enclosing symbol is honestly unresolved.
    assert facts.todos[0].enclosing_symbol is None
