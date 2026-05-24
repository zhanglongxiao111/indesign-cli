from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

from .errors import CliError
from .paths import scrub_text_paths


def setup_node_dependencies(server_root: Path) -> dict[str, Any]:
    try:
        result = subprocess.run(
            ["npm", "install"],
            cwd=server_root,
            text=True,
            encoding="utf-8",
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=180,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise CliError("Failed to install Node dependencies", code="NPM_INSTALL_FAILED") from exc

    payload = {
        "ok": result.returncode == 0,
        "server_root": str(server_root),
        "returncode": result.returncode,
        "stdout_tail": scrub_text_paths((result.stdout or "")[-2000:]),
        "stderr_tail": scrub_text_paths((result.stderr or "")[-2000:]),
    }
    if result.returncode != 0:
        raise CliError("npm install failed", code="NPM_INSTALL_FAILED", details=payload)
    return payload
