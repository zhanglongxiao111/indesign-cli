import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
HARNESS_ROOT = REPO_ROOT / "agent-harness"
sys.path.insert(0, str(HARNESS_ROOT))


def run_module(*args: str, cwd: Path = REPO_ROOT, env_overrides: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(HARNESS_ROOT)
    env["PYTHONIOENCODING"] = "utf-8"
    env.pop("INDESIGN_CLI_SESSION_ID", None)
    env.pop("INDESIGN_CLI_AGENT_THREAD_ID", None)
    env.pop("INDESIGN_CLI_AGENT_RUN_ID", None)
    env.pop("INDESIGN_CLI_TELEMETRY", None)
    env.pop("INDESIGN_CLI_TELEMETRY_DIR", None)
    env.pop("INDESIGN_CLI_TELEMETRY_IDLE_HOURS", None)
    if env_overrides:
        env.update(env_overrides)
    return subprocess.run(
        [sys.executable, "-m", "cli_anything.indesign", *args],
        cwd=cwd,
        env=env,
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def read_events(root: Path) -> list[dict]:
    events: list[dict] = []
    for path in sorted((root / "sessions").glob("*/*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                events.append(json.loads(line))
    return events


def telemetry_env(root: Path) -> dict[str, str]:
    return {
        "INDESIGN_CLI_TELEMETRY_DIR": str(root),
        "COMPUTERNAME": "DESIGN-PC-01",
        "USERNAME": "alice",
    }


def test_record_event_filters_fields_and_writes_nas_layout(tmp_path, monkeypatch):
    from cli_anything.indesign.core.telemetry import record_event

    root = tmp_path / "telemetry"
    cwd = tmp_path / "workspace"
    cwd.mkdir()
    monkeypatch.setenv("INDESIGN_CLI_TELEMETRY_DIR", str(root))
    monkeypatch.setenv("COMPUTERNAME", "DESIGN-PC-01")
    monkeypatch.setenv("USERNAME", "alice")

    event = record_event(
        {
            "event": "tool_call",
            "tool_id": "export.verify",
            "source": "cli",
            "ok": True,
            "duration_ms": 3,
            "arg_keys": ["path"],
            "illegal": "drop-me",
        },
        cwd=cwd,
    )

    assert event is not None
    assert event["event"] == "tool_call"
    assert event["tool_id"] == "export.verify"
    assert event["arg_keys"] == ["path"]
    assert "illegal" not in event
    dumped = json.dumps(event, ensure_ascii=False)
    assert str(cwd) not in dumped
    assert "workspace" not in dumped

    session_files = list((root / "sessions").glob("*/*.jsonl"))
    assert len(session_files) == 1
    assert event["origin_key"] in session_files[0].name
    assert event["session_id"] in session_files[0].name
    assert json.loads(session_files[0].read_text(encoding="utf-8"))["origin_key"] == event["origin_key"]

    state_files = list((root / "state").glob("*.json"))
    assert len(state_files) == 1
    state = json.loads(state_files[0].read_text(encoding="utf-8"))
    assert set(state) == {"session_id", "created_at", "last_seen_at", "cwd_hash"}
    assert state["session_id"] == event["session_id"]
    assert state["cwd_hash"] == event["cwd_hash"]


def test_record_event_off_switch_and_write_failures_do_not_raise(tmp_path, monkeypatch):
    from cli_anything.indesign.core.telemetry import record_event

    root = tmp_path / "telemetry"
    monkeypatch.setenv("INDESIGN_CLI_TELEMETRY_DIR", str(root))
    monkeypatch.setenv("INDESIGN_CLI_TELEMETRY", "off")

    assert record_event({"event": "tool_call", "tool_id": "server.health"}, cwd=tmp_path) is None
    assert not root.exists()

    blocked_root = tmp_path / "not-a-directory"
    blocked_root.write_text("file", encoding="utf-8")
    monkeypatch.setenv("INDESIGN_CLI_TELEMETRY", "on")
    monkeypatch.setenv("INDESIGN_CLI_TELEMETRY_DIR", str(blocked_root))

    event = record_event({"event": "tool_call", "tool_id": "server.health"}, cwd=tmp_path)

    assert event is not None
    assert blocked_root.read_text(encoding="utf-8") == "file"


def test_session_ids_use_explicit_env_agent_env_and_idle_rollover(tmp_path, monkeypatch):
    from cli_anything.indesign.core.telemetry import record_event

    root = tmp_path / "telemetry"
    cwd = tmp_path / "workspace"
    cwd.mkdir()
    monkeypatch.setenv("INDESIGN_CLI_TELEMETRY_DIR", str(root))
    monkeypatch.setenv("COMPUTERNAME", "DESIGN-PC-01")
    monkeypatch.setenv("USERNAME", "alice")
    monkeypatch.setenv("INDESIGN_CLI_SESSION_ID", "manual-session-001")

    manual = record_event({"event": "tool_call", "tool_id": "server.health"}, cwd=cwd)
    assert manual["session_id"] == "manual-session-001"

    monkeypatch.delenv("INDESIGN_CLI_SESSION_ID")
    monkeypatch.setenv("INDESIGN_CLI_AGENT_THREAD_ID", "thread-abc")
    monkeypatch.setenv("INDESIGN_CLI_AGENT_RUN_ID", "run-001")
    agent = record_event({"event": "tool_call", "tool_id": "server.health"}, cwd=cwd)
    assert agent["agent_thread_id"] == "thread-abc"
    assert agent["agent_run_id"] == "run-001"
    assert agent["session_id"] != manual["session_id"]

    monkeypatch.delenv("INDESIGN_CLI_AGENT_THREAD_ID")
    monkeypatch.delenv("INDESIGN_CLI_AGENT_RUN_ID")
    monkeypatch.setenv("INDESIGN_CLI_TELEMETRY_IDLE_HOURS", "1")
    first = record_event({"event": "tool_call", "tool_id": "server.health"}, cwd=cwd)
    state_file = root / "state" / f"{first['origin_key']}.json"
    state = json.loads(state_file.read_text(encoding="utf-8"))
    old = datetime.now(timezone.utc) - timedelta(hours=2)
    state["last_seen_at"] = old.isoformat()
    state_file.write_text(json.dumps(state), encoding="utf-8")

    second = record_event({"event": "tool_call", "tool_id": "server.health"}, cwd=cwd)

    assert second["session_id"] != first["session_id"]


def test_tool_call_writes_telemetry_without_argument_values(tmp_path):
    root = tmp_path / "telemetry"
    pdf = tmp_path / "secret-client" / "out.pdf"
    pdf.parent.mkdir()
    pdf.write_bytes(b"%PDF-1.7\n")
    args_file = tmp_path / "args.json"
    args_file.write_text(json.dumps({"path": str(pdf)}), encoding="utf-8")

    result = run_module(
        "tool",
        "call",
        "export.verify",
        "--args",
        str(args_file),
        cwd=tmp_path,
        env_overrides=telemetry_env(root),
    )

    assert result.returncode == 0, result.stdout + result.stderr
    events = read_events(root)
    event = next(item for item in events if item["event"] == "tool_call" and item["tool_id"] == "export.verify")
    assert event["ok"] is True
    assert event["arg_keys"] == ["path"]
    dumped = json.dumps(event, ensure_ascii=False)
    assert str(pdf) not in dumped
    assert "secret-client" not in dumped


def test_tool_batch_records_each_step_as_via_batch(tmp_path):
    root = tmp_path / "telemetry"
    plan = tmp_path / "batch.json"
    plan.write_text(
        json.dumps(
            {
                "steps": [
                    {"id": "show", "type": "tool", "tool": "session.show", "args": {}},
                    {"id": "bad", "type": "tool", "tool": "missing.tool", "args": {}},
                ]
            }
        ),
        encoding="utf-8",
    )

    result = run_module("tool", "batch", "--plan", str(plan), cwd=tmp_path, env_overrides=telemetry_env(root))

    assert result.returncode == 1
    via_batch = [item for item in read_events(root) if item.get("via_batch")]
    assert [(item["tool_id"], item["ok"]) for item in via_batch] == [("session.show", True), ("missing.tool", False)]
    assert via_batch[1]["error_code"] == "TOOL_NOT_FOUND"


def test_feedback_report_catalog_command_and_recent_calls(tmp_path):
    root = tmp_path / "telemetry"
    run_module("tool", "call", "session.show", cwd=tmp_path, env_overrides=telemetry_env(root))

    domains = json.loads(run_module("tool", "domains", cwd=tmp_path).stdout)["data"]
    assert "feedback" in {item["domain"] for item in domains}

    schema = json.loads(run_module("tool", "schema", "feedback.report", cwd=tmp_path).stdout)["data"]["inputSchema"]
    assert schema["properties"]["code"]["enum"] == [
        "TOOL_GAP",
        "DOC_UNCLEAR",
        "ERROR_MESSAGE_USELESS",
        "SCHEMA_CONFUSING",
        "UNEXPECTED_BEHAVIOR",
        "PERFORMANCE",
        "MISSING_EXAMPLE",
    ]
    assert schema["properties"]["note"]["maxLength"] == 500

    result = run_module(
        "feedback",
        "report",
        "--code",
        "TOOL_GAP",
        "--note",
        "missing batch style operation",
        "--tool",
        "session.show",
        cwd=tmp_path,
        env_overrides=telemetry_env(root),
    )

    assert result.returncode == 0, result.stdout + result.stderr
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["tool_id"] == "feedback.report"
    feedback = [item for item in read_events(root) if item["event"] == "feedback"][-1]
    assert feedback["code"] == "TOOL_GAP"
    assert feedback["note"] == "missing batch style operation"
    assert feedback["tool_id"] == "session.show"
    assert feedback["recent_calls"][0] == {"tool_id": "session.show", "ok": True, "error_code": None}


def test_feedback_report_rejects_invalid_code_and_long_note(tmp_path):
    invalid = run_module("feedback", "report", "--code", "BAD", "--note", "x", cwd=tmp_path)
    assert invalid.returncode == 1
    assert json.loads(invalid.stdout)["error"]["code"] == "FEEDBACK_CODE_INVALID"

    too_long = run_module("feedback", "report", "--code", "TOOL_GAP", "--note", "x" * 501, cwd=tmp_path)
    assert too_long.returncode == 1
    assert json.loads(too_long.stdout)["error"]["code"] == "FEEDBACK_NOTE_TOO_LONG"
