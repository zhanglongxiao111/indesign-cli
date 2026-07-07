from support import *


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


def test_catalog_loads_node_backed_tools_from_registry_artifact(monkeypatch):
    from cli_anything.indesign import indesign_cli

    def fail_backend(*args, **kwargs):
        raise AssertionError("catalog must not query MCP backends for Node-backed tools")

    monkeypatch.setattr(indesign_cli.McpBackend, "list_tools", fail_backend)

    catalog, warnings = indesign_cli.build_catalog_with_backends()
    tools = catalog.list_tools(callable_only=True)
    source_counts = {}
    for tool in tools:
        source_counts[tool["source"]] = source_counts.get(tool["source"], 0) + 1

    assert warnings == []
    assert source_counts["classic"] == 114
    assert source_counts["advanced"] == 6
    assert source_counts["hidden_handler"] == 30
    assert source_counts["cli"] == 7
    assert source_counts["cli.primitive"] == 1
    assert source_counts["script"] == 1


def test_unknown_tool_hint_points_to_search():
    result = run_module("tool", "schema", "not_a_domain.not_a_tool")
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "TOOL_NOT_FOUND"
    assert "tool search" in payload["error"]["hint"]
    assert "tool domains" in payload["error"]["hint"]


def test_domain_top_tools_include_exposed_hidden_handlers():
    from cli_anything.indesign.core.catalog import Catalog

    catalog = Catalog(repo_root=REPO_ROOT)
    book = next(item for item in catalog.domains() if item["domain"] == "book")
    assert "book.create_book" in book["top_tools"]
    assert book["count_by_source"]["hidden_handler"] == 15


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
        "document.cleanup_document",
        "document.data_merge",
        "document.export_document_xml",
        "document.get_document_xml_structure",
        "document.open_cloud_document",
        "document.preflight_document",
        "document.save_document_to_cloud",
        "document.validate_document",
        "spread.place_xml_on_spread",
    }
    catalog = Catalog(repo_root=REPO_ROOT)
    hidden_tools = catalog.list_tools(source="hidden_handler", callable_only=True)
    assert {item["id"] for item in hidden_tools} == expected
    assert len(hidden_tools) == 30
    assert all(item["availability"] == "exposed" for item in hidden_tools)
    assert all(item["schema_size"] != "unknown" for item in hidden_tools)
    assert "filePath" in next(item for item in hidden_tools if item["id"] == "book.create_book")["arg_names"]
    assert "files" in next(item for item in hidden_tools if item["id"] == "presentation.add_image_grid")["arg_names"]

    book_info = next(item for item in hidden_tools if item["id"] == "book.get_book_info")
    assert "调用已有" not in book_info["one_line_purpose"]
    assert book_info["side_effects"] == []
    assert book_info["target_scope"] == "indesign_book"

    export_book = next(item for item in hidden_tools if item["id"] == "book.export_book")
    assert "Book" in export_book["one_line_purpose"]
    assert export_book["side_effects"] == ["filesystem_write"]
    assert {"pdf", "epub", "html"}.issubset(set(export_book["artifact_kinds"]))
    assert export_book["produces_artifacts"] is True

    export_presentation = next(item for item in hidden_tools if item["id"] == "presentation.export_presentation_pdf")
    assert export_presentation["side_effects"] == ["filesystem_write"]
    assert export_presentation["artifact_kinds"] == ["pdf"]
    assert export_presentation["target_scope"] == "filesystem"

    cleanup = next(item for item in hidden_tools if item["id"] == "document.cleanup_document")
    assert cleanup["arg_names"] == ["removeUnusedStyles", "removeUnusedColors", "removeUnusedLayers", "removeHiddenElements"]
    assert cleanup["source"] == "hidden_handler"


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


def test_internal_bridge_resolves_tools_from_registry_without_legacy_bridge():
    old_bridge = REPO_ROOT / "agent-harness" / "cli_anything" / "indesign" / "node" / "hidden_handler_bridge.mjs"
    assert not old_bridge.exists()

    bridge = REPO_ROOT / "agent-harness" / "cli_anything" / "indesign" / "node" / "internal_tool_bridge.mjs"
    assert bridge.exists()
    assert "src/handlers" not in bridge.read_text(encoding="utf-8")

    result = subprocess.run(
        ["node", str(bridge)],
        cwd=REPO_ROOT,
        input=json.dumps(
            {
                "toolId": "presentation.export_presentation_pdf",
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
    assert payload["toolId"] == "presentation.export_presentation_pdf"
    assert payload["source"] == "hidden_handler"


def test_catalog_preserves_artifact_domains_for_node_backed_tools():
    from cli_anything.indesign.core.catalog import Catalog

    catalog = Catalog(repo_root=REPO_ROOT)
    ids = {tool["id"] for tool in catalog.list_tools(callable_only=True)}
    assert "page.add_page" in ids
    assert "master.create_master_spread" in ids
    assert "export.export_pdf" in ids
    assert "graphics.create_rectangle" in ids


def test_catalog_destructive_helper_is_canonical_for_cleanup_tools():
    from cli_anything.indesign.core.catalog import _destructive

    assert _destructive("cleanup_document") is False
    assert _destructive("close_document") is True
    assert _destructive("delete_layer") is True
    assert _destructive("create_document") is False


def test_canonical_switch_only_entry_uses_catalog_contract_inference():
    from cli_anything.indesign.core.catalog import canonical_switch_only_entry

    cleanup = canonical_switch_only_entry(
        domain="document",
        name="cleanup_document",
        handler="DocumentHandlers.cleanupDocument",
    )
    assert cleanup["id"] == "document.cleanup_document"
    assert cleanup["source"] == "switch_only_no_cli_schema"
    assert cleanup["side_effects"] == ["indesign_mutation"]
    assert cleanup["destructive"] is False
    assert cleanup["mutates_document"] is True
    assert cleanup["writes_filesystem"] is False
    assert cleanup["needs_indesign"] is True
    assert cleanup["requires_active_document"] is True

    exported = canonical_switch_only_entry(
        domain="document",
        name="export_document_xml",
        handler="DocumentHandlers.exportDocumentXml",
    )
    assert exported["side_effects"] == ["filesystem_write"]
    assert exported["writes_filesystem"] is True
    assert exported["mutates_document"] is False


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

    script_payload = router.schema("script.run")
    assert "timeout" in script_payload["inputSchema"]["properties"]
    assert "timeout" in script_payload["tool"]["arg_names"]
    assert "timeout_ms" in script_payload["tool"]["arg_names"]
    assert script_payload["inputSchema"]["oneOf"] == [{"required": ["file"]}, {"required": ["stdin"]}]
    assert "文件模式" in script_payload["inputSchema"]["properties"]["file"]["description"]
    assert "临时探针" in script_payload["inputSchema"]["properties"]["stdin"]["description"]
    assert "session_write" in script_payload["tool"]["side_effects"]

    health_payload = router.schema("server.health")
    assert "connect_indesign" in health_payload["tool"]["arg_names"]


def test_tool_schema_includes_agent_metadata():
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.router import Router

    router = Router(catalog=Catalog(repo_root=REPO_ROOT), repo_root=REPO_ROOT)
    payload = router.schema("export.verify")

    assert "metadata" in payload
    metadata = payload["metadata"]
    for field in (
        "requires_active_document",
        "mutates_document",
        "writes_filesystem",
        "returns_artifacts",
        "return_shape",
        "return_example",
        "failure_example",
        "preconditions",
        "safe_usage_notes",
        "common_next_steps",
    ):
        assert field in metadata
    assert metadata["returns_artifacts"] is True


def test_tool_explain_returns_task_level_contract():
    result = run_module("tool", "explain", "graphics.create_rectangle")
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    data = payload["data"]
    assert data["tool_id"] == "graphics.create_rectangle"
    assert "preconditions" in data
    assert "side_effects" in data
    assert "return_example" in data
    assert "failure_example" in data
    assert "common_next_steps" in data


def test_agent_quickstart_returns_canonical_commands():
    result = run_module("agent", "quickstart")
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    commands = payload["data"]["commands"]
    assert "indesign-cli server health --deep --connect-indesign" in commands
    assert any("--args-file" in command for command in commands)


def test_inline_script_tool_is_marked_as_short_probe():
    from cli_anything.indesign.indesign_cli import build_catalog_with_backends

    catalog, _warnings = build_catalog_with_backends()
    inline_tool = next(item for item in catalog.list_tools(domain="script") if item["id"] == "script.execute_indesign_code")
    assert "短" in inline_tool["one_line_purpose"]
    assert "script.run" in inline_tool["one_line_purpose"]


def test_router_passes_timeout_to_mcp_backend():
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.router import Router

    router = Router(catalog=Catalog(repo_root=REPO_ROOT), repo_root=REPO_ROOT, backend_timeout_seconds=123)
    assert router._backend("advanced").timeout_seconds == 123

    try:
        Router._parse_timeout(0)
    except CliError as exc:
        assert exc.code == "BAD_TIMEOUT"
    else:
        raise AssertionError("invalid timeout should fail")


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
        "requires_active_document",
        "requires_active_page",
        "uses_selection",
        "opens_document",
        "closes_document",
        "may_close_document",
        "mutates_document",
        "writes_filesystem",
        "returns_artifacts",
        "return_shape",
        "return_example",
        "failure_example",
        "preconditions",
        "safe_usage_notes",
        "common_next_steps",
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
        if tool["source"] in {"cli", "cli.primitive", "script"}:
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


def test_empty_schema_tool_call_can_omit_args(tmp_path):
    result = run_module("tool", "call", "session.show", cwd=tmp_path)
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["tool_id"] == "session.show"


def test_required_schema_without_args_returns_json_failure():
    result = run_module("tool", "call", "export.verify")
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert_failure_envelope(payload, "ARGS_REQUIRED")
    assert "usage:" not in result.stdout.lower()


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


def test_timeout_exception_returns_uncertain_failure_envelope():
    from cli_anything.indesign.core.envelope import failure
    from cli_anything.indesign.core.errors import TimeoutError

    payload = failure(command="tool call", error=TimeoutError("MCP process timed out"), duration_ms=2)

    assert_failure_envelope(payload, "TIMEOUT")
    assert payload["state_uncertain"] is True
    assert isinstance(payload["next_action"], str)


def test_session_doctor_reports_recent_failure(tmp_path):
    from cli_anything.indesign.core.session import SessionStore

    store = SessionStore(tmp_path)
    store.record_call(
        tool_id="export.verify",
        domain="export",
        source="cli",
        ok=False,
        duration_ms=12,
        error_code="ARTIFACT_NOT_FOUND",
        error_summary="Missing output",
        next_action="Create the artifact first.",
    )

    result = run_module("session", "doctor", cwd=tmp_path)

    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert "recent_failure" in payload["data"]
    assert payload["data"]["recent_failure"]["error_code"] == "ARTIFACT_NOT_FOUND"
    assert "next_action" in payload["data"]


def test_tool_batch_stops_on_first_failure(tmp_path):
    plan = tmp_path / "batch.json"
    plan.write_text(
        json.dumps(
            {
                "steps": [
                    {"id": "show", "type": "tool", "tool": "session.show", "args": {}},
                    {"id": "bad-step", "type": "tool", "tool": "missing.tool", "args": {}},
                ]
            }
        ),
        encoding="utf-8",
    )

    result = run_module("tool", "batch", "--plan", str(plan), cwd=tmp_path)

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["data"]["failed_step"] == "bad-step"
    assert payload["data"]["steps"][0]["ok"] is True


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


def test_backend_tool_response_fails_on_nested_json_failure():
    from cli_anything.indesign.core.errors import CliError
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
                        "result": json.dumps({"ok": False, "step": "export", "error": "boom"}),
                    }
                ),
            }
        ]
    }

    try:
        backend._parse_tool_response("run_jsx_file", response)
    except CliError as exc:
        assert exc.code == "INDESIGN_SCRIPT_FAILED"
        assert exc.details["step"] == "export"
    else:
        raise AssertionError("nested ok:false should fail")


def test_backend_tool_response_fails_on_top_level_ok_false():
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.mcp_backend import McpBackend

    backend = McpBackend(repo_root=REPO_ROOT, entry="src/index.js")
    response = {
        "content": [
            {
                "type": "text",
                "text": json.dumps(
                    {
                        "ok": False,
                        "code": "INDESIGN_SCRIPT_FAILED",
                        "message": "INTENTIONAL_REFERENCE_ERROR is undefined",
                        "step": "trigger intentional reference failure",
                        "line": 27,
                        "fileName": "probe.jsx",
                        "errorName": "ReferenceError",
                        "errorNumber": 2,
                        "data": {"expectedMarker": "INTENTIONAL_ERROR_MARKER"},
                    }
                ),
            }
        ]
    }

    try:
        backend._parse_tool_response("get_document_info", response)
    except CliError as exc:
        assert exc.code == "INDESIGN_SCRIPT_FAILED"
        assert exc.details["step"] == "trigger intentional reference failure"
        assert exc.details["line"] == 27
        assert exc.details["fileName"] == "probe.jsx"
        assert exc.details["errorName"] == "ReferenceError"
        assert exc.details["errorNumber"] == 2
        assert exc.details["data"]["expectedMarker"] == "INTENTIONAL_ERROR_MARKER"
    else:
        raise AssertionError("top-level ok:false should fail")


def test_backend_tool_response_fails_on_legacy_failure_string():
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.mcp_backend import McpBackend

    backend = McpBackend(repo_root=REPO_ROOT, entry="src/index.js")
    response = {"content": [{"type": "text", "text": "No document open"}]}

    try:
        backend._parse_tool_response("get_document_info", response)
    except CliError as exc:
        assert exc.code == "NO_ACTIVE_DOCUMENT"
    else:
        raise AssertionError("legacy failure string should fail")


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


def test_mcp_failure_message_falls_back_to_result_text():
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.mcp_backend import McpBackend

    backend = McpBackend(repo_root=REPO_ROOT, entry="src/index.js")
    response = {
        "isError": True,
        "content": [{"type": "text", "text": json.dumps({"success": False, "result": "无法访问 JSX 文件：ENOENT"})}],
    }
    try:
        backend._parse_tool_response("run_jsx_file", response)
    except CliError as exc:
        assert "无法访问 JSX 文件" in exc.message
    else:
        raise AssertionError("expected CliError")


def test_tool_call_rejects_unknown_argument_keys():
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.indesign_cli import validate_call_args

    schema = {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}
    try:
        validate_call_args({"filePath": "x.pdf"}, schema)
    except CliError as exc:
        assert exc.code == "ARGS_UNKNOWN_KEY"
        assert exc.details["unknown"] == ["filePath"]
        assert exc.details["allowed"] == ["path"]
    else:
        raise AssertionError("expected CliError")
    validate_call_args({"path": "x.pdf"}, schema)


def test_tool_list_output_is_slim():
    from cli_anything.indesign.indesign_cli import SLIM_TOOL_FIELDS, slim_tools

    tools = [{key: "x" for key in SLIM_TOOL_FIELDS} | {"return_example": {"big": True}, "plugin": "p1"}]
    slimmed = slim_tools(tools)
    assert "return_example" not in slimmed[0]
    assert slimmed[0]["plugin"] == "p1"
    assert set(slimmed[0]) == set(SLIM_TOOL_FIELDS) | {"plugin"}


def test_tool_list_callable_only_alone_lists_tools():
    result = run_module("tool", "list", "--callable-only")
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert isinstance(payload["data"], list)
    assert payload["data"], "expected non-empty tool list"
    assert "id" in payload["data"][0]
    assert "domain" in payload["data"][0]
    assert "return_example" not in payload["data"][0]
