from __future__ import annotations

import json
from json import JSONDecodeError
from pathlib import Path
from typing import Any

from .envelope import now_ms
from .errors import CliError
from .router import Router
from .telemetry import record_tool_call

STEP_TEMPLATE = {"id": "step-1", "type": "tool", "tool": "<tool_id>", "args": {}}
PLAN_TEMPLATE = {"steps": [STEP_TEMPLATE]}
PLAN_HINT = f"batch plan 是 JSON 文件，最小格式：{json.dumps(PLAN_TEMPLATE, ensure_ascii=False)}"


def _step_error(message: str, details: dict[str, Any]) -> CliError:
    return CliError(
        message,
        code="BATCH_STEP_INVALID",
        details={**details, "expected_step": STEP_TEMPLATE},
        hint=PLAN_HINT,
    )


def load_json_object(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError as exc:
        raise CliError("Batch plan not found", code="BATCH_PLAN_NOT_FOUND", details={"path": str(path)}, hint=PLAN_HINT) from exc
    except JSONDecodeError as exc:
        raise CliError("Batch plan must be valid JSON", code="BATCH_PLAN_JSON_INVALID", details={"path": str(path)}, hint=PLAN_HINT) from exc
    if not isinstance(payload, dict):
        raise CliError("Batch plan must be a JSON object", code="BATCH_PLAN_INVALID", hint=PLAN_HINT)
    return payload


def run_batch(router: Router, plan_path: Path, *, on_error: str = "stop") -> dict[str, Any]:
    if on_error != "stop":
        raise CliError("Only on_error=stop is supported", code="BATCH_ON_ERROR_UNSUPPORTED", details={"on_error": on_error})
    payload = load_json_object(plan_path)
    steps = payload.get("steps")
    if not isinstance(steps, list):
        raise CliError("Batch plan steps must be a list", code="BATCH_PLAN_INVALID", hint=PLAN_HINT)

    results: list[dict[str, Any]] = []
    for index, step in enumerate(steps):
        if not isinstance(step, dict):
            raise _step_error("Batch step must be an object", {"index": index})
        step_id = step.get("id")
        step_type = step.get("type")
        tool_id = step.get("tool")
        args = step.get("args")
        if not isinstance(step_id, str) or not step_id:
            raise _step_error("Batch step id is required", {"index": index})
        if step_type != "tool":
            raise _step_error("Batch step type must be tool", {"id": step_id})
        if not isinstance(tool_id, str) or not tool_id:
            raise _step_error("Batch step tool is required", {"id": step_id})
        if not isinstance(args, dict):
            raise _step_error("Batch step args must be an object", {"id": step_id})

        started = now_ms()
        tool_meta: dict[str, Any] | None = None
        try:
            tool_meta = router._find(tool_id)
            data = router.call(tool_id, args)
        except CliError as exc:
            duration_ms = max(1, now_ms() - started)
            record_tool_call(
                tool_id=tool_id,
                source=str(tool_meta.get("source")) if tool_meta else None,
                ok=False,
                duration_ms=duration_ms,
                error_code=exc.code,
                arg_keys=list(args),
                via_batch=True,
            )
            results.append(
                {
                    "id": step_id,
                    "tool": tool_id,
                    "ok": False,
                    "code": exc.code,
                    "message": exc.message,
                    "duration_ms": duration_ms,
                }
            )
            raise CliError(
                f"Batch failed at step {step_id}",
                code="BATCH_STEP_FAILED",
                details={
                    "failed_step": step_id,
                    "steps": results,
                    "state_uncertain": True,
                    "cleanup_suggestions": ["Inspect session doctor before retrying mutating steps."],
                },
                state_uncertain=True,
                next_action="Run `indesign-cli session doctor` before retrying mutating steps.",
            ) from exc
        duration_ms = max(1, now_ms() - started)
        record_tool_call(
            tool_id=tool_id,
            source=str(tool_meta.get("source")) if tool_meta else None,
            ok=True,
            duration_ms=duration_ms,
            arg_keys=list(args),
            via_batch=True,
        )
        results.append(
            {
                "id": step_id,
                "tool": tool_id,
                "ok": True,
                "duration_ms": duration_ms,
                "data": data,
            }
        )

    return {
        "failed_step": None,
        "steps": results,
        "state_uncertain": False,
        "cleanup_suggestions": [],
    }
