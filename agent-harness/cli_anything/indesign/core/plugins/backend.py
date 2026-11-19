from __future__ import annotations

import codecs
from contextlib import contextmanager
import json
import os
import queue
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Iterator

from ..errors import CliError
from ..paths import scrub_text_paths
from ..runtime_health import probe_edge
from .manifest import PluginRecord


def _stderr_tail(raw: Any, limit: int = 2000) -> str:
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    return scrub_text_paths(str(raw or "")[-limit:])


class PluginBackend:
    def __init__(self, record: PluginRecord, *, timeout: int = 30, node_executable: str | None = None, runner=subprocess.run) -> None:
        self.record = record
        self.timeout = timeout
        self.node_executable = node_executable or os.environ.get("INDESIGN_CLI_NODE") or "node"
        self.runner = runner
        self._session_depth: int = 0
        self._proc: subprocess.Popen[str] | None = None
        self._stdout_queue: queue.Queue[str | None] | None = None
        self._stderr_chunks: list[str] = []
        self._stderr_lock = threading.Lock()
        self._stdout_thread: threading.Thread | None = None
        self._stderr_thread: threading.Thread | None = None
        self._cached_child_env: dict[str, str] | None = None
        self._child_env_resolved: bool = False

    @property
    def supports_stdio_session(self) -> bool:
        capabilities = self.record.manifest.get("capabilities")
        return (
            self.runner is subprocess.run
            and isinstance(capabilities, dict)
            and capabilities.get("stdio_session") is True
        )

    @property
    def is_session_active(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    @contextmanager
    def session(self) -> Iterator["PluginBackend"]:
        self._session_depth += 1
        try:
            yield self
        finally:
            self._session_depth -= 1
            if self._session_depth <= 0:
                self._session_depth = 0
                self.close()

    def close(self, *, force: bool = False) -> None:
        proc = self._proc
        self._proc = None
        stdout_thread = self._stdout_thread
        stderr_thread = self._stderr_thread
        self._stdout_thread = None
        self._stderr_thread = None
        self._stdout_queue = None
        if proc is None:
            return
        if force:
            try:
                if proc.poll() is None:
                    proc.terminate()
                    try:
                        proc.wait(timeout=0.5)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait(timeout=1.0)
            except OSError:
                pass
            try:
                if proc.stdin is not None and not proc.stdin.closed:
                    proc.stdin.close()
            except (OSError, ValueError):
                pass
        else:
            try:
                if proc.stdin is not None and not proc.stdin.closed:
                    proc.stdin.close()
            except (OSError, ValueError):
                pass
            try:
                if proc.poll() is None:
                    proc.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                try:
                    proc.terminate()
                    proc.wait(timeout=1.0)
                except Exception:
                    try:
                        proc.kill()
                        proc.wait(timeout=1.0)
                    except Exception:
                        pass
            except OSError:
                pass
        # Let reader threads finish draining remaining pipe bytes after process exit before closing handles.
        for thread in (stderr_thread, stdout_thread):
            if thread is not None and thread.is_alive():
                thread.join(timeout=0.5)
        for stream in (proc.stdout, proc.stderr):
            try:
                if stream is not None and not stream.closed:
                    stream.close()
            except (OSError, ValueError):
                pass

    def _resolve_child_env(self) -> dict[str, str] | None:
        if not self._child_env_resolved:
            self._child_env_resolved = True
            if not (os.environ.get("HTML_INDESIGN_BROWSER_EXECUTABLE") or "").strip():
                edge = probe_edge()
                if edge.get("available") is True and isinstance(edge.get("path"), str) and edge["path"]:
                    child_env = dict(os.environ)
                    child_env["HTML_INDESIGN_BROWSER_EXECUTABLE"] = edge["path"]
                    self._cached_child_env = child_env
        return self._cached_child_env

    def _collect_stderr(self) -> str:
        with self._stderr_lock:
            return "".join(self._stderr_chunks)

    def _ensure_session_process(self) -> subprocess.Popen[str]:
        if self._proc is not None and self._proc.poll() is None:
            return self._proc
        self.close()
        popen_kwargs: dict[str, Any] = {}
        child_env = self._resolve_child_env()
        if child_env is not None:
            popen_kwargs["env"] = child_env
        with self._stderr_lock:
            self._stderr_chunks = []
        proc = subprocess.Popen(
            [self.node_executable, str(self.record.entry_path), "--stdio-session"],
            cwd=self.record.root,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
            **popen_kwargs,
        )
        stdout_q: queue.Queue[str | None] = queue.Queue()

        def _read_stdout() -> None:
            assert proc.stdout is not None
            try:
                for line in proc.stdout:
                    stdout_q.put(line)
            except (OSError, ValueError):
                pass
            finally:
                stdout_q.put(None)

        def _read_stderr() -> None:
            assert proc.stderr is not None
            decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
            try:
                fd = proc.stderr.fileno()
                while True:
                    raw_chunk = os.read(fd, 4096)
                    if not raw_chunk:
                        break
                    chunk = decoder.decode(raw_chunk, final=False)
                    if chunk:
                        with self._stderr_lock:
                            self._stderr_chunks.append(chunk)
                            if len(self._stderr_chunks) > 32:
                                joined = "".join(self._stderr_chunks)[-8192:]
                                self._stderr_chunks = [joined]
                tail = decoder.decode(b"", final=True)
                if tail:
                    with self._stderr_lock:
                        self._stderr_chunks.append(tail)
            except (OSError, ValueError):
                pass

        stdout_thread = threading.Thread(target=_read_stdout, name="indesign-cli-plugin-stdout", daemon=True)
        stderr_thread = threading.Thread(target=_read_stderr, name="indesign-cli-plugin-stderr", daemon=True)
        stdout_thread.start()
        stderr_thread.start()
        self._proc = proc
        self._stdout_queue = stdout_q
        self._stdout_thread = stdout_thread
        self._stderr_thread = stderr_thread
        return proc

    def _raise_session_timeout(self, method: str) -> None:
        # Force-terminate and drain stderr first so blocked stdin writers unblock and stderr_tail is complete.
        self.close(force=True)
        stderr_text = self._collect_stderr()
        raise CliError(
            "Plugin timed out",
            code="TIMEOUT",
            retryable=True,
            details={
                "plugin": self.record.id,
                "method": method,
                "timeout_seconds": self.timeout,
                "stderr_tail": _stderr_tail(stderr_text),
            },
            state_uncertain=True,
            next_action="Run `indesign-cli session doctor` before retrying plugin host actions.",
        )

    def _request_in_session(self, method: str, payload: dict[str, Any]) -> dict[str, Any]:
        proc = self._ensure_session_process()
        assert proc.stdin is not None
        assert self._stdout_queue is not None
        deadline = time.monotonic() + float(self.timeout)
        encoded_line = json.dumps(payload, ensure_ascii=False) + "\n"
        write_error: list[BaseException] = []

        def _write_stdin() -> None:
            try:
                assert proc.stdin is not None
                proc.stdin.write(encoded_line)
                proc.stdin.flush()
            except (OSError, ValueError) as exc:
                write_error.append(exc)

        writer = threading.Thread(target=_write_stdin, name="indesign-cli-plugin-stdin", daemon=True)
        writer.start()
        remaining = max(0.001, deadline - time.monotonic())
        writer.join(timeout=remaining)
        if writer.is_alive():
            self._raise_session_timeout(method)
        if write_error:
            exc = write_error[0]
            returncode = proc.poll()
            self.close()
            stderr_text = self._collect_stderr()
            raise CliError(
                "Plugin process failed",
                code="PLUGIN_CALL_FAILED",
                details={
                    "plugin": self.record.id,
                    "method": method,
                    "returncode": returncode,
                    "stderr": stderr_text[-1000:] or str(exc),
                },
            ) from exc

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            self._raise_session_timeout(method)
        try:
            raw_line = self._stdout_queue.get(timeout=remaining)
        except queue.Empty:
            self._raise_session_timeout(method)

        if raw_line is None:
            try:
                returncode = proc.wait(timeout=1.0)
            except subprocess.TimeoutExpired:
                returncode = proc.poll()
            self.close()
            stderr_text = self._collect_stderr()
            if returncode not in (None, 0):
                raise CliError(
                    "Plugin process failed",
                    code="PLUGIN_CALL_FAILED",
                    details={"plugin": self.record.id, "method": method, "returncode": returncode, "stderr": stderr_text[-1000:]},
                )
            raise CliError(
                "Plugin stdout must be a single JSON response",
                code="PLUGIN_STDOUT_INVALID",
                details={"plugin": self.record.id, "method": method, "stdout_prefix": ""},
            )

        return self._parse_response(raw_line, method)

    def _parse_response(self, raw_stdout: str, method: str) -> dict[str, Any]:
        try:
            response = json.loads(raw_stdout)
        except json.JSONDecodeError as exc:
            raise CliError(
                "Plugin stdout must be a single JSON response",
                code="PLUGIN_STDOUT_INVALID",
                details={"plugin": self.record.id, "method": method, "stdout_prefix": raw_stdout[:200]},
            ) from exc
        if not isinstance(response, dict):
            raise CliError("Plugin response must be an object", code="PLUGIN_RESPONSE_INVALID", details={"plugin": self.record.id, "method": method})
        if response.get("error"):
            error = response["error"]
            if not isinstance(error, dict):
                raise CliError("Plugin error must be an object", code="PLUGIN_RESPONSE_INVALID", details={"plugin": self.record.id, "method": method})
            details = error.get("details") if isinstance(error.get("details"), dict) else {}
            # hint/retryable 顶层优先；插件把它们冗余复制进 details 时（compile-instructions.js 模式）也要取到。
            hint = self._first_hint(error.get("hint"), details.get("hint"))
            retryable = error.get("retryable")
            if retryable is None:
                retryable = details.get("retryable")
            raise CliError(
                str(error.get("message") or "Plugin error"),
                code=str(error.get("code") or "PLUGIN_ERROR"),
                details=details,
                hint=hint,
                retryable=bool(retryable),
            )
        result = response.get("result")
        if not isinstance(result, dict):
            raise CliError("Plugin result must be an object", code="PLUGIN_RESPONSE_INVALID", details={"plugin": self.record.id, "method": method})
        return result

    def request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = {
            "jsonrpc": "2.0",
            "id": uuid.uuid4().hex[:12],
            "method": method,
            "params": params or {},
        }
        if self._session_depth > 0 and self.supports_stdio_session:
            return self._request_in_session(method, payload)
        run_kwargs: dict[str, Any] = {}
        child_env = self._resolve_child_env()
        if child_env is not None:
            run_kwargs["env"] = child_env
        try:
            completed = self.runner(
                [self.node_executable, str(self.record.entry_path)],
                cwd=self.record.root,
                input=json.dumps(payload, ensure_ascii=False),
                text=True,
                encoding="utf-8",
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=self.timeout,
                check=False,
                **run_kwargs,
            )
        except subprocess.TimeoutExpired as exc:
            # 超时最需要证据：TimeoutExpired 自带已捕获的 stderr，别丢。
            raise CliError(
                "Plugin timed out",
                code="TIMEOUT",
                retryable=True,
                details={
                    "plugin": self.record.id,
                    "method": method,
                    "timeout_seconds": self.timeout,
                    "stderr_tail": _stderr_tail(exc.stderr),
                },
                state_uncertain=True,
                next_action="Run `indesign-cli session doctor` before retrying plugin host actions.",
            ) from exc

        if completed.returncode != 0:
            raise CliError(
                "Plugin process failed",
                code="PLUGIN_CALL_FAILED",
                details={"plugin": self.record.id, "method": method, "returncode": completed.returncode, "stderr": completed.stderr[-1000:]},
            )
        return self._parse_response(completed.stdout, method)

    @staticmethod
    def _first_hint(*candidates: Any) -> str | None:
        for candidate in candidates:
            if isinstance(candidate, str) and candidate.strip():
                return candidate
        return None

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
