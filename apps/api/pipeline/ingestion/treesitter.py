"""Tree-sitter parser registry and per-file extraction (ARCHITECTURE.md
§3.1, §4). One `Language` per supported grammar, built once at import
time; a fresh `Parser` per call (tree-sitter's `Parser` is not
guaranteed thread-safe to reuse across calls with different languages,
and Parser construction is cheap)."""

import hashlib

import tree_sitter_go
import tree_sitter_javascript
import tree_sitter_python
import tree_sitter_typescript
from tree_sitter import Language, Parser

from models.types import StructuralConfidence
from pipeline.ingestion.extractors import common, go, python, typescript_js
from pipeline.ingestion.facts import SourceFileFacts

_LANGUAGES: dict[str, Language] = {
    "python": Language(tree_sitter_python.language()),
    "javascript": Language(tree_sitter_javascript.language()),
    "typescript": Language(tree_sitter_typescript.language_typescript()),
    "go": Language(tree_sitter_go.language()),
}

_EXTRACTORS = {
    "python": python.extract,
    "javascript": typescript_js.extract,
    "typescript": typescript_js.extract,
    "go": go.extract,
}


def extract_source_file(source: bytes, *, relative_path: str, language: str) -> SourceFileFacts:
    """Full Tree-sitter parse for one of the supported grammars. Raises
    KeyError if `language` isn't in `discovery.SUPPORTED_LANGUAGES` —
    callers route unsupported languages to `heuristic_extractor` instead,
    they don't call this function for them."""
    parser = Parser(_LANGUAGES[language])
    tree = parser.parse(source)
    imports, functions, classes = _EXTRACTORS[language](tree.root_node, source)
    todos = common.resolve_enclosing_symbols(
        common.find_todo_comments(tree.root_node, source), functions, classes
    )
    return SourceFileFacts(
        path=relative_path,
        language=language,
        loc=source.count(b"\n") + 1,
        content_hash=hashlib.sha256(source).hexdigest(),
        structural_confidence=StructuralConfidence.FULL,
        imports=imports,
        functions=functions,
        classes=classes,
        todos=todos,
    )
