from __future__ import annotations

import json
import os
import site
import subprocess
import sys
from pathlib import Path
from typing import Any

from .node_setup import LONG_PATH_WARNING_THRESHOLD, SERVER_ROOT_HINT, toolchain_report
from .runtime import package_root, resolve_node_executable, server_root_override
from .runtime_health import probe_edge


def _runtime_diagnostics() -> dict[str, Any]:
    root_value = os.environ.get("INDESIGN_CLI_RUNTIME_ROOT")
    if not root_value:
        return {
            "root": None,
            "version": None,
            "components": {},
            "builtin_html_plugin": {"available": False, "code": "RUNTIME_NOT_ACTIVE", "path": None},
        }
    root = Path(root_value).resolve()
    manifest_path = root / "plugins" / "html-indesign" / "manifest.json"
    plugin: dict[str, Any]
    components: dict[str, str] = {}
    state_path = root.parent.parent / "state" / "current-runtime.json"
    try:
        state = json.loads(state_path.read_text(encoding="utf-8-sig"))
        if isinstance(state, dict) and Path(str(state.get("root") or "")).resolve() == root and isinstance(state.get("components"), dict):
            components.update({str(key): str(value) for key, value in state["components"].items()})
    except (OSError, json.JSONDecodeError):
        pass
    if manifest_path.is_file():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
            version = str(manifest.get("version") or "") if isinstance(manifest, dict) else ""
        except (OSError, json.JSONDecodeError):
            version = ""
        if version:
            components["html_indesign"] = version
        plugin = {"available": True, "source": "builtin", "path": str(manifest_path), "version": version or None}
    else:
        plugin = {"available": False, "code": "BUILTIN_PLUGIN_MISSING", "path": str(manifest_path)}
    return {"root": str(root), "version": root.name, "components": components, "builtin_html_plugin": plugin}


def _server_root_diagnostics(repo_root: Path) -> dict[str, Any]:
    root_text = str(repo_root)
    diagnostics: dict[str, Any] = {
        "path": root_text,
        "source": "env_override" if server_root_override() else "auto",
        "path_length": len(root_text),
        "long_path_risk": len(root_text) >= LONG_PATH_WARNING_THRESHOLD,
    }
    if diagnostics["long_path_risk"]:
        diagnostics["hint"] = SERVER_ROOT_HINT
    return diagnostics


def _python_diagnostics() -> dict[str, Any]:
    try:
        user_base = site.getuserbase()
        user_site = site.getusersitepackages()
    except (AttributeError, OSError):
        user_base = None
        user_site = None
    return {
        "available": True,
        "executable": sys.executable,
        "user_base": user_base,
        "user_site": user_site,
        "package_root": str(package_root()),
    }


def health(repo_root: Path, deep: bool = False, connect_indesign: bool = False) -> dict[str, Any]:
    toolchain = toolchain_report()
    payload: dict[str, Any] = {
        "deep": deep,
        "node": {"available": toolchain["node"]["path"] is not None, **toolchain["node"]},
        "npm": {"available": toolchain["npm"]["version"] is not None, **toolchain["npm"]},
        "python": _python_diagnostics(),
        "server_root": _server_root_diagnostics(repo_root),
        "cwd": {"unc": str(Path.cwd()).startswith("\\\\")},
        "runtime": _runtime_diagnostics(),
        "edge": probe_edge(),
        "node_entry_advanced": {
            "path": "src/advanced/index.js",
            "exists": (repo_root / "src/advanced/index.js").exists(),
        },
        "node_entry_classic": {
            "path": "src/index.js",
            "exists": (repo_root / "src/index.js").exists(),
        },
        "winax": {
            "checked": False,
            "available": None,
            "reason": "未运行 --deep，未检查 Node winax 依赖。",
        },
        "indesign_com": {
            "checked": False,
            "available": None,
            "reason": "health 不主动连接 COM，避免隐式启动或干扰 InDesign；真实操作前可运行 `indesign-cli server health --deep` 检查 winax。",
        },
    }
    if deep:
        payload["winax"] = _check_winax(repo_root)
        payload["indesign_com"] = {
            "checked": False,
            "available": None,
            "reason": "health --deep 不主动连接 COM，避免隐式启动或干扰 InDesign；需要真实验证时加 `--connect-indesign` 执行只读探针。",
        }
    if connect_indesign:
        payload["indesign_com"] = indesign_com_probe(repo_root)
    return payload


def indesign_com_probe(repo_root: Path) -> dict[str, Any]:
    script = """
const winax = require('winax');
const app = new winax.Object('InDesign.Application');
process.stdout.write(JSON.stringify({
  checked: true,
  available: true,
  appName: String(app.name || ''),
  version: String(app.version || ''),
  documentsCount: Number(app.documents.length || 0)
}));
"""
    try:
        node = resolve_node_executable(repo_root)
        result = subprocess.run(
            [str(node), "-e", script],
            cwd=repo_root,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=15,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"checked": True, "available": False, "reason": exc.__class__.__name__}
    if result.returncode != 0:
        return {"checked": True, "available": False, "reason": result.stderr[-500:]}
    try:
        payload = json.loads(result.stdout)
    except Exception:
        return {"checked": True, "available": False, "reason": "COM probe returned invalid JSON"}
    if isinstance(payload, dict):
        return payload
    return {"checked": True, "available": False, "reason": "COM probe returned non-object JSON"}


def _check_winax(repo_root: Path) -> dict[str, Any]:
    try:
        node = resolve_node_executable(repo_root)
        result = subprocess.run(
            [str(node), "-e", "require('winax'); process.stdout.write('ok')"],
            cwd=repo_root,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return {"checked": True, "available": False}
    return {"checked": True, "available": result.returncode == 0}
