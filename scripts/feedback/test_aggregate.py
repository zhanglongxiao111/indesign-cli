from __future__ import annotations

import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("aggregate.py")
SPEC = importlib.util.spec_from_file_location("feedback_aggregate", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
aggregate_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(aggregate_module)


def _call(
    tool_id: str,
    *,
    version: str = "0.5.0",
    ok: bool = True,
    error_code: str | None = None,
) -> dict[str, object]:
    event: dict[str, object] = {
        "event": "tool_call",
        "tool_id": tool_id,
        "cli_version": version,
        "ok": ok,
    }
    if error_code:
        event["error_code"] = error_code
    return event


def test_version_summary_uses_each_events_own_version() -> None:
    sessions = {
        "cross-version": [
            _call("document.create_document", version="0.5.0"),
            _call("export.verify", version="0.5.3"),
        ]
    }

    result = aggregate_module.by_cli_version(sessions)

    assert result["0.5.0"]["events"] == 1
    assert result["0.5.0"]["tool_calls"] == 1
    assert result["0.5.3"]["events"] == 1
    assert result["0.5.3"]["tool_calls"] == 1


def test_script_run_summary_does_not_claim_unproven_failure_causality() -> None:
    sessions = {
        "same-session": [
            _call("graphics.place_image", ok=False, error_code="MCP_TOOL_FAILED"),
            _call("script.run"),
            _call("script.run"),
        ]
    }

    result = aggregate_module.script_run_analysis(sessions)

    assert result == {
        "calls": 2,
        "sessions": 1,
        "causal_status": "not_available",
        "causal_precursors": [],
    }


def test_health_summary_separates_command_result_from_component_health() -> None:
    calls = [
        _call("server.health", ok=True),
        _call("server.health", ok=False, error_code="UNEXPECTED_ERROR"),
        _call("export.verify", ok=True),
    ]

    result = aggregate_module.health_check_summary(calls)

    assert result == {
        "command_calls": 2,
        "command_successes": 1,
        "command_failures": 1,
        "component_health_status": "not_recorded",
    }
