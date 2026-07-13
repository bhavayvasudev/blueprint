from pathlib import Path

from pipeline.ingestion.discovery import classify_language, discover_source_files

FIXTURE_REPO = Path(__file__).parent / "fixtures" / "sample_repo"


def test_classify_language() -> None:
    assert classify_language(Path("a.py")) == "python"
    assert classify_language(Path("a.tsx")) == "typescript"
    assert classify_language(Path("a.go")) == "go"
    assert classify_language(Path("a.java")) == "java"
    assert classify_language(Path("README.md")) is None


def test_discover_source_files_excludes_vendored_and_lockfiles() -> None:
    found = {p.relative_to(FIXTURE_REPO).as_posix() for p in discover_source_files(FIXTURE_REPO)}

    assert "main.py" in found
    assert "utils/helper.py" in found
    assert "web/component.tsx" in found
    assert "service/server.go" in found
    assert "legacy/Old.java" in found

    assert not any("node_modules" in p for p in found)
    assert "package-lock.json" not in found
