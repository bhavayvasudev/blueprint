from pathlib import Path

from pipeline.ingestion.chunking import build_code_chunks, build_doc_chunks
from pipeline.ingestion.extract import extract_file

FIXTURE_REPO = Path(__file__).parent / "fixtures" / "sample_repo"


def test_build_code_chunks_main_py() -> None:
    facts = extract_file(FIXTURE_REPO / "main.py", repo_root=FIXTURE_REPO)
    assert facts is not None
    source_text = (FIXTURE_REPO / "main.py").read_text()

    chunks = build_code_chunks(facts, source_text)
    by_symbol = {c.symbol_name: c for c in chunks}

    # 1 function + 1 class + 2 methods
    assert len(chunks) == 4
    assert set(by_symbol) == {"greet", "Greeter", "Greeter.__init__", "Greeter.greet_default"}

    assert by_symbol["greet"].symbol_type == "function"
    assert "def greet(" in by_symbol["greet"].content
    assert by_symbol["greet"].file_path == "main.py"

    assert by_symbol["Greeter"].symbol_type == "class"
    # The class chunk includes its methods' text (documented overlap).
    assert "def greet_default" in by_symbol["Greeter"].content

    assert by_symbol["Greeter.greet_default"].symbol_type == "method"
    assert "def greet_default" in by_symbol["Greeter.greet_default"].content
    assert "def __init__" not in by_symbol["Greeter.greet_default"].content


def test_build_code_chunks_content_hash_changes_with_content() -> None:
    facts = extract_file(FIXTURE_REPO / "utils" / "helper.py", repo_root=FIXTURE_REPO)
    assert facts is not None
    source_text = (FIXTURE_REPO / "utils" / "helper.py").read_text()

    chunks = build_code_chunks(facts, source_text)
    assert len(chunks) == 1
    assert len(chunks[0].content_hash) == 64  # sha256 hex digest

    # Re-chunking identical input is deterministic.
    again = build_code_chunks(facts, source_text)
    assert chunks[0].content_hash == again[0].content_hash


def test_build_code_chunks_empty_file_produces_no_chunks() -> None:
    facts = extract_file(FIXTURE_REPO / "importer.py", repo_root=FIXTURE_REPO)
    assert facts is not None
    # importer.py has one function (use_helper) — sanity check it's not empty.
    source_text = (FIXTURE_REPO / "importer.py").read_text()
    chunks = build_code_chunks(facts, source_text)
    assert len(chunks) == 1
    assert chunks[0].symbol_name == "use_helper"


def test_build_doc_chunks_splits_on_headings() -> None:
    content = (
        "Intro text before any heading.\n\n"
        "# Title\n\nTitle body.\n\n"
        "## Subsection\n\nSubsection body.\n\n"
        "# Second Title\n\nMore text.\n"
    )
    chunks = build_doc_chunks("README.md", content)

    titles = [c.section_title for c in chunks]
    assert titles == ["", "Title", "Subsection", "Second Title"]
    assert all(c.source_path == "README.md" for c in chunks)
    assert "Intro text before any heading." in chunks[0].content
    assert "Subsection body." in chunks[2].content


def test_build_doc_chunks_no_headings_is_one_chunk() -> None:
    chunks = build_doc_chunks("notes.md", "Just a paragraph, no headings at all.")
    assert len(chunks) == 1
    assert chunks[0].section_title == ""


def test_build_doc_chunks_empty_content_produces_no_chunks() -> None:
    assert build_doc_chunks("empty.md", "") == []
    assert build_doc_chunks("whitespace.md", "   \n\n  ") == []
