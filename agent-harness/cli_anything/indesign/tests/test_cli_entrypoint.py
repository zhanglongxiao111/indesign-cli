from support import *


def test_version_returns_json():
    result = run_module("--version")
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["data"]["name"] == "indesign-cli"
    assert "cli-anything-indesign" in payload["data"]["aliases"]
    assert payload["data"]["version"]


def test_registry_artifact_missing_or_stale_is_a_hard_error(tmp_path):
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.errors import CliError

    server_root = tmp_path / "server"
    (server_root / "src" / "core").mkdir(parents=True)
    (server_root / "src" / "index.js").write_text("// classic", encoding="utf-8")
    (server_root / "src" / "advanced").mkdir(parents=True)
    (server_root / "src" / "advanced" / "index.js").write_text("// advanced", encoding="utf-8")
    (server_root / "package.json").write_text("{}", encoding="utf-8")

    with pytest.raises(CliError) as missing:
        Catalog(repo_root=server_root)
    assert missing.value.code == "REGISTRY_ARTIFACT_NOT_FOUND"
    assert "node src/core/artifact.js --write" in (missing.value.hint or "")

    artifact = json.loads((REPO_ROOT / "src" / "core" / "indesign-tool-registry.json").read_text(encoding="utf-8"))
    artifact["registry_hash"] = "0" * 64
    (server_root / "src" / "core" / "indesign-tool-registry.json").write_text(json.dumps(artifact), encoding="utf-8")

    with pytest.raises(CliError) as stale:
        Catalog(repo_root=server_root)
    assert stale.value.code == "REGISTRY_ARTIFACT_HASH_MISMATCH"
    assert "node src/core/artifact.js --write" in (stale.value.hint or "")


def test_safe_command_ignores_global_flags():
    from cli_anything.indesign.indesign_cli import safe_command

    assert safe_command(["--json", "--pretty", "script", "run"]) == "script run"
    assert safe_command(["--pretty", "tool", "domains"]) == "tool domains"
    assert safe_command(["plugin", "validate"]) == "plugin validate"


def test_script_run_parser_uses_longer_default_timeout():
    from cli_anything.indesign.indesign_cli import build_parser

    parser = build_parser()
    script_args = parser.parse_args(["script", "run", "probe.jsx"])
    assert script_args.timeout == 300

    custom_script_args = parser.parse_args(["script", "run", "probe.jsx", "--timeout", "900"])
    assert custom_script_args.timeout == 900

    tool_args = parser.parse_args(["tool", "call", "script.run", "--args", "args.json", "--timeout", "600"])
    assert tool_args.timeout == 600


def test_invalid_domain_is_actionable():
    result = run_module("tool", "list", "--domain", "not-a-domain")
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "DOMAIN_NOT_FOUND"
    assert payload["error"]["details"]["domain"] == "not-a-domain"
    assert "export" in payload["error"]["details"]["available"]
    assert "tool domains" in payload["error"]["hint"]
    assert "plugin list" in payload["error"]["hint"]


def test_invalid_source_is_actionable():
    result = run_module("tool", "search", "--source", "not-a-source", "--query", "pdf")
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "SOURCE_NOT_FOUND"
    assert payload["error"]["details"]["source"] == "not-a-source"
    assert "advanced" in payload["error"]["details"]["available"]


def test_missing_artifact_hint_explains_next_step(tmp_path):
    missing = tmp_path / "missing.pdf"
    result = run_module("export", "verify", str(missing), cwd=tmp_path)
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "ARTIFACT_NOT_FOUND"
    assert "导出" in payload["error"]["hint"]
    assert "当前工作目录" in payload["error"]["hint"]


def test_cli_discovery_commands_return_agent_useful_payloads():
    cases = [
        ("tool", "domains"),
        ("tool",),
        ("tool", "list"),
        ("tool", "list", "--domain", "export", "--callable-only"),
        ("tool", "search", "--domain", "export", "--query", "pdf"),
        ("tool", "schema", "export.verify"),
        ("server", "health"),
        ("server",),
        ("session", "show"),
        ("session",),
    ]
    for case in cases:
        result = run_module(*case)
        assert result.returncode == 0, case
        payload = json.loads(result.stdout)
        assert payload["ok"] is True, case
        assert payload["data"] not in (None, ""), case

    domains = json.loads(run_module("tool", "domains").stdout)["data"]
    export = next(item for item in domains if item["domain"] == "export")
    assert export["summary"]
    assert export["count_by_source"]
    assert export["top_tools"]

    listed = json.loads(run_module("tool", "list", "--domain", "export", "--callable-only").stdout)["data"]
    assert any(item["id"] == "export.verify" for item in listed)
    assert all(item["callable"] is True for item in listed)

    schema = json.loads(run_module("tool", "schema", "export.verify").stdout)["data"]["inputSchema"]
    assert schema["required"] == ["path"]
    assert "path" in schema["properties"]

    health_payload = json.loads(run_module("server", "health").stdout)["data"]
    assert health_payload["indesign_com"]["checked"] is False
    assert health_payload["indesign_com"]["available"] is None


def test_cli_action_commands_return_agent_useful_payloads(tmp_path):
    pdf = tmp_path / "out.pdf"
    pdf.write_bytes(b"%PDF-1.7\n")

    export_result = run_module("export", "verify", str(pdf))
    assert export_result.returncode == 0
    export_payload = json.loads(export_result.stdout)
    assert export_payload["data"]["kind"] == "pdf"
    assert export_payload["data"]["signature_ok"] is True

    args_file = tmp_path / "args.json"
    args_file.write_text(json.dumps({"path": str(pdf)}), encoding="utf-8")
    call_result = run_module("tool", "call", "export.verify", "--args", str(args_file))
    assert call_result.returncode == 0
    call_payload = json.loads(call_result.stdout)
    assert call_payload["tool_id"] == "export.verify"
    assert call_payload["data"]["kind"] == "pdf"

    clear_result = run_module("session", "clear")
    assert clear_result.returncode == 0
    assert json.loads(clear_result.stdout)["data"]["cleared"] is True

    script_result = run_module("script", "run")
    assert script_result.returncode == 1
    script_payload = json.loads(script_result.stdout)
    assert script_payload["error"]["code"] == "SCRIPT_INPUT_REQUIRED"


def test_run_stdin_script_reads_utf8_bytes(tmp_path, monkeypatch):
    from cli_anything.indesign.core.scripts import run_stdin_script

    class FakeStdin:
        buffer = io.BytesIO('"STDIN_UTF8_OK|中文";'.encode("utf-8"))

    class FakeRouter:
        def __init__(self):
            self.file_path = None

        def call(self, tool_id, args):
            self.file_path = Path(args["filePath"])
            return {
                "tool_id": tool_id,
                "script": self.file_path.read_text(encoding="utf-8"),
            }

    router = FakeRouter()
    monkeypatch.setattr(sys, "stdin", FakeStdin())

    payload = run_stdin_script(router, tmp_path)

    assert payload["tool_id"] == "template.run_jsx_file"
    assert "STDIN_UTF8_OK|中文" in payload["script"]
    assert router.file_path == tmp_path / ".indesign-cli" / "tmp" / "stdin.jsx"


def test_cli_help_is_agent_oriented():
    root = run_module("--help")
    assert root.returncode == 0
    assert "Agent" in root.stdout
    assert "发现工具" in root.stdout

    tool_list = run_module("tool", "list", "--help")
    assert tool_list.returncode == 0
    assert "不带过滤条件时返回工具域摘要" in tool_list.stdout

    plugin_doctor = run_module("plugin", "doctor", "--help")
    assert plugin_doctor.returncode == 0
    assert "写入临时 session 探针" in plugin_doctor.stdout


def test_output_is_compact_utf8_by_default_and_pretty_optional():
    compact = run_module("--version")
    assert compact.returncode == 0
    assert len(compact.stdout.strip().splitlines()) == 1

    pretty = run_module("--pretty", "--version")
    assert pretty.returncode == 0
    assert len(pretty.stdout.strip().splitlines()) > 1

    quickstart = run_module("agent", "quickstart")
    assert "\\u" not in quickstart.stdout or "指" in quickstart.stdout


def test_chinese_output_is_not_ascii_escaped():
    result = run_module("server", "health")
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    # winax.reason 是中文；不允许再被转义成 \uXXXX
    assert "未运行" in result.stdout
    assert "\\u672a" not in result.stdout


def test_unexpected_error_keeps_exception_summary(monkeypatch):
    from cli_anything.indesign import indesign_cli

    def boom(argv=None):
        raise ValueError("boom detail")

    monkeypatch.setattr(indesign_cli, "run", boom)
    import io as io_module

    buffer = io_module.StringIO()
    monkeypatch.setattr(sys, "stdout", buffer)
    exit_code = indesign_cli.main(["tool", "domains"])
    payload = json.loads(buffer.getvalue())
    assert exit_code == 1
    assert payload["error"]["code"] == "UNEXPECTED_ERROR"
    assert "boom detail" in payload["error"]["message"]
    assert payload["error"]["details"]["type"] == "ValueError"
    assert payload["error"]["details"]["location"]
    assert payload["error"]["hint"]
