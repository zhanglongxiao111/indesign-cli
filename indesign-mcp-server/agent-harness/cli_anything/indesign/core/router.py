from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from .catalog import Catalog
from .errors import CliError
from .mcp_backend import McpBackend


BACKENDS = {
    "advanced": "src/advanced/index.js",
    "classic": "src/index.js",
}


class Router:
    def __init__(self, catalog: Catalog, repo_root: Path) -> None:
        self.catalog = catalog
        self.repo_root = repo_root

    def _find(self, tool_id: str) -> dict[str, Any]:
        matches = [tool for tool in self.catalog.list_tools(callable_only=False) if tool["id"] == tool_id]
        if not matches:
            raise CliError(f"Tool not found: {tool_id}", code="TOOL_NOT_FOUND")
        return matches[0]

    def schema(self, tool_id: str) -> dict[str, Any]:
        tool = self._find(tool_id)
        if not tool["callable"]:
            raise CliError(f"Tool is not callable: {tool_id}", code="TOOL_NOT_CALLABLE")
        if tool["source"] in {"cli", "script"}:
            return {"tool": tool, "inputSchema": {"type": "object", "properties": {}}}
        backend = self._backend(tool["source"])
        for item in backend.list_tools():
            if item["name"] == tool["name"]:
                return {"tool": tool, "inputSchema": item.get("inputSchema", {})}
        raise CliError(f"Backend schema missing for {tool_id}", code="SCHEMA_NOT_FOUND")

    def call(self, tool_id: str, args: dict[str, Any]) -> dict[str, Any]:
        tool = self._find(tool_id)
        if not tool["callable"]:
            raise CliError(f"Tool is not callable: {tool_id}", code="TOOL_NOT_CALLABLE")
        if tool["source"] == "cli":
            return self._call_cli_primitive(tool_id, args)
        if tool["source"] == "script":
            return self._call_script_primitive(args)
        if tool["source"] not in BACKENDS:
            raise CliError(f"Tool is handled by a CLI command: {tool_id}", code="CLI_PRIMITIVE_ROUTE")
        backend = self._backend(tool["source"])
        return backend.call_tool(tool["name"], args)

    def _backend(self, source: str) -> McpBackend:
        try:
            entry = BACKENDS[source]
        except KeyError as exc:
            raise CliError(f"Unsupported backend source: {source}", code="BACKEND_NOT_SUPPORTED") from exc
        return McpBackend(repo_root=self.repo_root, entry=entry)

    def _call_cli_primitive(self, tool_id: str, args: dict[str, Any]) -> dict[str, Any]:
        if tool_id == "export.verify":
            from .artifacts import verify_artifact

            created_after = datetime.fromisoformat(args["created_after"]) if args.get("created_after") else None
            return verify_artifact(Path(args["path"]), created_after=created_after, cwd=Path.cwd())
        if tool_id == "session.show":
            from .session import SessionStore

            return SessionStore(Path.cwd()).read(compact=not bool(args.get("verbose")))
        if tool_id == "session.clear":
            from .session import SessionStore

            SessionStore(Path.cwd()).clear()
            return {"cleared": True}
        if tool_id == "server.health":
            from .health import health

            return health(self.repo_root, deep=bool(args.get("deep")))
        raise CliError(f"Unsupported CLI primitive: {tool_id}", code="CLI_PRIMITIVE_UNSUPPORTED")

    def _call_script_primitive(self, args: dict[str, Any]) -> dict[str, Any]:
        from .scripts import run_script, run_stdin_script

        if args.get("stdin"):
            return run_stdin_script(self, Path.cwd())
        if args.get("file"):
            return run_script(self, Path(args["file"]))
        raise CliError("script.run requires file or stdin", code="SCRIPT_INPUT_REQUIRED")


def load_args(path_value: str) -> dict[str, Any]:
    if path_value == "-":
        return json.loads(sys.stdin.read() or "{}")
    return json.loads(Path(path_value).read_text(encoding="utf-8"))
