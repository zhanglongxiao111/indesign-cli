from __future__ import annotations

import json
import subprocess
import threading
from pathlib import Path
from typing import Any, Callable

from .errors import CliError, TimeoutError


class McpBackend:
    def __init__(self, repo_root: Path, entry: str, timeout_seconds: int = 30) -> None:
        self.repo_root = repo_root
        self.entry = entry
        self.timeout_seconds = timeout_seconds
        self._next_id = 1

    def list_tools(self) -> list[dict[str, Any]]:
        response = self._with_process(lambda proc: self._request(proc, "tools/list", {}))
        return response.get("tools", [])

    def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        return self._with_process(
            lambda proc: self._request(proc, "tools/call", {"name": name, "arguments": arguments})
        )

    def _with_process(self, action: Callable[[subprocess.Popen[str]], dict[str, Any]]) -> dict[str, Any]:
        entry_path = self.repo_root / self.entry
        if not entry_path.exists():
            raise CliError(f"MCP entry not found: {self.entry}", code="MCP_ENTRY_NOT_FOUND")

        proc = subprocess.Popen(
            ["node", self.entry],
            cwd=self.repo_root,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
        timed_out = {"value": False}

        def kill_process() -> None:
            timed_out["value"] = True
            proc.kill()

        timer = threading.Timer(self.timeout_seconds, kill_process)
        try:
            timer.start()
            self._request(
                proc,
                "initialize",
                {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "cli-anything-indesign", "version": "0.1.0"},
                },
            )
            self._notify(proc, "notifications/initialized", {})
            return action(proc)
        finally:
            timer.cancel()
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()
            if timed_out["value"]:
                raise TimeoutError("MCP process timed out", details={"entry": self.entry})

    def _request(self, proc: subprocess.Popen[str], method: str, params: dict[str, Any]) -> dict[str, Any]:
        if proc.stdin is None or proc.stdout is None:
            raise CliError("MCP process stdio is unavailable", code="MCP_STDIO_UNAVAILABLE")
        request = {"jsonrpc": "2.0", "id": self._next_id, "method": method, "params": params}
        self._next_id += 1
        proc.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
        proc.stdin.flush()
        line = proc.stdout.readline()
        if line == "":
            raise TimeoutError("MCP process ended before response", details={"method": method, "entry": self.entry})
        try:
            response = json.loads(line)
        except json.JSONDecodeError as exc:
            raise CliError("MCP response is not JSON", code="MCP_BAD_JSON", details={"line": line[:500]}) from exc
        if "error" in response:
            raise CliError(
                response["error"].get("message", "MCP request failed"),
                code="MCP_PROTOCOL_ERROR",
                retryable=False,
                details=response["error"],
            )
        return response.get("result", {})

    def _notify(self, proc: subprocess.Popen[str], method: str, params: dict[str, Any]) -> None:
        if proc.stdin is None:
            raise CliError("MCP process stdin is unavailable", code="MCP_STDIN_UNAVAILABLE")
        proc.stdin.write(json.dumps({"jsonrpc": "2.0", "method": method, "params": params}) + "\n")
        proc.stdin.flush()
