from __future__ import annotations

import hashlib
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
