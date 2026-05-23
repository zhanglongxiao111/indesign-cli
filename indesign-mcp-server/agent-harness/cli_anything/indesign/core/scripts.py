from __future__ import annotations

import sys
from pathlib import Path
from typing import Any


def run_script(router: Any, script_path: Path) -> dict[str, Any]:
    resolved = script_path.resolve()
    return router.call("template.run_jsx_file", {"filePath": str(resolved)})


def run_stdin_script(router: Any, cwd: Path) -> dict[str, Any]:
    tmp_dir = cwd / ".indesign-cli" / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    script_path = tmp_dir / "stdin.jsx"
    script_path.write_text(sys.stdin.read(), encoding="utf-8")
    return run_script(router, script_path)
