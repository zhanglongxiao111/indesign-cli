from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path
from typing import Any

_EDGE_EXE_SUFFIX = Path("Microsoft") / "Edge" / "Application" / "msedge.exe"


def _env_get(values: Mapping[str, str], key: str) -> str:
    direct = values.get(key)
    if direct is not None:
        return str(direct).strip()
    target = key.upper()
    for candidate_key, candidate_value in values.items():
        if str(candidate_key).upper() == target and candidate_value is not None:
            return str(candidate_value).strip()
    return ""


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


def _windows_program_roots(values: Mapping[str, str], *, use_default_drive: bool) -> list[Path]:
    drive_roots: list[Path] = []
    system_drive = _env_get(values, "SystemDrive")
    if system_drive:
        drive_roots.append(_drive_root(system_drive))
    system_root = _env_get(values, "SystemRoot")
    if system_root:
        drive_roots.append(Path(system_root).parent)
    if use_default_drive and os.name == "nt":
        drive_roots.append(Path("C:\\"))
    roots: list[Path] = []
    for root in drive_roots:
        roots.append(root / "Program Files (x86)")
        roots.append(root / "Program Files")
    return roots


def edge_candidates(env: Mapping[str, str] | None = None) -> list[Path]:
    use_process_env = env is None
    values: Mapping[str, str] = os.environ if use_process_env else env
    explicit = _env_get(values, "HTML_INDESIGN_BROWSER_EXECUTABLE")
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit))
    for key in ("ProgramFiles(x86)", "ProgramFiles", "ProgramW6432"):
        base = _env_get(values, key)
        if base:
            candidates.append(Path(base) / _EDGE_EXE_SUFFIX)
    if not all(_env_get(values, key) for key in ("ProgramFiles(x86)", "ProgramFiles")):
        for root in _windows_program_roots(values, use_default_drive=use_process_env):
            candidates.append(root / _EDGE_EXE_SUFFIX)
    local_app_data = _env_get(values, "LOCALAPPDATA")
    if local_app_data:
        candidates.append(Path(local_app_data) / _EDGE_EXE_SUFFIX)
    return _dedupe_paths(candidates)


def probe_edge(env: Mapping[str, str] | None = None) -> dict[str, Any]:
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
