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


def _build(*, metrics: dict[str, object], ok: bool = True) -> dict[str, object]:
    event = _call("html.build_indesign", ok=ok, error_code=None if ok else "FIDELITY_GATE_FAILED")
    event["plugin_metrics"] = metrics
    return event


def test_plugin_metrics_summary_separates_gated_and_draft_builds_and_totals_grid_counts() -> None:
    calls = [
        _build(metrics={"fidelity_gate_ms": 20, "fidelity_error_count": 2, "grid_ignored_count": 40, "grid_off_count": 3}, ok=False),
        _build(metrics={"fidelity_gate_ms": 18, "fidelity_error_count": 0, "grid_ignored_count": 40, "grid_off_count": 0}),
        _build(metrics={"verify_ms": 300, "grid_ignored_count": 7}),
        _call("html.authoring_lint", ok=False, error_code="AUTHORING_LINT_FAILED"),
    ]
    calls[-1]["plugin_metrics"] = {"grid_ignored_count": 5, "grid_off_count": 12, "grid_block_checked_count": 15}

    result = aggregate_module.plugin_metrics_summary(calls)

    assert result == {
        "build_calls": 3,
        "gated_builds": 2,
        "gated_builds_fidelity_failed": 1,
        "gated_fidelity_failure_rate": 0.5,
        "draft_builds": 1,
        "grid_ignored_count": {"calls": 4, "sum": 92, "max": 40},
        "grid_off_count": {"calls": 3, "sum": 15, "max": 12},
        "grid_block_checked_count": {"calls": 1, "sum": 15, "max": 15},
        "grid_checked_count": {"calls": 0, "sum": 0, "max": 0},
    }


def test_plugin_metrics_summary_is_all_zero_without_metrics() -> None:
    result = aggregate_module.plugin_metrics_summary([_call("export.verify")])

    assert result["build_calls"] == 0
    assert result["gated_fidelity_failure_rate"] == 0.0
    assert result["grid_ignored_count"] == {"calls": 0, "sum": 0, "max": 0}
