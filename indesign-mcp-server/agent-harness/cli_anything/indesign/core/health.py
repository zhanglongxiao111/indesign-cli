from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any


def health(repo_root: Path, deep: bool = False) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "deep": deep,
        "node": {"available": shutil.which("node") is not None},
        "python": {"available": shutil.which("python") is not None},
        "node_entry_advanced": {
            "path": "src/advanced/index.js",
            "exists": (repo_root / "src/advanced/index.js").exists(),
        },
        "node_entry_classic": {
            "path": "src/index.js",
            "exists": (repo_root / "src/index.js").exists(),
        },
    }
    if deep:
        payload["winax"] = {"checked": True, "available": None}
        payload["indesign_com"] = {"checked": True, "available": None}
    return payload
