"""Helpers shared across per-language extractors: text slicing, TODO
comment scanning, and enclosing-symbol resolution (ARCHITECTURE.md
§3.1: "a TODO is linked to a symbol, not just a line number")."""

import re

from tree_sitter import Node

from pipeline.ingestion.facts import ClassFact, FunctionFact, TodoFact

_TODO_PATTERN = re.compile(r"\b(TODO|FIXME)\b[:\s]*(.*)", re.IGNORECASE)


def node_text(node: Node, source: bytes) -> str:
    return source[node.start_byte : node.end_byte].decode("utf-8", errors="replace")


def first_child_of_type(node: Node, type_name: str) -> Node | None:
    return next((c for c in node.children if c.type == type_name), None)


def find_todo_comments(root_node: Node, source: bytes) -> list[tuple[int, str]]:
    """Walks the whole tree (comments can appear at any depth) looking
    for `comment` nodes whose text matches TODO/FIXME. Common across all
    three supported grammars — Python, TS/JS, and Go all name the node
    type `comment` (verified against each grammar directly)."""
    found: list[tuple[int, str]] = []
    stack = [root_node]
    while stack:
        node = stack.pop()
        if node.type == "comment":
            text = node_text(node, source)
            match = _TODO_PATTERN.search(text)
            if match:
                found.append((node.start_point.row + 1, text.strip("/*# \t\r\n")))
        stack.extend(node.children)
    return found


def resolve_enclosing_symbols(
    todos: list[tuple[int, str]],
    functions: list[FunctionFact],
    classes: list[ClassFact],
) -> list[TodoFact]:
    """Picks the innermost (smallest-range) enclosing function/class for
    each TODO, or None if it's at module level."""
    ranges: list[tuple[int, int, str]] = []
    for cls in classes:
        ranges.append((cls.start_line, cls.end_line, cls.name))
        for method in cls.methods:
            ranges.append((method.start_line, method.end_line, method.qualified_name))
    for fn in functions:
        ranges.append((fn.start_line, fn.end_line, fn.qualified_name))

    resolved: list[TodoFact] = []
    for line, text in todos:
        candidates = [r for r in ranges if r[0] <= line <= r[1]]
        enclosing = min(candidates, key=lambda r: r[1] - r[0])[2] if candidates else None
        resolved.append(TodoFact(text=text, line=line, enclosing_symbol=enclosing))
    return resolved
