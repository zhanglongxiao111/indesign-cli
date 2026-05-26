from __future__ import annotations

from pathlib import Path
from typing import Any

from ..errors import CliError


ALLOWED_HOST_ACTIONS = {"script.run", "export.verify", "session.show"}


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
    def __init__(self, router: Any, cwd: Path, *, max_resume_rounds: int = 3) -> None:
        self.router = router
        self.cwd = cwd
        self.max_resume_rounds = max_resume_rounds

    def complete(self, backend: Any, tool_id: str, initial: dict[str, Any]) -> dict[str, Any]:
        current = initial
        failed_results: list[dict[str, Any]] = []
        for _round in range(self.max_resume_rounds + 1):
            if current.get("status") != "requires_host_actions":
                if failed_results and current.get("data", {}).get("ok") is not False:
                    raise CliError(
                        "Plugin host action failed",
                        code="PLUGIN_HOST_ACTION_FAILED",
                        details={"tool_id": tool_id, "host_results": failed_results, "plugin_result": current},
                    )
                return current
            actions = current.get("actions")
            if not isinstance(actions, list):
                raise CliError("Plugin host actions must be an array", code="PLUGIN_HOST_ACTION_INVALID")
            host_results = [self._execute_action(action) for action in actions if isinstance(action, dict)]
            failed_results.extend(result for result in host_results if result.get("ok") is False)
            current = backend.resume_tool(tool_id, current.get("state") if isinstance(current.get("state"), dict) else {}, host_results)
        raise CliError("Plugin exceeded host action resume limit", code="PLUGIN_HOST_ACTION_LIMIT_EXCEEDED", details={"tool_id": tool_id})

    def _execute_action(self, action: dict[str, Any]) -> dict[str, Any]:
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
            if host_tool_id == "script.run" and args.get("file"):
                _validate_script_path(str(args["file"]), self.cwd)
            data = self.router.call(host_tool_id, args)
        except CliError as exc:
            return {
                "id": action_id,
                "tool_id": host_tool_id,
                "ok": False,
                "error": {"code": exc.code, "message": exc.message, "details": exc.details},
            }
        return {"id": action_id, "tool_id": host_tool_id, "ok": True, "data": data}
