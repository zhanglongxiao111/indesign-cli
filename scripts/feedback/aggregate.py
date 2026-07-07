from __future__ import annotations

import argparse
import difflib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
HARNESS_ROOT = REPO_ROOT / "agent-harness"
sys.path.insert(0, str(HARNESS_ROOT))

from cli_anything.indesign.core.telemetry import ALLOWED_FIELDS  # noqa: E402


def find_jsonl_files(input_path: Path) -> list[Path]:
    if (input_path / "sessions").is_dir():
        root = input_path / "sessions"
    else:
        root = input_path
    return sorted(path for path in root.rglob("*.jsonl") if path.is_file())


def load_events(input_path: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    events: list[dict[str, Any]] = []
    unknown_fields: Counter[str] = Counter()
    bad_lines = 0
    order = 0
    files = find_jsonl_files(input_path)
    for path in files:
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except OSError:
            bad_lines += 1
            continue
        for line in lines:
            if not line.strip():
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                bad_lines += 1
                continue
            if not isinstance(payload, dict):
                bad_lines += 1
                continue
            for key in sorted(set(payload) - ALLOWED_FIELDS):
                unknown_fields[key] += 1
            event = {key: payload[key] for key in payload if key in ALLOWED_FIELDS}
            event["_order"] = order
            order += 1
            events.append(event)
    stats = {
        "files": len(files),
        "events": len(events),
        "bad_lines": bad_lines,
        "unknown_fields": dict(sorted(unknown_fields.items())),
    }
    return events, stats


def event_sort_key(event: dict[str, Any]) -> tuple[str, int]:
    return str(event.get("ts") or ""), int(event.get("_order") or 0)


def grouped_sessions(events: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    sessions: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        session_id = event.get("session_id")
        if isinstance(session_id, str) and session_id:
            sessions[session_id].append(event)
    return {session_id: sorted(items, key=event_sort_key) for session_id, items in sorted(sessions.items())}


def tool_calls(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [event for event in events if event.get("event") == "tool_call"]


def feedback_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [event for event in events if event.get("event") == "feedback"]


def rate(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return round(numerator / denominator, 4)


def call_distribution(values: list[int]) -> dict[str, Any]:
    if not values:
        return {"min": 0, "max": 0, "avg": 0.0}
    return {
        "min": min(values),
        "max": max(values),
        "avg": round(sum(values) / len(values), 4),
    }


def version_for_session(events: list[dict[str, Any]]) -> str:
    for event in events:
        version = event.get("cli_version")
        if isinstance(version, str) and version:
            return version
    return "unknown"


def by_cli_version(sessions: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    version_sessions: dict[str, list[list[dict[str, Any]]]] = defaultdict(list)
    for events in sessions.values():
        version_sessions[version_for_session(events)].append(events)

    result: dict[str, Any] = {}
    for version, items in sorted(version_sessions.items()):
        sessions_with_calls = [tool_calls(events) for events in items if tool_calls(events)]
        denominator = len(sessions_with_calls)
        first_success = sum(1 for calls in sessions_with_calls if calls[0].get("ok") is True)
        tail_success = sum(1 for calls in sessions_with_calls if calls[-1].get("ok") is True)
        escape_sessions = sum(1 for calls in sessions_with_calls if any(call.get("tool_id") == "script.run" for call in calls))
        call_counts = [len(calls) for calls in sessions_with_calls]
        result[version] = {
            "sessions": len(items),
            "tool_calls": sum(call_counts),
            "escape_hatch_sessions": escape_sessions,
            "escape_hatch_rate": rate(escape_sessions, denominator),
            "first_success_rate": rate(first_success, denominator),
            "session_tail_success_rate": rate(tail_success, denominator),
            "calls_per_session": call_distribution(call_counts),
        }
    return result


def error_code_by_tool(calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counter: Counter[tuple[str, str]] = Counter()
    for call in calls:
        if call.get("ok") is False:
            error_code = str(call.get("error_code") or "UNSTRUCTURED")
            tool_id = str(call.get("tool_id") or "unknown")
            counter[(error_code, tool_id)] += 1
    return [
        {"error_code": error_code, "tool_id": tool_id, "count": count}
        for (error_code, tool_id), count in sorted(counter.items(), key=lambda item: (-item[1], item[0][0], item[0][1]))
    ]


def retry_rate_by_tool(sessions: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    failures: Counter[str] = Counter()
    retries: Counter[str] = Counter()
    for events in sessions.values():
        previous: dict[str, Any] | None = None
        for call in tool_calls(events):
            tool_id = str(call.get("tool_id") or "unknown")
            if call.get("ok") is False:
                failures[tool_id] += 1
            if previous and previous.get("ok") is False and previous.get("tool_id") == call.get("tool_id"):
                retries[tool_id] += 1
            previous = call
    rows = []
    for tool_id in sorted(failures):
        rows.append(
            {
                "tool_id": tool_id,
                "failures": failures[tool_id],
                "retries": retries[tool_id],
                "retry_rate": rate(retries[tool_id], failures[tool_id]),
            }
        )
    return sorted(rows, key=lambda row: (-row["retry_rate"], row["tool_id"]))


def escape_hatch_precursors(sessions: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    counter: Counter[tuple[str, str]] = Counter()
    for events in sessions.values():
        calls = tool_calls(events)
        for index, call in enumerate(calls):
            if call.get("tool_id") != "script.run":
                continue
            for previous in calls[:index]:
                if previous.get("ok") is False and previous.get("tool_id") != "script.run":
                    tool_id = str(previous.get("tool_id") or "unknown")
                    error_code = str(previous.get("error_code") or "UNSTRUCTURED")
                    counter[(tool_id, error_code)] += 1
    return [
        {"tool_id": tool_id, "error_code": error_code, "count": count}
        for (tool_id, error_code), count in sorted(counter.items(), key=lambda item: (-item[1], item[0][0], item[0][1]))
    ]


def feedback_by_code(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: Counter[str] = Counter()
    tools: dict[str, set[str]] = defaultdict(set)
    for event in feedback_events(events):
        code = str(event.get("code") or "UNKNOWN")
        counts[code] += 1
        tool_id = event.get("tool_id")
        if isinstance(tool_id, str) and tool_id:
            tools[code].add(tool_id)
    return [
        {"code": code, "count": counts[code], "tools": sorted(tools[code])}
        for code in sorted(counts)
    ]


def distribution(events: list[dict[str, Any]], sessions: dict[str, list[dict[str, Any]]], field: str) -> list[dict[str, Any]]:
    event_counts: Counter[str] = Counter()
    session_keys: dict[str, set[str]] = defaultdict(set)
    for event in events:
        value = event.get(field)
        session_id = event.get("session_id")
        if isinstance(value, str) and value:
            event_counts[value] += 1
            if isinstance(session_id, str) and session_id:
                session_keys[value].add(session_id)
    rows = []
    for value in sorted(event_counts):
        rows.append({field: value, "sessions": len(session_keys[value]), "events": event_counts[value]})
    return sorted(rows, key=lambda row: (-row["sessions"], -row["events"], row[field]))


def aggregate(input_path: Path) -> dict[str, Any]:
    events, input_stats = load_events(input_path)
    sessions = grouped_sessions(events)
    calls = tool_calls(events)
    return {
        "schema_version": 1,
        "input": input_stats,
        "totals": {
            "sessions": len(sessions),
            "tool_calls": len(calls),
            "feedback": len(feedback_events(events)),
            "errors": sum(1 for call in calls if call.get("ok") is False),
            "script_run": sum(1 for call in calls if call.get("tool_id") == "script.run"),
        },
        "by_cli_version": by_cli_version(sessions),
        "friction": {
            "error_code_by_tool": error_code_by_tool(calls),
            "retry_rate_by_tool": retry_rate_by_tool(sessions),
            "escape_hatch_precursors": escape_hatch_precursors(sessions),
            "feedback_by_code": feedback_by_code(events),
        },
        "origin_distribution": distribution(events, sessions, "origin_key"),
        "cwd_distribution": distribution(events, sessions, "cwd_hash"),
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def compare_golden(actual: dict[str, Any], expected_path: Path) -> bool:
    expected = json.loads(expected_path.read_text(encoding="utf-8"))
    if actual == expected:
        return True
    actual_text = json.dumps(actual, ensure_ascii=False, indent=2, sort_keys=True).splitlines()
    expected_text = json.dumps(expected, ensure_ascii=False, indent=2, sort_keys=True).splitlines()
    diff = "\n".join(difflib.unified_diff(expected_text, actual_text, fromfile="expected", tofile="actual", lineterm=""))
    print(diff, file=sys.stderr)
    return False


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Aggregate indesign-cli feedback telemetry JSONL files.")
    parser.add_argument("--input", required=True, help="Telemetry root, sessions directory, or fixture directory")
    parser.add_argument("--output", help="Write aggregate JSON to this path")
    parser.add_argument("--check-golden", help="Compare aggregate output with a golden JSON file")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    payload = aggregate(Path(args.input))
    if args.output:
        write_json(Path(args.output), payload)
    if args.check_golden:
        if not compare_golden(payload, Path(args.check_golden)):
            return 1
        print("golden ok")
    elif not args.output:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
