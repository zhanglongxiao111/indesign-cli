from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any

from .catalog import Catalog
from .errors import CliError, TimeoutError
from .paths import scrub_text_paths
from .runtime import internal_tool_bridge_path, resolve_node_executable


class InternalToolBackend:
    def __init__(self, repo_root: Path, catalog: Catalog | None = None, timeout_seconds: int = 60) -> None:
        self.repo_root = repo_root
        self.catalog = catalog or Catalog(repo_root=repo_root)
        self.timeout_seconds = timeout_seconds

    def schema(self, tool_id: str) -> dict[str, Any]:
        return self.catalog.schema(tool_id)

    def call_tool(self, tool: dict[str, Any], arguments: dict[str, Any]) -> dict[str, Any]:
        schema = self.schema(tool["id"])
        self._validate_required(schema, arguments)

        bridge = internal_tool_bridge_path()
        node = resolve_node_executable(self.repo_root)
        request = {
            "toolId": tool["id"],
            "args": arguments,
        }
        try:
            proc = subprocess.run(
                [str(node), str(bridge)],
                cwd=self.repo_root,
                env={**os.environ, "INDESIGN_CLI_SERVER_ROOT": str(self.repo_root)},
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
                "Internal tool bridge timed out",
                details={
                    "tool": tool["id"],
                    "timeout_seconds": self.timeout_seconds,
                    "stderr_tail": scrub_text_paths((exc.stderr or "")[-2000:]),
                },
            ) from exc
        except OSError as exc:
            raise CliError("Failed to start internal tool bridge", code="INTERNAL_TOOL_START_FAILED") from exc

        payload = self._parse_bridge_payload(proc, tool["id"])
        if not payload.get("ok"):
            error = payload.get("error", {})
            raise CliError(
                "Internal tool bridge failed",
                code=error.get("code", "INTERNAL_TOOL_FAILED"),
                details={
                    "tool": tool["id"],
                    "message": scrub_text_paths(str(error.get("message", ""))),
                },
            )

        result = payload.get("result", {})
        if isinstance(result, dict) and result.get("success") is False:
            raise CliError(
                "Internal tool failed",
                code="INTERNAL_TOOL_FAILED",
                details={"tool": tool["id"], "operation": result.get("operation")},
            )
        if isinstance(result, dict) and isinstance(result.get("result"), str) and result["result"].startswith("Error:"):
            raise CliError(
                "Internal tool failed",
                code="INTERNAL_TOOL_FAILED",
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
                "Internal tool bridge exited with an error",
                code="INTERNAL_TOOL_BRIDGE_FAILED",
                details={"tool": tool_id, "returncode": proc.returncode, "stderr_tail": stderr_tail},
            )

        stdout = (proc.stdout or "").strip()
        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError as exc:
            raise CliError(
                "Internal tool bridge response is not JSON",
                code="INTERNAL_TOOL_BAD_JSON",
                details={"tool": tool_id, "stdout": scrub_text_paths(stdout[-1000:]), "stderr_tail": stderr_tail},
            ) from exc
        if not isinstance(payload, dict):
            raise CliError("Internal tool bridge response must be an object", code="INTERNAL_TOOL_BAD_JSON")
        return payload

    @staticmethod
    def _validate_required(schema: dict[str, Any], arguments: dict[str, Any]) -> None:
        for key in schema.get("required", []):
            value = arguments.get(key)
            if value in (None, ""):
                raise CliError(f"Missing required argument: {key}", code="MISSING_ARGUMENT", details={"argument": key})
