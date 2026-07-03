from __future__ import annotations

import os
import shutil
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


def server_root_override() -> str | None:
    return os.environ.get("INDESIGN_CLI_SERVER_ROOT")


def runtime_root_override() -> str | None:
    return os.environ.get("INDESIGN_CLI_RUNTIME_ROOT")


def node_override() -> str | None:
    return os.environ.get("INDESIGN_CLI_NODE")


def _node_name() -> str:
    return "node.exe" if os.name == "nt" else "node"


def _valid_node(path: Path) -> bool:
    return path.exists() and path.is_file()


def resolve_node_executable(server_root: Path | None = None) -> Path | str:
    """Resolve the Node executable without requiring Node to be on PATH.

    Agent bootstrapper releases carry a portable Node runtime. Development
    installs can still fall back to PATH.
    """
    explicit = node_override()
    if explicit:
        path = Path(explicit).resolve()
        if _valid_node(path):
            return path
        raise CliError(
            "INDESIGN_CLI_NODE does not point to a valid node executable",
            code="NODE_NOT_FOUND",
            details={"override": explicit},
            hint="修正 INDESIGN_CLI_NODE，或删除该环境变量后使用 PATH 上的 node。",
        )

    runtime_root = runtime_root_override()
    if runtime_root:
        candidate = Path(runtime_root).resolve() / "node" / _node_name()
        if _valid_node(candidate):
            return candidate
        raise CliError(
            "INDESIGN_CLI_RUNTIME_ROOT does not contain a portable node executable",
            code="NODE_NOT_FOUND",
            details={"runtime_root": runtime_root, "expected": str(candidate)},
            hint="INDESIGN_CLI_RUNTIME_ROOT 应指向包含 node\\node.exe 的 runtime 目录。",
        )

    if server_root is not None:
        candidate = server_root.resolve().parent / "node" / _node_name()
        if _valid_node(candidate):
            return candidate

    path_node = shutil.which("node")
    if path_node:
        return path_node
    raise CliError(
        "Node executable was not found",
        code="NODE_NOT_FOUND",
        hint="安装 Node.js，或使用 indesign-cli-agent 内置 runtime 设置 INDESIGN_CLI_NODE。",
    )


def resolve_server_root() -> Path:
    package_dir = package_root()
    override = server_root_override()
    if override:
        path = Path(override).resolve()
        if _is_server_root(path):
            return path
        raise CliError(
            "INDESIGN_CLI_SERVER_ROOT does not point to a valid server root",
            code="SERVER_ROOT_INVALID",
            details={
                "override": override,
                "expected_files": ["package.json", "src/index.js", "src/advanced/index.js"],
            },
            hint="INDESIGN_CLI_SERVER_ROOT 必须指向包含 package.json、src/index.js、src/advanced/index.js 的 server 目录；修正路径或删除该环境变量后重试。",
        )
    for candidate in [*package_dir.parents, package_dir / "server"]:
        if _is_server_root(candidate):
            return candidate
    raise CliError(
        "InDesign CLI server resources were not found",
        code="SERVER_ROOT_NOT_FOUND",
        details={"package_root": str(package_dir)},
        hint="包内 server 资源缺失，通常是安装不完整或用户目录被重定向导致；重新 `pip install indesign-cli`，或设置 INDESIGN_CLI_SERVER_ROOT 指向一个完整的 server 目录。",
    )


def hidden_handler_bridge_path() -> Path:
    bridge = package_root() / "node" / "hidden_handler_bridge.mjs"
    if not bridge.exists():
        raise CliError("Hidden handler bridge not found", code="HIDDEN_HANDLER_BRIDGE_NOT_FOUND")
    return bridge


def skill_source_path() -> Path:
    package_dir = package_root()
    packaged = package_dir / "skills" / "SKILL.md"
    if packaged.exists():
        return packaged
    for parent in package_dir.parents:
        source_tree = parent / "skills" / "indesign-cli" / "SKILL.md"
        if source_tree.exists():
            return source_tree
    try:
        source = resolve_server_root() / "skills" / "indesign-cli" / "SKILL.md"
    except CliError as exc:
        raise CliError("Packaged skill not found", code="SKILL_NOT_FOUND") from exc
    if source.exists():
        return source
    raise CliError("Packaged skill not found", code="SKILL_NOT_FOUND")
