from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from . import __version__
from .core.catalog import Catalog
from .core.envelope import success


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
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.version:
        return emit(version_payload())
    if args.group == "tool":
        catalog = Catalog(repo_root=REPO_ROOT)
        if args.tool_command == "domains" or args.tool_command is None:
            return emit(success(command="tool domains", data=catalog.domains(), duration_ms=0))
        if args.tool_command == "list":
            if not args.domain and not args.source:
                return emit(success(command="tool list", data=catalog.domains(), duration_ms=0))
            data = catalog.list_tools(
                domain=args.domain,
                source=args.source,
                callable_only=args.callable_only,
            )
            return emit(success(command="tool list", data=data, duration_ms=0))
        if args.tool_command == "search":
            data = catalog.list_tools(domain=args.domain, source=args.source, query=args.query)
            return emit(success(command="tool search", data=data, duration_ms=0))
    parser.print_help(sys.stderr)
    return 2
