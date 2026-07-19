"""The manifest is pure composition of already-real data — assembly and
entrypoint detection, never invention."""

from pathlib import Path

from models.types import GraphType
from pipeline.graph.specs import NodeSpec
from pipeline.ingestion.manifest import build_manifest
from pipeline.ingestion.readme_extract import extract_readme


def _module_node(label: str, node_type: str) -> NodeSpec:
    return NodeSpec(graph_type=GraphType.REPOSITORY, node_type=node_type, label=label)


def test_build_manifest_composes_real_inputs(tmp_path: Path) -> None:
    (tmp_path / "main.py").write_text("print('hi')", encoding="utf-8")
    (tmp_path / "helper.py").write_text("x = 1", encoding="utf-8")
    source_files = [tmp_path / "main.py", tmp_path / "helper.py"]

    manifest = build_manifest(
        full_name="acme/claimsight",
        readme=extract_readme("# ClaimSight\n\nDoes claims.\n\n## Features\n\n- OCR"),
        detected_stack={
            "languages": [{"name": "Python", "file_count": 2}],
            "frameworks": [{"name": "FastAPI", "category": "backend", "manifest_path": "x"}],
        },
        api_routes={"count": 3, "routes": []},
        doc_audit={"present": ["README"], "missing": ["Tests"]},
        repository_nodes=[_module_node("api", "service"), _module_node("web", "module")],
        source_files=source_files,
        repo_root=tmp_path,
    )

    assert manifest["name"] == "claimsight"
    assert manifest["full_name"] == "acme/claimsight"
    assert manifest["readme"]["title"] == "ClaimSight"
    assert manifest["tech_stack"] == {"languages": ["Python"], "frameworks": ["FastAPI"]}
    assert manifest["api_route_count"] == 3
    # Only the real entrypoint filename is picked up, not every source file.
    assert manifest["entrypoints"] == ["main.py"]
    assert {"name": "api", "kind": "service"} in manifest["modules"]


def test_build_manifest_without_readme_or_stack(tmp_path: Path) -> None:
    manifest = build_manifest(
        full_name="acme/bare",
        readme=None,
        detected_stack=None,
        api_routes=None,
        doc_audit=None,
        repository_nodes=[],
        source_files=[],
        repo_root=tmp_path,
    )
    assert manifest["readme"] is None
    assert manifest["tech_stack"] == {"languages": [], "frameworks": []}
    assert manifest["entrypoints"] == []
    assert manifest["api_route_count"] == 0
