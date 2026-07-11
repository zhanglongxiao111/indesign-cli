from support import *


def test_runtime_resolves_server_root_and_packaged_skill():
    from cli_anything.indesign.core.runtime import resolve_server_root, skill_source_path

    server_root = resolve_server_root()
    assert (server_root / "src" / "index.js").exists()
    assert (server_root / "src" / "advanced" / "index.js").exists()
    assert (server_root / "package.json").exists()

    skill_path = skill_source_path()
    assert skill_path.name == "SKILL.md"
    assert skill_path == REPO_ROOT / "skills" / "indesign-cli" / "SKILL.md"
    skill_text = skill_path.read_text(encoding="utf-8")
    assert "name: indesign-cli" in skill_text
    assert "pip install indesign-cli" in skill_text
    assert "server health --deep" in skill_text
    assert "打开或连接 InDesign" in skill_text
    assert "script run --stdin" in skill_text
    assert "不得关闭用户已经打开的 InDesign 文档" in skill_text
    assert "正式成果文件保持打开" in skill_text
    assert "D:\\AI\\html-indesign" not in skill_text
    assert '"templatePath"' not in skill_text
    assert '"values"' not in skill_text
    assert "git+https://github.com" not in skill_text
    assert "cli-anything-indesign" not in skill_text


def test_node_dependency_setup_runs_npm_install_against_server_root(monkeypatch, tmp_path):
    from cli_anything.indesign.core.node_setup import setup_node_dependencies

    calls = []

    def fake_which(name):
        return {"node": "C:\\nodejs\\node.exe", "npm": "C:\\nodejs\\npm.cmd"}.get(name)

    def fake_run(args, **kwargs):
        calls.append((args, kwargs))

        class Result:
            returncode = 0
            stdout = "10.9.0" if args[-1] == "--version" else "installed"
            stderr = ""

        return Result()

    monkeypatch.setattr(shutil, "which", fake_which)
    monkeypatch.setattr(subprocess, "run", fake_run)

    payload = setup_node_dependencies(tmp_path)

    assert calls[-1][0] == ["C:\\nodejs\\npm.cmd", "install"]
    assert calls[-1][1]["cwd"] == tmp_path
    assert payload["ok"] is True
    assert payload["server_root"] == str(tmp_path)
    assert payload["npm_source"] == "path"
    assert payload["toolchain"]["npm"]["version"] == "10.9.0"


def test_node_dependency_setup_falls_back_to_node_bundled_npm(monkeypatch, tmp_path):
    from cli_anything.indesign.core.node_setup import setup_node_dependencies

    node_dir = tmp_path / "nodejs"
    npm_cli = node_dir / "node_modules" / "npm" / "bin" / "npm-cli.js"
    npm_cli.parent.mkdir(parents=True)
    npm_cli.write_text("// npm cli", encoding="utf-8")
    node_path = node_dir / "node.exe"
    node_path.write_text("", encoding="utf-8")
    broken_npm = node_dir / "npm.cmd"
    server_root = tmp_path / "server"
    server_root.mkdir()

    calls = []

    def fake_which(name):
        return {"node": str(node_path), "npm": str(broken_npm)}.get(name)

    def fake_run(args, **kwargs):
        calls.append((args, kwargs))

        class Result:
            stdout = "v22.15.0"
            stderr = ""
            returncode = 1 if args[0] == str(broken_npm) else 0

        return Result()

    monkeypatch.setattr(shutil, "which", fake_which)
    monkeypatch.setattr(subprocess, "run", fake_run)

    payload = setup_node_dependencies(server_root)

    assert payload["npm_source"] == "node_bundled_fallback"
    assert calls[-1][0] == [str(node_path), str(npm_cli), "install"]


def test_node_dependency_setup_fails_with_remediation_when_npm_unusable(monkeypatch, tmp_path):
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.node_setup import setup_node_dependencies

    monkeypatch.setattr(shutil, "which", lambda name: None)

    try:
        setup_node_dependencies(tmp_path)
    except CliError as exc:
        assert exc.code == "NPM_NOT_AVAILABLE"
        assert exc.hint
    else:
        raise AssertionError("expected CliError")


def test_server_root_warnings_flags_long_paths():
    from cli_anything.indesign.core.node_setup import server_root_warnings

    long_root = Path("D:\\") / ("x" * 150)
    warnings = server_root_warnings(long_root)
    assert warnings
    assert "INDESIGN_CLI_SERVER_ROOT" in warnings[0]
    assert server_root_warnings(Path("D:\\srv")) == []


def test_health_reports_project_files():
    from cli_anything.indesign.core.health import health

    payload = health(REPO_ROOT, deep=False)
    assert payload["node_entry_advanced"]["exists"] is True
    assert payload["node_entry_classic"]["exists"] is True
    assert payload["deep"] is False


def test_health_reports_toolchain_diagnostics(monkeypatch):
    from cli_anything.indesign.core import health as health_module

    monkeypatch.setattr(
        health_module,
        "toolchain_report",
        lambda: {
            "node": {"path": "C:\\nodejs\\node.exe", "version": "v22.15.0"},
            "npm": {"path": "C:\\nodejs\\npm.cmd", "version": None},
        },
    )

    payload = health_module.health(REPO_ROOT, deep=False)

    assert payload["node"]["available"] is True
    assert payload["node"]["version"] == "v22.15.0"
    assert payload["npm"]["available"] is False
    assert payload["python"]["executable"]
    assert payload["python"]["package_root"]
    assert "user_base" in payload["python"]
    assert payload["server_root"]["path"] == str(REPO_ROOT)
    assert payload["server_root"]["source"] in {"auto", "env_override"}
    assert isinstance(payload["server_root"]["long_path_risk"], bool)
    assert "unc" in payload["cwd"]


def test_invalid_server_root_override_emits_json_envelope(tmp_path):
    env_overrides = {"INDESIGN_CLI_SERVER_ROOT": str(tmp_path)}

    version_result = run_module("--version", env_overrides=env_overrides)
    assert version_result.returncode == 0
    assert json.loads(version_result.stdout)["ok"] is True

    health_result = run_module("server", "health", env_overrides=env_overrides)
    assert health_result.returncode == 1
    payload = json.loads(health_result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "SERVER_ROOT_INVALID"
    assert payload["error"]["hint"]
    assert "Traceback" not in health_result.stderr


def test_deep_health_does_not_claim_unchecked_com_probe():
    from cli_anything.indesign.core.health import health

    payload = health(REPO_ROOT, deep=True)
    assert payload["winax"]["checked"] is True
    assert payload["indesign_com"]["checked"] is False
    assert "reason" in payload["indesign_com"]


def test_health_connect_indesign_uses_explicit_com_probe(monkeypatch):
    from cli_anything.indesign.core import health as health_module

    def fake_probe(repo_root):
        assert repo_root == REPO_ROOT
        return {"checked": True, "available": True, "appName": "Adobe InDesign", "version": "20.x", "documentsCount": 0}

    monkeypatch.setattr(health_module, "indesign_com_probe", fake_probe)

    payload = health_module.health(REPO_ROOT, deep=True, connect_indesign=True)

    assert payload["indesign_com"]["checked"] is True
    assert payload["indesign_com"]["available"] is True
    assert payload["indesign_com"]["documentsCount"] == 0


def test_health_winax_probe_uses_resolved_node(monkeypatch):
    from cli_anything.indesign.core import health as health_module

    calls = []

    def fake_run(args, **kwargs):
        calls.append(args)

        class Result:
            returncode = 0
            stdout = "ok"
            stderr = ""

        return Result()

    monkeypatch.setattr(health_module, "resolve_node_executable", lambda repo_root: r"D:\runtime\node\node.exe")
    monkeypatch.setattr(subprocess, "run", fake_run)

    payload = health_module._check_winax(REPO_ROOT)

    assert payload["available"] is True
    assert calls[0][0] == r"D:\runtime\node\node.exe"


def test_server_health_parser_accepts_connect_indesign_flag():
    from cli_anything.indesign.indesign_cli import build_parser

    parser = build_parser()
    args = parser.parse_args(["server", "health", "--deep", "--connect-indesign"])

    assert args.deep is True
    assert args.connect_indesign is True


def test_runtime_resolves_explicit_and_bundled_node(monkeypatch, tmp_path):
    from cli_anything.indesign.core.runtime import resolve_node_executable

    explicit = tmp_path / "explicit" / "node.exe"
    explicit.parent.mkdir()
    explicit.write_text("", encoding="utf-8")
    monkeypatch.setenv("INDESIGN_CLI_NODE", str(explicit))

    assert resolve_node_executable(tmp_path) == explicit.resolve()

    monkeypatch.delenv("INDESIGN_CLI_NODE")
    runtime_node = tmp_path / "runtime" / "node" / "node.exe"
    runtime_node.parent.mkdir(parents=True)
    runtime_node.write_text("", encoding="utf-8")
    monkeypatch.setenv("INDESIGN_CLI_RUNTIME_ROOT", str(tmp_path / "runtime"))

    assert resolve_node_executable(tmp_path) == runtime_node.resolve()


def test_mcp_backend_uses_resolved_node(monkeypatch, tmp_path):
    from cli_anything.indesign.core.mcp_backend import McpBackend

    entry = tmp_path / "src" / "index.js"
    entry.parent.mkdir(parents=True)
    entry.write_text("// server", encoding="utf-8")
    node = tmp_path / "runtime" / "node" / "node.exe"
    node.parent.mkdir(parents=True)
    node.write_text("", encoding="utf-8")
    monkeypatch.setenv("INDESIGN_CLI_RUNTIME_ROOT", str(tmp_path / "runtime"))
    calls = []

    class FakeProc:
        def __init__(self):
            self.stdin = io.StringIO()
            self.stdout = io.StringIO(
                json.dumps({"jsonrpc": "2.0", "id": 1, "result": {}})
                + "\n"
                + json.dumps({"jsonrpc": "2.0", "id": 2, "result": {"tools": []}})
                + "\n"
            )
            self.stderr = io.StringIO("")

        def poll(self):
            return None

        def terminate(self):
            return None

        def wait(self, timeout=None):
            return 0

        def kill(self):
            return None

    def fake_popen(cmd, **kwargs):
        calls.append(cmd)
        return FakeProc()

    monkeypatch.setattr(subprocess, "Popen", fake_popen)

    tools = McpBackend(repo_root=tmp_path, entry="src/index.js").list_tools()

    assert tools == []
    assert calls[0][0] == str(node.resolve())


def test_edge_probe_prefers_controlled_executable_and_searches_standard_roots(tmp_path):
    from cli_anything.indesign.core.runtime_health import edge_candidates, probe_edge

    controlled = tmp_path / "controlled" / "msedge.exe"
    controlled.parent.mkdir()
    controlled.write_text("edge", encoding="utf-8")
    env = {
        "HTML_INDESIGN_BROWSER_EXECUTABLE": str(controlled),
        "ProgramFiles(x86)": str(tmp_path / "pf86"),
        "ProgramFiles": str(tmp_path / "pf"),
        "LOCALAPPDATA": str(tmp_path / "local"),
    }

    result = probe_edge(env)

    assert result["available"] is True
    assert result["path"] == str(controlled.resolve())
    assert edge_candidates(env)[1:] == [
        tmp_path / "pf86" / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        tmp_path / "pf" / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        tmp_path / "local" / "Microsoft" / "Edge" / "Application" / "msedge.exe",
    ]


def test_edge_probe_reports_stable_missing_code(tmp_path):
    from cli_anything.indesign.core.runtime_health import probe_edge

    result = probe_edge({"ProgramFiles": str(tmp_path / "missing")})

    assert result["available"] is False
    assert result["code"] == "EDGE_NOT_AVAILABLE"


def test_server_health_reports_current_runtime_components_builtin_html_and_edge(monkeypatch, tmp_path):
    from cli_anything.indesign.core import health as health_module

    runtime = tmp_path / "runtime" / "0.5.0"
    plugin = runtime / "plugins" / "html-indesign"
    plugin.mkdir(parents=True)
    (plugin / "manifest.json").write_text('{"id":"html-indesign","version":"0.2.0"}', encoding="utf-8")
    state = tmp_path / "state" / "current-runtime.json"
    state.parent.mkdir()
    state.write_text(json.dumps({"schema_version": 1, "version": "0.5.0", "root": str(runtime), "components": {"indesign_cli": "0.5.0", "html_indesign": "0.2.0", "node": "20.18.1", "winax": "3.6.2", "browser": "msedge"}}), encoding="utf-8")
    monkeypatch.setenv("INDESIGN_CLI_RUNTIME_ROOT", str(runtime))
    monkeypatch.setattr(health_module, "probe_edge", lambda: {"checked": True, "available": True, "browser": "msedge", "path": "C:\\Edge\\msedge.exe"})
    monkeypatch.setattr(health_module, "validate_builtin_plugin", lambda root, components: {"tools": ["html.authoring_lint", "html.build_indesign", "html.compile_instructions", "html.reverse_export"]})

    payload = health_module.health(REPO_ROOT, deep=False)

    assert payload["runtime"]["root"] == str(runtime.resolve())
    assert payload["runtime"]["version"] == "0.5.0"
    assert payload["runtime"]["components"]["html_indesign"] == "0.2.0"
    assert payload["runtime"]["components"]["node"] == "20.18.1"
    assert payload["runtime"]["builtin_html_plugin"]["available"] is True
    assert payload["edge"]["available"] is True


def test_server_health_explicitly_reports_missing_builtin_html(monkeypatch, tmp_path):
    from cli_anything.indesign.core import health as health_module

    runtime = tmp_path / "runtime" / "0.5.0"
    runtime.mkdir(parents=True)
    monkeypatch.setenv("INDESIGN_CLI_RUNTIME_ROOT", str(runtime))
    monkeypatch.setattr(health_module, "probe_edge", lambda: {"checked": True, "available": True})

    payload = health_module.health(REPO_ROOT, deep=False)

    assert payload["runtime"]["builtin_html_plugin"] == {
        "available": False,
        "code": "BUILTIN_PLUGIN_MISSING",
        "path": str(runtime / "plugins" / "html-indesign" / "manifest.json"),
    }


def test_server_health_reports_invalid_builtin_manifest_as_unavailable(monkeypatch, tmp_path):
    from cli_anything.indesign.core import health as health_module

    runtime = tmp_path / "runtime" / "0.5.0"
    plugin = runtime / "plugins" / "html-indesign"
    plugin.mkdir(parents=True)
    manifest = plugin / "manifest.json"
    manifest.write_text("{broken", encoding="utf-8")
    components = {"indesign_cli": "0.5.0", "html_indesign": "0.2.0", "node": "20.18.1", "winax": "3.6.2", "browser": "msedge"}
    state = tmp_path / "state" / "current-runtime.json"
    state.parent.mkdir()
    state.write_text(json.dumps({"schema_version": 1, "version": "0.5.0", "root": str(runtime), "components": components}), encoding="utf-8")
    monkeypatch.setenv("INDESIGN_CLI_RUNTIME_ROOT", str(runtime))
    monkeypatch.setattr(health_module, "probe_edge", lambda: {"checked": True, "available": True})

    payload = health_module.health(REPO_ROOT, deep=False)

    assert payload["runtime"]["builtin_html_plugin"]["available"] is False
    assert payload["runtime"]["builtin_html_plugin"]["code"] == "BUILTIN_PLUGIN_INVALID"
    assert payload["runtime"]["builtin_html_plugin"]["reason"] == "PLUGIN_MANIFEST_JSON_INVALID"


def test_server_health_reports_invalid_current_runtime_state_as_unavailable(monkeypatch, tmp_path):
    from cli_anything.indesign.core import health as health_module

    runtime = tmp_path / "runtime" / "0.5.0"
    runtime.mkdir(parents=True)
    state = tmp_path / "state" / "current-runtime.json"
    state.parent.mkdir()
    state.write_text("{broken", encoding="utf-8")
    monkeypatch.setenv("INDESIGN_CLI_RUNTIME_ROOT", str(runtime))
    monkeypatch.setattr(health_module, "probe_edge", lambda: {"checked": True, "available": True})

    payload = health_module.health(REPO_ROOT, deep=False)

    assert payload["runtime"]["available"] is False
    assert payload["runtime"]["code"] == "RUNTIME_STATE_INVALID"
    assert payload["runtime"]["reason"] == "STATE_JSON_INVALID"


def test_server_health_uses_strict_current_runtime_schema_validation(monkeypatch, tmp_path):
    from cli_anything.indesign.core import health as health_module

    runtime = tmp_path / "runtime" / "0.5.0"
    runtime.mkdir(parents=True)
    state = tmp_path / "state" / "current-runtime.json"
    state.parent.mkdir()
    state.write_text(
        json.dumps(
            {
                "schema_version": 999,
                "version": "0.5.0",
                "root": str(runtime),
                "components": {"indesign_cli": "0.5.0", "html_indesign": "0.2.0", "node": "20.18.1", "winax": "3.6.2", "browser": "msedge"},
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("INDESIGN_CLI_RUNTIME_ROOT", str(runtime))
    monkeypatch.setattr(health_module, "probe_edge", lambda: {"checked": True, "available": True})

    payload = health_module.health(REPO_ROOT, deep=False)

    assert payload["runtime"]["available"] is False
    assert payload["runtime"]["code"] == "RUNTIME_STATE_INVALID"
    assert payload["runtime"]["reason"] == "STATE_SCHEMA_UNSUPPORTED"


def test_server_health_rejects_active_root_that_is_not_current_state_root(monkeypatch, tmp_path):
    from cli_anything.indesign.core import health as health_module

    active = tmp_path / "runtime" / "0.5.0"
    current = tmp_path / "runtime" / "0.4.2"
    active.mkdir(parents=True)
    current.mkdir(parents=True)
    state = tmp_path / "state" / "current-runtime.json"
    state.parent.mkdir()
    state.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "version": "0.4.2",
                "root": str(current),
                "components": {"indesign_cli": "0.4.2", "html_indesign": "0.1.0", "node": "20.18.1", "winax": "3.6.2", "browser": "msedge"},
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("INDESIGN_CLI_RUNTIME_ROOT", str(active))
    monkeypatch.setattr(health_module, "probe_edge", lambda: {"checked": True, "available": True})

    payload = health_module.health(REPO_ROOT, deep=False)

    assert payload["runtime"]["available"] is False
    assert payload["runtime"]["code"] == "RUNTIME_STATE_INVALID"
    assert payload["runtime"]["reason"] == "ACTIVE_RUNTIME_ROOT_MISMATCH"


def test_server_health_reuses_formal_plugin_validation_for_semantic_errors(monkeypatch, tmp_path):
    from cli_anything.indesign.core import health as health_module

    runtime = tmp_path / "runtime" / "0.5.0"
    plugin = runtime / "plugins" / "html-indesign"
    plugin.mkdir(parents=True)
    manifest = {
        "schema_version": 1,
        "protocol": "indesign-cli-plugin.v1",
        "id": "html-indesign",
        "name": "HTML InDesign",
        "version": "0.2.0",
        "kind": "node-plugin",
        "domain": "html",
        "entry": "index.js",
        "description": "invalid permissions",
        "timeout_default_ms": 30000,
        "document_state_policy": "host_reported",
        "host_actions": ["script.run"],
        "requires": {"indesign_cli": ">=0.5.0", "node": ">=20.18.1"},
        "capabilities": {"tools": True},
        "permissions": {"indesign": "direct"},
    }
    (plugin / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (plugin / "index.js").write_text("// plugin", encoding="utf-8")
    components = {"indesign_cli": "0.5.0", "html_indesign": "0.2.0", "node": "20.18.1", "winax": "3.6.2", "browser": "msedge"}
    state = tmp_path / "state" / "current-runtime.json"
    state.parent.mkdir()
    state.write_text(json.dumps({"schema_version": 1, "version": "0.5.0", "root": str(runtime), "components": components}), encoding="utf-8")
    monkeypatch.setenv("INDESIGN_CLI_RUNTIME_ROOT", str(runtime))
    monkeypatch.setattr(health_module, "probe_edge", lambda: {"checked": True, "available": True})

    payload = health_module.health(REPO_ROOT, deep=False)

    assert payload["runtime"]["builtin_html_plugin"]["available"] is False
    assert payload["runtime"]["builtin_html_plugin"]["code"] == "BUILTIN_PLUGIN_INVALID"
    assert payload["runtime"]["builtin_html_plugin"]["reason"] == "PLUGIN_MANIFEST_INVALID"
