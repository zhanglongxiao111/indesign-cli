from __future__ import annotations

import hashlib
import re
from pathlib import Path


def _hash_path(path: Path) -> str:
    digest = hashlib.sha256(str(path).encode("utf-8")).hexdigest()
    return digest[:16]


def scrub_path(path_value: str, cwd: Path) -> dict[str, object]:
    path = Path(path_value)
    try:
        resolved = path.resolve()
    except OSError:
        resolved = path
    try:
        relative = resolved.relative_to(cwd.resolve())
        return {
            "path": str(relative).replace("\\", "/"),
            "external": False,
            "extension": resolved.suffix.lower(),
        }
    except ValueError:
        return {
            "external": True,
            "kind": "external_path",
            "extension": resolved.suffix.lower(),
            "hash": _hash_path(resolved),
        }


def scrub_text_paths(value: str) -> str:
    def replace(match: re.Match[str]) -> str:
        raw_path = match.group(0)
        suffix = Path(raw_path).suffix.lower()
        return f"<external_path extension={suffix or 'unknown'} hash={_hash_path(Path(raw_path))}>"

    return re.sub(r"[A-Za-z]:[\\/][^'\"\r\n]+", replace, value)
