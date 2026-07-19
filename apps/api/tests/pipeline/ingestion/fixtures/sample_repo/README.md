# Sample Repo

A small fixture repository used to exercise the ingestion pipeline end to end.

## Features

- A Python entrypoint and a handful of importable modules
- A Java file with no Tree-sitter grammar, to exercise heuristic extraction
- Package manifests in several directories, to exercise module rollup

## Installation

```bash
pip install -e .
```

## Usage

Run the entrypoint directly:

```bash
python main.py
```

## Architecture

`main.py` is the entrypoint. `utils/`, `web/`, and `service/` each carry their
own package manifest, so Stage 3 rolls them up as separate modules.
