"""Real, manifest/extension-derived language and framework detection —
no LLM, no guessing. Feeds the Atlas's "Technologies Detected" section
and the live-discovery feed shown while a study is running.

A framework only appears here if its exact package name is present in
a manifest file Blueprint already reads for Stage 3's module rollup
(`discovery.MANIFEST_FILENAMES`); nothing is inferred from file
extensions, folder names, or code content alone (RULES.md §23: no
fabricated findings — every entry traces to one real line in one real
manifest file, carried as `manifest_path` so the claim is checkable).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from pipeline.ingestion.discovery import LANGUAGE_BY_EXTENSION

# dependency name (as it appears in the manifest) -> (display name, category).
# Category drives grouping in "Technologies Detected"; it is not a
# confidence signal.
_NPM_FRAMEWORKS: dict[str, tuple[str, str]] = {
    "react": ("React", "frontend"),
    "next": ("Next.js", "frontend"),
    "vue": ("Vue", "frontend"),
    "@angular/core": ("Angular", "frontend"),
    "svelte": ("Svelte", "frontend"),
    "tailwindcss": ("Tailwind CSS", "frontend"),
    "express": ("Express", "backend"),
    "@nestjs/core": ("NestJS", "backend"),
    "fastify": ("Fastify", "backend"),
    "prisma": ("Prisma", "database"),
    "mongoose": ("MongoDB", "database"),
    "mongodb": ("MongoDB", "database"),
    "pg": ("PostgreSQL", "database"),
    "redis": ("Redis", "database"),
    "ioredis": ("Redis", "database"),
    "graphql": ("GraphQL", "api"),
}

_PYTHON_FRAMEWORKS: dict[str, tuple[str, str]] = {
    "fastapi": ("FastAPI", "backend"),
    "flask": ("Flask", "backend"),
    "django": ("Django", "backend"),
    "sqlalchemy": ("SQLAlchemy", "database"),
    "pymongo": ("MongoDB", "database"),
    "motor": ("MongoDB", "database"),
    "psycopg": ("PostgreSQL", "database"),
    "psycopg2": ("PostgreSQL", "database"),
    "psycopg2-binary": ("PostgreSQL", "database"),
    "redis": ("Redis", "database"),
    "torch": ("PyTorch", "ml"),
    "tensorflow": ("TensorFlow", "ml"),
    "transformers": ("Hugging Face Transformers", "ml"),
    "ultralytics": ("YOLO (Ultralytics)", "ml"),
    "celery": ("Celery", "backend"),
    "pydantic": ("Pydantic", "backend"),
}

_GO_FRAMEWORKS: dict[str, tuple[str, str]] = {
    "github.com/gin-gonic/gin": ("Gin", "backend"),
    "github.com/labstack/echo": ("Echo", "backend"),
    "gorm.io/gorm": ("GORM", "database"),
}

_LANGUAGE_DISPLAY_NAMES = {
    "python": "Python",
    "typescript": "TypeScript",
    "javascript": "JavaScript",
    "go": "Go",
    "java": "Java",
    "kotlin": "Kotlin",
    "ruby": "Ruby",
    "rust": "Rust",
    "c": "C",
    "cpp": "C++",
    "csharp": "C#",
    "php": "PHP",
    "swift": "Swift",
}


@dataclass
class DetectedFramework:
    name: str
    category: str
    manifest_path: str


@dataclass
class DetectedLanguage:
    name: str
    file_count: int


@dataclass
class StackDetection:
    languages: list[DetectedLanguage]
    frameworks: list[DetectedFramework]


def _detect_languages(source_files: list[Path]) -> list[DetectedLanguage]:
    counts: dict[str, int] = {}
    for path in source_files:
        language = LANGUAGE_BY_EXTENSION.get(path.suffix)
        if language is None:
            continue
        counts[language] = counts.get(language, 0) + 1
    return sorted(
        (
            DetectedLanguage(name=_LANGUAGE_DISPLAY_NAMES.get(key, key), file_count=count)
            for key, count in counts.items()
        ),
        key=lambda lang: lang.file_count,
        reverse=True,
    )


def _npm_dependency_names(manifest_path: Path) -> set[str]:
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8", errors="ignore"))
    except (OSError, json.JSONDecodeError):
        return set()
    names: set[str] = set()
    for key in ("dependencies", "devDependencies"):
        section = data.get(key)
        if isinstance(section, dict):
            names.update(name for name in section if isinstance(name, str))
    return names


_REQUIREMENT_NAME_RE = re.compile(r"^([A-Za-z0-9_.\-]+)")


def _python_requirement_names(manifest_path: Path) -> set[str]:
    try:
        text = manifest_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return set()
    names: set[str] = set()
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        match = _REQUIREMENT_NAME_RE.match(stripped)
        if match:
            names.add(match.group(1).lower())
    return names


def _pyproject_dependency_names(manifest_path: Path) -> set[str]:
    """`pyproject.toml`'s `[project.dependencies]`/`[tool.poetry.dependencies]`
    lines are just `"name>=1.0"` (PEP 508) entries — the same shape as a
    requirements.txt line once quoting is stripped, so the same regex
    applies without pulling in a TOML parser for one field."""
    try:
        text = manifest_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return set()
    names: set[str] = set()
    for line in text.splitlines():
        stripped = line.strip().strip(",").strip('"').strip("'")
        if "=" in line.split("#")[0] and stripped == line.strip():
            # A real `key = value` TOML line (not a quoted dependency
            # string) — skip so section headers/table keys never leak in.
            continue
        match = _REQUIREMENT_NAME_RE.match(stripped)
        if match:
            names.add(match.group(1).lower())
    return names


def _go_mod_requires(manifest_path: Path) -> set[str]:
    try:
        text = manifest_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return set()
    names: set[str] = set()
    for line in text.splitlines():
        stripped = line.strip()
        parts = stripped.split()
        if len(parts) >= 2 and "/" in parts[0] and "." in parts[0]:
            names.add(parts[0])
    return names


def detect_stack(repo_root: Path, source_files: list[Path], manifest_dirs: frozenset[str]) -> StackDetection:
    languages = _detect_languages(source_files)

    frameworks: list[DetectedFramework] = []
    seen: set[str] = set()

    def record(match: tuple[str, str] | None, manifest_dir: str, filename: str) -> None:
        if match is None or match[0] in seen:
            return
        name, category = match
        evidence = str(Path(manifest_dir) / filename)
        frameworks.append(DetectedFramework(name=name, category=category, manifest_path=evidence))
        seen.add(name)

    for manifest_dir in sorted(manifest_dirs):
        base = repo_root / manifest_dir if manifest_dir != "." else repo_root

        package_json = base / "package.json"
        if package_json.exists():
            for dep_name in _npm_dependency_names(package_json):
                record(_NPM_FRAMEWORKS.get(dep_name), manifest_dir, "package.json")

        requirements_txt = base / "requirements.txt"
        if requirements_txt.exists():
            for dep_name in _python_requirement_names(requirements_txt):
                record(_PYTHON_FRAMEWORKS.get(dep_name), manifest_dir, "requirements.txt")

        pyproject_toml = base / "pyproject.toml"
        if pyproject_toml.exists():
            for dep_name in _pyproject_dependency_names(pyproject_toml):
                record(_PYTHON_FRAMEWORKS.get(dep_name), manifest_dir, "pyproject.toml")

        go_mod = base / "go.mod"
        if go_mod.exists():
            for dep_name in _go_mod_requires(go_mod):
                record(_GO_FRAMEWORKS.get(dep_name), manifest_dir, "go.mod")

        dockerfile = base / "Dockerfile"
        if dockerfile.exists():
            record(("Docker", "infra"), manifest_dir, "Dockerfile")

    frameworks.sort(key=lambda f: (f.category, f.name))
    return StackDetection(languages=languages, frameworks=frameworks)
