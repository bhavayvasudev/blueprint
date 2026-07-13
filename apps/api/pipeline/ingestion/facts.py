"""Stage 1 output types (ARCHITECTURE.md §3.1, §4).

Pure Pydantic DTOs with no ORM/DB coupling, so the pipeline stays
importable and runnable standalone (ARCHITECTURE.md §13) — persisting
these into `files`/`code_chunks` rows is a separate, later concern, not
this module's job. `structural_confidence` is reused from `models.types`
(a plain enum, no SQLAlchemy dependency) rather than redefined here, per
RULES.md §24's "one vocabulary" principle.
"""

from pydantic import BaseModel

from models.types import StructuralConfidence


class ParameterFact(BaseModel):
    name: str
    type_annotation: str | None = None
    has_default: bool = False


class ImportFact(BaseModel):
    """A single import statement. `names` is empty for a whole-module
    import (`import os`, `import "fmt"`)."""

    module: str
    names: list[str] = []
    line: int


class FunctionFact(BaseModel):
    name: str
    qualified_name: str
    parameters: list[ParameterFact]
    return_type: str | None = None
    start_line: int
    end_line: int
    is_method: bool = False


class ClassFact(BaseModel):
    """Also used for Go structs (the nearest structural analog) — see
    pipeline/ingestion/extractors/go.py for how methods are associated,
    since Go declares them at package level via a receiver, not nested
    inside the type's syntax like Python/TypeScript."""

    name: str
    start_line: int
    end_line: int
    methods: list[FunctionFact] = []


class TodoFact(BaseModel):
    """ARCHITECTURE.md §3.1: "a TODO is linked to a symbol, not just a
    line number." `enclosing_symbol` is the qualified name of the
    innermost function/class containing it, or None at module level."""

    text: str
    line: int
    enclosing_symbol: str | None = None


class SourceFileFacts(BaseModel):
    path: str
    language: str
    loc: int
    content_hash: str
    structural_confidence: StructuralConfidence
    imports: list[ImportFact] = []
    functions: list[FunctionFact] = []
    classes: list[ClassFact] = []
    todos: list[TodoFact] = []
