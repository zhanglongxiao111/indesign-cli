from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from . import __version__
from .core.agent_update import agent_exe_path, ensure_agent_ready, install_root, register_user_command
from .core.bootstrapper import build_runtime_env, embedded_runtime_root
from .core.envelope import now_ms
from .core.errors import CliError
from .core.paths import scrub_text_paths
from .core.runtime_install import current_runtime_root, install_embedded_runtime, read_current_runtime
from .core.runtime_health import probe_edge


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

    sub.add_parser("install", help="安装或更新用户级 indesign-cli-agent 命令")

    health = sub.add_parser("health", help="读取 bootstrapper 和当前 runtime 状态")
    health.add_argument("--install-root", help="安装根目录；测试和受控环境可覆盖")
    health.add_argument("--json", action="store_true", help="兼容参数；输出恒为 JSON")

    version = sub.add_parser("version", help="输出 bootstrapper 和当前 runtime 版本")
    version.add_argument("--install-root", help="安装根目录；测试和受控环境可覆盖")
    version.add_argument("--json", action="store_true", help="兼容参数；输出恒为 JSON")
    return parser


def install_root_from_args(args: argparse.Namespace) -> Path:
    return Path(args.install_root).resolve() if getattr(args, "install_root", None) else install_root()


def child_command(cli_args: list[str]) -> list[str]:
    if getattr(sys, "frozen", False):
        return [sys.executable, "__cli__", *cli_args]
    return [sys.executable, "-m", "cli_anything.indesign", *cli_args]


def run_child(cli_args: list[str], runtime_root: Path | None = None) -> dict[str, Any]:
    actual_runtime_root = runtime_root
    if actual_runtime_root is None:
        raise CliError("No persistent runtime is active", code="RUNTIME_NOT_INSTALLED")
    env = build_runtime_env(actual_runtime_root)
    cli = actual_runtime_root / "cli" / "indesign-cli.exe"
    if not cli.is_file():
        raise CliError("Runtime CLI executable is missing", code="RUNTIME_INVALID", details={"path": str(cli)})
    result = subprocess.run(
        [str(cli), *cli_args],
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


def builtin_html_status(runtime_root: Path | None) -> dict[str, Any]:
    if runtime_root is None:
        return {"available": False, "code": "RUNTIME_NOT_ACTIVE", "path": None}
    manifest = runtime_root / "plugins" / "html-indesign" / "manifest.json"
    if not manifest.is_file():
        return {"available": False, "code": "BUILTIN_PLUGIN_MISSING", "path": str(manifest)}
    return {"available": True, "source": "builtin", "path": str(manifest)}


def run(argv: list[str] | None = None) -> int:
    start = now_ms()
    actual_argv = list(sys.argv[1:] if argv is None else argv)
    pretty = False
    if actual_argv and actual_argv[0] == "--pretty":
        pretty = True
        actual_argv = actual_argv[1:]
    if not actual_argv:
        raise CliError("Command is required", code="COMMAND_REQUIRED")
    if actual_argv[0] in {"run", "update"}:
        raise CliError(
            "The old indesign-cli-agent run/update --source entry has been removed",
            code="LEGACY_COMMAND_REMOVED",
            details={"command": actual_argv[0]},
            next_action="Use indesign-cli-agent <indesign-cli args...> or indesign-cli-agent install.",
        )
    if actual_argv[0] == "install":
        root = install_root()
        embedded = embedded_runtime_root()
        if embedded is not None and current_runtime_root(root) is None:
            installed = install_embedded_runtime(embedded, root=root)
            current = read_current_runtime(root) or {}
            data = {
                "updated": True,
                "version": current.get("version"),
                "runtime_root": str(installed),
                "source": "embedded-setup",
                "warnings": [],
                "command_args": ["install"],
            }
        else:
            data = ensure_agent_ready(command_args=["install"])
        data["registration"] = register_user_command()
        return emit(ok("install", data, elapsed(start)), pretty=pretty)
    if actual_argv[0] not in {"health", "version"}:
        update_data = ensure_agent_ready(command_args=actual_argv)
        child = run_child(actual_argv, runtime_root=Path(update_data["runtime_root"]))
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

    parser = build_parser()
    args = parser.parse_args((["--pretty"] if pretty else []) + actual_argv)
    pretty = pretty or bool(getattr(args, "pretty", False))
    if args.command is None:
        raise CliError("Command is required", code="COMMAND_REQUIRED")

    install_base = install_root_from_args(args)
    if args.command == "version":
        state = read_current_runtime(install_base)
        return emit(ok("version", {"bootstrapper_version": __version__, "current": state}, elapsed(start)), pretty=pretty)

    if args.command == "health":
        state = read_current_runtime(install_base)
        runtime_root = current_runtime_root(install_base)
        return emit(
            ok(
                "health",
                {
                    "install_root": str(install_base),
                    "agent_exe": str(agent_exe_path(install_base)),
                    "runtime_root": str(runtime_root) if runtime_root else None,
                    "builtin_html_plugin": builtin_html_status(runtime_root),
                    "edge": probe_edge(),
                    "current": state,
                },
                elapsed(start),
            ),
            pretty=pretty,
        )

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
