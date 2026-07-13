"""Python fact extraction (tree-sitter-python grammar).

Scoped to module-level and class-level structure: top-level functions,
classes and their direct methods, and top-level imports. Nested
functions (closures inside functions) and imports inside conditionals/
try blocks are intentionally not walked — Stage 5+ reasons about
module/class/function-level architecture, not closures, and a facts
pass that chased every nesting level would trade real complexity for
signal nothing downstream currently consumes.
"""

from tree_sitter import Node

from pipeline.ingestion.extractors.common import first_child_of_type, node_text
from pipeline.ingestion.facts import ClassFact, FunctionFact, ImportFact, ParameterFact


def _unwrap_decorated(node: Node) -> Node:
    if node.type == "decorated_definition":
        for child in node.children:
            if child.type in ("function_definition", "class_definition"):
                return child
    return node


def _extract_parameters(params_node: Node, source: bytes) -> list[ParameterFact]:
    result: list[ParameterFact] = []
    for child in params_node.children:
        if child.type == "identifier":
            result.append(ParameterFact(name=node_text(child, source)))
        elif child.type == "typed_parameter":
            name_node = first_child_of_type(child, "identifier")
            type_node = child.child_by_field_name("type")
            if name_node is not None:
                result.append(
                    ParameterFact(
                        name=node_text(name_node, source),
                        type_annotation=node_text(type_node, source) if type_node else None,
                    )
                )
        elif child.type == "default_parameter":
            name_node = first_child_of_type(child, "identifier")
            if name_node is not None:
                result.append(ParameterFact(name=node_text(name_node, source), has_default=True))
        elif child.type == "typed_default_parameter":
            name_node = child.child_by_field_name("name")
            type_node = child.child_by_field_name("type")
            if name_node is not None:
                result.append(
                    ParameterFact(
                        name=node_text(name_node, source),
                        type_annotation=node_text(type_node, source) if type_node else None,
                        has_default=True,
                    )
                )
        elif child.type in ("list_splat_pattern", "dictionary_splat_pattern"):
            ident = first_child_of_type(child, "identifier")
            if ident is not None:
                prefix = "*" if child.type == "list_splat_pattern" else "**"
                result.append(ParameterFact(name=prefix + node_text(ident, source)))
    return result


def _extract_function(
    node: Node, source: bytes, *, qualified_prefix: str, is_method: bool
) -> FunctionFact | None:
    name_node = node.child_by_field_name("name")
    if name_node is None:
        return None
    name = node_text(name_node, source)
    params_node = node.child_by_field_name("parameters")
    return_node = node.child_by_field_name("return_type")
    return FunctionFact(
        name=name,
        qualified_name=f"{qualified_prefix}.{name}" if qualified_prefix else name,
        parameters=_extract_parameters(params_node, source) if params_node else [],
        return_type=node_text(return_node, source) if return_node else None,
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
            actual = _unwrap_decorated(child)
            if actual.type == "function_definition":
                fn = _extract_function(actual, source, qualified_prefix=name, is_method=True)
                if fn:
                    methods.append(fn)
    return ClassFact(
        name=name,
        start_line=node.start_point.row + 1,
        end_line=node.end_point.row + 1,
        methods=methods,
    )


def _extract_imports(node: Node, source: bytes) -> list[ImportFact]:
    imports: list[ImportFact] = []
    line = node.start_point.row + 1
    if node.type == "import_statement":
        for child in node.children:
            if child.type == "dotted_name":
                imports.append(ImportFact(module=node_text(child, source), line=line))
            elif child.type == "aliased_import":
                dotted = first_child_of_type(child, "dotted_name")
                if dotted is not None:
                    imports.append(ImportFact(module=node_text(dotted, source), line=line))
    elif node.type == "import_from_statement":
        module_node = first_child_of_type(node, "dotted_name")
        module = node_text(module_node, source) if module_node else ""
        if any(c.type == "wildcard_import" for c in node.children):
            names = ["*"]
        else:
            dotted_names = [c for c in node.children if c.type == "dotted_name"]
            # first dotted_name is the module itself; the rest are imported names
            names = [node_text(c, source) for c in dotted_names[1:]]
        imports.append(ImportFact(module=module, names=names, line=line))
    return imports


def extract(
    root_node: Node, source: bytes
) -> tuple[list[ImportFact], list[FunctionFact], list[ClassFact]]:
    imports: list[ImportFact] = []
    functions: list[FunctionFact] = []
    classes: list[ClassFact] = []

    for child in root_node.children:
        actual = _unwrap_decorated(child)
        if actual.type in ("import_statement", "import_from_statement"):
            imports.extend(_extract_imports(actual, source))
        elif actual.type == "function_definition":
            fn = _extract_function(actual, source, qualified_prefix="", is_method=False)
            if fn:
                functions.append(fn)
        elif actual.type == "class_definition":
            classes.append(_extract_class(actual, source))

    return imports, functions, classes
