from __future__ import annotations

import json
from json import JSONDecodeError
from pathlib import Path
from typing import Any

from .envelope import now_ms
from .errors import CliError
from .router import Router


def load_json_object(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError as exc:
        raise CliError("Batch plan not found", code="BATCH_PLAN_NOT_FOUND", details={"path": str(path)}) from exc
    except JSONDecodeError as exc:
        raise CliError("Batch plan must be valid JSON", code="BATCH_PLAN_JSON_INVALID", details={"path": str(path)}) from exc
    if not isinstance(payload, dict):
        raise CliError("Batch plan must be a JSON object", code="BATCH_PLAN_INVALID")
    return payload


def run_batch(router: Router, plan_path: Path, *, on_error: str = "stop") -> dict[str, Any]:
    if on_error != "stop":
        raise CliError("Only on_error=stop is supported", code="BATCH_ON_ERROR_UNSUPPORTED", details={"on_error": on_error})
    payload = load_json_object(plan_path)
    steps = payload.get("steps")
    if not isinstance(steps, list):
        raise CliError("Batch plan steps must be a list", code="BATCH_PLAN_INVALID")

    results: list[dict[str, Any]] = []
    for index, step in enumerate(steps):
        if not isinstance(step, dict):
            raise CliError("Batch step must be an object", code="BATCH_STEP_INVALID", details={"index": index})
        step_id = step.get("id")
        step_type = step.get("type")
        tool_id = step.get("tool")
        args = step.get("args")
        if not isinstance(step_id, str) or not step_id:
            raise CliError("Batch step id is required", code="BATCH_STEP_INVALID", details={"index": index})
        if step_type != "tool":
            raise CliError("Batch step type must be tool", code="BATCH_STEP_INVALID", details={"id": step_id})
        if not isinstance(tool_id, str) or not tool_id:
            raise CliError("Batch step tool is required", code="BATCH_STEP_INVALID", details={"id": step_id})
        if not isinstance(args, dict):
            raise CliError("Batch step args must be an object", code="BATCH_STEP_INVALID", details={"id": step_id})

        started = now_ms()
        try:
            data = router.call(tool_id, args)
        except CliError as exc:
            results.append(
                {
                    "id": step_id,
                    "tool": tool_id,
                    "ok": False,
                    "code": exc.code,
                    "message": exc.message,
                    "duration_ms": max(1, now_ms() - started),
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
        results.append(
            {
                "id": step_id,
                "tool": tool_id,
                "ok": True,
                "duration_ms": max(1, now_ms() - started),
                "data": data,
            }
        )

    return {
        "failed_step": None,
        "steps": results,
        "state_uncertain": False,
        "cleanup_suggestions": [],
    }
