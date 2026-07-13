#!/usr/bin/env python3
"""Converts a downloaded GitHub App .pem file into the single-line,
escaped-newline form GITHUB_APP_PRIVATE_KEY needs in .env.

Why this exists: pasting a raw, multi-line PEM directly into .env looks
correct but silently breaks. python-dotenv parses .env line by line and
has no support for an unquoted value spanning multiple lines, so it
keeps only the "-----BEGIN RSA PRIVATE KEY-----" line and discards the
rest -- no error, just a truncated key that fails later, deep inside a
GitHub API call (see integrations/github/config.py's from_settings,
which now validates for this and fails fast instead).

Usage:
    uv run python scripts/format_private_key.py path/to/downloaded-key.pem

Prints a single line: GITHUB_APP_PRIVATE_KEY=<escaped value>
Redirect it into .env, or append directly:

    uv run python scripts/format_private_key.py key.pem >> .env
"""

import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} path/to/downloaded-key.pem", file=sys.stderr)
        return 1

    pem_path = Path(sys.argv[1])
    if not pem_path.is_file():
        print(f"error: {pem_path} is not a file", file=sys.stderr)
        return 1

    raw = pem_path.read_text().strip()
    if "BEGIN" not in raw or "END" not in raw:
        print(
            f"error: {pem_path} does not look like a PEM file "
            "(expected BEGIN/END markers)",
            file=sys.stderr,
        )
        return 1

    escaped = raw.replace("\n", "\\n")
    print(f"GITHUB_APP_PRIVATE_KEY={escaped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
