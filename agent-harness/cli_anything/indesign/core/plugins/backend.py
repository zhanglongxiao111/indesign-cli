from __future__ import annotations

import json
import subprocess
import uuid
from pathlib import Path
from typing import Any

from ..errors import CliError
from .manifest import PluginRecord


class PluginBackend:
    def __init__(self, record: PluginRecord, *, timeout: int = 30) -> None:
        self.record = record
        self.timeout = timeout

    def request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = {
            "jsonrpc": "2.0",
            "id": uuid.uuid4().hex[:12],
            "method": method,
            "params": params or {},
        }
        try:
            completed = subprocess.run(
                ["node", str(self.record.entry_path)],
                cwd=self.record.root,
                input=json.dumps(payload, ensure_ascii=False),
                text=True,
                encoding="utf-8",
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=self.timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise CliError("Plugin timed out", code="PLUGIN_TIMEOUT", retryable=True, details={"plugin": self.record.id, "method": method}) from exc

        if completed.returncode != 0:
            raise CliError(
                "Plugin process failed",
                code="PLUGIN_CALL_FAILED",
                details={"plugin": self.record.id, "method": method, "returncode": completed.returncode, "stderr": completed.stderr[-1000:]},
            )
        try:
            response = json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            raise CliError(
                "Plugin stdout must be a single JSON response",
                code="PLUGIN_STDOUT_INVALID",
                details={"plugin": self.record.id, "method": method, "stdout_prefix": completed.stdout[:200]},
            ) from exc
        if not isinstance(response, dict):
            raise CliError("Plugin response must be an object", code="PLUGIN_RESPONSE_INVALID", details={"plugin": self.record.id, "method": method})
        if response.get("error"):
            error = response["error"]
            if not isinstance(error, dict):
                raise CliError("Plugin error must be an object", code="PLUGIN_RESPONSE_INVALID", details={"plugin": self.record.id, "method": method})
            raise CliError(
                str(error.get("message") or "Plugin error"),
                code=str(error.get("code") or "PLUGIN_ERROR"),
                details=error.get("details") if isinstance(error.get("details"), dict) else {},
            )
        result = response.get("result")
        if not isinstance(result, dict):
            raise CliError("Plugin result must be an object", code="PLUGIN_RESPONSE_INVALID", details={"plugin": self.record.id, "method": method})
        return result

    def handshake(self, host: dict[str, Any]) -> dict[str, Any]:
        return self.request("plugin/handshake", {"host": host})

    def list_tools(self, context: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        result = self.request("tools/list", {"context": context or {}})
        tools = result.get("tools")
        if not isinstance(tools, list):
            raise CliError("Plugin tools/list must return tools array", code="PLUGIN_RESPONSE_INVALID", details={"plugin": self.record.id})
        return [tool for tool in tools if isinstance(tool, dict)]

    def schema(self, tool_id: str) -> dict[str, Any]:
        return self.request("tools/schema", {"tool_id": tool_id})

    def call_tool(self, tool_id: str, args: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        return self.request("tools/call", {"tool_id": tool_id, "args": args, "context": context})

    def resume_tool(self, tool_id: str, state: dict[str, Any], host_results: list[dict[str, Any]]) -> dict[str, Any]:
        return self.request("tools/resume", {"tool_id": tool_id, "state": state, "host_results": host_results})

    def doctor(self) -> dict[str, Any]:
        return self.request("plugin/doctor", {})
