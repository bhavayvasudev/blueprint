"""Persists Stage 1 extraction output (pipeline/ingestion/facts.py) as
`File` rows for one snapshot. DB write logic lives here, not in
pipeline/ (RULES.md §6) — pipeline/ stays storage-agnostic and
importable standalone (ARCHITECTURE.md §13).
"""

from sqlalchemy.orm import Session

from models.repository import File, RepoSnapshot
from pipeline.ingestion.facts import SourceFileFacts


def persist_files(
    session: Session, snapshot: RepoSnapshot, all_facts: list[SourceFileFacts]
) -> dict[str, File]:
    """Returns a path -> File mapping so `graph_service` can resolve
    `file_id` foreign keys without a second query."""
    files_by_path: dict[str, File] = {}
    for facts in all_facts:
        file_row = File(
            snapshot_id=snapshot.id,
            path=facts.path,
            language=facts.language,
            loc=facts.loc,
            is_generated=False,
            content_hash=facts.content_hash,
            structural_confidence=facts.structural_confidence,
        )
        session.add(file_row)
        files_by_path[facts.path] = file_row
    session.flush()  # assigns PKs without committing the transaction
    return files_by_path
