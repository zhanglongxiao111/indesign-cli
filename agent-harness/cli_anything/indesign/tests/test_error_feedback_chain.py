from support import *


class _StubCatalog:
    def schema(self, tool_id: str) -> dict:
        return {}


class _StubRouter:
    """只负责把预置错误抛给 batch，不牵扯真实工具解析。"""

    def __init__(self, error: Exception) -> None:
        self.error = error

    def _find(self, tool_id: str) -> dict:
        return {"id": tool_id, "source": "classic"}

    def call(self, tool_id: str, args: dict) -> dict:
        raise self.error


def _call_internal_tool(monkeypatch, result, tool_id="data_merge"):
    from cli_anything.indesign.core import internal_backend as module
    from cli_anything.indesign.core.errors import CliError

    monkeypatch.setattr(module, "internal_tool_bridge_path", lambda: Path("bridge.js"))
    monkeypatch.setattr(module, "resolve_node_executable", lambda repo_root: Path("node"))

    def fake_run(*args, **kwargs):
        payload = {"ok": True, "result": result}
        return subprocess.CompletedProcess(
            args=list(args),
            returncode=0,
            stdout=json.dumps(payload, ensure_ascii=False),
            stderr="",
        )

    monkeypatch.setattr(subprocess, "run", fake_run)
    backend = module.InternalToolBackend(repo_root=REPO_ROOT, catalog=_StubCatalog())
    try:
        backend.call_tool({"id": tool_id}, {})
    except CliError as exc:
        return exc
    raise AssertionError("expected CliError")


def _fake_plugin_record():
    from cli_anything.indesign.core.plugins.manifest import PluginRecord

    return PluginRecord(
        id="fake-html-plugin",
        source="test",
        root=FAKE_PLUGIN_ROOT,
        manifest_path=FAKE_PLUGIN_ROOT / "manifest.json",
        manifest=json.loads((FAKE_PLUGIN_ROOT / "manifest.json").read_text(encoding="utf-8")),
    )


def _plugin_error(error_payload):
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.plugins.backend import PluginBackend

    def runner(*args, **kwargs):
        response = {"jsonrpc": "2.0", "id": "abc", "error": error_payload}
        return subprocess.CompletedProcess(
            args=list(args),
            returncode=0,
            stdout=json.dumps(response, ensure_ascii=False),
            stderr="",
        )

    try:
        PluginBackend(_fake_plugin_record(), runner=runner).request("tools/call", {})
    except CliError as exc:
        return exc
    raise AssertionError("expected CliError")


def _batch_failure(tmp_path, error):
    from cli_anything.indesign.core.batch import run_batch
    from cli_anything.indesign.core.errors import CliError

    plan = tmp_path / "plan.json"
    plan.write_text(
        json.dumps({"steps": [{"id": "step-1", "type": "tool", "tool": "document.info", "args": {}}]}),
        encoding="utf-8",
    )
    try:
        run_batch(_StubRouter(error), plan)
    except CliError as exc:
        return exc
    raise AssertionError("expected CliError")


def test_internal_tool_failure_keeps_script_code_and_text(monkeypatch):
    exc = _call_internal_tool(
        monkeypatch,
        {
            "success": False,
            "operation": "dataMerge",
            "code": "NO_ACTIVE_DOCUMENT",
            "result": "No document open",
        },
    )

    assert exc.code == "NO_ACTIVE_DOCUMENT"
    assert exc.message == "No document open"
    assert exc.details["tool"] == "data_merge"
    assert exc.details["operation"] == "dataMerge"


def test_internal_tool_failure_falls_back_to_message_field(monkeypatch):
    exc = _call_internal_tool(
        monkeypatch,
        {
            "success": False,
            "operation": "preflightDocument",
            "message": "Data source file not found: D:\\Clients\\AcmeSecret\\merge.csv",
        },
        tool_id="preflight_document",
    )

    assert exc.code == "INTERNAL_TOOL_FAILED"
    assert exc.message.startswith("Data source file not found:")
    assert "AcmeSecret" not in exc.message


def test_internal_tool_failure_carries_script_diagnostics(monkeypatch):
    exc = _call_internal_tool(
        monkeypatch,
        {
            "success": False,
            "operation": "createBook",
            "code": "INDESIGN_SCRIPT_FAILED",
            "result": "Object is invalid",
            "step": "add-document",
            "errorName": "Error",
            "errorNumber": 30477,
            "line": 42,
            "fileName": "book.jsx",
        },
        tool_id="create_book",
    )

    assert exc.code == "INDESIGN_SCRIPT_FAILED"
    assert exc.message == "Object is invalid"
    assert exc.details["step"] == "add-document"
    assert exc.details["errorName"] == "Error"
    assert exc.details["errorNumber"] == 30477
    assert exc.details["line"] == 42
    assert exc.details["fileName"] == "book.jsx"


def test_internal_tool_failure_without_text_uses_generic_message(monkeypatch):
    exc = _call_internal_tool(monkeypatch, {"success": False, "operation": "exportBook"}, tool_id="export_book")

    assert exc.code == "INTERNAL_TOOL_FAILED"
    assert exc.message == "Internal tool failed"
    assert exc.details["operation"] == "exportBook"


def test_internal_tool_failure_text_without_error_prefix_is_forwarded(monkeypatch):
    exc = _call_internal_tool(monkeypatch, {"success": False, "error": "Data source file not found"})

    assert exc.message == "Data source file not found"


def test_plugin_error_forwards_hint_and_retryable():
    exc = _plugin_error(
        {
            "code": "FIDELITY_GATE_FAILED",
            "message": "Forward fidelity gate failed",
            "retryable": False,
            "hint": "Read forward-fidelity-report.json, fix the named HTML page/object/field, then start a new build.",
            "details": {"stage": "fidelity"},
        }
    )

    assert exc.code == "FIDELITY_GATE_FAILED"
    assert exc.hint is not None
    assert "forward-fidelity-report.json" in exc.hint
    assert exc.retryable is False
    assert exc.details["stage"] == "fidelity"


def test_plugin_error_hint_and_retryable_fall_back_to_details():
    exc = _plugin_error(
        {
            "code": "AUTHOR_GENERATED_ENTRY_DIRTY",
            "message": "Generated entry was edited by hand",
            "details": {"hint": "Regenerate the entry from source before compiling.", "retryable": True},
        }
    )

    assert exc.hint == "Regenerate the entry from source before compiling."
    assert exc.retryable is True


def test_failure_envelope_exposes_plugin_hint():
    from cli_anything.indesign.core.envelope import failure

    exc = _plugin_error(
        {
            "code": "INDESIGN_BUILD_FAILED",
            "message": "Build failed",
            "hint": "Fix the reported cause before starting a new build.",
        }
    )
    payload = failure(command="tool call", error=exc, duration_ms=7)

    assert payload["error"]["hint"] == "Fix the reported cause before starting a new build."


def test_plugin_timeout_collects_stderr_tail():
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.plugins.backend import PluginBackend

    def runner(*args, **kwargs):
        raise subprocess.TimeoutExpired(
            cmd="node",
            timeout=1,
            output="",
            stderr="stage=indesign-build waiting for host response\n",
        )

    try:
        PluginBackend(_fake_plugin_record(), runner=runner).request("tools/call", {})
    except CliError as exc:
        assert exc.code == "TIMEOUT"
        assert "indesign-build" in exc.details["stderr_tail"]
    else:
        raise AssertionError("expected CliError")


def test_plugin_timeout_without_stderr_keeps_empty_tail():
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.plugins.backend import PluginBackend

    def runner(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd="node", timeout=1)

    try:
        PluginBackend(_fake_plugin_record(), runner=runner).request("tools/call", {})
    except CliError as exc:
        assert exc.details["stderr_tail"] == ""
    else:
        raise AssertionError("expected CliError")


def test_batch_keeps_certain_state_for_input_errors(tmp_path):
    from cli_anything.indesign.core.errors import CliError

    exc = _batch_failure(tmp_path, CliError("Missing required argument: path", code="MISSING_ARGUMENT"))

    assert exc.code == "BATCH_STEP_FAILED"
    assert exc.state_uncertain is False
    assert exc.details["state_uncertain"] is False
    assert exc.next_action is None
    assert exc.details["cleanup_suggestions"] == []


def test_batch_propagates_uncertain_state_from_host_failure(tmp_path):
    from cli_anything.indesign.core.errors import TimeoutError as CliTimeoutError

    exc = _batch_failure(tmp_path, CliTimeoutError("Plugin timed out"))

    assert exc.state_uncertain is True
    assert exc.details["state_uncertain"] is True
    assert exc.next_action
    assert exc.details["cleanup_suggestions"]


def test_batch_defaults_to_uncertain_when_state_flag_missing(tmp_path):
    from cli_anything.indesign.core.errors import CliError

    error = CliError("Legacy error object", code="LEGACY_ERROR")
    del error.state_uncertain

    exc = _batch_failure(tmp_path, error)

    assert exc.state_uncertain is True


def test_failure_envelope_reports_failure_category():
    from cli_anything.indesign.core.envelope import failure
    from cli_anything.indesign.core.errors import CliError

    expected = {
        "MISSING_ARGUMENT": "input_error",
        "FIDELITY_GATE_FAILED": "gate_rejection",
        "NPM_NOT_AVAILABLE": "environment_error",
        "TIMEOUT": "timeout",
        "HOST_ACTION_FAILED": "runtime_error",
    }
    for code, category in expected.items():
        payload = failure(command="tool call", error=CliError("boom", code=code), duration_ms=3)
        assert payload["error"]["category"] == category


def test_cli_failure_envelope_carries_category():
    result = run_module("tool", "call", "no.such_tool", "--args", "{}")

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["error"]["code"] == "TOOL_NOT_FOUND"
    assert payload["error"]["category"] == "input_error"


def test_npm_failures_classify_as_environment_error():
    from cli_anything.indesign.core.telemetry import classify_result

    assert classify_result(False, "NPM_NOT_AVAILABLE") == "environment_error"
    assert classify_result(False, "NPM_INSTALL_FAILED") == "environment_error"
    # NODE_SETUP_FAILED 全仓从未被 raise，移出环境类集合后回落默认分类。
    assert classify_result(False, "NODE_SETUP_FAILED") == "runtime_error"


def test_classify_result_is_shared_between_envelope_and_telemetry():
    from cli_anything.indesign.core.envelope import classify_result as envelope_classify
    from cli_anything.indesign.core.telemetry import classify_result as telemetry_classify

    assert envelope_classify is telemetry_classify


def test_script_failure_detected_when_success_key_absent_but_text_is_error():
    """JS 侧缺 success 键时默认 true（stringUtils.js:77），但文本仍可能是 `Error: ...`
    （mcpServer.js:45）。只认 success 会把错误当成功返回——静默错位。"""
    from cli_anything.indesign.core.internal_backend import InternalToolBackend

    assert InternalToolBackend._is_script_failure({"result": "Error: no document open"}) is True
    assert InternalToolBackend._is_script_failure({"result": "  Error: leading space"}) is True
    assert InternalToolBackend._is_script_failure({"success": False, "result": "x"}) is True
    assert InternalToolBackend._is_script_failure({"success": True, "result": "ok"}) is False
    assert InternalToolBackend._is_script_failure({"result": "Errors were fixed"}) is False
