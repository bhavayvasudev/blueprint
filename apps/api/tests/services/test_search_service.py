"""Global search is a deterministic stage, so it gets real unit/integration
tests rather than eval-harness coverage (RULES.md §15). Every assertion here
runs against real rows in a real Postgres — the same fixtures the retrieval
integration tests use."""

import uuid

import pytest
from sqlalchemy.orm import Session

from models.chunks import CodeChunk, DocChunk
from models.repository import File, RepoSnapshot
from models.types import EMBEDDING_DIM, StructuralConfidence
from services.search_service import search_repository

_ZERO_VECTOR = [0.0] * EMBEDDING_DIM


def _add_file(db: Session, snapshot: RepoSnapshot, path: str, language: str = "python") -> File:
    file = File(
        id=uuid.uuid4(),
        snapshot_id=snapshot.id,
        path=path,
        language=language,
        loc=10,
        content_hash=str(uuid.uuid4()),
        structural_confidence=StructuralConfidence.FULL,
    )
    db.add(file)
    db.flush()
    return file


def _add_symbol(db: Session, file: File, name: str, symbol_type: str) -> CodeChunk:
    chunk = CodeChunk(
        id=uuid.uuid4(),
        file_id=file.id,
        symbol_name=name,
        symbol_type=symbol_type,
        start_line=1,
        end_line=8,
        embedding=_ZERO_VECTOR,
        content_hash=str(uuid.uuid4()),
        content=f"def {name}(): ...",
    )
    db.add(chunk)
    db.flush()
    return chunk


def _groups(db: Session, snapshot: RepoSnapshot, query: str) -> dict[str, list[str]]:
    """Search results as {group label: [hit labels]} — the shape the palette
    renders, which is what these tests are really about."""
    results = search_repository(
        db,
        repository_id=snapshot.repository_id,
        user_id=snapshot.repository.user_id,
        snapshot=snapshot,
        query=query,
    )
    return {group.label: [hit.label for hit in group.hits] for group in results}


def test_finds_files_and_folders_by_name(db_session: Session, snapshot: RepoSnapshot) -> None:
    _add_file(db_session, snapshot, "backend/app/main.py")
    _add_file(db_session, snapshot, "frontend/index.tsx", language="typescript")

    groups = _groups(db_session, snapshot, "main")

    assert groups["Files"] == ["main.py"]
    # "main" must not drag in `frontend/` just because it contains no match.
    assert "Folders" not in groups


def test_folder_matches_even_when_no_file_under_it_matches(
    db_session: Session, snapshot: RepoSnapshot
) -> None:
    _add_file(db_session, snapshot, "backend/auth/tokens.py")

    groups = _groups(db_session, snapshot, "auth")

    assert groups["Folders"] == ["auth"]


def test_symbols_split_into_functions_and_classes(
    db_session: Session, snapshot: RepoSnapshot
) -> None:
    file = _add_file(db_session, snapshot, "backend/app/auth.py")
    _add_symbol(db_session, file, "authenticate_user", "function")
    _add_symbol(db_session, file, "AuthenticationError", "class")

    groups = _groups(db_session, snapshot, "authentic")

    # Functions carry call parens so a result reads as the thing it is.
    assert groups["Functions"] == ["authenticate_user()"]
    assert groups["Classes"] == ["AuthenticationError"]


def test_exact_match_outranks_longer_substring_match(
    db_session: Session, snapshot: RepoSnapshot
) -> None:
    file = _add_file(db_session, snapshot, "backend/app/auth.py")
    _add_symbol(db_session, file, "authenticate_user_session_token", "function")
    _add_symbol(db_session, file, "auth", "function")

    groups = _groups(db_session, snapshot, "auth")

    assert groups["Functions"][0] == "auth()"


def test_routes_match_on_path_and_on_method_plus_path(
    db_session: Session, snapshot: RepoSnapshot
) -> None:
    snapshot.api_routes = {
        "count": 2,
        "routes": [
            {"method": "POST", "path": "/claims", "file": "backend/app/claims.py"},
            {"method": "GET", "path": "/health", "file": "backend/app/health.py"},
        ],
    }
    db_session.flush()

    assert _groups(db_session, snapshot, "claims")["Routes"] == ["POST /claims"]
    assert _groups(db_session, snapshot, "post /claims")["Routes"] == ["POST /claims"]


def test_readme_sections_match_by_heading_and_by_body(
    db_session: Session, snapshot: RepoSnapshot
) -> None:
    snapshot.manifest = {
        "readme": {
            "source_path": "README.md",
            "title": "Sample",
            "installation": "Run uv sync to install dependencies.",
            "architecture": "A FastAPI backend and a Next.js frontend.",
        }
    }
    db_session.flush()

    assert _groups(db_session, snapshot, "install")["README"] == ["Installation"]
    # A phrase from the prose finds its section too, not just the heading.
    assert _groups(db_session, snapshot, "next.js")["README"] == ["Architecture"]


def test_documentation_sections_match_by_title(
    db_session: Session, snapshot: RepoSnapshot
) -> None:
    db_session.add(
        DocChunk(
            id=uuid.uuid4(),
            snapshot_id=snapshot.id,
            source_path="docs/ARCHITECTURE.md",
            section_title="Retrieval Interface",
            content="How hybrid retrieval works.",
            embedding=_ZERO_VECTOR,
        )
    )
    db_session.flush()

    assert _groups(db_session, snapshot, "retrieval")["Documentation"] == ["Retrieval Interface"]


def test_symbol_hits_carry_their_line_range(db_session: Session, snapshot: RepoSnapshot) -> None:
    """A symbol result must be able to open the exact slice, not the top of
    the file — so the line range travels with the hit."""
    file = _add_file(db_session, snapshot, "backend/app/auth.py")
    _add_symbol(db_session, file, "authenticate_user", "function")

    results = search_repository(
        db_session,
        repository_id=snapshot.repository_id,
        user_id=snapshot.repository.user_id,
        snapshot=snapshot,
        query="authenticate",
    )
    hit = next(h for group in results for h in group.hits if h.kind == "function")

    assert (hit.start_line, hit.end_line) == (1, 8)
    assert hit.target == "backend/app/auth.py"


def test_no_snapshot_yields_no_structural_groups(
    db_session: Session, snapshot: RepoSnapshot
) -> None:
    """A repository that has never been studied returns nothing rather than
    raising — the palette turns that into "not indexed yet", which is a real
    reason, not a shrug (Priority 9)."""
    _add_file(db_session, snapshot, "backend/app/main.py")

    results = search_repository(
        db_session,
        repository_id=snapshot.repository_id,
        user_id=snapshot.repository.user_id,
        snapshot=None,
        query="main",
    )

    assert results == []


@pytest.mark.parametrize("query", ["", "   "])
def test_blank_query_returns_nothing(
    db_session: Session, snapshot: RepoSnapshot, query: str
) -> None:
    _add_file(db_session, snapshot, "backend/app/main.py")

    assert _groups(db_session, snapshot, query) == {}
