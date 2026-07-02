from __future__ import annotations

import json
import subprocess
import threading
from pathlib import Path
from typing import Any, Callable

from .errors import CliError, TimeoutError
from .paths import scrub_text_paths


LEGACY_FAILURE_PATTERNS = (
    "No document open",
    "No document to close",
    "Error ",
    "ERROR:",
    "Failed ",
)


def classify_legacy_failure(text: str) -> tuple[str, str] | None:
    stripped = text.strip()
    if "No document open" in stripped:
        return ("NO_ACTIVE_DOCUMENT", "No active document")
    if "No document to close" in stripped:
        return ("NO_ACTIVE_DOCUMENT", "No document to close")
    if stripped.startswith(("Error ", "ERROR:", "Failed ")):
        return ("INDESIGN_SCRIPT_FAILED", stripped[:200])
    return None


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
        response = self._with_process(
            lambda proc: self._request(proc, "tools/call", {"name": name, "arguments": arguments})
        )
        return self._parse_tool_response(name, response)

    def _with_process(self, action: Callable[[subprocess.Popen[str]], dict[str, Any]]) -> dict[str, Any]:
        entry_path = self.repo_root / self.entry
        if not entry_path.exists():
            raise CliError(f"MCP entry not found: {self.entry}", code="MCP_ENTRY_NOT_FOUND")

        try:
            proc = subprocess.Popen(
                ["node", self.entry],
                cwd=self.repo_root,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
            )
        except OSError as exc:
            raise CliError("Failed to start MCP process", code="MCP_START_FAILED", details={"entry": self.entry}) from exc

        timed_out = {"value": False}
        stderr_tail: list[str] = []

        def drain_stderr() -> None:
            if proc.stderr is None:
                return
            for line in proc.stderr:
                stderr_tail.append(scrub_text_paths(line.strip()))
                del stderr_tail[:-20]

        def kill_process() -> None:
            timed_out["value"] = True
            proc.kill()

        timer = threading.Timer(self.timeout_seconds, kill_process)
        stderr_thread = threading.Thread(target=drain_stderr, daemon=True)
        try:
            timer.start()
            stderr_thread.start()
            self._request(
                proc,
                "initialize",
                {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "indesign-cli", "version": "0.2.0"},
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
                raise TimeoutError(
                    "MCP process timed out",
                    details={"entry": self.entry, "timeout_seconds": self.timeout_seconds, "stderr_tail": stderr_tail},
                )

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

    def _parse_tool_response(self, name: str, response: dict[str, Any]) -> dict[str, Any]:
        content = response.get("content", [])
        if not content:
            return response

        first = content[0]
        if first.get("type") != "text":
            return response

        text = first.get("text", "")
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            legacy = classify_legacy_failure(text)
            if legacy:
                code, message = legacy
                raise CliError(message, code=code, details={"tool": name, "result": scrub_text_paths(text)})
            if response.get("isError"):
                raise CliError(
                    "MCP tool failed",
                    code="MCP_TOOL_FAILED",
                    details={"tool": name, "result": scrub_text_paths(text)},
                )
            return response

        if isinstance(parsed, dict) and isinstance(parsed.get("result"), str):
            legacy = classify_legacy_failure(parsed["result"])
            if legacy:
                code, message = legacy
                raise CliError(message, code=code, details={"tool": name, "result": scrub_text_paths(parsed["result"])})

        if isinstance(parsed, dict) and isinstance(parsed.get("result"), str):
            try:
                result_json = json.loads(parsed["result"])
            except json.JSONDecodeError:
                result_json = None
        else:
            result_json = None

        if isinstance(result_json, dict) and result_json.get("ok") is False:
            details = {"tool": name, **result_json}
            message = str(result_json.get("error") or result_json.get("message") or "InDesign script failed")
            raise CliError(message, code=str(result_json.get("code") or "INDESIGN_SCRIPT_FAILED"), details=details)

        if response.get("isError") or (
            isinstance(parsed, dict) and (parsed.get("success") is False or parsed.get("ok") is False)
        ):
            details = {"tool": name}
            if isinstance(parsed, dict):
                details["operation"] = parsed.get("operation")
                details["result"] = scrub_text_paths(str(parsed.get("result", "")))
                details.update(
                    {
                        key: value
                        for key, value in parsed.items()
                        if key
                        in {
                            "code",
                            "message",
                            "error",
                            "step",
                            "data",
                            "documentState",
                            "errorName",
                            "errorNumber",
                            "line",
                            "fileName",
                        }
                    }
                )
            code = str(parsed.get("code") or "MCP_TOOL_FAILED") if isinstance(parsed, dict) else "MCP_TOOL_FAILED"
            message = str(parsed.get("message") or parsed.get("error") or "") if isinstance(parsed, dict) else ""
            if not message:
                # message 缺失时回退到工具返回文本，Agent 才能看到真实失败原因
                result_text = scrub_text_paths(str(parsed.get("result") or "")).strip() if isinstance(parsed, dict) else ""
                message = result_text[:300] or "MCP tool failed"
            legacy = classify_legacy_failure(message)
            if legacy:
                code, message = legacy
            raise CliError(message, code=code, details=details)

        payload = {"content": content, "parsed": parsed}
        if isinstance(result_json, dict):
            payload["result_json"] = result_json
        return payload
