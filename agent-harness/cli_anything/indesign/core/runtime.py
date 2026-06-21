from __future__ import annotations

import os
from pathlib import Path

from .errors import CliError


def package_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _is_server_root(path: Path) -> bool:
    return (
        (path / "package.json").exists()
        and (path / "src" / "index.js").exists()
        and (path / "src" / "advanced" / "index.js").exists()
    )


def resolve_server_root() -> Path:
    package_dir = package_root()
    override = os.environ.get("INDESIGN_CLI_SERVER_ROOT")
    if override:
        path = Path(override).resolve()
        if _is_server_root(path):
            return path
        raise CliError("INDESIGN_CLI_SERVER_ROOT does not point to a valid server root", code="SERVER_ROOT_INVALID")
    for candidate in [*package_dir.parents, package_dir / "server"]:
        if _is_server_root(candidate):
            return candidate
    raise CliError("InDesign CLI server resources were not found", code="SERVER_ROOT_NOT_FOUND")


def hidden_handler_bridge_path() -> Path:
    bridge = package_root() / "node" / "hidden_handler_bridge.mjs"
    if not bridge.exists():
        raise CliError("Hidden handler bridge not found", code="HIDDEN_HANDLER_BRIDGE_NOT_FOUND")
    return bridge


def skill_source_path() -> Path:
    packaged = package_root() / "skills" / "SKILL.md"
    if packaged.exists():
        return packaged
    try:
        source = resolve_server_root() / "skills" / "indesign-cli" / "SKILL.md"
    except CliError as exc:
        raise CliError("Packaged skill not found", code="SKILL_NOT_FOUND") from exc
    if source.exists():
        return source
    raise CliError("Packaged skill not found", code="SKILL_NOT_FOUND")
