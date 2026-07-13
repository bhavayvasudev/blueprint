"""Heuristic regex-based fallback extractor (ARCHITECTURE.md §4).

Used only for languages `discovery.classify_language()` recognizes but
that have no Tree-sitter grammar wired up in `treesitter.py` (i.e. not
in `discovery.SUPPORTED_LANGUAGES`). Deliberately coarser than the
Tree-sitter path: no parameter types, no return types, and a TODO's
`enclosing_symbol` is always None — there's no AST to resolve nesting
against. Every fact produced here is tagged
`StructuralConfidence.LOW` by the caller, never presented as
equal-quality to a real parse (ARCHITECTURE.md §4).
"""

import hashlib
import re

from models.types import StructuralConfidence
from pipeline.ingestion.facts import ClassFact, FunctionFact, SourceFileFacts, TodoFact

_TODO_PATTERN = re.compile(r"(?://|#|/\*)\s*(TODO|FIXME)\b[:\s]*(.*)", re.IGNORECASE)

# Matches brace-delimited function-like definitions across the common
# C-family/def/func-keyword shapes: `def foo(`, `func foo(`, `function
# foo(`, `fn foo(`, `public void foo(`, `private int foo(`, etc.
_FUNCTION_PATTERN = re.compile(
    r"^[ \t]*(?:[\w<>\[\],\s*&]+?[ \t]+)?"  # optional return type / modifiers
    r"(?:def|func|function|fn)?[ \t]*"  # optional keyword
    r"\b([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{}]*?\)"  # name(args)
    r"[ \t]*(?:->[ \t]*[\w<>\[\],\s]+)?[ \t]*\{",  # optional return arrow + opening brace
    re.MULTILINE,
)

_CONTROL_FLOW_KEYWORDS = frozenset({"if", "for", "while", "switch", "catch", "else"})

_CLASS_PATTERN = re.compile(
    r"^[ \t]*(?:public[ \t]+|private[ \t]+|final[ \t]+|abstract[ \t]+)*class[ \t]+([A-Za-z_][A-Za-z0-9_]*)",
    re.MULTILINE,
)


def _find_matching_brace(text: str, open_index: int) -> int:
    depth = 0
    for i in range(open_index, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return i
    return len(text) - 1


def _line_of(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


def extract_heuristic(source: bytes, *, relative_path: str, language: str) -> SourceFileFacts:
    text = source.decode("utf-8", errors="replace")

    functions: list[FunctionFact] = []
    for match in _FUNCTION_PATTERN.finditer(text):
        name = match.group(1)
        if name in _CONTROL_FLOW_KEYWORDS:
            continue
        brace_index = match.end() - 1
        end_index = _find_matching_brace(text, brace_index)
        functions.append(
            FunctionFact(
                name=name,
                qualified_name=name,
                parameters=[],
                start_line=_line_of(text, match.start()),
                end_line=_line_of(text, end_index),
            )
        )

    classes = [
        ClassFact(
            name=match.group(1),
            start_line=_line_of(text, match.start()),
            end_line=_line_of(text, match.start()),
        )
        for match in _CLASS_PATTERN.finditer(text)
    ]

    todos = [
        TodoFact(text=match.group(0).strip(), line=_line_of(text, match.start()), enclosing_symbol=None)
        for match in _TODO_PATTERN.finditer(text)
    ]

    return SourceFileFacts(
        path=relative_path,
        language=language,
        loc=text.count("\n") + 1,
        content_hash=hashlib.sha256(source).hexdigest(),
        structural_confidence=StructuralConfidence.LOW,
        imports=[],
        functions=functions,
        classes=classes,
        todos=todos,
    )
