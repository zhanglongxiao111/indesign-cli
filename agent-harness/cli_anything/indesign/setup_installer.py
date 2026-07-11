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


def _install_launcher(source: Path, target: Path) -> Path | None:
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".exe.tmp")
    backup = target.with_suffix(".exe.setup-backup")
    temporary.unlink(missing_ok=True)
    backup.unlink(missing_ok=True)
    had_previous = target.is_file()
    try:
        if had_previous:
            shutil.copy2(target, backup)
        shutil.copy2(source, temporary)
        os.replace(temporary, target)
    except Exception:
        temporary.unlink(missing_ok=True)
        backup.unlink(missing_ok=True)
        raise
    return backup if had_previous else None


def _rollback_launcher(target: Path, backup: Path | None) -> None:
    if backup is None:
        target.unlink(missing_ok=True)
        return
    os.replace(backup, target)


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

    launcher_target = root / "bin" / "indesign-cli-agent.exe"
    launcher_backup = _install_launcher(launcher_source, launcher_target)
    try:
        installed = install_embedded_runtime(embedded, root=root)
    except Exception:
        _rollback_launcher(launcher_target, launcher_backup)
        raise
    if launcher_backup is not None:
        launcher_backup.unlink(missing_ok=True)
    warnings = list(installed.warnings)
    if args.no_register_path:
        registration = {"registered": False, "skipped": True, "bin": str(root / "bin")}
    else:
        try:
            registration = register_user_command(root)
        except OSError as exc:
            warning = {"code": "PATH_REGISTRATION_FAILED", "message": str(exc)}
            warnings.append(warning)
            registration = {"registered": False, "code": warning["code"], "bin": str(root / "bin")}
    response = {
        "ok": True,
        "data": {
            "install_root": str(root),
            "runtime_root": str(installed.runtime_root),
            "runtime_installed": installed.installed,
            "launcher": str(launcher_target),
            "registration": registration,
            "warnings": warnings,
        },
    }
    print(json.dumps(response, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
