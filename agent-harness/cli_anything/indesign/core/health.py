from __future__ import annotations

import shutil
import subprocess
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
    return payload


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
