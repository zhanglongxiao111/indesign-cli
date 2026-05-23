import json
import os
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
HARNESS_ROOT = REPO_ROOT / "agent-harness"
sys.path.insert(0, str(HARNESS_ROOT))


def run_module(*args: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(HARNESS_ROOT)
    return subprocess.run(
        [sys.executable, "-m", "cli_anything.indesign", *args],
        cwd=REPO_ROOT,
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
    assert payload["data"]["name"] == "cli-anything-indesign"
    assert payload["data"]["version"] == "0.1.0"


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


def test_domain_top_tools_do_not_recommend_hidden_handlers():
    from cli_anything.indesign.core.catalog import Catalog

    catalog = Catalog(repo_root=REPO_ROOT)
    book = next(item for item in catalog.domains() if item["domain"] == "book")
    assert book["top_tools"] == []
    assert book["count_by_source"]["hidden_handler"] > 0


def test_hidden_handlers_are_listed_but_not_callable():
    from cli_anything.indesign.core.catalog import Catalog

    catalog = Catalog(repo_root=REPO_ROOT)
    book_tools = catalog.list_tools(domain="book", callable_only=False)
    assert any(item["availability"] == "hidden_handler" for item in book_tools)
    assert all(item["callable"] is False for item in book_tools if item["availability"] == "hidden_handler")


def test_tool_call_rejects_hidden_handler():
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.router import Router

    router = Router(catalog=Catalog(repo_root=REPO_ROOT), repo_root=REPO_ROOT)
    try:
        router.call("book.create_book", {})
    except CliError as exc:
        assert exc.code == "TOOL_NOT_CALLABLE"
    else:
        raise AssertionError("hidden handler should not be callable")


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


def test_tool_call_missing_args_returns_json_failure(tmp_path):
    args_file = tmp_path / "args.json"
    args_file.write_text("{}", encoding="utf-8")
    result = run_module("tool", "call", "export.verify", "--args", str(args_file))
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "MISSING_ARGUMENT"
    assert "Traceback" not in result.stderr


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
