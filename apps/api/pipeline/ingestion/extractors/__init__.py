"""One module per supported grammar (ARCHITECTURE.md §4: Python,
TypeScript/JavaScript, Go). Each exposes a single `extract(root_node,
source) -> tuple[list[ImportFact], list[FunctionFact], list[ClassFact]]`
function — the common interface `treesitter.py` dispatches through."""
