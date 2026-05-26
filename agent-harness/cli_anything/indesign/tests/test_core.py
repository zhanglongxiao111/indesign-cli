import io
import json
import os
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
HARNESS_ROOT = REPO_ROOT / "agent-harness"
FAKE_PLUGIN_ROOT = HARNESS_ROOT / "cli_anything" / "indesign" / "tests" / "fixtures" / "plugins" / "fake-html-plugin"
sys.path.insert(0, str(HARNESS_ROOT))


def run_module(*args: str, cwd: Path = REPO_ROOT) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(HARNESS_ROOT)
    return subprocess.run(
        [sys.executable, "-m", "cli_anything.indesign", *args],
        cwd=cwd,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def test_version_returns_json():
    result = run_module("--version")
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["data"]["name"] == "indesign-cli"
    assert "cli-anything-indesign" in payload["data"]["aliases"]
    assert payload["data"]["version"]


def test_pyproject_exposes_remote_installable_package_and_console_aliases():
    pyproject_path = REPO_ROOT / "pyproject.toml"
    assert pyproject_path.exists()
    payload = pyproject_path.read_text(encoding="utf-8")
    assert 'name = "indesign-cli"' in payload
    assert 'Repository = "https://github.com/zhanglongxiao111/indesign-cli"' in payload
    assert 'indesign-cli = "cli_anything.indesign.indesign_cli:main"' in payload
    assert 'cli-anything-indesign = "cli_anything.indesign.indesign_cli:main"' in payload


def test_runtime_resolves_server_root_and_packaged_skill():
    from cli_anything.indesign.core.runtime import resolve_server_root, skill_source_path

    server_root = resolve_server_root()
    assert (server_root / "src" / "index.js").exists()
    assert (server_root / "src" / "advanced" / "index.js").exists()
    assert (server_root / "package.json").exists()

    skill_path = skill_source_path()
    assert skill_path.name == "SKILL.md"
    assert "name: indesign-cli" in skill_path.read_text(encoding="utf-8")


def test_node_dependency_setup_runs_npm_install_against_server_root(monkeypatch, tmp_path):
    from cli_anything.indesign.core.node_setup import setup_node_dependencies

    calls = []

    def fake_run(args, **kwargs):
        calls.append((args, kwargs))

        class Result:
            returncode = 0
            stdout = "installed"
            stderr = ""

        return Result()

    monkeypatch.setattr(subprocess, "run", fake_run)

    payload = setup_node_dependencies(tmp_path)

    assert calls[0][0] == ["npm", "install"]
    assert calls[0][1]["cwd"] == tmp_path
    assert payload["ok"] is True
    assert payload["server_root"] == str(tmp_path)


def test_skill_install_copies_packaged_skill_to_target(tmp_path):
    result = run_module("skill", "install", "--target", str(tmp_path))
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["tool_id"] == "skill.install"

    installed = tmp_path / ".codex" / "skills" / "indesign-cli" / "SKILL.md"
    assert installed.exists()
    assert installed == Path(payload["data"]["installed_path"])
    assert "name: indesign-cli" in installed.read_text(encoding="utf-8")


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
    assert payload["schema_version"] == 1
    assert payload["error"]["code"] == "BAD_INPUT"
    assert payload["error"]["retryable"] is False


def test_tool_domains_are_compact():
    from cli_anything.indesign.core.catalog import Catalog

    catalog = Catalog(repo_root=REPO_ROOT)
    domains = catalog.domains()
    names = {item["domain"] for item in domains}
    assert {"template", "document", "export", "book", "presentation", "object"}.issubset(names)
    export = next(item for item in domains if item["domain"] == "export")
    assert "summary" in export
    assert "top_tools" in export
    assert "tools" not in export


def test_root_command_missing_still_returns_json_failure():
    result = run_module()
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "COMMAND_REQUIRED"
    assert "usage:" not in result.stdout.lower()


def test_safe_command_ignores_global_flags():
    from cli_anything.indesign.indesign_cli import safe_command

    assert safe_command(["--json", "--pretty", "script", "run"]) == "script run"
    assert safe_command(["--pretty", "tool", "domains"]) == "tool domains"
    assert safe_command(["plugin", "validate"]) == "plugin validate"


def test_invalid_domain_is_actionable():
    result = run_module("tool", "list", "--domain", "not-a-domain")
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "DOMAIN_NOT_FOUND"
    assert payload["error"]["details"]["domain"] == "not-a-domain"
    assert "export" in payload["error"]["details"]["available"]


def test_invalid_source_is_actionable():
    result = run_module("tool", "search", "--source", "not-a-source", "--query", "pdf")
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "SOURCE_NOT_FOUND"
    assert payload["error"]["details"]["source"] == "not-a-source"
    assert "advanced" in payload["error"]["details"]["available"]


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


def test_plugin_validate_accepts_fake_plugin():
    result = run_module("plugin", "validate", str(FAKE_PLUGIN_ROOT))
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["data"]["ok"] is True
    assert payload["data"]["plugin"] == "fake-html-plugin"
    assert payload["data"]["summary"]["tools"] == 3

    manifest_result = run_module("plugin", "validate", str(FAKE_PLUGIN_ROOT / "manifest.json"))
    assert manifest_result.returncode == 0
    assert json.loads(manifest_result.stdout)["data"]["plugin"] == "fake-html-plugin"


def test_plugin_validate_rejects_bad_manifest(tmp_path):
    bad = tmp_path / "bad-plugin"
    bad.mkdir()
    (bad / "manifest.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "protocol": "indesign-cli-plugin.v1",
                "id": "bad-plugin",
            }
        ),
        encoding="utf-8",
    )
    result = run_module("plugin", "validate", str(bad))
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["data"]["ok"] is False
    assert any(item["code"] == "PLUGIN_MANIFEST_INVALID" for item in payload["data"]["errors"])


def test_plugin_install_list_remove_project_plugin(tmp_path):
    install = run_module("plugin", "install", str(FAKE_PLUGIN_ROOT), cwd=tmp_path)
    assert install.returncode == 0
    install_payload = json.loads(install.stdout)
    assert install_payload["data"]["id"] == "fake-html-plugin"

    record = tmp_path / ".indesign-cli" / "plugins" / "fake-html-plugin.json"
    assert record.exists()

    listed = run_module("plugin", "list", cwd=tmp_path)
    listed_payload = json.loads(listed.stdout)
    assert listed.returncode == 0
    assert listed_payload["data"]["plugins"][0]["id"] == "fake-html-plugin"
    assert listed_payload["data"]["plugins"][0]["domain"] == "html"

    removed = run_module("plugin", "remove", "fake-html-plugin", cwd=tmp_path)
    assert removed.returncode == 0
    assert not record.exists()


def test_plugin_tools_enter_catalog_and_router(tmp_path):
    run_module("plugin", "install", str(FAKE_PLUGIN_ROOT), cwd=tmp_path)

    domains = json.loads(run_module("tool", "domains", cwd=tmp_path).stdout)["data"]
    html_domain = next(item for item in domains if item["domain"] == "html")
    assert html_domain["count_by_source"]["plugin"] == 3

    listed = json.loads(run_module("tool", "list", "--domain", "html", cwd=tmp_path).stdout)["data"]
    assert {item["id"] for item in listed} == {
        "html.authoring_lint",
        "html.compile_instructions",
        "html.build_indesign",
    }
    assert all(item["source"] == "plugin" for item in listed)

    schema = json.loads(run_module("tool", "schema", "html.authoring_lint", cwd=tmp_path).stdout)["data"]
    assert schema["tool"]["plugin"] == "fake-html-plugin"
    assert schema["inputSchema"]["required"] == ["package"]


def test_plugin_tool_call_updates_session(tmp_path):
    run_module("plugin", "install", str(FAKE_PLUGIN_ROOT), cwd=tmp_path)
    args_file = tmp_path / "args.json"
    args_file.write_text(json.dumps({"package": "deck.config.json", "strict": True}), encoding="utf-8")

    result = run_module("tool", "call", "html.authoring_lint", "--args", str(args_file), cwd=tmp_path)
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["source"] == "plugin"
    assert payload["data"]["status"] == "complete"

    session = json.loads(run_module("session", "show", cwd=tmp_path).stdout)["data"]
    recent = session["recent_calls"][0]
    assert recent["tool_id"] == "html.authoring_lint"
    assert recent["source"] == "plugin"
    assert recent["plugin"] == "fake-html-plugin"
    assert recent["artifacts"][0]["path"] == "test/workspace/lint-report.json"


def test_plugin_host_action_resume_and_denial(tmp_path):
    run_module("plugin", "install", str(FAKE_PLUGIN_ROOT), cwd=tmp_path)
    args_file = tmp_path / "args.json"
    args_file.write_text(json.dumps({"package": "deck.config.json"}), encoding="utf-8")

    ok_result = run_module("tool", "call", "html.build_indesign", "--args", str(args_file), cwd=tmp_path)
    assert ok_result.returncode == 0
    ok_payload = json.loads(ok_result.stdout)
    assert ok_payload["data"]["data"]["resumed"] is True
    assert ok_payload["data"]["data"]["host_results"][0]["tool_id"] == "session.show"

    bad_args = tmp_path / "bad-args.json"
    bad_args.write_text(json.dumps({"package": "deck.config.json", "mode": "illegal-host-action"}), encoding="utf-8")
    bad_result = run_module("tool", "call", "html.build_indesign", "--args", str(bad_args), cwd=tmp_path)
    assert bad_result.returncode == 1
    bad_payload = json.loads(bad_result.stdout)
    assert bad_payload["error"]["code"] == "PLUGIN_HOST_ACTION_FAILED"
    assert bad_payload["error"]["details"]["host_results"][0]["error"]["code"] == "PLUGIN_HOST_ACTION_DENIED"


def test_plugin_doctor_reports_installed_plugin(tmp_path):
    run_module("plugin", "install", str(FAKE_PLUGIN_ROOT), cwd=tmp_path)
    result = run_module("plugin", "doctor", "fake-html-plugin", cwd=tmp_path)
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["ok"] is True
    assert payload["data"]["plugin"] == "fake-html-plugin"
    assert any(check["name"] == "validate" for check in payload["data"]["checks"])


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


def test_domain_top_tools_include_exposed_hidden_handlers():
    from cli_anything.indesign.core.catalog import Catalog

    catalog = Catalog(repo_root=REPO_ROOT)
    book = next(item for item in catalog.domains() if item["domain"] == "book")
    assert "book.create_book" in book["top_tools"]
    assert book["count_by_source"]["hidden_handler"] > 0


def test_hidden_handlers_are_listed_callable_and_schema_backed():
    from cli_anything.indesign.core.catalog import Catalog

    expected = {
        "book.create_book",
        "book.open_book",
        "book.add_document_to_book",
        "book.synchronize_book",
        "book.export_book",
        "book.package_book",
        "book.get_book_info",
        "book.list_books",
        "book.repaginate_book",
        "book.update_all_cross_references",
        "book.update_all_numbers",
        "book.update_chapter_and_paragraph_numbers",
        "book.preflight_book",
        "book.print_book",
        "book.set_book_properties",
        "presentation.create_presentation_document",
        "presentation.add_cover_page",
        "presentation.add_section_page",
        "presentation.add_full_bleed_image",
        "presentation.add_image_grid",
        "presentation.export_presentation_pdf",
    }
    catalog = Catalog(repo_root=REPO_ROOT)
    hidden_tools = catalog.list_tools(source="hidden_handler", callable_only=True)
    assert {item["id"] for item in hidden_tools} == expected
    assert len(hidden_tools) == 21
    assert all(item["availability"] == "exposed" for item in hidden_tools)
    assert all(item["schema_size"] != "unknown" for item in hidden_tools)
    assert "filePath" in next(item for item in hidden_tools if item["id"] == "book.create_book")["arg_names"]
    assert "files" in next(item for item in hidden_tools if item["id"] == "presentation.add_image_grid")["arg_names"]


def test_tool_schema_supports_hidden_handler():
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.router import Router

    router = Router(catalog=Catalog(repo_root=REPO_ROOT), repo_root=REPO_ROOT)
    payload = router.schema("book.create_book")
    schema = payload["inputSchema"]
    assert schema["required"] == ["filePath"]
    assert schema["properties"]["filePath"]["type"] == "string"
    assert payload["tool"]["source"] == "hidden_handler"


def test_tool_call_hidden_handler_validates_required_args():
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.router import Router

    router = Router(catalog=Catalog(repo_root=REPO_ROOT), repo_root=REPO_ROOT)
    try:
        router.call("book.create_book", {})
    except CliError as exc:
        assert exc.code == "MISSING_ARGUMENT"
        assert exc.details["argument"] == "filePath"
    else:
        raise AssertionError("hidden handler should reject missing required argument")


def test_hidden_bridge_resolves_acronym_handler_names():
    bridge = REPO_ROOT / "agent-harness" / "cli_anything" / "indesign" / "node" / "hidden_handler_bridge.mjs"
    result = subprocess.run(
        ["node", str(bridge)],
        cwd=REPO_ROOT,
        input=json.dumps(
            {
                "domain": "presentation",
                "name": "export_presentation_pdf",
                "args": {},
                "resolveOnly": True,
            }
        ),
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["methodName"] == "exportPresentationPDF"


def test_catalog_infers_expected_domains_from_tool_names():
    from cli_anything.indesign.core.catalog import Catalog

    catalog = Catalog(repo_root=REPO_ROOT).with_exposed_tools(
        classic_tools=[
            {"name": "add_page", "description": "Add a new page to the document", "inputSchema": {}},
            {"name": "create_master_spread", "description": "Create a master spread", "inputSchema": {}},
            {"name": "export_pdf", "description": "Export document to PDF", "inputSchema": {}},
            {"name": "create_rectangle", "description": "Create rectangle", "inputSchema": {}},
        ]
    )
    ids = {tool["id"] for tool in catalog.list_tools(callable_only=True)}
    assert "page.add_page" in ids
    assert "master.create_master_spread" in ids
    assert "export.export_pdf" in ids
    assert "graphics.create_rectangle" in ids


def test_router_calls_export_verify_cli_primitive(tmp_path):
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.router import Router

    pdf = tmp_path / "out.pdf"
    pdf.write_bytes(b"%PDF-1.7\n")
    router = Router(catalog=Catalog(repo_root=REPO_ROOT), repo_root=REPO_ROOT)
    payload = router.call("export.verify", {"path": str(pdf)})
    assert payload["kind"] == "pdf"
    assert payload["signature_ok"] is True


def test_cli_primitive_schema_exposes_required_args():
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.router import Router

    router = Router(catalog=Catalog(repo_root=REPO_ROOT), repo_root=REPO_ROOT)
    payload = router.schema("export.verify")
    assert payload["inputSchema"]["required"] == ["path"]
    assert "path" in payload["inputSchema"]["properties"]


def test_every_listed_callable_tool_has_agent_contract_fields():
    from cli_anything.indesign.indesign_cli import build_catalog_with_backends

    catalog, _warnings = build_catalog_with_backends()
    tools = catalog.list_tools(callable_only=True)
    assert tools

    required_fields = {
        "id",
        "domain",
        "name",
        "one_line_purpose",
        "arg_names",
        "source",
        "rank",
        "schema_size",
        "availability",
        "callable",
        "requires",
        "side_effects",
        "destructive",
        "target_scope",
        "needs_indesign",
        "produces_artifacts",
    }
    for tool in tools:
        assert required_fields.issubset(tool), tool["id"]
        assert isinstance(tool["arg_names"], list), tool["id"]
        assert isinstance(tool["requires"], list), tool["id"]
        assert isinstance(tool["side_effects"], list), tool["id"]
        assert tool["callable"] is True, tool["id"]
        assert "inputSchema" not in tool, tool["id"]


def test_every_callable_tool_schema_covers_catalog_args():
    from cli_anything.indesign.core.mcp_backend import McpBackend
    from cli_anything.indesign.core.router import PRIMITIVE_SCHEMAS, Router
    from cli_anything.indesign.indesign_cli import build_catalog_with_backends

    catalog, _warnings = build_catalog_with_backends()
    router = Router(catalog=catalog, repo_root=REPO_ROOT)
    backend_schemas: dict[tuple[str, str], dict] = {}
    for source, entry in (("advanced", "src/advanced/index.js"), ("classic", "src/index.js")):
        for item in McpBackend(repo_root=REPO_ROOT, entry=entry).list_tools():
            backend_schemas[(source, item["name"])] = item.get("inputSchema", {})

    for tool in catalog.list_tools(callable_only=True):
        if tool["source"] in {"cli", "script"}:
            schema = PRIMITIVE_SCHEMAS[tool["id"]]
        elif tool["source"] == "hidden_handler":
            schema = router.schema(tool["id"])["inputSchema"]
        elif tool["source"] == "plugin":
            schema = router.schema(tool["id"])["inputSchema"]
        else:
            schema = backend_schemas[(tool["source"], tool["name"])]
        properties = schema.get("properties", {})
        assert schema.get("type") == "object", tool["id"]
        assert isinstance(properties, dict), tool["id"]
        for arg_name in tool["arg_names"]:
            assert arg_name in properties, tool["id"]
        for required_name in schema.get("required", []):
            assert required_name in properties, tool["id"]


def test_tool_call_missing_args_returns_json_failure(tmp_path):
    args_file = tmp_path / "args.json"
    args_file.write_text("{}", encoding="utf-8")
    result = run_module("tool", "call", "export.verify", "--args", str(args_file))
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "MISSING_ARGUMENT"
    assert "Traceback" not in result.stderr


def test_tool_call_accepts_utf8_bom_args_file(tmp_path):
    args_file = tmp_path / "args-bom.json"
    pdf = tmp_path / "out.pdf"
    pdf.write_bytes(b"%PDF-1.7\n")
    args_file.write_text(json.dumps({"path": str(pdf)}), encoding="utf-8-sig")

    result = run_module("tool", "call", "export.verify", "--args", str(args_file))
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["data"]["kind"] == "pdf"


def test_tool_call_updates_session(tmp_path):
    run_module("session", "clear")
    args_file = tmp_path / "args.json"
    pdf = tmp_path / "out.pdf"
    pdf.write_bytes(b"%PDF-1.7\n")
    args_file.write_text(json.dumps({"path": str(pdf)}), encoding="utf-8")

    result = run_module("tool", "call", "export.verify", "--args", str(args_file))
    assert result.returncode == 0

    session = run_module("session", "show")
    payload = json.loads(session.stdout)
    assert payload["data"]["recent_calls"][0]["tool_id"] == "export.verify"
    assert payload["data"]["recent_calls"][0]["ok"] is True


def test_script_run_failure_updates_session():
    run_module("session", "clear")

    result = run_module("script", "run")
    assert result.returncode == 1

    session = run_module("session", "show")
    payload = json.loads(session.stdout)
    assert payload["data"]["recent_calls"][0]["tool_id"] == "script.run"
    assert payload["data"]["recent_calls"][0]["ok"] is False


def test_backend_tool_failure_returns_failure_envelope_without_path_leak(tmp_path):
    args_file = tmp_path / "args.json"
    secret_path = r"D:\Clients\AcmeSecret\missing.jsx"
    args_file.write_text(json.dumps({"filePath": secret_path}), encoding="utf-8")
    result = run_module("tool", "call", "template.run_jsx_file", "--args", str(args_file))
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    dumped = json.dumps(payload, ensure_ascii=False)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "MCP_TOOL_FAILED"
    assert "AcmeSecret" not in dumped
    assert "missing.jsx" not in dumped
    assert "D:\\Clients" not in dumped


def test_backend_tool_response_exposes_nested_json_result():
    from cli_anything.indesign.core.mcp_backend import McpBackend

    backend = McpBackend(repo_root=REPO_ROOT, entry="src/index.js")
    response = {
        "content": [
            {
                "type": "text",
                "text": json.dumps(
                    {
                        "success": True,
                        "operation": "Run JSX File",
                        "result": json.dumps({"ok": True, "marker": "NESTED_JSON_OK"}),
                    }
                ),
            }
        ]
    }

    payload = backend._parse_tool_response("run_jsx_file", response)

    assert payload["parsed"]["result"]
    assert payload["result_json"] == {"ok": True, "marker": "NESTED_JSON_OK"}


def test_pdf_verify_rejects_non_pdf(tmp_path):
    from cli_anything.indesign.core.artifacts import verify_artifact
    from cli_anything.indesign.core.errors import CliError

    fake = tmp_path / "out.pdf"
    fake.write_text("not a pdf", encoding="utf-8")
    try:
        verify_artifact(fake)
    except CliError as exc:
        assert exc.code == "ARTIFACT_SIGNATURE_INVALID"
    else:
        raise AssertionError("invalid PDF should fail")


def test_export_verify_accepts_powershell_roundtrip_timestamp(tmp_path):
    pdf = tmp_path / "out.pdf"
    pdf.write_bytes(b"%PDF-1.7\n")
    result = run_module(
        "export",
        "verify",
        str(pdf),
        "--created-after",
        "2999-01-01T00:00:00.0000000+00:00",
    )
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["error"]["code"] == "ARTIFACT_TOO_OLD"


def test_session_compact_does_not_store_args(tmp_path):
    from cli_anything.indesign.core.session import SessionStore

    store = SessionStore(tmp_path)
    store.record_call(tool_id="document.info", domain="document", source="classic", ok=True, duration_ms=5)
    payload = store.read(compact=True)
    assert "recent_calls" in payload
    assert "args" not in json.dumps(payload, ensure_ascii=False)


def test_health_reports_project_files():
    from cli_anything.indesign.core.health import health

    payload = health(REPO_ROOT, deep=False)
    assert payload["node_entry_advanced"]["exists"] is True
    assert payload["node_entry_classic"]["exists"] is True
    assert payload["deep"] is False


def test_deep_health_does_not_claim_unchecked_com_probe():
    from cli_anything.indesign.core.health import health

    payload = health(REPO_ROOT, deep=True)
    assert payload["winax"]["checked"] is True
    assert payload["indesign_com"]["checked"] is False
    assert "reason" in payload["indesign_com"]
