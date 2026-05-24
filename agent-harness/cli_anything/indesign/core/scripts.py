from __future__ import annotations

import locale
import sys
from pathlib import Path
from typing import Any


def _read_stdin_text() -> str:
    buffer = getattr(sys.stdin, "buffer", None)
    if buffer is None:
        return sys.stdin.read()

    raw = buffer.read()
    if isinstance(raw, str):
        return raw

    encodings = ["utf-8-sig", "utf-8", locale.getpreferredencoding(False)]
    if sys.platform.startswith("win"):
        encodings.append("mbcs")

    tried: set[str] = set()
    for encoding in encodings:
        if not encoding or encoding in tried:
            continue
        tried.add(encoding)
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def run_script(router: Any, script_path: Path) -> dict[str, Any]:
    resolved = script_path.resolve()
    return router.call("template.run_jsx_file", {"filePath": str(resolved)})


def run_stdin_script(router: Any, cwd: Path) -> dict[str, Any]:
    tmp_dir = cwd / ".indesign-cli" / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    script_path = tmp_dir / "stdin.jsx"
    script_path.write_text(_read_stdin_text(), encoding="utf-8")
    return run_script(router, script_path)
