"""TypeScript/JavaScript fact extraction.

One extractor for both languages: the TypeScript grammar is a superset
of the JavaScript one (tree-sitter-typescript ships both `language_typescript`
and `language_tsx`; JavaScript source parses fine under the TypeScript
grammar, just without type annotations present to extract), so a single
implementation avoids duplicating this logic per RULES.md §24.

Scoped the same way as the Python extractor: top-level/class-level
functions and classes, plus arrow functions assigned to a top-level
`const`/`let` — the common "exported handler" pattern in this codebase's
own stack (FastAPI aside, `apps/web` is exactly this shape). Deeply
nested closures are not walked, for the same reason noted in python.py.
"""

from tree_sitter import Node

from pipeline.ingestion.extractors.common import node_text
from pipeline.ingestion.facts import ClassFact, FunctionFact, ImportFact, ParameterFact

_FUNCTION_LIKE = ("function_declaration", "generator_function_declaration")


def _strip_type_annotation(text: str) -> str:
    # `type_annotation` node text includes the leading ':', e.g. ": number".
    return text.removeprefix(":").strip()


def _extract_parameters(params_node: Node, source: bytes) -> list[ParameterFact]:
    result: list[ParameterFact] = []
    for child in params_node.children:
        if child.type not in ("required_parameter", "optional_parameter"):
            continue
        pattern_node = child.child_by_field_name("pattern")
        if pattern_node is None or pattern_node.type != "identifier":
            continue
        type_node = child.child_by_field_name("type")
        value_node = child.child_by_field_name("value")
        result.append(
            ParameterFact(
                name=node_text(pattern_node, source),
                type_annotation=(
                    _strip_type_annotation(node_text(type_node, source)) if type_node else None
                ),
                has_default=child.type == "optional_parameter" or value_node is not None,
            )
        )
    return result


def _extract_function_like(
    node: Node, source: bytes, *, name: str, qualified_prefix: str, is_method: bool
) -> FunctionFact:
    params_node = node.child_by_field_name("parameters")
    return_node = node.child_by_field_name("return_type")
    return FunctionFact(
        name=name,
        qualified_name=f"{qualified_prefix}.{name}" if qualified_prefix else name,
        parameters=_extract_parameters(params_node, source) if params_node else [],
        return_type=(
            _strip_type_annotation(node_text(return_node, source)) if return_node else None
        ),
        start_line=node.start_point.row + 1,
        end_line=node.end_point.row + 1,
        is_method=is_method,
    )


def _extract_class(node: Node, source: bytes) -> ClassFact:
    name_node = node.child_by_field_name("name")
    name = node_text(name_node, source) if name_node else "<anonymous>"
    body = node.child_by_field_name("body")
    methods: list[FunctionFact] = []
    if body is not None:
        for child in body.children:
            if child.type == "method_definition":
                method_name_node = child.child_by_field_name("name")
                if method_name_node is None:
                    continue
                methods.append(
                    _extract_function_like(
                        child,
                        source,
                        name=node_text(method_name_node, source),
                        qualified_prefix=name,
                        is_method=True,
                    )
                )
    return ClassFact(
        name=name,
        start_line=node.start_point.row + 1,
        end_line=node.end_point.row + 1,
        methods=methods,
    )


def _extract_arrow_const(node: Node, source: bytes) -> FunctionFact | None:
    """`const foo = (x: number): number => x + 1` — a `lexical_declaration`
    whose `variable_declarator.value` is an arrow_function/function_expression."""
    for declarator in node.children:
        if declarator.type != "variable_declarator":
            continue
        name_node = declarator.child_by_field_name("name")
        value_node = declarator.child_by_field_name("value")
        if name_node is None or value_node is None:
            continue
        if value_node.type not in ("arrow_function", "function_expression"):
            continue
        return _extract_function_like(
            value_node, source, name=node_text(name_node, source), qualified_prefix="", is_method=False
        )
    return None


def _extract_imports(node: Node, source: bytes) -> ImportFact | None:
    source_node = node.child_by_field_name("source")
    if source_node is None:
        return None
    module = node_text(source_node, source).strip("'\"")
    clause = next((c for c in node.children if c.type == "import_clause"), None)
    names: list[str] = []
    if clause is not None:
        stack = [clause]
        while stack:
            n = stack.pop()
            if n.type == "identifier":
                names.append(node_text(n, source))
            stack.extend(n.children)
    return ImportFact(module=module, names=names, line=node.start_point.row + 1)


def extract(
    root_node: Node, source: bytes
) -> tuple[list[ImportFact], list[FunctionFact], list[ClassFact]]:
    imports: list[ImportFact] = []
    functions: list[FunctionFact] = []
    classes: list[ClassFact] = []

    for child in root_node.children:
        # `export function foo() {}` / `export class Bar {}` / `export const x = ...`
        node = child
        if node.type == "export_statement":
            inner = next(
                (c for c in node.children if c.type not in ("export", "default")), None
            )
            if inner is None:
                continue
            node = inner

        if node.type in _FUNCTION_LIKE:
            name_node = node.child_by_field_name("name")
            if name_node is not None:
                functions.append(
                    _extract_function_like(
                        node,
                        source,
                        name=node_text(name_node, source),
                        qualified_prefix="",
                        is_method=False,
                    )
                )
        elif node.type == "class_declaration":
            classes.append(_extract_class(node, source))
        elif node.type == "lexical_declaration":
            fn = _extract_arrow_const(node, source)
            if fn:
                functions.append(fn)
        elif node.type == "import_statement":
            imp = _extract_imports(node, source)
            if imp:
                imports.append(imp)

    return imports, functions, classes
