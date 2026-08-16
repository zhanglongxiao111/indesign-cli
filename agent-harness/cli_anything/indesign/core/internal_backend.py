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


# JS 侧失败固定给出 success:false + code + 真实错误文本（src/utils/stringUtils.js），
# 并按需附带这些定位字段；宿主必须原样上浮，不得替换成笼统的 INTERNAL_TOOL_FAILED。
_SCRIPT_DIAGNOSTIC_KEYS = ("step", "errorName", "errorNumber", "line", "fileName")

# 设计原则：hint 为 null 视为缺陷。把 code 与真实文本救回来之后，还得告诉
# Agent 下一步该干什么——否则这 30 个工具只是从"不知道错在哪"变成
# "知道错在哪但不知道怎么办"。
_SCRIPT_FAILURE_DEFAULT_HINT = (
    "先看 error.details 里的 step/line/fileName 定位；确认 InDesign 侧状态用 "
    "`indesign-cli session doctor`。同样的输入不要直接重试。"
)
_SCRIPT_FAILURE_HINTS = {
    "NO_ACTIVE_DOCUMENT": "该工具需要已打开的文档：先用 document 域的工具打开或新建，再重试。",
    "INDESIGN_SCRIPT_FAILED": (
        "InDesign 脚本内部抛错。看 error.details 的 errorName/line 定位到脚本位置；"
        "属工具缺陷时用 `indesign-cli feedback report` 上报，不要反复重试。"
    ),
}


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
        if isinstance(result, dict) and self._is_script_failure(result):
            raise self._script_failure(tool["id"], result)
        return result

    @staticmethod
    def _is_script_failure(result: dict[str, Any]) -> bool:
        """`success is False` 是主判据；`Error:` 前缀是兜底。

        JS 侧 `formatScriptResult` 在解析出的 JSON 缺 `success` 键时默认置 true
        （src/utils/stringUtils.js:77），而错误文本仍可能是 `Error: ...`
        （src/core/mcpServer.js:45）。只认 `success` 会把这种载荷当成功返回，
        属于静默错位——比报错更难发现。
        """
        if result.get("success") is False:
            return True
        text = result.get("result")
        return isinstance(text, str) and text.lstrip().startswith("Error:")

    @staticmethod
    def _script_failure(tool_id: str, result: dict[str, Any]) -> CliError:
        details: dict[str, Any] = {"tool": tool_id, "operation": result.get("operation")}
        for key in _SCRIPT_DIAGNOSTIC_KEYS:
            value = result.get(key)
            if value is None or value == "":
                continue
            details[key] = scrub_text_paths(value) if isinstance(value, str) else value

        code = result.get("code")
        message = next(
            (
                value.strip()
                for value in (result.get("result"), result.get("message"), result.get("error"))
                if isinstance(value, str) and value.strip()
            ),
            None,
        )
        resolved_code = code.strip() if isinstance(code, str) and code.strip() else "INTERNAL_TOOL_FAILED"
        return CliError(
            scrub_text_paths(message) if message else "Internal tool failed",
            code=resolved_code,
            details=details,
            hint=_SCRIPT_FAILURE_HINTS.get(resolved_code, _SCRIPT_FAILURE_DEFAULT_HINT),
        )

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
