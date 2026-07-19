"""README extraction is verbatim and section-mapped — the manifest's honesty
depends on these fields being real slices of the file, never paraphrase."""

from pathlib import Path

from pipeline.ingestion.readme_extract import extract_readme, find_readme, read_and_extract

_README = """# ClaimSight India

An AI-powered insurance claims intelligence platform that automates first
notice of loss assessment using computer vision and OCR.

## Features

- Damage detection
- Policy validation
- Claim timeline

## Installation

Run `docker compose up` and open http://localhost:3000.

## Architecture

A React frontend talks to a FastAPI backend; a worker runs YOLO inference.

## Known Limitations

Only supports vehicle claims today.
"""


def test_title_and_description_come_from_the_first_heading() -> None:
    extract = extract_readme(_README)
    assert extract.title == "ClaimSight India"
    assert extract.description is not None
    assert "AI-powered insurance claims" in extract.description
    # The heading line itself is not repeated in the description body.
    assert not extract.description.startswith("#")


def test_canonical_sections_are_mapped_by_heading_keyword() -> None:
    extract = extract_readme(_README)
    assert extract.features is not None and "Damage detection" in extract.features
    assert extract.installation is not None and "docker compose up" in extract.installation
    assert extract.architecture is not None and "FastAPI backend" in extract.architecture
    assert extract.limitations is not None and "vehicle claims" in extract.limitations
    # No usage section present -> field stays absent, never guessed.
    assert extract.usage is None


def test_to_dict_drops_absent_fields() -> None:
    extract = extract_readme("# Solo\n\nJust a title and a line.")
    data = extract.to_dict()
    assert data["title"] == "Solo"
    assert "features" not in data  # absent sections are simply not claimed
    assert "usage" not in data


def test_preamble_before_first_heading_feeds_description() -> None:
    extract = extract_readme("Intro paragraph with no heading yet.\n\n# Later Title\n\nBody.")
    # The untitled preamble is captured rather than dropped.
    assert extract.description is not None
    assert "Intro paragraph" in extract.description or extract.title == "Later Title"


def test_find_and_read_readme(tmp_path: Path) -> None:
    (tmp_path / "README.md").write_text(_README, encoding="utf-8")
    assert find_readme(tmp_path) == tmp_path / "README.md"
    extract = read_and_extract(tmp_path)
    assert extract is not None
    assert extract.source_path == "README.md"
    assert extract.title == "ClaimSight India"


def test_no_readme_returns_none(tmp_path: Path) -> None:
    assert find_readme(tmp_path) is None
    assert read_and_extract(tmp_path) is None
