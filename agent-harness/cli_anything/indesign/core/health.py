from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any


def health(repo_root: Path, deep: bool = False, connect_indesign: bool = False) -> dict[str, Any]:
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
            "reason": "health --deep 不主动连接 COM，避免隐式启动或干扰 InDesign；真实验证请运行 INDESIGN_E2E=1 的 E2E 测试。",
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
        result = subprocess.run(
            ["node", "-e", script],
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
        result = subprocess.run(
            ["node", "-e", "require('winax'); process.stdout.write('ok')"],
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
