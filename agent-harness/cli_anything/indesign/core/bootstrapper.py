from __future__ import annotations

import os
import sys
from pathlib import Path

from .errors import CliError


def build_runtime_env(runtime_root: Path, *, base_env: dict[str, str] | None = None) -> dict[str, str]:
    runtime_root = runtime_root.resolve()
    node = runtime_root / "node" / ("node.exe" if os.name == "nt" else "node")
    server = runtime_root / "server"
    expected = [node, server / "package.json", server / "src" / "index.js", server / "src" / "advanced" / "index.js"]
    missing = [str(path) for path in expected if not path.exists()]
    if missing:
        raise CliError(
            "Runtime is incomplete",
            code="RUNTIME_INVALID",
            details={"runtime_root": str(runtime_root), "missing": missing},
            next_action="Reinstall indesign-cli-agent.",
        )
    env = dict(base_env if base_env is not None else os.environ)
    env["INDESIGN_CLI_RUNTIME_ROOT"] = str(runtime_root)
    env["INDESIGN_CLI_NODE"] = str(node)
    env["INDESIGN_CLI_SERVER_ROOT"] = str(server)
    return env


def embedded_runtime_root() -> Path | None:
    override = os.environ.get("INDESIGN_CLI_EMBEDDED_RUNTIME_ROOT")
    if override:
        return Path(override)
    frozen_root = getattr(sys, "_MEIPASS", None)
    if frozen_root:
        candidate = Path(str(frozen_root)) / "runtime"
        if candidate.exists():
            return candidate
    return None
