from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from . import __version__
from .core.artifacts import verify_artifact
from .core.catalog import Catalog
from .core.envelope import failure, now_ms, success
from .core.errors import CliError
from .core.mcp_backend import McpBackend
from .core.router import Router, load_args
from .core.scripts import run_script, run_stdin_script
from .core.session import SessionStore


REPO_ROOT = Path(__file__).resolve().parents[3]


def emit(payload: dict[str, Any]) -> int:
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return int(payload.get("exit_code", 0))


def version_payload() -> dict[str, Any]:
    return success(
        command="version",
        data={"name": "cli-anything-indesign", "version": __version__},
        duration_ms=0,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="cli-anything-indesign")
    parser.add_argument("--version", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--pretty", action="store_true")
    subparsers = parser.add_subparsers(dest="group")

    tool_parser = subparsers.add_parser("tool")
    tool_sub = tool_parser.add_subparsers(dest="tool_command")
    tool_sub.add_parser("domains")
    list_parser = tool_sub.add_parser("list")
    list_parser.add_argument("--domain")
    list_parser.add_argument("--source")
    list_parser.add_argument("--callable-only", action="store_true")
    search_parser = tool_sub.add_parser("search")
    search_parser.add_argument("--domain")
    search_parser.add_argument("--source")
    search_parser.add_argument("--query", required=True)
    schema_parser = tool_sub.add_parser("schema")
    schema_parser.add_argument("tool_id")
    call_parser = tool_sub.add_parser("call")
    call_parser.add_argument("tool_id")
    call_parser.add_argument("--args", required=True)

    script_parser = subparsers.add_parser("script")
    script_sub = script_parser.add_subparsers(dest="script_command")
    run_parser = script_sub.add_parser("run")
    run_parser.add_argument("file", nargs="?")
    run_parser.add_argument("--stdin", action="store_true")

    export_parser = subparsers.add_parser("export")
    export_sub = export_parser.add_subparsers(dest="export_command")
    verify_parser = export_sub.add_parser("verify")
    verify_parser.add_argument("path")
    verify_parser.add_argument("--created-after")

    session_parser = subparsers.add_parser("session")
    session_sub = session_parser.add_subparsers(dest="session_command")
    show_parser = session_sub.add_parser("show")
    show_parser.add_argument("--verbose", action="store_true")
    session_sub.add_parser("clear")
    return parser


def build_catalog_with_backends() -> tuple[Catalog, list[str]]:
    base = Catalog(repo_root=REPO_ROOT)
    warnings: list[str] = []
    advanced_tools: list[dict[str, Any]] = []
    classic_tools: list[dict[str, Any]] = []
    for source, entry, sink in (
        ("advanced", "src/advanced/index.js", advanced_tools),
        ("classic", "src/index.js", classic_tools),
    ):
        try:
            sink.extend(McpBackend(repo_root=REPO_ROOT, entry=entry).list_tools())
        except CliError as exc:
            warnings.append(f"{source} backend unavailable: {exc.code}")
    return base.with_exposed_tools(advanced_tools=advanced_tools, classic_tools=classic_tools), warnings


def run(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.version:
        return emit(version_payload())
    if args.group == "tool":
        catalog, warnings = build_catalog_with_backends()
        if args.tool_command == "domains" or args.tool_command is None:
            return emit(success(command="tool domains", data=catalog.domains(), duration_ms=0, warnings=warnings))
        if args.tool_command == "list":
            if not args.domain and not args.source:
                return emit(success(command="tool list", data=catalog.domains(), duration_ms=0, warnings=warnings))
            data = catalog.list_tools(
                domain=args.domain,
                source=args.source,
                callable_only=args.callable_only,
            )
            return emit(success(command="tool list", data=data, duration_ms=0, warnings=warnings))
        if args.tool_command == "search":
            data = catalog.list_tools(domain=args.domain, source=args.source, query=args.query)
            return emit(success(command="tool search", data=data, duration_ms=0, warnings=warnings))
        router = Router(catalog=catalog, repo_root=REPO_ROOT)
        if args.tool_command == "schema":
            data = router.schema(args.tool_id)
            return emit(success(command="tool schema", data=data, duration_ms=0, tool_id=args.tool_id, warnings=warnings))
        if args.tool_command == "call":
            call_args = load_args(args.args)
            data = router.call(args.tool_id, call_args)
            return emit(success(command="tool call", data=data, duration_ms=0, tool_id=args.tool_id, warnings=warnings))
    if args.group == "script" and args.script_command == "run":
        catalog, warnings = build_catalog_with_backends()
        router = Router(catalog=catalog, repo_root=REPO_ROOT)
        if args.stdin:
            data = run_stdin_script(router, Path.cwd())
        elif args.file:
            data = run_script(router, Path(args.file))
        else:
            raise CliError("script run requires a file path or --stdin", code="SCRIPT_INPUT_REQUIRED")
        return emit(success(command="script run", data=data, duration_ms=0, tool_id="script.run", warnings=warnings))
    if args.group == "export" and args.export_command == "verify":
        created_after = datetime.fromisoformat(args.created_after) if args.created_after else None
        data = verify_artifact(Path(args.path), created_after=created_after, cwd=Path.cwd())
        return emit(success(command="export verify", data=data, duration_ms=0, tool_id="export.verify"))
    if args.group == "session":
        store = SessionStore(Path.cwd())
        if args.session_command == "show" or args.session_command is None:
            data = store.read(compact=not getattr(args, "verbose", False))
            return emit(success(command="session show", data=data, duration_ms=0, tool_id="session.show"))
        if args.session_command == "clear":
            store.clear()
            return emit(success(command="session clear", data={"cleared": True}, duration_ms=0, tool_id="session.clear"))
    parser.print_help(sys.stderr)
    return 2


def safe_command(argv: list[str] | None) -> str:
    parts = list(argv if argv is not None else sys.argv[1:])
    if not parts:
        return "cli"
    if parts[0] == "tool" and len(parts) > 1:
        return f"tool {parts[1]}"
    if parts[0] in {"script", "export", "session"} and len(parts) > 1:
        return f"{parts[0]} {parts[1]}"
    return parts[0]


def main(argv: list[str] | None = None) -> int:
    start = now_ms()
    try:
        return run(argv)
    except CliError as exc:
        duration_ms = now_ms() - start
        return emit(failure(command=safe_command(argv), error=exc, duration_ms=duration_ms))
