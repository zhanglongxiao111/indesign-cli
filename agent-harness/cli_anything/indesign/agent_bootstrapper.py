from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from . import __version__
from .core.bootstrapper import build_runtime_env, current_manifest, default_install_root, ensure_updated
from .core.envelope import now_ms
from .core.errors import CliError
from .core.paths import scrub_text_paths


def elapsed(start_ms: int) -> int:
    return max(1, now_ms() - start_ms)


def emit(payload: dict[str, Any], *, pretty: bool = False) -> int:
    text = json.dumps(payload, ensure_ascii=False, indent=2 if pretty else None, separators=None if pretty else (",", ":"))
    print(text)
    return int(payload.get("exit_code", 0))


def ok(command: str, data: dict[str, Any], duration_ms: int) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "ok": True,
        "exit_code": 0,
        "command": command,
        "version": __version__,
        "duration_ms": duration_ms,
        "data": data,
        "error": None,
    }


def fail(command: str, error: CliError, duration_ms: int) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "schema_version": 1,
        "ok": False,
        "exit_code": 1,
        "command": command,
        "version": __version__,
        "duration_ms": duration_ms,
        "data": None,
        "error": {
            "type": error.__class__.__name__,
            "code": error.code,
            "message": error.message,
            "details": error.details,
            "retryable": error.retryable,
            "hint": error.hint,
        },
        "next_action": error.next_action,
    }
    if "current" in error.details:
        payload["current"] = error.details["current"]
    if "latest" in error.details:
        payload["latest"] = error.details["latest"]
    return payload


class AgentArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise CliError("Invalid command line", code="BAD_CLI_ARGS", details={"message": message, "usage": self.format_usage().strip()})


def build_parser() -> argparse.ArgumentParser:
    parser = AgentArgumentParser(prog="indesign-cli-agent", description="Agent bootstrapper for indesign-cli runtime.")
    parser.add_argument("--pretty", action="store_true", help="输出缩进 JSON")
    sub = parser.add_subparsers(dest="command")

    run = sub.add_parser("run", help="强制更新后执行 indesign-cli 命令")
    run.add_argument("--source", required=True, help="latest.json 路径")
    run.add_argument("--install-root", help="安装根目录；测试和受控环境可覆盖")
    run.add_argument("cli_args", nargs=argparse.REMAINDER, help="-- 后面的 indesign-cli 参数")

    update = sub.add_parser("update", help="强制检查并安装最新 runtime")
    update.add_argument("--source", required=True, help="latest.json 路径")
    update.add_argument("--install-root", help="安装根目录；测试和受控环境可覆盖")
    update.add_argument("--quiet", action="store_true", help="兼容 Agent 静默参数；仍输出 JSON")

    health = sub.add_parser("health", help="读取 bootstrapper 和当前 runtime 状态")
    health.add_argument("--source", help="latest.json 路径；传入时会做强制更新检查")
    health.add_argument("--install-root", help="安装根目录；测试和受控环境可覆盖")
    health.add_argument("--json", action="store_true", help="兼容参数；输出恒为 JSON")

    version = sub.add_parser("version", help="输出 bootstrapper 和当前 runtime 版本")
    version.add_argument("--install-root", help="安装根目录；测试和受控环境可覆盖")
    version.add_argument("--json", action="store_true", help="兼容参数；输出恒为 JSON")
    return parser


def install_root_from_args(args: argparse.Namespace) -> Path:
    return Path(args.install_root).resolve() if getattr(args, "install_root", None) else default_install_root()


def normalized_cli_args(args: list[str]) -> list[str]:
    if args and args[0] == "--":
        return args[1:]
    return args


def child_command(cli_args: list[str]) -> list[str]:
    if getattr(sys, "frozen", False):
        return [sys.executable, "__cli__", *cli_args]
    return [sys.executable, "-m", "cli_anything.indesign", *cli_args]


def run_child(cli_args: list[str], runtime_root: Path) -> dict[str, Any]:
    env = build_runtime_env(runtime_root)
    result = subprocess.run(
        child_command(cli_args),
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        env=env,
    )
    try:
        stdout_json = json.loads(result.stdout) if result.stdout.strip() else None
    except json.JSONDecodeError:
        stdout_json = None
    return {
        "exit_code": result.returncode,
        "stdout_json": stdout_json,
        "stdout_tail": scrub_text_paths((result.stdout or "")[-2000:]),
        "stderr_tail": scrub_text_paths((result.stderr or "")[-2000:]),
    }


def run(argv: list[str] | None = None) -> int:
    start = now_ms()
    parser = build_parser()
    args = parser.parse_args(argv)
    pretty = bool(getattr(args, "pretty", False))
    if args.command is None:
        raise CliError("Command is required", code="COMMAND_REQUIRED")

    install_root = install_root_from_args(args)
    if args.command == "version":
        manifest = current_manifest(install_root)
        return emit(ok("version", {"bootstrapper_version": __version__, "current": manifest}, elapsed(start)), pretty=pretty)

    if args.command == "health":
        update = ensure_updated(install_root, args.source) if args.source else None
        manifest = current_manifest(install_root)
        return emit(ok("health", {"install_root": str(install_root), "update": update, "current": manifest}, elapsed(start)), pretty=pretty)

    if args.command == "update":
        data = ensure_updated(install_root, args.source)
        return emit(ok("update", data, elapsed(start)), pretty=pretty)

    if args.command == "run":
        update_data = ensure_updated(install_root, args.source)
        manifest = current_manifest(install_root)
        runtime_root = (manifest or {}).get("runtime_root")
        if not runtime_root:
            raise CliError(
                "No active runtime is installed",
                code="RUNTIME_NOT_INSTALLED",
                details={"install_root": str(install_root)},
                next_action="Run indesign-cli-agent update first.",
            )
        cli_args = normalized_cli_args(args.cli_args)
        if not cli_args:
            raise CliError("run requires indesign-cli arguments after --", code="COMMAND_REQUIRED")
        child = run_child(cli_args, Path(str(runtime_root)))
        payload = ok("run", {"update": update_data, "child": child}, elapsed(start))
        if child["exit_code"] != 0:
            payload["ok"] = False
            payload["exit_code"] = child["exit_code"]
            payload["error"] = {
                "type": "CliError",
                "code": "CHILD_COMMAND_FAILED",
                "message": "indesign-cli command failed",
                "details": {"child_exit_code": child["exit_code"]},
                "retryable": False,
                "hint": "Inspect data.child.stdout_json for the underlying CLI error.",
            }
        return emit(payload, pretty=pretty)

    raise CliError("Unsupported command", code="COMMAND_REQUIRED")


def main(argv: list[str] | None = None) -> int:
    start = now_ms()
    actual_argv = list(sys.argv[1:] if argv is None else argv)
    if actual_argv and actual_argv[0] == "__cli__":
        from .indesign_cli import main as indesign_cli_main

        return indesign_cli_main(actual_argv[1:])
    try:
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except (AttributeError, OSError):
            pass
        return run(actual_argv)
    except CliError as exc:
        pretty = "--pretty" in actual_argv
        command = actual_argv[0] if actual_argv else "cli"
        return emit(fail(command, exc, elapsed(start)), pretty=pretty)
    except Exception as exc:
        error = CliError(
            f"Unexpected bootstrapper error: {scrub_text_paths(str(exc))[:300]}",
            code="UNEXPECTED_ERROR",
            details={"type": exc.__class__.__name__},
        )
        pretty = "--pretty" in actual_argv
        return emit(fail("cli", error, elapsed(start)), pretty=pretty)


if __name__ == "__main__":
    raise SystemExit(main())
