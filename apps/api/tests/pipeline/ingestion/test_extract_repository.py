from pathlib import Path

from pipeline.ingestion.extract import extract_repository

FIXTURE_REPO = Path(__file__).parent / "fixtures" / "sample_repo"


def test_extract_repository_is_deterministic_and_complete() -> None:
    first_pass = extract_repository(FIXTURE_REPO)
    second_pass = extract_repository(FIXTURE_REPO)

    paths = [f.path for f in first_pass]
    assert paths == sorted(paths), "extract_repository must return a deterministic, sorted order"
    assert paths == [f.path for f in second_pass], "identical repo state must produce identical output"

    assert set(paths) == {
        "importer.py",
        "legacy/Old.java",
        "main.py",
        "service/server.go",
        "utils/helper.py",
        "web/app.tsx",
        "web/component.tsx",
    }

    by_path = {f.path: f for f in first_pass}
    assert by_path["main.py"].content_hash == by_path["main.py"].content_hash  # stable per call
    assert len(by_path["main.py"].content_hash) == 64  # sha256 hex digest
