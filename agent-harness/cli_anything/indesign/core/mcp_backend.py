from __future__ import annotations

import json
import subprocess
import threading
from pathlib import Path
from typing import Any, Callable

from .errors import CliError, TimeoutError
from .paths import scrub_text_paths
from .runtime import resolve_node_executable


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
        return ("INDESIGN_SCRIPT_FAILED", scrub_text_paths(stripped)[:200])
    return None


def _scrub_nested_paths(value: Any) -> Any:
    if isinstance(value, str):
        return scrub_text_paths(value)
    if isinstance(value, list):
        return [_scrub_nested_paths(item) for item in value]
    if isinstance(value, dict):
        return {key: _scrub_nested_paths(item) for key, item in value.items()}
    return value


class McpBackend:
    def __init__(
        self,
        repo_root: Path,
        entry: str,
        timeout_seconds: int = 30,
        *,
        persistent: bool = False,
    ) -> None:
        self.repo_root = repo_root
        self.entry = entry
        self.timeout_seconds = timeout_seconds
        self._next_id = 1
        self._persistent = persistent
        self._started = False
        self._proc: subprocess.Popen[str] | None = None
        self._stderr_tail: list[str] = []
        self._stderr_thread: threading.Thread | None = None

    @property
    def is_open(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    @property
    def is_session_active(self) -> bool:
        return self._persistent

    def open(self) -> "McpBackend":
        if self.is_open:
            self._persistent = True
            return self
        if self._proc is not None:
            self.close()
        self._persistent = True
        self._start_and_initialize()
        return self

    def close(self) -> None:
        proc = self._proc
        stderr_thread = self._stderr_thread
        self._proc = None
        self._stderr_thread = None
        self._persistent = False
        self._started = False
        if proc is None:
            return
        if proc.stdin is not None:
            try:
                proc.stdin.close()
            except OSError:
                pass
        if proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                try:
                    proc.kill()
                    proc.wait(timeout=1)
                except (OSError, subprocess.TimeoutExpired):
                    pass
            except OSError:
                pass
        for stream in (proc.stdout, proc.stderr):
            if stream is not None:
                try:
                    stream.close()
                except OSError:
                    pass
        if stderr_thread is not None and stderr_thread.is_alive():
            stderr_thread.join(timeout=0.5)

    def __enter__(self) -> "McpBackend":
        return self.open()

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> bool:
        self.close()
        return False

    def list_tools(self) -> list[dict[str, Any]]:
        response = self._with_process(lambda proc: self._request(proc, "tools/list", {}))
        return response.get("tools", [])

    def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        response = self._with_process(
            lambda proc: self._request(proc, "tools/call", {"name": name, "arguments": arguments})
        )
        return self._parse_tool_response(name, response)

    def _start_and_initialize(self) -> subprocess.Popen[str]:
        entry_path = self.repo_root / self.entry
        if not entry_path.exists():
            raise CliError(f"MCP entry not found: {self.entry}", code="MCP_ENTRY_NOT_FOUND")

        try:
            node = resolve_node_executable(self.repo_root)
            proc = subprocess.Popen(
                [str(node), self.entry],
                cwd=self.repo_root,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
            )
        except OSError as exc:
            raise CliError("Failed to start MCP process", code="MCP_START_FAILED", details={"entry": self.entry}) from exc

        stderr_tail: list[str] = []

        def drain_stderr() -> None:
            if proc.stderr is None:
                return
            try:
                for line in proc.stderr:
                    stderr_tail.append(scrub_text_paths(line.strip()))
                    del stderr_tail[:-20]
            except (OSError, ValueError):
                pass

        stderr_thread = threading.Thread(target=drain_stderr, daemon=True)
        stderr_thread.start()
        self._proc = proc
        self._stderr_tail = stderr_tail
        self._stderr_thread = stderr_thread
        self._started = True

        def initialize(active_proc: subprocess.Popen[str]) -> None:
            self._request(
                active_proc,
                "initialize",
                {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "indesign-cli", "version": "0.2.0"},
                },
            )
            self._notify(active_proc, "notifications/initialized", {})

        try:
            self._run_with_timeout(proc, initialize)
        except BaseException:
            self.close()
            raise
        return proc

    def _run_with_timeout(
        self,
        proc: subprocess.Popen[str],
        action: Callable[[subprocess.Popen[str]], Any],
    ) -> Any:
        timed_out = {"value": False}

        def kill_process() -> None:
            timed_out["value"] = True
            try:
                proc.kill()
            except OSError:
                pass

        timer = threading.Timer(self.timeout_seconds, kill_process)
        timer.daemon = True
        try:
            timer.start()
            result = action(proc)
        except BaseException:
            timer.cancel()
            if timed_out["value"]:
                self.close()
                raise TimeoutError(
                    "MCP process timed out",
                    details={
                        "entry": self.entry,
                        "timeout_seconds": self.timeout_seconds,
                        "stderr_tail": list(self._stderr_tail),
                    },
                )
            raise
        else:
            timer.cancel()
            if timed_out["value"]:
                self.close()
                raise TimeoutError(
                    "MCP process timed out",
                    details={
                        "entry": self.entry,
                        "timeout_seconds": self.timeout_seconds,
                        "stderr_tail": list(self._stderr_tail),
                    },
                )
            return result

    def _with_process(self, action: Callable[[subprocess.Popen[str]], dict[str, Any]]) -> dict[str, Any]:
        if not self._persistent:
            proc = self._start_and_initialize()
            try:
                return self._run_with_timeout(proc, action)
            finally:
                self.close()

        if self._proc is None:
            if self._started:
                raise CliError(
                    "MCP process session is already closed",
                    code="MCP_PROCESS_EXITED",
                    details={"entry": self.entry},
                    state_uncertain=True,
                    next_action="Run `indesign-cli session doctor` before retrying mutating steps.",
                )
            proc = self._start_and_initialize()
        else:
            proc = self._proc
            rc = proc.poll()
            if rc is not None:
                stderr_tail = list(self._stderr_tail)
                self.close()
                raise CliError(
                    "MCP process exited unexpectedly",
                    code="MCP_PROCESS_EXITED",
                    details={"entry": self.entry, "returncode": rc, "stderr_tail": stderr_tail},
                    state_uncertain=True,
                    next_action="Run `indesign-cli session doctor` before retrying mutating steps.",
                )

        try:
            return self._run_with_timeout(proc, action)
        except BaseException as exc:
            if (
                proc.poll() is not None
                or isinstance(exc, TimeoutError)
                or (
                    isinstance(exc, CliError)
                    and exc.code in {"MCP_PROCESS_EXITED", "MCP_BAD_JSON", "MCP_STDIO_UNAVAILABLE", "MCP_STDIN_UNAVAILABLE"}
                )
            ):
                self.close()
            raise

    def _request(self, proc: subprocess.Popen[str], method: str, params: dict[str, Any]) -> dict[str, Any]:
        if proc.stdin is None or proc.stdout is None:
            raise CliError("MCP process stdio is unavailable", code="MCP_STDIO_UNAVAILABLE")
        request = {"jsonrpc": "2.0", "id": self._next_id, "method": method, "params": params}
        self._next_id += 1
        try:
            proc.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
            proc.stdin.flush()
            line = proc.stdout.readline()
        except OSError as exc:
            raise CliError(
                "MCP process pipe closed before response",
                code="MCP_PROCESS_EXITED",
                details={"method": method, "entry": self.entry},
                state_uncertain=True,
                next_action="Run `indesign-cli session doctor` before retrying mutating steps.",
            ) from exc
        if line == "":
            raise TimeoutError("MCP process ended before response", details={"method": method, "entry": self.entry})
        try:
            response = json.loads(line)
        except json.JSONDecodeError as exc:
            raise CliError("MCP response is not JSON", code="MCP_BAD_JSON", details={"line": scrub_text_paths(line[:500])}) from exc
        if "error" in response:
            raise CliError(
                scrub_text_paths(str(response["error"].get("message", "MCP request failed"))),
                code="MCP_PROTOCOL_ERROR",
                retryable=False,
                details=_scrub_nested_paths(response["error"]),
            )
        return response.get("result", {})

    def _notify(self, proc: subprocess.Popen[str], method: str, params: dict[str, Any]) -> None:
        if proc.stdin is None:
            raise CliError("MCP process stdin is unavailable", code="MCP_STDIN_UNAVAILABLE")
        try:
            proc.stdin.write(json.dumps({"jsonrpc": "2.0", "method": method, "params": params}) + "\n")
            proc.stdin.flush()
        except OSError as exc:
            raise CliError(
                "MCP process pipe closed during notification",
                code="MCP_PROCESS_EXITED",
                details={"method": method, "entry": self.entry},
                state_uncertain=True,
                next_action="Run `indesign-cli session doctor` before retrying mutating steps.",
            ) from exc

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

        if response.get("isError") or (
            isinstance(parsed, dict) and (parsed.get("success") is False or parsed.get("ok") is False)
        ):
            details: dict[str, Any] = {"tool": name}
            first_error: dict[str, Any] | None = None
            if isinstance(parsed, dict):
                details["operation"] = parsed.get("operation")
                details["result"] = scrub_text_paths(str(parsed.get("result", "")))
                errors = parsed.get("errors")
                if isinstance(errors, list) and errors and isinstance(errors[0], dict):
                    first_error = {
                        key: _scrub_nested_paths(value)
                        for key, value in errors[0].items()
                        if key in {"code", "message", "pageId", "itemId", "field", "step", "line", "fileName"}
                    }
                    details["first_error"] = first_error
                details.update(
                    {
                        key: _scrub_nested_paths(value)
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
            code = (
                str(parsed.get("code") or (first_error or {}).get("code") or "MCP_TOOL_FAILED")
                if isinstance(parsed, dict)
                else "MCP_TOOL_FAILED"
            )
            raw_message = (
                str(parsed.get("message") or parsed.get("error") or (first_error or {}).get("message") or "")
                if isinstance(parsed, dict)
                else ""
            )
            message = scrub_text_paths(raw_message).strip()
            if not message:
                # message 缺失时回退到工具返回文本，Agent 才能看到真实失败原因
                result_text = scrub_text_paths(str(parsed.get("result") or "")).strip() if isinstance(parsed, dict) else ""
                message = result_text[:300] or "MCP tool failed"
            legacy = classify_legacy_failure(message)
            if legacy:
                code, message = legacy
            doc_state = (
                parsed.get("documentState")
                if isinstance(parsed, dict) and isinstance(parsed.get("documentState"), dict)
                else {}
            )
            state_uncertain = bool(
                (isinstance(parsed, dict) and parsed.get("state_uncertain") is True)
                or doc_state.get("state_uncertain") is True
            )
            next_action = (
                scrub_text_paths(parsed["next_action"])
                if isinstance(parsed, dict) and isinstance(parsed.get("next_action"), str) and parsed["next_action"].strip()
                else ("Run `indesign-cli session doctor` before retrying mutating steps." if state_uncertain else None)
            )
            raise CliError(message, code=code, details=details, state_uncertain=state_uncertain, next_action=next_action)

        return {"content": content, "parsed": parsed}
