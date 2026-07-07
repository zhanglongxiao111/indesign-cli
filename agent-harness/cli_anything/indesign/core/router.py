from __future__ import annotations

import json
import sys
from json import JSONDecodeError
from pathlib import Path
from typing import Any

from .catalog import Catalog
from .errors import CliError
from .internal_backend import InternalToolBackend
from .mcp_backend import McpBackend
from .plugins.backend import PluginBackend
from .plugins.host_actions import ALLOWED_HOST_ACTIONS, HostActionExecutor
from .telemetry import FEEDBACK_CODES, recent_call_summaries, record_event, validate_feedback_payload


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
            "connect_indesign": {"type": "boolean", "description": "是否执行只读 InDesign COM 探针"},
        },
    },
    "server.setup": {"type": "object", "additionalProperties": False, "properties": {}},
    "session.show": {"type": "object", "additionalProperties": False, "properties": {}},
    "session.clear": {"type": "object", "additionalProperties": False, "properties": {}},
    "session.doctor": {"type": "object", "additionalProperties": False, "properties": {}},
    "feedback.report": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "code": {"type": "string", "enum": FEEDBACK_CODES, "description": "反馈类型"},
            "note": {
                "type": "string",
                "maxLength": 500,
                "description": "摩擦点摘要；不得包含客户文档内容、客户名称或文件路径",
            },
            "tool": {"type": "string", "description": "可选，关联的工具 id"},
        },
        "required": ["code", "note"],
    },
    "tool.batch": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "plan": {
                "type": "string",
                "description": 'JSON batch plan 路径；格式：{"steps":[{"id":"step-1","type":"tool","tool":"<tool_id>","args":{}}]}',
            },
            "on_error": {"type": "string", "enum": ["stop"], "description": "失败策略，当前仅支持 stop"},
            "timeout_ms": {"type": "integer", "description": "本次 batch 的超时毫秒"},
        },
        "required": ["plan"],
    },
    "script.run": {
        "type": "object",
        "additionalProperties": False,
        "oneOf": [{"required": ["file"]}, {"required": ["stdin"]}],
        "properties": {
            "file": {"type": "string", "description": "文件模式；推荐用于可复跑 JSX、相对 #include 和协作测试"},
            "stdin": {"type": "boolean", "description": "从 stdin 读取短临时探针；复杂脚本优先写文件再执行"},
            "timeout": {"type": "integer", "description": "脚本通道超时秒数，范围 1-3600"},
            "timeout_ms": {"type": "integer", "description": "脚本通道超时毫秒，范围 1-3600000"},
        },
    },
}


class Router:
    def __init__(self, catalog: Catalog, repo_root: Path, backend_timeout_seconds: int | None = None) -> None:
        self.catalog = catalog
        self.repo_root = repo_root
        self.backend_timeout_seconds = backend_timeout_seconds

    def _find(self, tool_id: str) -> dict[str, Any]:
        matches = [tool for tool in self.catalog.list_tools(callable_only=False) if tool["id"] == tool_id]
        if not matches:
            raise CliError(
                f"Tool not found: {tool_id}",
                code="TOOL_NOT_FOUND",
                details={"tool_id": tool_id},
                hint="先运行 `indesign-cli tool domains` 查看工具域，再用 `indesign-cli tool search --query <关键词>` 查找候选工具。",
            )
        return matches[0]

    def schema(self, tool_id: str) -> dict[str, Any]:
        tool = self._find(tool_id)
        if not tool["callable"]:
            raise CliError(f"Tool is not callable: {tool_id}", code="TOOL_NOT_CALLABLE")
        metadata = self._metadata(tool)
        if tool["source"] in {"cli", "cli.primitive", "script"}:
            return {"tool": tool, "inputSchema": PRIMITIVE_SCHEMAS.get(tool_id, {"type": "object", "properties": {}}), "metadata": metadata}
        if tool["source"] == "hidden_handler":
            return {"tool": tool, "inputSchema": InternalToolBackend(self.repo_root, catalog=self.catalog).schema(tool_id), "metadata": metadata}
        if tool["source"] == "plugin":
            backend = self._plugin_backend(tool)
            payload = backend.schema(tool_id)
            return {"tool": tool, "inputSchema": payload.get("inputSchema", {}), "metadata": metadata}
        backend = self._backend(tool["source"])
        for item in backend.list_tools():
            if item["name"] == tool["name"]:
                return {"tool": tool, "inputSchema": item.get("inputSchema", {}), "metadata": metadata}
        raise CliError(f"Backend schema missing for {tool_id}", code="SCHEMA_NOT_FOUND")

    @staticmethod
    def _metadata(tool: dict[str, Any]) -> dict[str, Any]:
        keys = (
            "requires_active_document",
            "requires_active_page",
            "uses_selection",
            "opens_document",
            "closes_document",
            "may_close_document",
            "mutates_document",
            "writes_filesystem",
            "returns_artifacts",
            "return_shape",
            "return_example",
            "failure_example",
            "preconditions",
            "safe_usage_notes",
            "common_next_steps",
        )
        return {key: tool.get(key) for key in keys}

    def call(self, tool_id: str, args: dict[str, Any]) -> dict[str, Any]:
        tool = self._find(tool_id)
        if not tool["callable"]:
            raise CliError(f"Tool is not callable: {tool_id}", code="TOOL_NOT_CALLABLE")
        if tool["source"] in {"cli", "cli.primitive"}:
            return self._call_cli_primitive(tool_id, args)
        if tool["source"] == "script":
            return self._call_script_primitive(args)
        if tool["source"] == "hidden_handler":
            return InternalToolBackend(
                self.repo_root,
                catalog=self.catalog,
                timeout_seconds=self.backend_timeout_seconds or 60,
            ).call_tool(tool, args)
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
        return McpBackend(repo_root=self.repo_root, entry=entry, timeout_seconds=self.backend_timeout_seconds or 30)

    def _plugin_backend(self, tool: dict[str, Any]) -> PluginBackend:
        plugin_id = tool.get("plugin")
        if not isinstance(plugin_id, str) or not plugin_id:
            raise CliError("Plugin tool is missing plugin id", code="PLUGIN_RECORD_NOT_FOUND", details={"tool_id": tool.get("id")})
        record = self.catalog.plugin_record(plugin_id)
        timeout = self.backend_timeout_seconds
        if timeout is None:
            timeout = self._parse_timeout_ms(record.manifest.get("timeout_default_ms", 30_000))
        return PluginBackend(record, timeout=timeout)

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

            return SessionStore(Path.cwd()).read(compact=True)
        if tool_id == "session.clear":
            from .session import SessionStore

            SessionStore(Path.cwd()).clear()
            return {"cleared": True}
        if tool_id == "session.doctor":
            from .session import SessionStore

            return SessionStore(Path.cwd()).doctor()
        if tool_id == "feedback.report":
            code = str(args.get("code") or "")
            note = str(args.get("note") or "")
            linked_tool = args.get("tool")
            if linked_tool is not None and not isinstance(linked_tool, str):
                raise CliError("feedback tool must be a string", code="FEEDBACK_TOOL_INVALID")
            validate_feedback_payload(code, note)
            event = record_event(
                {
                    "event": "feedback",
                    "tool_id": linked_tool,
                    "source": "cli.primitive",
                    "code": code,
                    "note": note.strip(),
                    "recent_calls": recent_call_summaries(Path.cwd()),
                }
            )
            return {
                "recorded": event is not None,
                "code": code,
                "tool": linked_tool,
                "session_id": event.get("session_id") if event else None,
                "origin_key": event.get("origin_key") if event else None,
                "cwd_hash": event.get("cwd_hash") if event else None,
            }
        if tool_id == "server.health":
            from .health import health

            return health(self.repo_root, deep=bool(args.get("deep")), connect_indesign=bool(args.get("connect_indesign")))
        if tool_id == "tool.batch":
            from .batch import run_batch

            return run_batch(self, Path(self._require_arg(args, "plan")), on_error=str(args.get("on_error") or "stop"))
        if tool_id == "server.setup":
            from .node_setup import setup_node_dependencies

            return setup_node_dependencies(self.repo_root)
        raise CliError(f"Unsupported CLI primitive: {tool_id}", code="CLI_PRIMITIVE_UNSUPPORTED")

    def _call_script_primitive(self, args: dict[str, Any]) -> dict[str, Any]:
        from .scripts import run_script, run_stdin_script

        old_timeout = self.backend_timeout_seconds
        if args.get("timeout_ms") is not None:
            self.backend_timeout_seconds = self._parse_timeout_ms(args.get("timeout_ms"))
        elif args.get("timeout") is not None:
            self.backend_timeout_seconds = self._parse_timeout(args.get("timeout"))
        try:
            if args.get("stdin"):
                return run_stdin_script(self, Path.cwd())
            if args.get("file"):
                return run_script(self, Path(args["file"]))
            raise CliError(
                "script.run requires file or stdin",
                code="SCRIPT_INPUT_REQUIRED",
                hint="传 JSX 文件路径（可复跑、支持相对 #include），或传 stdin:true 执行短临时探针。",
            )
        finally:
            self.backend_timeout_seconds = old_timeout

    @staticmethod
    def _require_arg(args: dict[str, Any], key: str) -> Any:
        value = args.get(key)
        if value in (None, ""):
            raise CliError(
                f"Missing required argument: {key}",
                code="MISSING_ARGUMENT",
                details={"argument": key},
                hint="用 `indesign-cli tool schema <tool_id>` 查看必填参数和类型。",
            )
        return value

    @staticmethod
    def _parse_timeout(value: Any) -> int:
        try:
            timeout = int(value)
        except (TypeError, ValueError) as exc:
            raise CliError("timeout must be an integer number of seconds", code="BAD_TIMEOUT") from exc
        if timeout < 1 or timeout > 3600:
            raise CliError("timeout must be between 1 and 3600 seconds", code="BAD_TIMEOUT", details={"timeout": timeout})
        return timeout

    @staticmethod
    def _parse_timeout_ms(value: Any) -> int:
        try:
            timeout_ms = int(value)
        except (TypeError, ValueError) as exc:
            raise CliError("timeout_ms must be an integer number of milliseconds", code="BAD_TIMEOUT") from exc
        if timeout_ms < 1 or timeout_ms > 3_600_000:
            raise CliError("timeout_ms must be between 1 and 3600000", code="BAD_TIMEOUT", details={"timeout_ms": timeout_ms})
        return max(1, int((timeout_ms + 999) / 1000))


ARGS_USAGE_HINT = (
    "三种传参方式：`--args-file <path>` 读 UTF-8 JSON 文件；`--args -` 从 stdin 读 JSON；"
    "`--args` 直接传以 { 开头的内联 JSON（注意 shell 引号转义）。"
)


def load_args(path_value: str) -> dict[str, Any]:
    stripped = path_value.strip()
    if stripped.startswith(("{", "[")):
        try:
            payload = json.loads(stripped)
        except JSONDecodeError as exc:
            raise CliError(
                "Inline JSON arguments are invalid",
                code="ARGS_JSON_INVALID",
                details={"position": f"line {exc.lineno} column {exc.colno}"},
                hint=f"内联 JSON 解析失败，常见原因是 shell 引号转义；{ARGS_USAGE_HINT}",
            ) from exc
    else:
        try:
            if path_value == "-":
                payload = json.loads(sys.stdin.read() or "{}")
            else:
                payload = json.loads(Path(path_value).read_text(encoding="utf-8-sig"))
        except JSONDecodeError as exc:
            raise CliError(
                "Arguments must be valid JSON",
                code="ARGS_JSON_INVALID",
                details={"position": f"line {exc.lineno} column {exc.colno}"},
                hint=ARGS_USAGE_HINT,
            ) from exc
        except OSError as exc:
            # FileNotFoundError 和 Windows 非法路径字符（如把 JSON 当路径）都落在这里
            raise CliError(
                "Arguments file not found or unreadable",
                code="ARGS_FILE_NOT_FOUND",
                details={"value": path_value},
                hint=ARGS_USAGE_HINT,
            ) from exc
    if not isinstance(payload, dict):
        raise CliError("Arguments JSON must be an object", code="ARGS_NOT_OBJECT", hint=ARGS_USAGE_HINT)
    return payload
