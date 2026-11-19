from __future__ import annotations

import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

from support import *


FAKE_MCP_SERVER_JS = r"""
const readline = require('readline');

let callCount = 0;
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', (line) => {
  if (!line.trim()) return;
  let req;
  try {
    req = JSON.parse(line);
  } catch (_) {
    return;
  }
  if (req.id === undefined) {
    return;
  }
  const reply = (result) => {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }) + '\n');
  };
  if (req.method === 'initialize') {
    reply({
      protocolVersion: '2024-11-05',
      capabilities: {},
      serverInfo: { name: 'fake-mcp-server', version: '1.0.0' },
    });
    return;
  }
  if (req.method === 'tools/list') {
    reply({ tools: [] });
    return;
  }
  if (req.method === 'tools/call') {
    callCount += 1;
    const params = req.params || {};
    const args = params.arguments || {};
    if (args.crashNow) {
      process.stderr.write('simulated crash on call ' + callCount + '\n');
      process.exit(1);
    }
    const finish = () => {
      if (args.failBusiness) {
        reply({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                code: 'NO_ACTIVE_DOCUMENT',
                message: 'No document open',
              }),
            },
          ],
        });
        return;
      }
      reply({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              pid: process.pid,
              callCount,
              name: params.name,
              args,
            }),
          },
        ],
      });
    };
    const sleepMs = Number(args.sleepMs || 0);
    if (sleepMs > 0) {
      setTimeout(finish, sleepMs);
    } else {
      finish();
    }
  }
});
""".lstrip()


def _write_fake_mcp_server(root: Path) -> Path:
    entry = root / "fake_mcp_server.js"
    entry.write_text(FAKE_MCP_SERVER_JS, encoding="utf-8")
    return entry


def _isolate_localappdata(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    local_app_data = tmp_path / "localappdata"
    local_app_data.mkdir(parents=True, exist_ok=True)
    monkeypatch.delenv("INDESIGN_CLI_INSTALL_ROOT", raising=False)
    monkeypatch.setenv("LOCALAPPDATA", str(local_app_data))
    return local_app_data


def _install_plugin_copy(tmp_path: Path) -> tuple[Path, Path]:
    plugin_dir = tmp_path / "plugin-copy"
    shutil.copytree(FAKE_PLUGIN_ROOT, plugin_dir)
    workspace = tmp_path / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    from cli_anything.indesign import __version__
    from cli_anything.indesign.core.plugins.install import install_plugin

    install_plugin(str(plugin_dir), cwd=workspace, host_version=__version__)
    return plugin_dir, workspace


def _capture_emit(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    from cli_anything.indesign import indesign_cli

    captured: list[dict[str, Any]] = []

    def fake_emit(payload: dict[str, Any]) -> int:
        captured.append(payload)
        return int(payload.get("exit_code", 0))

    monkeypatch.setattr(indesign_cli, "emit", fake_emit)
    return captured


# ---------------------------------------------------------------------------
# Task 6: 砍掉 CLI 冗余 Node 进程冷启动
# ---------------------------------------------------------------------------


def test_router_schema_for_classic_and_advanced_reads_catalog_without_mcp_process(monkeypatch):
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.mcp_backend import McpBackend
    from cli_anything.indesign.core.router import Router

    def forbid_popen(*_args, **_kwargs):
        raise AssertionError("Router.schema must not spawn MCP Node process for classic/advanced tools")

    def forbid_list_tools(*_args, **_kwargs):
        raise AssertionError("Router.schema must not call McpBackend.list_tools for classic/advanced tools")

    monkeypatch.setattr(subprocess, "Popen", forbid_popen)
    monkeypatch.setattr(McpBackend, "list_tools", forbid_list_tools)

    router = Router(catalog=Catalog(repo_root=REPO_ROOT), repo_root=REPO_ROOT)

    classic_payload = router.schema("document.open_document")
    assert classic_payload["tool"]["source"] == "classic"
    assert "filePath" in classic_payload["inputSchema"]["properties"]

    advanced_payload = router.schema("template.run_jsx_file")
    assert advanced_payload["tool"]["source"] == "advanced"
    assert "filePath" in advanced_payload["inputSchema"]["properties"]


def test_builtin_tool_commands_skip_plugin_discovery_and_launch_at_most_one_mcp_process(monkeypatch, tmp_path):
    from cli_anything.indesign import indesign_cli
    from cli_anything.indesign.core.mcp_backend import McpBackend
    from cli_anything.indesign.core.plugins.backend import PluginBackend

    _isolate_localappdata(monkeypatch, tmp_path)
    _plugin_dir, workspace = _install_plugin_copy(tmp_path)
    monkeypatch.chdir(workspace)
    captured = _capture_emit(monkeypatch)

    def forbid_plugin_discover(*_args, **_kwargs):
        raise AssertionError("Built-in tool commands must not trigger plugin discovery")

    def forbid_plugin_request(*_args, **_kwargs):
        raise AssertionError("Built-in tool commands must not invoke PluginBackend")

    def forbid_mcp_list_tools(*_args, **_kwargs):
        raise AssertionError("Built-in tool commands must not call McpBackend.list_tools")

    mcp_calls: list[tuple[str, dict[str, Any]]] = []

    def fake_mcp_call(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        mcp_calls.append((name, arguments))
        return {"content": [], "parsed": {"success": True, "documentsCount": 0}}

    monkeypatch.setattr(indesign_cli, "discover_plugins", forbid_plugin_discover)
    monkeypatch.setattr(PluginBackend, "request", forbid_plugin_request)
    monkeypatch.setattr(McpBackend, "list_tools", forbid_mcp_list_tools)
    monkeypatch.setattr(McpBackend, "call_tool", fake_mcp_call)

    assert indesign_cli.main(["tool", "schema", "document.open_document"]) == 0
    assert captured.pop()["ok"] is True
    assert mcp_calls == []

    assert indesign_cli.main(["tool", "explain", "document.open_document"]) == 0
    assert captured.pop()["ok"] is True
    assert mcp_calls == []

    assert indesign_cli.main(["tool", "call", "document.get_document_info"]) == 0
    payload = captured.pop()
    assert payload["ok"] is True
    assert len(mcp_calls) == 1
    assert mcp_calls[0][0] == "get_document_info"


def test_script_run_skips_plugin_discovery_and_handshake(monkeypatch, tmp_path):
    from cli_anything.indesign import indesign_cli
    from cli_anything.indesign.core.mcp_backend import McpBackend
    from cli_anything.indesign.core.plugins.backend import PluginBackend

    _isolate_localappdata(monkeypatch, tmp_path)
    _plugin_dir, workspace = _install_plugin_copy(tmp_path)
    monkeypatch.chdir(workspace)
    captured = _capture_emit(monkeypatch)

    jsx_file = workspace / "probe.jsx"
    jsx_file.write_text('JSON.stringify({ok: true});\n', encoding="utf-8")

    monkeypatch.setattr(
        indesign_cli,
        "discover_plugins",
        lambda *_a, **_kw: (_ for _ in ()).throw(AssertionError("script run must not discover plugins")),
    )
    monkeypatch.setattr(
        PluginBackend,
        "request",
        lambda *_a, **_kw: (_ for _ in ()).throw(AssertionError("script run must not invoke PluginBackend")),
    )

    mcp_calls: list[str] = []

    def fake_call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        mcp_calls.append(name)
        return {"content": [], "parsed": {"success": True, "result": '{"ok":true}'}}

    monkeypatch.setattr(McpBackend, "call_tool", fake_call_tool)

    code = indesign_cli.main(["script", "run", str(jsx_file)])
    assert code == 0
    assert captured.pop()["ok"] is True
    assert mcp_calls == ["run_jsx_file"]


def test_plugin_catalog_cache_hit_invalidation_and_corruption_recovery(monkeypatch, tmp_path):
    from cli_anything.indesign import indesign_cli
    from cli_anything.indesign.core import router as router_module
    from cli_anything.indesign.core.plugins.backend import PluginBackend
    from cli_anything.indesign.core.plugins.discovery import plugin_catalog_cache_path

    local_app_data = _isolate_localappdata(monkeypatch, tmp_path)
    plugin_dir, workspace = _install_plugin_copy(tmp_path)
    monkeypatch.chdir(workspace)
    captured = _capture_emit(monkeypatch)

    args_file = workspace / "lint-args.json"
    args_file.write_text(json.dumps({"package": "deck.config.json", "strict": True}), encoding="utf-8")

    methods: list[str] = []
    original_request = PluginBackend.request

    def spy_request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        methods.append(method)
        return original_request(self, method, params)

    monkeypatch.setattr(PluginBackend, "request", spy_request)

    # 1) 首次调用（冷缓存）：必须执行 handshake + tools/list + tools/schema + tools/call
    assert indesign_cli.main(["tool", "call", "html.authoring_lint", "--args-file", str(args_file)]) == 0
    assert captured.pop()["ok"] is True
    assert methods == ["plugin/handshake", "tools/list", "tools/schema", "tools/call"]

    cache_file = plugin_catalog_cache_path()
    assert cache_file == local_app_data / "indesign-cli" / "state" / "plugin-catalog-cache.json"
    assert cache_file.is_file()

    # 2) 第二次调用（热缓存）：只应执行 tools/call，0 次 handshake/list/schema
    methods.clear()
    assert indesign_cli.main(["tool", "call", "html.authoring_lint", "--args-file", str(args_file)]) == 0
    assert captured.pop()["ok"] is True
    assert methods == ["tools/call"]

    # 3) manifest_mtime_ns 变化 -> 缓存失效并重建
    manifest_path = plugin_dir / "manifest.json"
    st = manifest_path.stat()
    os.utime(manifest_path, ns=(st.st_atime_ns, st.st_mtime_ns + 2_000_000_000))
    methods.clear()
    assert indesign_cli.main(["tool", "call", "html.authoring_lint", "--args-file", str(args_file)]) == 0
    assert captured.pop()["ok"] is True
    assert methods == ["plugin/handshake", "tools/list", "tools/schema", "tools/call"]

    # 4) entry_mtime_ns 变化 -> 缓存失效
    entry_path = plugin_dir / "index.js"
    est = entry_path.stat()
    os.utime(entry_path, ns=(est.st_atime_ns, est.st_mtime_ns + 2_000_000_000))
    methods.clear()
    assert indesign_cli.main(["tool", "call", "html.authoring_lint", "--args-file", str(args_file)]) == 0
    assert captured.pop()["ok"] is True
    assert methods == ["plugin/handshake", "tools/list", "tools/schema", "tools/call"]

    # 5) manifest_version 变化（即使强行还原原 mtime）-> 缓存失效
    mst_before = manifest_path.stat()
    manifest_obj = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest_obj["version"] = "0.2.0"
    manifest_path.write_text(json.dumps(manifest_obj, indent=2), encoding="utf-8")
    os.utime(manifest_path, ns=(mst_before.st_atime_ns, mst_before.st_mtime_ns))
    methods.clear()
    assert indesign_cli.main(["tool", "call", "html.authoring_lint", "--args-file", str(args_file)]) == 0
    assert captured.pop()["ok"] is True
    assert methods == ["plugin/handshake", "tools/list", "tools/schema", "tools/call"]

    # 6) host_version 变化 -> 缓存失效
    monkeypatch.setattr(indesign_cli, "__version__", "9.9.9")
    monkeypatch.setattr(router_module, "__version__", "9.9.9")
    methods.clear()
    assert indesign_cli.main(["tool", "call", "html.authoring_lint", "--args-file", str(args_file)]) == 0
    assert captured.pop()["ok"] is True
    assert methods == ["plugin/handshake", "tools/list", "tools/schema", "tools/call"]

    # 7) 缓存文件损坏 -> 优雅降级回退真实验证，不抛异常
    cache_file.write_text("{corrupted-json", encoding="utf-8")
    methods.clear()
    assert indesign_cli.main(["tool", "call", "html.authoring_lint", "--args-file", str(args_file)]) == 0
    assert captured.pop()["ok"] is True
    assert methods == ["plugin/handshake", "tools/list", "tools/schema", "tools/call"]


def test_plugin_validate_doctor_and_server_health_bypass_plugin_cache(monkeypatch, tmp_path):
    from cli_anything.indesign import __version__, indesign_cli
    from cli_anything.indesign.core import health as health_module
    from cli_anything.indesign.core.plugins.backend import PluginBackend
    from cli_anything.indesign.core.plugins.validate import doctor_plugin, validate_plugin_path

    _isolate_localappdata(monkeypatch, tmp_path)
    plugin_dir, workspace = _install_plugin_copy(tmp_path)
    monkeypatch.chdir(workspace)

    # 先预热 plugin-catalog-cache.json
    indesign_cli.build_catalog_with_backends()

    methods: list[str] = []
    original_request = PluginBackend.request

    def spy_request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        methods.append(method)
        return original_request(self, method, params)

    monkeypatch.setattr(PluginBackend, "request", spy_request)

    # plugin validate 必须绕过缓存
    methods.clear()
    val = validate_plugin_path(str(plugin_dir), host_version=__version__)
    assert val["ok"] is True
    assert "plugin/handshake" in methods
    assert "tools/list" in methods
    assert "tools/schema" in methods

    # plugin doctor 必须绕过缓存
    methods.clear()
    doc = doctor_plugin("fake-html-plugin", cwd=workspace, host_version=__version__)
    assert doc["ok"] is True
    assert "plugin/handshake" in methods
    assert "tools/list" in methods
    assert "plugin/doctor" in methods

    # server health 校验 builtin plugin 时不读 plugin-catalog-cache.json
    runtime_root = tmp_path / "install" / "runtime" / "0.5.0"
    builtin_dir = runtime_root / "plugins" / "html-indesign"
    shutil.copytree(FAKE_PLUGIN_ROOT, builtin_dir)
    state_dir = tmp_path / "install" / "state"
    state_dir.mkdir(parents=True, exist_ok=True)
    components = {
        "indesign_cli": "0.5.0",
        "html_indesign": "0.1.0",
        "node": "22.0.0",
        "winax": "3.0.0",
        "browser": "msedge",
    }
    (state_dir / "current-runtime.json").write_text(
        json.dumps({"schema_version": 1, "version": "0.5.0", "root": str(runtime_root), "components": components}),
        encoding="utf-8",
    )
    monkeypatch.setenv("INDESIGN_CLI_RUNTIME_ROOT", str(runtime_root))
    validated_calls: list[Path] = []
    monkeypatch.setattr(
        health_module,
        "validate_builtin_plugin",
        lambda root, components: (validated_calls.append(root), {"tools": ["html.authoring_lint"]})[1],
    )
    health_payload = health_module.health(REPO_ROOT)
    assert health_payload["runtime"]["builtin_html_plugin"]["available"] is True
    assert validated_calls == [runtime_root.resolve()]


def test_pure_builtin_batch_skips_plugin_discovery_while_plugin_batch_loads_plugins(monkeypatch, tmp_path):
    from cli_anything.indesign import indesign_cli
    from cli_anything.indesign.core.plugins.backend import PluginBackend

    _isolate_localappdata(monkeypatch, tmp_path)
    _plugin_dir, workspace = _install_plugin_copy(tmp_path)
    monkeypatch.chdir(workspace)
    captured = _capture_emit(monkeypatch)

    builtin_plan = workspace / "builtin-batch.json"
    builtin_plan.write_text(
        json.dumps({"steps": [{"id": "s1", "type": "tool", "tool": "session.show", "args": {}}]}),
        encoding="utf-8",
    )
    plugin_plan = workspace / "plugin-batch.json"
    plugin_plan.write_text(
        json.dumps(
            {
                "steps": [
                    {
                        "id": "p1",
                        "type": "tool",
                        "tool": "html.authoring_lint",
                        "args": {"package": "deck.config.json"},
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    discover_calls = 0
    original_discover = indesign_cli.discover_plugins

    def spy_discover(*args, **kwargs):
        nonlocal discover_calls
        discover_calls += 1
        return original_discover(*args, **kwargs)

    monkeypatch.setattr(indesign_cli, "discover_plugins", spy_discover)

    # 纯内置 batch：0 次插件发现
    assert indesign_cli.main(["tool", "batch", "--plan", str(builtin_plan)]) == 0
    assert captured.pop()["ok"] is True
    assert discover_calls == 0

    # 含插件步骤的 batch：按需加载插件并成功执行
    assert indesign_cli.main(["tool", "batch", "--plan", str(plugin_plan)]) == 0
    payload = captured.pop()
    assert payload["ok"] is True
    assert discover_calls == 1
    assert payload["data"]["steps"][0]["ok"] is True


# ---------------------------------------------------------------------------
# Task 7: McpBackend 持久会话 + Router.session() + batch / host_actions 复用
# ---------------------------------------------------------------------------


def test_mcp_backend_context_manager_reuses_single_process_and_closes_on_exit(monkeypatch, tmp_path):
    from cli_anything.indesign.core.mcp_backend import McpBackend

    entry = _write_fake_mcp_server(tmp_path)
    spawned: list[subprocess.Popen[str]] = []
    real_popen = subprocess.Popen

    def spy_popen(*args, **kwargs):
        proc = real_popen(*args, **kwargs)
        spawned.append(proc)
        return proc

    monkeypatch.setattr(subprocess, "Popen", spy_popen)

    with McpBackend(repo_root=tmp_path, entry=entry.name, timeout_seconds=10) as backend:
        assert backend.is_open is True
        r1 = backend.call_tool("tool_a", {"seq": 1})
        r2 = backend.call_tool("tool_b", {"seq": 2})
        r3 = backend.call_tool("tool_c", {"seq": 3})
        assert len(spawned) == 1
        pids = {r1["parsed"]["pid"], r2["parsed"]["pid"], r3["parsed"]["pid"]}
        assert len(pids) == 1
        assert [r1["parsed"]["callCount"], r2["parsed"]["callCount"], r3["parsed"]["callCount"]] == [1, 2, 3]

    assert backend.is_open is False
    assert spawned[0].poll() is not None


def test_run_batch_reuses_single_mcp_process_across_three_same_source_steps(monkeypatch, tmp_path):
    from cli_anything.indesign.core import router as router_module
    from cli_anything.indesign.core.batch import run_batch
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.router import Router

    entry = _write_fake_mcp_server(tmp_path)
    monkeypatch.setitem(router_module.BACKENDS, "classic", entry.name)

    spawned: list[subprocess.Popen[str]] = []
    real_popen = subprocess.Popen

    def spy_popen(*args, **kwargs):
        proc = real_popen(*args, **kwargs)
        spawned.append(proc)
        return proc

    monkeypatch.setattr(subprocess, "Popen", spy_popen)

    catalog = Catalog(repo_root=REPO_ROOT)
    router = Router(catalog=catalog, repo_root=tmp_path, backend_timeout_seconds=10)

    plan = tmp_path / "batch-3-steps.json"
    plan.write_text(
        json.dumps(
            {
                "steps": [
                    {"id": "step-1", "type": "tool", "tool": "document.get_document_info", "args": {"step": 1}},
                    {"id": "step-2", "type": "tool", "tool": "document.get_document_info", "args": {"step": 2}},
                    {"id": "step-3", "type": "tool", "tool": "document.get_document_info", "args": {"step": 3}},
                ]
            }
        ),
        encoding="utf-8",
    )

    result = run_batch(router, plan)
    assert result["failed_step"] is None
    assert len(result["steps"]) == 3
    assert len(spawned) == 1
    pids = {step["data"]["parsed"]["pid"] for step in result["steps"]}
    counts = [step["data"]["parsed"]["callCount"] for step in result["steps"]]
    assert len(pids) == 1
    assert counts == [1, 2, 3]
    # 退出 run_batch 后子进程必须已经优雅回收
    assert spawned[0].poll() is not None
    assert router._session_backends == {}


def test_run_batch_step_2_timeout_terminates_process_and_reports_state_uncertain_without_retry(monkeypatch, tmp_path):
    from cli_anything.indesign.core import router as router_module
    from cli_anything.indesign.core.batch import run_batch
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.router import Router

    entry = _write_fake_mcp_server(tmp_path)
    monkeypatch.setitem(router_module.BACKENDS, "classic", entry.name)

    spawned: list[subprocess.Popen[str]] = []
    real_popen = subprocess.Popen

    def spy_popen(*args, **kwargs):
        proc = real_popen(*args, **kwargs)
        spawned.append(proc)
        return proc

    monkeypatch.setattr(subprocess, "Popen", spy_popen)

    router = Router(catalog=Catalog(repo_root=REPO_ROOT), repo_root=tmp_path, backend_timeout_seconds=1)
    plan = tmp_path / "batch-timeout.json"
    plan.write_text(
        json.dumps(
            {
                "steps": [
                    {"id": "step-1", "type": "tool", "tool": "document.get_document_info", "args": {}},
                    {"id": "step-2", "type": "tool", "tool": "document.get_document_info", "args": {"sleepMs": 5000}},
                    {"id": "step-3", "type": "tool", "tool": "document.get_document_info", "args": {}},
                ]
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(CliError) as exc_info:
        run_batch(router, plan)

    exc = exc_info.value
    assert exc.code == "BATCH_STEP_FAILED"
    assert exc.state_uncertain is True
    assert exc.details["state_uncertain"] is True
    assert exc.details["failed_step"] == "step-2"
    assert len(exc.details["steps"]) == 2
    assert exc.details["steps"][0]["ok"] is True
    assert exc.details["steps"][1]["ok"] is False
    assert exc.details["steps"][1]["code"] == "TIMEOUT"
    # 绝不自动重试，进程总数必须为 1 且已回收
    assert len(spawned) == 1
    assert spawned[0].poll() is not None
    assert router._session_backends == {}


def test_run_batch_step_2_unexpected_exit_terminates_and_does_not_retry(monkeypatch, tmp_path):
    from cli_anything.indesign.core import router as router_module
    from cli_anything.indesign.core.batch import run_batch
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.router import Router

    entry = _write_fake_mcp_server(tmp_path)
    monkeypatch.setitem(router_module.BACKENDS, "classic", entry.name)

    spawned: list[subprocess.Popen[str]] = []
    real_popen = subprocess.Popen

    def spy_popen(*args, **kwargs):
        proc = real_popen(*args, **kwargs)
        spawned.append(proc)
        return proc

    monkeypatch.setattr(subprocess, "Popen", spy_popen)

    router = Router(catalog=Catalog(repo_root=REPO_ROOT), repo_root=tmp_path, backend_timeout_seconds=5)
    plan = tmp_path / "batch-crash.json"
    plan.write_text(
        json.dumps(
            {
                "steps": [
                    {"id": "step-1", "type": "tool", "tool": "document.get_document_info", "args": {}},
                    {"id": "step-2", "type": "tool", "tool": "document.get_document_info", "args": {"crashNow": True}},
                    {"id": "step-3", "type": "tool", "tool": "document.get_document_info", "args": {}},
                ]
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(CliError) as exc_info:
        run_batch(router, plan)

    exc = exc_info.value
    assert exc.code == "BATCH_STEP_FAILED"
    assert exc.state_uncertain is True
    assert exc.details["state_uncertain"] is True
    assert exc.details["failed_step"] == "step-2"
    assert len(exc.details["steps"]) == 2
    assert len(spawned) == 1
    assert spawned[0].poll() is not None
    assert router._session_backends == {}


def test_host_action_executor_reuses_single_advanced_mcp_process_across_script_runs(monkeypatch, tmp_path):
    from cli_anything.indesign.core import router as router_module
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.plugins.host_actions import HostActionExecutor
    from cli_anything.indesign.core.router import Router

    entry = _write_fake_mcp_server(tmp_path)
    monkeypatch.setitem(router_module.BACKENDS, "advanced", entry.name)

    spawned: list[subprocess.Popen[str]] = []
    real_popen = subprocess.Popen

    def spy_popen(*args, **kwargs):
        proc = real_popen(*args, **kwargs)
        spawned.append(proc)
        return proc

    monkeypatch.setattr(subprocess, "Popen", spy_popen)

    script_a = tmp_path / "build.jsx"
    script_b = tmp_path / "export.jsx"
    script_a.write_text("// build\n", encoding="utf-8")
    script_b.write_text("// export\n", encoding="utf-8")

    router = Router(catalog=Catalog(repo_root=REPO_ROOT), repo_root=tmp_path, backend_timeout_seconds=10)

    class TwoScriptBackend:
        timeout = 30

        def __init__(self) -> None:
            self.round = 0
            self.collected: list[dict[str, Any]] = []

        def resume_tool(self, tool_id: str, state: dict[str, Any], host_results: list[dict[str, Any]]) -> dict[str, Any]:
            self.round += 1
            self.collected.extend(host_results)
            if self.round == 1:
                return {
                    "status": "requires_host_actions",
                    "state": {"step": "export"},
                    "actions": [{"id": "export", "tool_id": "script.run", "args": {"file": str(script_b)}}],
                }
            return {"status": "complete", "data": {"ok": True, "host_results": self.collected}}

    backend = TwoScriptBackend()
    final = HostActionExecutor(router, tmp_path).complete(
        backend,
        "html.build_indesign",
        {
            "status": "requires_host_actions",
            "state": {"step": "build"},
            "actions": [{"id": "build", "tool_id": "script.run", "args": {"file": str(script_a)}}],
        },
    )

    assert final["status"] == "complete"
    results = final["data"]["host_results"]
    assert len(results) == 2
    assert len(spawned) == 1
    assert results[0]["data"]["parsed"]["pid"] == results[1]["data"]["parsed"]["pid"]
    assert [results[0]["data"]["parsed"]["callCount"], results[1]["data"]["parsed"]["callCount"]] == [1, 2]
    # complete() 结束后 advanced 子进程立即回收
    assert spawned[0].poll() is not None
    assert router._session_backends == {}


def test_router_session_is_reentrant_and_closes_all_sources_on_outer_exit(monkeypatch, tmp_path):
    from cli_anything.indesign.core import router as router_module
    from cli_anything.indesign.core.catalog import Catalog
    from cli_anything.indesign.core.router import Router

    entry = _write_fake_mcp_server(tmp_path)
    monkeypatch.setitem(router_module.BACKENDS, "classic", entry.name)
    monkeypatch.setitem(router_module.BACKENDS, "advanced", entry.name)

    spawned: list[subprocess.Popen[str]] = []
    real_popen = subprocess.Popen

    def spy_popen(*args, **kwargs):
        proc = real_popen(*args, **kwargs)
        spawned.append(proc)
        return proc

    monkeypatch.setattr(subprocess, "Popen", spy_popen)

    router = Router(catalog=Catalog(repo_root=REPO_ROOT), repo_root=tmp_path, backend_timeout_seconds=10)
    with router.session():
        r1 = router.call("document.get_document_info", {})
        with router.session():
            r2 = router.call("template.run_jsx_file", {"filePath": "dummy.jsx"})
        # 退出内层 session 时不应提前关闭外层复用的进程
        assert len(spawned) == 2
        assert all(proc.poll() is None for proc in spawned)
        r3 = router.call("document.get_document_info", {})
        assert r1["parsed"]["pid"] == r3["parsed"]["pid"]
        assert r3["parsed"]["callCount"] == 2
        assert r2["parsed"]["callCount"] == 1

    # 退出最外层 session 后所有 source 子进程全部回收
    assert all(proc.poll() is not None for proc in spawned)
    assert router._session_backends == {}


def test_tool_call_tool_batch_lazily_loads_plugins_for_plugin_steps(monkeypatch, tmp_path, capsys):
    from cli_anything.indesign import indesign_cli

    _isolate_localappdata(monkeypatch, tmp_path)
    _plugin_dir, workspace = _install_plugin_copy(tmp_path)
    monkeypatch.chdir(workspace)

    # 1) Plan containing a plugin step executed via `tool call tool.batch` must lazily load plugins and succeed.
    plan_with_plugin = workspace / "plugin-plan.json"
    plan_with_plugin.write_text(
        json.dumps(
            {
                "steps": [
                    {
                        "id": "lint-1",
                        "type": "tool",
                        "tool": "html.authoring_lint",
                        "args": {"package": "demo.html"},
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    rc = indesign_cli.run(
        [
            "tool",
            "call",
            "tool.batch",
            "--args",
            json.dumps({"plan": str(plan_with_plugin)}),
        ]
    )
    out = json.loads(capsys.readouterr().out)
    assert rc == 0
    assert out["ok"] is True
    assert out["data"]["failed_step"] is None
    assert len(out["data"]["steps"]) == 1
    assert out["data"]["steps"][0]["tool"] == "html.authoring_lint"
    assert out["data"]["steps"][0]["ok"] is True

    # 2) Built-in-only plan executed via `tool call tool.batch` must NOT trigger plugin discovery.
    discover_calls: list[Any] = []
    real_build = indesign_cli.build_catalog_with_backends

    def spy_build(*args, **kwargs):
        discover_calls.append((args, kwargs))
        return real_build(*args, **kwargs)

    monkeypatch.setattr(indesign_cli, "build_catalog_with_backends", spy_build)
    plan_builtin = workspace / "builtin-plan.json"
    plan_builtin.write_text(
        json.dumps({"steps": [{"id": "s1", "type": "tool", "tool": "session.show", "args": {}}]}),
        encoding="utf-8",
    )
    rc2 = indesign_cli.run(
        [
            "tool",
            "call",
            "tool.batch",
            "--args",
            json.dumps({"plan": str(plan_builtin)}),
        ]
    )
    out2 = json.loads(capsys.readouterr().out)
    assert rc2 == 0
    assert out2["ok"] is True
    assert discover_calls == []
