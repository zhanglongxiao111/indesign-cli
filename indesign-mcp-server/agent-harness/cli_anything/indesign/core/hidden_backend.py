from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from .errors import CliError, TimeoutError
from .hidden_handler_schemas import HIDDEN_HANDLER_SCHEMAS
from .paths import scrub_text_paths


class HiddenHandlerBackend:
    def __init__(self, repo_root: Path, timeout_seconds: int = 60) -> None:
        self.repo_root = repo_root
        self.timeout_seconds = timeout_seconds

    def schema(self, tool_id: str) -> dict[str, Any]:
        try:
            return HIDDEN_HANDLER_SCHEMAS[tool_id]
        except KeyError as exc:
            raise CliError(f"Hidden handler schema missing: {tool_id}", code="SCHEMA_NOT_FOUND") from exc

    def call_tool(self, tool: dict[str, Any], arguments: dict[str, Any]) -> dict[str, Any]:
        schema = self.schema(tool["id"])
        self._validate_required(schema, arguments)

        bridge = self.repo_root / "agent-harness" / "cli_anything" / "indesign" / "node" / "hidden_handler_bridge.mjs"
        if not bridge.exists():
            raise CliError("Hidden handler bridge not found", code="HIDDEN_HANDLER_BRIDGE_NOT_FOUND")

        request = {
            "domain": tool["domain"],
            "name": tool["name"],
            "args": arguments,
        }
        try:
            proc = subprocess.run(
                ["node", str(bridge)],
                cwd=self.repo_root,
                input=json.dumps(request, ensure_ascii=False),
                text=True,
                encoding="utf-8",
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
                timeout=self.timeout_seconds,
            )
        except subprocess.TimeoutExpired as exc:
            raise TimeoutError(
                "Hidden handler bridge timed out",
                details={"tool": tool["id"], "stderr_tail": scrub_text_paths((exc.stderr or "")[-2000:])},
            ) from exc
        except OSError as exc:
            raise CliError("Failed to start hidden handler bridge", code="HIDDEN_HANDLER_START_FAILED") from exc

        payload = self._parse_bridge_payload(proc, tool["id"])
        if not payload.get("ok"):
            error = payload.get("error", {})
            raise CliError(
                "Hidden handler bridge failed",
                code=error.get("code", "HIDDEN_HANDLER_FAILED"),
                details={
                    "tool": tool["id"],
                    "message": scrub_text_paths(str(error.get("message", ""))),
                },
            )

        result = payload.get("result", {})
        if isinstance(result, dict) and result.get("success") is False:
            raise CliError(
                "Hidden handler failed",
                code="HIDDEN_HANDLER_FAILED",
                details={"tool": tool["id"], "operation": result.get("operation")},
            )
        if isinstance(result, dict) and isinstance(result.get("result"), str) and result["result"].startswith("Error:"):
            raise CliError(
                "Hidden handler failed",
                code="HIDDEN_HANDLER_FAILED",
                details={
                    "tool": tool["id"],
                    "operation": result.get("operation"),
                    "result": scrub_text_paths(result["result"]),
                },
            )
        return result

    def _parse_bridge_payload(self, proc: subprocess.CompletedProcess[str], tool_id: str) -> dict[str, Any]:
        stderr_tail = scrub_text_paths((proc.stderr or "")[-2000:])
        if proc.returncode != 0:
            raise CliError(
                "Hidden handler bridge exited with an error",
                code="HIDDEN_HANDLER_BRIDGE_FAILED",
                details={"tool": tool_id, "returncode": proc.returncode, "stderr_tail": stderr_tail},
            )

        stdout = (proc.stdout or "").strip()
        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError as exc:
            raise CliError(
                "Hidden handler bridge response is not JSON",
                code="HIDDEN_HANDLER_BAD_JSON",
                details={"tool": tool_id, "stdout": scrub_text_paths(stdout[-1000:]), "stderr_tail": stderr_tail},
            ) from exc
        if not isinstance(payload, dict):
            raise CliError("Hidden handler bridge response must be an object", code="HIDDEN_HANDLER_BAD_JSON")
        return payload

    @staticmethod
    def _validate_required(schema: dict[str, Any], arguments: dict[str, Any]) -> None:
        for key in schema.get("required", []):
            value = arguments.get(key)
            if value in (None, ""):
                raise CliError(f"Missing required argument: {key}", code="MISSING_ARGUMENT", details={"argument": key})
