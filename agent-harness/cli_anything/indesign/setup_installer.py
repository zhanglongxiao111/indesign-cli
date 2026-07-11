from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

from .core.agent_update import install_root as default_install_root
from .core.agent_update import register_user_command
from .core.runtime_install import install_embedded_runtime


def setup_payload_root() -> Path:
    override = os.environ.get("INDESIGN_CLI_SETUP_PAYLOAD_ROOT")
    if override:
        return Path(override).resolve()
    frozen_root = getattr(sys, "_MEIPASS", None)
    if frozen_root:
        return Path(str(frozen_root)).resolve()
    return Path(__file__).resolve().parent


def _install_launcher(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".exe.tmp")
    shutil.copy2(source, temporary)
    os.replace(temporary, target)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Install the complete offline indesign-cli persistent runtime.")
    parser.add_argument("--install-root", help="Installation root; defaults to LOCALAPPDATA\\indesign-cli")
    parser.add_argument("--no-register-path", action="store_true", help="Skip user PATH registration (isolated validation only)")
    args = parser.parse_args(argv)
    root = Path(args.install_root).resolve() if args.install_root else default_install_root().resolve()
    payload_root = setup_payload_root()
    embedded = payload_root / "runtime"
    launcher_source = payload_root / "payload" / "indesign-cli-agent.exe"
    if not embedded.is_dir() or not launcher_source.is_file():
        raise SystemExit("Setup payload is incomplete")

    installed = install_embedded_runtime(embedded, root=root)
    launcher_target = root / "bin" / "indesign-cli-agent.exe"
    _install_launcher(launcher_source, launcher_target)
    registration = (
        {"registered": False, "skipped": True, "bin": str(root / "bin")}
        if args.no_register_path
        else register_user_command(root)
    )
    response = {
        "ok": True,
        "data": {
            "install_root": str(root),
            "runtime_root": str(installed.runtime_root),
            "runtime_installed": installed.installed,
            "launcher": str(launcher_target),
            "registration": registration,
            "warnings": list(installed.warnings),
        },
    }
    print(json.dumps(response, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
