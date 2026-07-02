from __future__ import annotations

import time
import uuid
from typing import Any

from .errors import CliError


def request_id() -> str:
    return uuid.uuid4().hex[:16]


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
            "details": error.details,
            "retryable": error.retryable,
            "hint": error.hint,
        },
        "warnings": [],
    }


def now_ms() -> int:
    return int(time.perf_counter() * 1000)
