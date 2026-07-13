from pathlib import Path

from models.types import StructuralConfidence
from pipeline.ingestion.extract import extract_file

FIXTURE_REPO = Path(__file__).parent / "fixtures" / "sample_repo"


def test_extract_main_py() -> None:
    facts = extract_file(FIXTURE_REPO / "main.py", repo_root=FIXTURE_REPO)
    assert facts is not None

    assert facts.language == "python"
    assert facts.structural_confidence == StructuralConfidence.FULL
    assert facts.path == "main.py"

    assert {i.module for i in facts.imports} == {"os", "typing"}
    typing_import = next(i for i in facts.imports if i.module == "typing")
    assert typing_import.names == ["Optional"]

    assert len(facts.functions) == 1
    greet = facts.functions[0]
    assert greet.name == "greet"
    assert greet.qualified_name == "greet"
    assert greet.return_type == "str"
    assert [p.name for p in greet.parameters] == ["name", "excited"]
    assert greet.parameters[0].type_annotation == "str"
    assert greet.parameters[1].has_default is True

    assert len(facts.classes) == 1
    greeter = facts.classes[0]
    assert greeter.name == "Greeter"
    method_names = {m.name for m in greeter.methods}
    assert method_names == {"__init__", "greet_default"}
    greet_default = next(m for m in greeter.methods if m.name == "greet_default")
    assert greet_default.qualified_name == "Greeter.greet_default"
    assert greet_default.is_method is True

    todo_texts = {t.text: t.enclosing_symbol for t in facts.todos}
    assert any("i18n" in text and enclosing == "greet" for text, enclosing in todo_texts.items())
    assert any(
        "ignores excited" in text and enclosing == "Greeter.greet_default"
        for text, enclosing in todo_texts.items()
    )


def test_extract_helper_py_simple_function() -> None:
    facts = extract_file(FIXTURE_REPO / "utils" / "helper.py", repo_root=FIXTURE_REPO)
    assert facts is not None
    assert facts.path == "utils/helper.py"
    assert len(facts.functions) == 1
    assert facts.functions[0].name == "add"
    assert facts.functions[0].parameters[0].type_annotation == "int"
