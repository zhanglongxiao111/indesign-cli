from __future__ import annotations

import os
from pathlib import Path
from typing import Any

_EDGE_EXE_SUFFIX = Path("Microsoft") / "Edge" / "Application" / "msedge.exe"


def _dedupe_paths(paths: list[Path]) -> list[Path]:
    seen: set[str] = set()
    unique: list[Path] = []
    for path in paths:
        key = os.path.normcase(os.path.normpath(str(path)))
        if key not in seen:
            seen.add(key)
            unique.append(path)
    return unique


def _drive_root(raw: str) -> Path:
    if len(raw) == 2 and raw[1] == ":":
        return Path(f"{raw}\\")
    return Path(raw)


def _windows_program_roots(values: dict[str, str], *, use_default_drive: bool) -> list[Path]:
    drive_roots: list[Path] = []
    system_drive = (values.get("SystemDrive") or "").strip()
    if system_drive:
        drive_roots.append(_drive_root(system_drive))
    system_root = (values.get("SystemRoot") or "").strip()
    if system_root:
        drive_roots.append(Path(system_root).parent)
    if use_default_drive and os.name == "nt":
        drive_roots.append(Path("C:\\"))
    roots: list[Path] = []
    for root in drive_roots:
        roots.append(root / "Program Files (x86)")
        roots.append(root / "Program Files")
    return roots


def edge_candidates(env: dict[str, str] | None = None) -> list[Path]:
    use_process_env = env is None
    values = dict(os.environ) if use_process_env else env
    explicit = (values.get("HTML_INDESIGN_BROWSER_EXECUTABLE") or "").strip()
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit))
    for key in ("ProgramFiles(x86)", "ProgramFiles", "ProgramW6432"):
        base = (values.get(key) or "").strip()
        if base:
            candidates.append(Path(base) / _EDGE_EXE_SUFFIX)
    if not all((values.get(key) or "").strip() for key in ("ProgramFiles(x86)", "ProgramFiles")):
        for root in _windows_program_roots(values, use_default_drive=use_process_env):
            candidates.append(root / _EDGE_EXE_SUFFIX)
    local_app_data = (values.get("LOCALAPPDATA") or "").strip()
    if local_app_data:
        candidates.append(Path(local_app_data) / _EDGE_EXE_SUFFIX)
    return _dedupe_paths(candidates)


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
