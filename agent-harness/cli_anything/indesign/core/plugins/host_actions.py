from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Callable

from ..errors import CliError


ALLOWED_HOST_ACTIONS = {"script.run", "export.verify", "session.show"}

# 整个插件工具调用（含全部 resume 轮次与 host action）的墙钟预算。
# 各轮次的进程超时按每次请求重置，没有这个总闸门时，NAS 慢 I/O 可以把一次调用拖到 30 分钟。
DEFAULT_TOTAL_DEADLINE_SECONDS = 600

_SCRIPT_RUN_DEFAULT_TIMEOUT_SECONDS = 300


def _validate_script_path(path_value: str, cwd: Path) -> None:
    script_path = Path(path_value).resolve()
    cwd_root = cwd.resolve()
    try:
        script_path.relative_to(cwd_root)
    except ValueError as exc:
        raise CliError(
            "Plugin script.run host action must stay inside the current project",
            code="PLUGIN_HOST_ACTION_DENIED",
            details={"path": str(script_path)},
        ) from exc


class HostActionExecutor:
    def __init__(
        self,
        router: Any,
        cwd: Path,
        *,
        max_resume_rounds: int = 4,
        total_deadline_seconds: int = DEFAULT_TOTAL_DEADLINE_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.router = router
        self.cwd = cwd
        self.max_resume_rounds = max_resume_rounds
        self.total_deadline_seconds = total_deadline_seconds
        self._clock = clock

    def complete(self, backend: Any, tool_id: str, initial: dict[str, Any]) -> dict[str, Any]:
        started = self._clock()
        base_backend_timeout = getattr(backend, "timeout", None)
        current = initial
        failed_results: list[dict[str, Any]] = []
        try:
            for _round in range(self.max_resume_rounds + 1):
                if current.get("status") != "requires_host_actions":
                    if (
                        failed_results
                        and current.get("status") != "error"
                        and current.get("data", {}).get("ok") is not False
                    ):
                        raise CliError(
                            "Plugin host action failed",
                            code="PLUGIN_HOST_ACTION_FAILED",
                            details={"tool_id": tool_id, "host_results": failed_results, "plugin_result": current},
                        )
                    return current
                actions = current.get("actions")
                if not isinstance(actions, list):
                    raise CliError("Plugin host actions must be an array", code="PLUGIN_HOST_ACTION_INVALID")
                host_results: list[dict[str, Any]] = []
                for action in actions:
                    if not isinstance(action, dict):
                        continue
                    result = self._execute_action(action, self._remaining_seconds(started, tool_id))
                    host_results.append(result)
                    if _host_result_failed(result):
                        break
                failed_results.extend(result for result in host_results if _host_result_failed(result))
                remaining = self._remaining_seconds(started, tool_id)
                if isinstance(base_backend_timeout, int):
                    backend.timeout = max(1, min(base_backend_timeout, int(remaining)))
                current = backend.resume_tool(tool_id, current.get("state") if isinstance(current.get("state"), dict) else {}, host_results)
        finally:
            if isinstance(base_backend_timeout, int):
                backend.timeout = base_backend_timeout
        raise CliError("Plugin exceeded host action resume limit", code="PLUGIN_HOST_ACTION_LIMIT_EXCEEDED", details={"tool_id": tool_id})

    def _remaining_seconds(self, started: float, tool_id: str) -> float:
        elapsed = self._clock() - started
        remaining = self.total_deadline_seconds - elapsed
        if remaining <= 0:
            raise CliError(
                "Plugin tool exceeded its total time budget",
                code="TIMEOUT",
                retryable=False,
                state_uncertain=True,
                details={
                    "tool_id": tool_id,
                    "reason": "total_deadline_exceeded",
                    "total_deadline_seconds": self.total_deadline_seconds,
                    "elapsed_seconds": round(elapsed, 1),
                },
                next_action="Run `indesign-cli session doctor`, then retry with a smaller task or a larger --timeout.",
            )
        return remaining

    def _execute_action(self, action: dict[str, Any], remaining_seconds: float) -> dict[str, Any]:
        action_id = str(action.get("id") or "")
        host_tool_id = str(action.get("tool_id") or "")
        args = action.get("args") if isinstance(action.get("args"), dict) else {}
        if host_tool_id not in ALLOWED_HOST_ACTIONS:
            return {
                "id": action_id,
                "tool_id": host_tool_id,
                "ok": False,
                "error": {
                    "code": "PLUGIN_HOST_ACTION_DENIED",
                    "message": f"Host action is not allowed: {host_tool_id}",
                },
            }
        try:
            if host_tool_id == "script.run":
                if args.get("file"):
                    _validate_script_path(str(args["file"]), self.cwd)
                args = _clamp_script_timeout(args, remaining_seconds)
            data = self.router.call(host_tool_id, args)
        except CliError as exc:
            return {
                "id": action_id,
                "tool_id": host_tool_id,
                "ok": False,
                "error": {"code": exc.code, "message": exc.message, "details": exc.details},
            }
        return {"id": action_id, "tool_id": host_tool_id, "ok": True, "data": data}


def _clamp_script_timeout(args: dict[str, Any], remaining_seconds: float) -> dict[str, Any]:
    try:
        if args.get("timeout_ms") is not None:
            requested = max(1, int((int(args["timeout_ms"]) + 999) / 1000))
        elif args.get("timeout") is not None:
            requested = int(args["timeout"])
        else:
            requested = _SCRIPT_RUN_DEFAULT_TIMEOUT_SECONDS
    except (TypeError, ValueError):
        return args
    limit = max(1, int(remaining_seconds))
    if requested <= limit:
        return args
    clamped = dict(args)
    clamped.pop("timeout_ms", None)
    clamped["timeout"] = limit
    return clamped


def _host_result_failed(result: dict[str, Any]) -> bool:
    if result.get("ok") is False:
        return True
    data = result.get("data")
    return isinstance(data, dict) and data.get("ok") is False
