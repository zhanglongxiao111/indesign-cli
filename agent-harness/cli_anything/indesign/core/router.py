from __future__ import annotations

import json
import sys
from json import JSONDecodeError
from pathlib import Path
from typing import Any

from .catalog import Catalog
from .errors import CliError
from .hidden_backend import HiddenHandlerBackend
from .mcp_backend import McpBackend
from .plugins.backend import PluginBackend
from .plugins.host_actions import ALLOWED_HOST_ACTIONS, HostActionExecutor


BACKENDS = {
    "advanced": "src/advanced/index.js",
    "classic": "src/index.js",
}


PRIMITIVE_SCHEMAS = {
    "export.verify": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "path": {"type": "string", "description": "要验证的 PDF 或 IDML 路径"},
            "created_after": {"type": "string", "description": "ISO 时间戳；用于避免验证到旧产物"},
        },
        "required": ["path"],
    },
    "server.health": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "deep": {"type": "boolean", "description": "是否执行较深的依赖检查"},
        },
    },
    "server.setup": {"type": "object", "additionalProperties": False, "properties": {}},
    "session.show": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "verbose": {"type": "boolean", "description": "是否显示允许展示的详细 session 信息"},
        },
    },
    "session.clear": {"type": "object", "additionalProperties": False, "properties": {}},
    "script.run": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "file": {"type": "string", "description": "要执行的 JSX 文件路径"},
            "stdin": {"type": "boolean", "description": "从 stdin 读取临时 JSX"},
        },
    },
    "skill.install": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "target": {"type": "string", "description": "目标项目根目录；默认使用当前工作目录"},
        },
    },
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
            return {"tool": tool, "inputSchema": PRIMITIVE_SCHEMAS.get(tool_id, {"type": "object", "properties": {}})}
        if tool["source"] == "hidden_handler":
            return {"tool": tool, "inputSchema": HiddenHandlerBackend(self.repo_root).schema(tool_id)}
        if tool["source"] == "plugin":
            backend = self._plugin_backend(tool)
            payload = backend.schema(tool_id)
            return {"tool": tool, "inputSchema": payload.get("inputSchema", {})}
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
        if tool["source"] == "hidden_handler":
            return HiddenHandlerBackend(self.repo_root).call_tool(tool, args)
        if tool["source"] == "plugin":
            backend = self._plugin_backend(tool)
            result = backend.call_tool(tool_id, args, self._plugin_context())
            return HostActionExecutor(self, Path.cwd()).complete(backend, tool_id, result)
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

    def _plugin_backend(self, tool: dict[str, Any]) -> PluginBackend:
        plugin_id = tool.get("plugin")
        if not isinstance(plugin_id, str) or not plugin_id:
            raise CliError("Plugin tool is missing plugin id", code="PLUGIN_RECORD_NOT_FOUND", details={"tool_id": tool.get("id")})
        return PluginBackend(self.catalog.plugin_record(plugin_id))

    @staticmethod
    def _plugin_context() -> dict[str, Any]:
        cwd = Path.cwd()
        return {
            "cwd": str(cwd),
            "session_path": str(cwd / ".indesign-cli" / "session.json"),
            "host_tools": sorted(ALLOWED_HOST_ACTIONS),
        }

    def _call_cli_primitive(self, tool_id: str, args: dict[str, Any]) -> dict[str, Any]:
        if tool_id == "export.verify":
            from .artifacts import parse_timestamp, verify_artifact

            path = self._require_arg(args, "path")
            try:
                created_after = parse_timestamp(args["created_after"]) if args.get("created_after") else None
            except ValueError as exc:
                raise CliError("created_after must be an ISO timestamp", code="BAD_TIMESTAMP") from exc
            return verify_artifact(Path(path), created_after=created_after, cwd=Path.cwd())
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
        if tool_id == "server.setup":
            from .node_setup import setup_node_dependencies

            return setup_node_dependencies(self.repo_root)
        if tool_id == "skill.install":
            from .runtime import install_skill

            return install_skill(Path(args.get("target") or "."))
        raise CliError(f"Unsupported CLI primitive: {tool_id}", code="CLI_PRIMITIVE_UNSUPPORTED")

    def _call_script_primitive(self, args: dict[str, Any]) -> dict[str, Any]:
        from .scripts import run_script, run_stdin_script

        if args.get("stdin"):
            return run_stdin_script(self, Path.cwd())
        if args.get("file"):
            return run_script(self, Path(args["file"]))
        raise CliError("script.run requires file or stdin", code="SCRIPT_INPUT_REQUIRED")

    @staticmethod
    def _require_arg(args: dict[str, Any], key: str) -> Any:
        value = args.get(key)
        if value in (None, ""):
            raise CliError(f"Missing required argument: {key}", code="MISSING_ARGUMENT", details={"argument": key})
        return value


def load_args(path_value: str) -> dict[str, Any]:
    try:
        if path_value == "-":
            payload = json.loads(sys.stdin.read() or "{}")
        else:
            payload = json.loads(Path(path_value).read_text(encoding="utf-8-sig"))
    except FileNotFoundError as exc:
        raise CliError("Arguments file not found", code="ARGS_FILE_NOT_FOUND") from exc
    except JSONDecodeError as exc:
        raise CliError("Arguments must be valid JSON", code="ARGS_JSON_INVALID") from exc
    if not isinstance(payload, dict):
        raise CliError("Arguments JSON must be an object", code="ARGS_NOT_OBJECT")
    return payload
