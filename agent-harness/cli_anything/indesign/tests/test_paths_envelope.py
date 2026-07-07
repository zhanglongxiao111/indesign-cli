from support import *


def test_external_path_is_scrubbed():
    from cli_anything.indesign.core.paths import scrub_path

    scrubbed = scrub_path(r"D:\Clients\AcmeSecret\layout.indd", Path.cwd())
    assert scrubbed["external"] is True
    assert scrubbed["extension"] == ".indd"
    assert "AcmeSecret" not in json.dumps(scrubbed, ensure_ascii=False)
    assert "layout.indd" not in json.dumps(scrubbed, ensure_ascii=False)
    assert len(scrubbed["hash"]) == 16


def test_failure_envelope_has_machine_fields():
    from cli_anything.indesign.core.envelope import failure
    from cli_anything.indesign.core.errors import CliError

    payload = failure(
        command="unit",
        error=CliError("Bad input", code="BAD_INPUT", retryable=False),
        duration_ms=12,
    )
    assert payload["ok"] is False
    assert payload["exit_code"] == 1
    assert payload["schema_version"] == 2
    assert payload["error"]["code"] == "BAD_INPUT"
    assert payload["error"]["retryable"] is False
    assert payload["tool_success"] is False
    assert "tool_id" in payload
    assert "data" in payload
    assert payload["state_uncertain"] is False
    assert "next_action" in payload


def test_failure_envelope_copies_uncertain_state_and_next_action():
    from cli_anything.indesign.core.envelope import failure
    from cli_anything.indesign.core.errors import CliError

    payload = failure(
        command="unit",
        error=CliError(
            "Timed out",
            code="TIMEOUT",
            state_uncertain=True,
            next_action="Run session doctor before retrying.",
        ),
        duration_ms=25,
    )

    assert_failure_envelope(payload, "TIMEOUT")
    assert payload["state_uncertain"] is True
    assert payload["next_action"] == "Run session doctor before retrying."


def test_root_command_missing_still_returns_json_failure():
    result = run_module()
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "COMMAND_REQUIRED"
    assert "usage:" not in result.stdout.lower()


def test_args_file_accepts_unicode_path(tmp_path):
    args_file = tmp_path / "参数.json"
    args_file.write_text(json.dumps({}), encoding="utf-8")

    result = run_module("tool", "call", "session.show", "--args-file", str(args_file), cwd=tmp_path)

    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True


def test_missing_args_file_uses_stable_failure_envelope(tmp_path):
    result = run_module("tool", "call", "session.show", "--args-file", str(tmp_path / "missing.json"))
    assert result.returncode == 1
    assert_failure_envelope(json.loads(result.stdout), "ARGS_FILE_NOT_FOUND")


def test_bad_args_json_uses_stable_failure_envelope(tmp_path):
    args_file = tmp_path / "bad.json"
    args_file.write_text("{bad", encoding="utf-8")
    result = run_module("tool", "call", "session.show", "--args-file", str(args_file))
    assert result.returncode == 1
    assert_failure_envelope(json.loads(result.stdout), "ARGS_JSON_INVALID")


def test_session_compact_does_not_store_args(tmp_path):
    from cli_anything.indesign.core.session import SessionStore

    store = SessionStore(tmp_path)
    store.record_call(tool_id="document.info", domain="document", source="classic", ok=True, duration_ms=5)
    payload = store.read(compact=True)
    assert "recent_calls" in payload
    assert "args" not in json.dumps(payload, ensure_ascii=False)


def test_load_args_accepts_inline_json():
    from cli_anything.indesign.core.router import load_args

    assert load_args('{"path": "out.pdf"}') == {"path": "out.pdf"}


def test_load_args_inline_json_invalid_has_hint():
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.router import load_args

    try:
        load_args('{"path": out.pdf}')
    except CliError as exc:
        assert exc.code == "ARGS_JSON_INVALID"
        assert exc.hint
    else:
        raise AssertionError("expected CliError")


def test_load_args_bad_path_reports_args_file_not_found_with_hint():
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.router import load_args

    for value in ("no-such-file.json", 'D:\\bad"path*?.json'):
        try:
            load_args(value)
        except CliError as exc:
            assert exc.code == "ARGS_FILE_NOT_FOUND"
            assert exc.hint
        else:
            raise AssertionError("expected CliError")


def test_argparse_errors_emit_json_envelope():
    result = run_module("tool", "schema")
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "BAD_CLI_ARGS"
    assert "usage" in payload["error"]["details"]
    assert payload["error"]["hint"]


def test_scrub_text_paths_keeps_workspace_paths_relative(tmp_path):
    from cli_anything.indesign.core.paths import scrub_text_paths

    inside = tmp_path / "test" / "workspace" / "probe.jsx"
    text = f"ENOENT: no such file, open '{inside}' and D:\\Clients\\AcmeSecret\\layout.indd"
    scrubbed = scrub_text_paths(text, allow_roots=[tmp_path])
    assert "test/workspace/probe.jsx" in scrubbed
    assert "AcmeSecret" not in scrubbed
    assert "<external_path" in scrubbed


def test_batch_step_invalid_includes_expected_step_template(tmp_path):
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.batch import run_batch

    plan = tmp_path / "plan.json"
    plan.write_text(json.dumps({"steps": [{"tool": "session.show", "args": {}}]}), encoding="utf-8")
    try:
        run_batch(None, plan)
    except CliError as exc:
        assert exc.code == "BATCH_STEP_INVALID"
        assert exc.details["expected_step"]["type"] == "tool"
        assert exc.hint and "steps" in exc.hint
    else:
        raise AssertionError("expected CliError")


def test_timeout_seconds_validates_fallback_seconds():
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.indesign_cli import timeout_seconds_from_ms

    assert timeout_seconds_from_ms(None, 300) == 300
    assert timeout_seconds_from_ms(None, None) is None
    try:
        timeout_seconds_from_ms(None, -5)
    except CliError as exc:
        assert exc.code == "BAD_TIMEOUT"
    else:
        raise AssertionError("expected CliError")


def test_artifact_verify_returns_iso_mtime(tmp_path):
    from cli_anything.indesign.core.artifacts import verify_artifact

    pdf = tmp_path / "out.pdf"
    pdf.write_bytes(b"%PDF-1.7 minimal")
    payload = verify_artifact(pdf, cwd=tmp_path)
    assert payload["mtime_iso"]
    assert "T" in payload["mtime_iso"]


def test_session_show_rejects_removed_verbose_flag():
    result = run_module("session", "show", "--verbose")
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["error"]["code"] == "BAD_CLI_ARGS"


def test_emit_check_failure_includes_error_object():
    from cli_anything.indesign import indesign_cli

    import io as io_module

    buffer = io_module.StringIO()
    original = sys.stdout
    sys.stdout = buffer
    try:
        exit_code = indesign_cli.emit_check("plugin validate", {"ok": False, "errors": [{"code": "X"}]}, tool_id="plugin.validate")
    finally:
        sys.stdout = original
    payload = json.loads(buffer.getvalue())
    assert exit_code == 1
    assert payload["ok"] is False
    assert payload["tool_success"] is False
    assert payload["error"]["code"] == "CHECK_FAILED"
