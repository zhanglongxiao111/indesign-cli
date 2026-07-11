from __future__ import annotations

import os
from pathlib import Path
from typing import Any


def edge_candidates(env: dict[str, str] | None = None) -> list[Path]:
    values = env if env is not None else os.environ
    explicit = values.get("HTML_INDESIGN_BROWSER_EXECUTABLE")
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit))
    suffix = Path("Microsoft") / "Edge" / "Application" / "msedge.exe"
    for key in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"):
        base = values.get(key)
        if base:
            candidates.append(Path(base) / suffix)
    return candidates


def probe_edge(env: dict[str, str] | None = None) -> dict[str, Any]:
    candidates = edge_candidates(env)
    for candidate in candidates:
        if candidate.is_file():
            return {"checked": True, "available": True, "browser": "msedge", "path": str(candidate.resolve())}
    return {
        "checked": True,
        "available": False,
        "browser": "msedge",
        "path": None,
        "code": "EDGE_NOT_AVAILABLE",
        "candidates": [str(path) for path in candidates],
    }
