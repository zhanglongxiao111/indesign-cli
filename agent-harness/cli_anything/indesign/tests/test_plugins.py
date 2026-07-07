from support import *


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


def test_plugin_validate_rejects_missing_document_state_policy(tmp_path):
    bad = tmp_path / "bad-plugin"
    bad.mkdir()
    manifest = json.loads((FAKE_PLUGIN_ROOT / "manifest.json").read_text(encoding="utf-8"))
    manifest.pop("document_state_policy", None)
    (bad / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (bad / "index.js").write_text((FAKE_PLUGIN_ROOT / "index.js").read_text(encoding="utf-8"), encoding="utf-8")

    result = run_module("plugin", "validate", str(bad))

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["data"]["ok"] is False
    assert any(error["code"] == "PLUGIN_MANIFEST_INVALID" for error in payload["data"]["errors"])
    assert any(error["details"].get("field") == "document_state_policy" for error in payload["data"]["errors"])


def test_plugin_validate_rejects_missing_tool_contract_field(tmp_path):
    plugin = tmp_path / "contract-plugin"
    plugin.mkdir()
    manifest = json.loads((FAKE_PLUGIN_ROOT / "manifest.json").read_text(encoding="utf-8"))
    (plugin / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    source = (FAKE_PLUGIN_ROOT / "index.js").read_text(encoding="utf-8")
    source = source.replace("    preconditions: [],\n", "", 1)
    (plugin / "index.js").write_text(source, encoding="utf-8")

    result = run_module("plugin", "validate", str(plugin))

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert any(error["details"].get("field") == "preconditions" for error in payload["data"]["errors"])


def test_plugin_validate_rejects_disallowed_host_action(tmp_path):
    plugin = tmp_path / "bad-host-action-plugin"
    plugin.mkdir()
    manifest = json.loads((FAKE_PLUGIN_ROOT / "manifest.json").read_text(encoding="utf-8"))
    manifest["host_actions"] = ["script.run", "server.setup"]
    (plugin / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (plugin / "index.js").write_text((FAKE_PLUGIN_ROOT / "index.js").read_text(encoding="utf-8"), encoding="utf-8")

    result = run_module("plugin", "validate", str(plugin))

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert any(error["code"] == "PLUGIN_HOST_ACTION_DENIED" for error in payload["data"]["errors"])
    denied = next(error for error in payload["data"]["errors"] if error["code"] == "PLUGIN_HOST_ACTION_DENIED")
    assert denied["details"]["action"] == "server.setup"


def test_plugin_timeout_uses_common_uncertain_error():
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.plugins.backend import PluginBackend
    from cli_anything.indesign.core.plugins.manifest import PluginRecord

    record = PluginRecord(
        id="fake-html-plugin",
        source="test",
        root=FAKE_PLUGIN_ROOT,
        manifest_path=FAKE_PLUGIN_ROOT / "manifest.json",
        manifest=json.loads((FAKE_PLUGIN_ROOT / "manifest.json").read_text(encoding="utf-8")),
    )
    backend = PluginBackend(record, timeout=0.001)

    try:
        backend.request("plugin/handshake", {"sleep_ms": 1000})
    except CliError as exc:
        assert exc.code == "TIMEOUT"
        assert exc.state_uncertain is True
    else:
        raise AssertionError("plugin timeout should fail")


def test_router_passes_timeout_to_plugin_backend_and_uses_manifest_default():
    from cli_anything.indesign.core.catalog import Catalog, plugin_tool_entries
    from cli_anything.indesign.core.plugins.manifest import PluginRecord
    from cli_anything.indesign.core.router import Router

    manifest = json.loads((FAKE_PLUGIN_ROOT / "manifest.json").read_text(encoding="utf-8"))
    manifest["timeout_default_ms"] = 2500
    record = PluginRecord(
        id="fake-html-plugin",
        source="test",
        root=FAKE_PLUGIN_ROOT,
        manifest_path=FAKE_PLUGIN_ROOT / "manifest.json",
        manifest=manifest,
    )
    tools = plugin_tool_entries(
        record,
        [
            {
                "id": "html.authoring_lint",
                "domain": "html",
                "name": "authoring_lint",
                "arg_names": ["package"],
                "preconditions": [],
                "return_example": {},
                "failure_example": {},
            }
        ],
    )
    catalog = Catalog(repo_root=REPO_ROOT).with_exposed_tools(
        plugin_tools=tools,
        plugin_domain_summaries={"html": "HTML plugin"},
        plugin_records={record.id: record},
    )
    tool = next(item for item in catalog.list_tools(source="plugin") if item["id"] == "html.authoring_lint")

    assert Router(catalog=catalog, repo_root=REPO_ROOT)._plugin_backend(tool).timeout == 3
    assert Router(catalog=catalog, repo_root=REPO_ROOT, backend_timeout_seconds=9)._plugin_backend(tool).timeout == 9


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
