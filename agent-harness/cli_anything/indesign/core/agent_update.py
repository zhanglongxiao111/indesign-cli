from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

from .runtime_install import ensure_runtime_ready
from .runtime_manifest import DEFAULT_RUNTIME_SOURCES, compare_versions, parse_version


DEFAULT_SOURCES = DEFAULT_RUNTIME_SOURCES


def install_root() -> Path:
    override = os.environ.get("INDESIGN_CLI_INSTALL_ROOT")
    if override:
        return Path(override).resolve()
    executable = Path(sys.executable).resolve()
    if (
        getattr(sys, "frozen", False)
        and executable.name.lower() == "indesign-cli-agent.exe"
        and executable.parent.name.lower() == "bin"
    ):
        return executable.parent.parent
    base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    return Path(base) / "indesign-cli"


def bin_dir(root: Path | None = None) -> Path:
    return (root or install_root()) / "bin"


def agent_exe_path(root: Path | None = None) -> Path:
    return bin_dir(root) / "indesign-cli-agent.exe"


def ensure_agent_ready(*, command_args: list[str], sources: list[str] | None = None) -> dict[str, Any]:
    return ensure_runtime_ready(root=install_root(), sources=sources, command_args=command_args)


def _path_entries(current_path: str) -> list[str]:
    return [entry.strip().rstrip("\\/") for entry in current_path.split(os.pathsep) if entry.strip()]


def path_needs_registration(bin_path: str, *, current_path: str | None = None) -> bool:
    current = current_path if current_path is not None else os.environ.get("PATH", "")
    normalized = str(Path(bin_path)).rstrip("\\/")
    return normalized.lower() not in {entry.lower() for entry in _path_entries(current)}


def updated_user_path(bin_path: str, *, current_path: str | None = None) -> str:
    current = current_path if current_path is not None else os.environ.get("PATH", "")
    if not path_needs_registration(bin_path, current_path=current):
        return current
    return f"{current}{os.pathsep if current else ''}{bin_path}"


def read_user_path() -> str:
    if os.name != "nt":
        return os.environ.get("PATH", "")
    import winreg

    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment", 0, winreg.KEY_READ) as key:
            for name in ("Path", "PATH"):
                try:
                    value, _ = winreg.QueryValueEx(key, name)
                    return str(value)
                except FileNotFoundError:
                    continue
    except FileNotFoundError:
        return ""
    return ""


def write_user_path(value: str) -> None:
    if os.name != "nt":
        os.environ["PATH"] = value
        return
    import winreg

    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
        winreg.SetValueEx(key, "Path", 0, winreg.REG_EXPAND_SZ, value)


def register_user_command(root: Path | None = None) -> dict[str, Any]:
    actual_root = root or install_root()
    directory = str(bin_dir(actual_root))
    current_user_path = read_user_path()
    new_user_path = updated_user_path(directory, current_path=current_user_path)
    if new_user_path == current_user_path:
        return {"registered": False, "bin": directory}
    write_user_path(new_user_path)
    os.environ["PATH"] = updated_user_path(directory, current_path=os.environ.get("PATH", ""))
    return {"registered": True, "bin": directory}
