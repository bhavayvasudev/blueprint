"""The hygiene audit is filesystem presence checks plus two derived ones —
every entry traces to a real file or a real match count, never an inference."""

from pathlib import Path

from pipeline.ingestion.doc_audit import audit_docs


def test_documentation_directory_counts_as_present(tmp_path: Path) -> None:
    (tmp_path / "docs").mkdir()

    audit = audit_docs(tmp_path, [])

    assert "Documentation" in audit.present
    assert "Documentation" not in audit.missing


def test_documentation_absent_is_reported_missing(tmp_path: Path) -> None:
    audit = audit_docs(tmp_path, [])

    assert "Documentation" in audit.missing


def test_api_present_when_routes_were_matched(tmp_path: Path) -> None:
    audit = audit_docs(tmp_path, [], api_route_count=7)

    assert "API" in audit.present


def test_api_missing_when_route_scan_found_none(tmp_path: Path) -> None:
    audit = audit_docs(tmp_path, [], api_route_count=0)

    assert "API" in audit.missing


def test_api_omitted_entirely_when_route_scan_did_not_run(tmp_path: Path) -> None:
    """"We didn't look" is not "it isn't there" — with no route count the API
    row appears in neither list rather than being claimed absent."""
    audit = audit_docs(tmp_path, [])

    assert "API" not in audit.present
    assert "API" not in audit.missing


def test_tests_detected_from_real_paths(tmp_path: Path) -> None:
    (tmp_path / "tests").mkdir()
    test_file = tmp_path / "tests" / "test_thing.py"
    test_file.write_text("def test_thing(): ...", encoding="utf-8")

    audit = audit_docs(tmp_path, [test_file])

    assert "Tests" in audit.present
