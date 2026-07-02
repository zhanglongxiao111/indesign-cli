from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any

from .errors import CliError
from .paths import scrub_text_paths

# node-gyp/MSVC 在深层长路径下编译原生模块（winax）时常见 C1083 失败，提前预警。
LONG_PATH_WARNING_THRESHOLD = 120
SERVER_ROOT_HINT = (
    "若 npm install 或 winax 构建在长路径/受控临时目录下失败，"
    "可把完整 server 目录放到稳定短路径（如 D:\\indesign-cli-server），"
    "设置 INDESIGN_CLI_SERVER_ROOT 指向它后重跑 `indesign-cli server setup`。"
)


def _probe_version(command: list[str]) -> str | None:
    try:
        result = subprocess.run(
            command,
            text=True,
            encoding="utf-8",
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        return None
    return (result.stdout or "").strip() or None


def _node_bundled_npm_cli(node_path: str) -> Path | None:
    candidate = Path(node_path).resolve().parent / "node_modules" / "npm" / "bin" / "npm-cli.js"
    if candidate.exists():
        return candidate
    return None


def toolchain_report() -> dict[str, Any]:
    node_path = shutil.which("node")
    npm_path = shutil.which("npm")
    report: dict[str, Any] = {
        "node": {
            "path": node_path,
            "version": _probe_version([node_path, "--version"]) if node_path else None,
        },
        "npm": {
            "path": npm_path,
            "version": _probe_version([npm_path, "--version"]) if npm_path else None,
        },
    }
    return report


def resolve_npm_command(toolchain: dict[str, Any] | None = None) -> tuple[list[str], dict[str, Any]]:
    """选可用的 npm 执行方式；PATH 上的 npm shim 损坏时回退到 Node 自带 npm-cli.js。"""
    toolchain = toolchain or toolchain_report()
    npm_info = toolchain.get("npm", {})
    node_info = toolchain.get("node", {})
    if npm_info.get("path") and npm_info.get("version"):
        return [npm_info["path"]], {"npm_source": "path", "toolchain": toolchain}
    node_path = node_info.get("path")
    if node_path and node_info.get("version"):
        npm_cli = _node_bundled_npm_cli(node_path)
        if npm_cli:
            return [node_path, str(npm_cli)], {"npm_source": "node_bundled_fallback", "toolchain": toolchain}
    raise CliError(
        "No usable npm was found",
        code="NPM_NOT_AVAILABLE",
        details={"toolchain": toolchain},
        hint="PATH 上的 npm 不可用（可能是损坏的 Volta/nvm shim），且未找到 Node 自带 npm；先修复 Node/npm 安装，再重跑 `indesign-cli server setup`。",
    )


def server_root_warnings(server_root: Path) -> list[str]:
    warnings: list[str] = []
    root_text = str(server_root)
    if len(root_text) >= LONG_PATH_WARNING_THRESHOLD:
        warnings.append(
            f"server root 路径长度 {len(root_text)} 字符，原生模块（winax）在长路径下容易编译失败（MSVC C1083）；{SERVER_ROOT_HINT}"
        )
    return warnings


def setup_node_dependencies(server_root: Path) -> dict[str, Any]:
    npm_command, npm_meta = resolve_npm_command()
    warnings = server_root_warnings(server_root)
    try:
        result = subprocess.run(
            [*npm_command, "install"],
            cwd=server_root,
            text=True,
            encoding="utf-8",
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=600,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise CliError(
            "Failed to install Node dependencies",
            code="NPM_INSTALL_FAILED",
            details={"server_root": str(server_root), **npm_meta, "warnings": warnings},
            hint=SERVER_ROOT_HINT,
        ) from exc

    scrub_roots = [server_root, Path.cwd()]
    payload = {
        "ok": result.returncode == 0,
        "server_root": str(server_root),
        "returncode": result.returncode,
        **npm_meta,
        "warnings": warnings,
        "stdout_tail": scrub_text_paths((result.stdout or "")[-2000:], allow_roots=scrub_roots),
        "stderr_tail": scrub_text_paths((result.stderr or "")[-2000:], allow_roots=scrub_roots),
    }
    if result.returncode != 0:
        raise CliError("npm install failed", code="NPM_INSTALL_FAILED", details=payload, hint=SERVER_ROOT_HINT)
    return payload
