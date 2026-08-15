from __future__ import annotations

import time
import uuid
from typing import Any

from .errors import CliError


def request_id() -> str:
    return uuid.uuid4().hex[:16]


# 故障归因：区分门禁正常拒绝、输入问题、环境问题、程序缺陷和超时。三者需要的下一步完全不同，
# 所以既下发给 Agent（error.category），也进遥测（result_class）。
# 放在 envelope 而非 telemetry：envelope 只依赖 errors，telemetry 反过来引它不成环。
# 未列出的错误码默认归为 runtime_error，宁可保守也不把真缺陷误标成门禁。
_GATE_REJECTION_CODES = {
    "AUTHORING_LINT_FAILED",
    "FIDELITY_GATE_FAILED",
    "REVERSE_AUTHOR_AUDIT_FAILED",
    "OUTPUT_OUTSIDE_PROJECT",
    "PLUGIN_HOST_ACTION_DENIED",
}
_INPUT_ERROR_CODES = {
    "TOOL_NOT_FOUND",
    "MISSING_ARGUMENT",
    "ARGS_REQUIRED",
    "ARGS_UNKNOWN_KEY",
    "ARGS_JSON_INVALID",
    "ARGS_FILE_NOT_FOUND",
    "ARGS_NOT_OBJECT",
    "BAD_TIMEOUT",
    "BAD_TIMESTAMP",
    "SCRIPT_INPUT_REQUIRED",
    "FEEDBACK_CODE_INVALID",
    "FEEDBACK_NOTE_REQUIRED",
    "FEEDBACK_NOTE_TOO_LONG",
    "FEEDBACK_TOOL_INVALID",
    "CLI_PRIMITIVE_ROUTE",
}
_ENVIRONMENT_ERROR_CODES = {
    "INTERNAL_TOOL_START_FAILED",
    "UPDATE_CHECK_FAILED",
    "PLUGIN_RECORD_NOT_FOUND",
    "BACKEND_NOT_SUPPORTED",
    "NPM_NOT_AVAILABLE",
    "NPM_INSTALL_FAILED",
}


def classify_result(ok: bool, error_code: str | None) -> str:
    if ok:
        return "success"
    code = str(error_code or "")
    if code == "TIMEOUT":
        return "timeout"
    if code in _GATE_REJECTION_CODES:
        return "gate_rejection"
    if code in _INPUT_ERROR_CODES:
        return "input_error"
    if code in _ENVIRONMENT_ERROR_CODES:
        return "environment_error"
    return "runtime_error"


# schema_version 2：success/failure 字段集合对称；移除恒为 True 的 mcp_ok/raw_result_type。
def success(
    *,
    command: str,
    data: Any,
    duration_ms: int,
    tool_id: str | None = None,
    domain: str | None = None,
    source: str | None = None,
    backend: str | None = None,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "schema_version": 2,
        "ok": True,
        "exit_code": 0,
        "request_id": request_id(),
        "command": command,
        "tool_id": tool_id,
        "domain": domain,
        "source": source,
        "backend": backend,
        "tool_success": True,
        "duration_ms": duration_ms,
        "state_uncertain": False,
        "next_action": None,
        "data": data,
        "error": None,
        "warnings": warnings or [],
    }


def failure(
    *,
    command: str,
    error: CliError,
    duration_ms: int,
    tool_id: str | None = None,
    domain: str | None = None,
    source: str | None = None,
    data: Any = None,
) -> dict[str, Any]:
    return {
        "schema_version": 2,
        "ok": False,
        "exit_code": 1,
        "request_id": request_id(),
        "command": command,
        "tool_id": tool_id,
        "domain": domain,
        "source": source,
        "backend": None,
        "tool_success": False,
        "duration_ms": duration_ms,
        "state_uncertain": error.state_uncertain,
        "next_action": error.next_action,
        "data": data,
        "error": {
            "type": error.__class__.__name__,
            "code": error.code,
            "message": error.message,
            "category": classify_result(False, error.code),
            "details": error.details,
            "retryable": error.retryable,
            "hint": error.hint,
        },
        "warnings": [],
    }


def now_ms() -> int:
    return int(time.perf_counter() * 1000)
