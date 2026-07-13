"""Go fact extraction.

Go has no classes — the nearest structural analog is a struct type
declaration, modeled here as a `ClassFact` (ARCHITECTURE.md doesn't
distinguish "class" from "struct" at the facts level; both are "a named
type with associated behavior" for Stage 5+'s purposes). Unlike Python/
TypeScript, Go methods are *not* nested inside the struct's syntax —
they're declared at package level with a receiver
(`func (b *Bar) Method(...)`), so association to the struct happens by
matching the receiver's type name against the collected structs, not by
AST nesting.
"""

from tree_sitter import Node

from pipeline.ingestion.extractors.common import node_text
from pipeline.ingestion.facts import ClassFact, FunctionFact, ImportFact, ParameterFact


def _extract_parameters(params_node: Node, source: bytes) -> list[ParameterFact]:
    result: list[ParameterFact] = []
    for child in params_node.children:
        if child.type != "parameter_declaration":
            continue
        name_node = child.child_by_field_name("name")
        type_node = child.child_by_field_name("type")
        if name_node is None:
            continue
        result.append(
            ParameterFact(
                name=node_text(name_node, source),
                type_annotation=node_text(type_node, source) if type_node else None,
            )
        )
    return result


def _receiver_type_name(receiver_node: Node, source: bytes) -> str | None:
    """`(b *Bar)` or `(b Bar)` -> "Bar"."""
    decl = next((c for c in receiver_node.children if c.type == "parameter_declaration"), None)
    if decl is None:
        return None
    type_node = decl.child_by_field_name("type")
    if type_node is None:
        return None
    if type_node.type == "pointer_type":
        inner = next((c for c in type_node.children if c.type == "type_identifier"), None)
        return node_text(inner, source) if inner is not None else None
    if type_node.type == "type_identifier":
        return node_text(type_node, source)
    return None


def _extract_function(node: Node, source: bytes) -> FunctionFact | None:
    name_node = node.child_by_field_name("name")
    if name_node is None:
        return None
    name = node_text(name_node, source)
    params_node = node.child_by_field_name("parameters")
    result_node = node.child_by_field_name("result")
    return FunctionFact(
        name=name,
        qualified_name=name,
        parameters=_extract_parameters(params_node, source) if params_node else [],
        return_type=node_text(result_node, source) if result_node else None,
        start_line=node.start_point.row + 1,
        end_line=node.end_point.row + 1,
        is_method=False,
    )


def _extract_method(node: Node, source: bytes) -> tuple[str, FunctionFact] | None:
    name_node = node.child_by_field_name("name")
    receiver_node = node.child_by_field_name("receiver")
    if name_node is None or receiver_node is None:
        return None
    receiver_type = _receiver_type_name(receiver_node, source)
    if receiver_type is None:
        return None
    name = node_text(name_node, source)
    params_node = node.child_by_field_name("parameters")
    result_node = node.child_by_field_name("result")
    fn = FunctionFact(
        name=name,
        qualified_name=f"{receiver_type}.{name}",
        parameters=_extract_parameters(params_node, source) if params_node else [],
        return_type=node_text(result_node, source) if result_node else None,
        start_line=node.start_point.row + 1,
        end_line=node.end_point.row + 1,
        is_method=True,
    )
    return receiver_type, fn


def _extract_struct(type_spec: Node, source: bytes, decl_node: Node) -> ClassFact | None:
    name_node = type_spec.child_by_field_name("name")
    type_node = type_spec.child_by_field_name("type")
    if name_node is None or type_node is None or type_node.type != "struct_type":
        return None
    return ClassFact(
        name=node_text(name_node, source),
        start_line=decl_node.start_point.row + 1,
        end_line=decl_node.end_point.row + 1,
    )


def _extract_imports(node: Node, source: bytes) -> list[ImportFact]:
    imports: list[ImportFact] = []
    line = node.start_point.row + 1
    for spec in node.children:
        if spec.type == "import_spec_list":
            for child in spec.children:
                if child.type == "import_spec":
                    lit = next(
                        (c for c in child.children if c.type == "interpreted_string_literal"), None
                    )
                    if lit is not None:
                        imports.append(ImportFact(module=node_text(lit, source).strip('"'), line=line))
        elif spec.type == "import_spec":
            lit = next((c for c in spec.children if c.type == "interpreted_string_literal"), None)
            if lit is not None:
                imports.append(ImportFact(module=node_text(lit, source).strip('"'), line=line))
    return imports


def extract(
    root_node: Node, source: bytes
) -> tuple[list[ImportFact], list[FunctionFact], list[ClassFact]]:
    imports: list[ImportFact] = []
    functions: list[FunctionFact] = []
    structs_by_name: dict[str, ClassFact] = {}
    pending_methods: list[tuple[str, FunctionFact]] = []

    for child in root_node.children:
        if child.type == "import_declaration":
            imports.extend(_extract_imports(child, source))
        elif child.type == "function_declaration":
            fn = _extract_function(child, source)
            if fn:
                functions.append(fn)
        elif child.type == "method_declaration":
            result = _extract_method(child, source)
            if result:
                pending_methods.append(result)
        elif child.type == "type_declaration":
            for type_spec in child.children:
                if type_spec.type == "type_spec":
                    struct = _extract_struct(type_spec, source, child)
                    if struct:
                        structs_by_name[struct.name] = struct

    for receiver_type, method in pending_methods:
        struct = structs_by_name.get(receiver_type)
        if struct is not None:
            struct.methods.append(method)
        else:
            # Receiver type has no struct declaration in this file (e.g.
            # declared elsewhere, or a named non-struct type) — surface
            # the method as a top-level function rather than dropping it.
            functions.append(method)

    return imports, functions, list(structs_by_name.values())
