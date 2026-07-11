from support import *
from types import SimpleNamespace

import pytest

from cli_anything.indesign.core.errors import CliError


def test_agent_bootstrapper_rejects_legacy_run_source():
    result = run_agent_module("run", "--source", "latest.json", "--", "--version")

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "LEGACY_COMMAND_REMOVED"


def test_agent_bootstrapper_builds_runtime_env(tmp_path):
    from cli_anything.indesign.core.bootstrapper import build_runtime_env

    runtime_root = tmp_path / "runtime" / "0.4.2"
    node = runtime_root / "node" / "node.exe"
    server = runtime_root / "server"
    node.parent.mkdir(parents=True)
    node.write_text("", encoding="utf-8")
    (server / "src" / "advanced").mkdir(parents=True)
    (server / "package.json").write_text("{}", encoding="utf-8")
    (server / "src" / "index.js").write_text("// classic", encoding="utf-8")
    (server / "src" / "advanced" / "index.js").write_text("// advanced", encoding="utf-8")

    env = build_runtime_env(runtime_root, base_env={"PATH": "x"})

    assert env["INDESIGN_CLI_NODE"] == str(node)
    assert env["INDESIGN_CLI_SERVER_ROOT"] == str(server)
    assert env["PATH"] == "x"

    from cli_anything.indesign.core.bootstrapper import DEFAULT_TELEMETRY_DIR

    assert env["INDESIGN_CLI_TELEMETRY_DIR"] == DEFAULT_TELEMETRY_DIR

    kept = build_runtime_env(runtime_root, base_env={"PATH": "x", "INDESIGN_CLI_TELEMETRY_DIR": r"D:\custom"})
    assert kept["INDESIGN_CLI_TELEMETRY_DIR"] == r"D:\custom"

    disabled = build_runtime_env(runtime_root, base_env={"PATH": "x", "INDESIGN_CLI_TELEMETRY": "off"})
    assert "INDESIGN_CLI_TELEMETRY_DIR" not in disabled


def test_agent_bootstrapper_rejects_legacy_update_source():
    result = run_agent_module("update", "--source", "latest.json")

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "LEGACY_COMMAND_REMOVED"


def test_agent_bootstrapper_direct_command_dispatches(monkeypatch):
    from cli_anything.indesign import agent_bootstrapper

    calls: dict[str, object] = {}

    def fake_ensure_agent_ready(*, command_args, sources=None):
        calls["ready"] = {"command_args": command_args, "sources": sources}
        return {"updated": False, "warnings": [], "runtime_root": r"D:\runtime\0.5.0"}

    def fake_run_child(cli_args, runtime_root=None):
        calls["child"] = {"cli_args": cli_args, "runtime_root": runtime_root}
        return {"exit_code": 0, "stdout_json": {"ok": True}, "stdout_tail": "", "stderr_tail": ""}

    monkeypatch.setattr(agent_bootstrapper, "ensure_agent_ready", fake_ensure_agent_ready)
    monkeypatch.setattr(agent_bootstrapper, "run_child", fake_run_child)

    assert agent_bootstrapper.main(["tool", "domains"]) == 0
    assert calls["ready"] == {"command_args": ["tool", "domains"], "sources": None}
    assert calls["child"] == {"cli_args": ["tool", "domains"], "runtime_root": Path(r"D:\runtime\0.5.0")}


def test_agent_bootstrapper_run_child_requires_explicit_persistent_runtime(monkeypatch, tmp_path):
    from cli_anything.indesign import agent_bootstrapper

    runtime_root = tmp_path / "runtime"
    cli = runtime_root / "cli" / "indesign-cli.exe"
    cli.parent.mkdir(parents=True)
    cli.write_text("", encoding="utf-8")
    node = runtime_root / "node" / "node.exe"
    server = runtime_root / "server"
    node.parent.mkdir(parents=True)
    node.write_text("", encoding="utf-8")
    (server / "src" / "advanced").mkdir(parents=True)
    (server / "package.json").write_text("{}", encoding="utf-8")
    (server / "src" / "index.js").write_text("// classic", encoding="utf-8")
    (server / "src" / "advanced" / "index.js").write_text("// advanced", encoding="utf-8")
    captured: dict[str, object] = {}

    class Result:
        returncode = 0
        stdout = '{"ok":true}'
        stderr = ""

    def fake_run(command, **kwargs):
        captured["command"] = command
        captured["env"] = kwargs["env"]
        return Result()

    monkeypatch.setattr(agent_bootstrapper.subprocess, "run", fake_run)

    result = agent_bootstrapper.run_child(["--version"], runtime_root=runtime_root)

    assert result["exit_code"] == 0
    env = captured["env"]
    assert env["INDESIGN_CLI_RUNTIME_ROOT"] == str(runtime_root.resolve())
    assert env["INDESIGN_CLI_NODE"] == str(node.resolve())
    assert env["INDESIGN_CLI_SERVER_ROOT"] == str(server.resolve())
    assert captured["command"] == [str(cli), "--version"]


def test_agent_bootstrapper_install_registers_user_command(monkeypatch, capsys):
    from cli_anything.indesign import agent_bootstrapper

    monkeypatch.setattr(
        agent_bootstrapper,
        "ensure_agent_ready",
        lambda *, command_args, sources=None: {"updated": False, "warnings": []},
    )
    monkeypatch.setattr(
        agent_bootstrapper,
        "register_user_command",
        lambda: {"registered": True, "bin": r"C:\Users\me\AppData\Local\indesign-cli\bin"},
    )

    assert agent_bootstrapper.main(["install"]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["ok"] is True
    assert payload["data"]["registration"]["registered"] is True


def test_agent_bootstrapper_install_seeds_embedded_runtime_without_network(monkeypatch, tmp_path, capsys):
    from cli_anything.indesign import agent_bootstrapper

    embedded = tmp_path / "embedded"
    embedded.mkdir()
    installed = tmp_path / "install" / "runtime" / "0.5.0"
    calls = {}
    monkeypatch.setattr(agent_bootstrapper, "embedded_runtime_root", lambda: embedded)
    monkeypatch.setattr(agent_bootstrapper, "current_runtime_root", lambda root: None)
    monkeypatch.setattr(
        agent_bootstrapper,
        "install_embedded_runtime",
        lambda source, root: calls.setdefault("installed", (source, root))
        and SimpleNamespace(
            runtime_root=installed,
            warnings=({"code": "RUNTIME_CLEANUP_FAILED", "path": "old", "message": "locked"},),
        ),
    )
    monkeypatch.setattr(agent_bootstrapper, "ensure_agent_ready", lambda **kwargs: (_ for _ in ()).throw(AssertionError("network update should not run")))
    monkeypatch.setattr(agent_bootstrapper, "register_user_command", lambda: {"registered": True, "bin": "bin"})
    monkeypatch.setattr(agent_bootstrapper, "install_root", lambda: tmp_path / "install")

    exit_code = agent_bootstrapper.run(["install"])

    payload = json.loads(capsys.readouterr().out)
    assert exit_code == 0
    assert payload["data"]["runtime_root"] == str(installed)
    assert payload["data"]["source"] == "embedded-setup"
    assert payload["data"]["warnings"] == [{"code": "RUNTIME_CLEANUP_FAILED", "path": "old", "message": "locked"}]
    assert calls["installed"] == (embedded, tmp_path / "install")


def test_agent_bootstrapper_health_help_does_not_expose_source():
    result = run_agent_module("health", "--help")

    assert result.returncode == 0
    assert "--source" not in result.stdout


def test_agent_bootstrapper_console_alias_and_build_script_are_declared():
    pyproject = (REPO_ROOT / "pyproject.toml").read_text(encoding="utf-8")
    assert 'indesign-cli-agent = "cli_anything.indesign.agent_bootstrapper:main"' in pyproject

    script = REPO_ROOT / "scripts" / "build_agent_bootstrapper.py"
    assert script.exists()
    text = script.read_text(encoding="utf-8")
    assert "PyInstaller" in text
    assert "--onefile" in text
    assert "runtime" in text
    assert "indesign-cli-agent" in text


def test_agent_bootstrapper_has_no_hidden_embedded_cli_dispatch(monkeypatch):
    from cli_anything.indesign import agent_bootstrapper
    from cli_anything.indesign import indesign_cli

    calls = {}
    monkeypatch.setattr(indesign_cli, "main", lambda _args: (_ for _ in ()).throw(AssertionError("embedded CLI dispatch used")))
    monkeypatch.setattr(agent_bootstrapper, "ensure_agent_ready", lambda **_kwargs: {"runtime_root": r"D:\runtime\0.5.0", "warnings": []})

    def fake_child(args, runtime_root=None):
        calls["child"] = (args, runtime_root)
        return {"exit_code": 0, "stdout_json": {}, "stdout_tail": "", "stderr_tail": ""}

    monkeypatch.setattr(agent_bootstrapper, "run_child", fake_child)

    assert not hasattr(agent_bootstrapper, "child_command")
    assert agent_bootstrapper.main(["__cli__", "--version"]) == 0
    assert calls["child"] == (["__cli__", "--version"], Path(r"D:\runtime\0.5.0"))


@pytest.mark.parametrize(
    "failure, reason",
    [
        (CliError("invalid", code="RUNTIME_VALIDATION_FAILED"), "RUNTIME_VALIDATION_FAILED"),
        (OSError("copy failed"), "OSError"),
    ],
)
def test_agent_bootstrapper_wraps_all_embedded_install_failures(monkeypatch, tmp_path, capsys, failure, reason):
    from cli_anything.indesign import agent_bootstrapper

    embedded = tmp_path / "embedded"
    embedded.mkdir()
    monkeypatch.setattr(agent_bootstrapper, "embedded_runtime_root", lambda: embedded)
    monkeypatch.setattr(agent_bootstrapper, "current_runtime_root", lambda root: None)
    monkeypatch.setattr(agent_bootstrapper, "install_root", lambda: tmp_path / "install")
    monkeypatch.setattr(agent_bootstrapper, "install_embedded_runtime", lambda *_args, **_kwargs: (_ for _ in ()).throw(failure))

    exit_code = agent_bootstrapper.main(["install"])

    payload = json.loads(capsys.readouterr().out)
    assert exit_code == 1
    assert payload["error"]["code"] == "INITIAL_INSTALL_FAILED"
    assert payload["error"]["details"]["reason"] == reason


def test_agent_bootstrapper_preserves_embedded_metadata_reason_code(monkeypatch, tmp_path, capsys):
    from cli_anything.indesign import agent_bootstrapper

    embedded = tmp_path / "embedded"
    embedded.mkdir()
    monkeypatch.setattr(agent_bootstrapper, "embedded_runtime_root", lambda: embedded)
    monkeypatch.setattr(agent_bootstrapper, "current_runtime_root", lambda root: None)
    monkeypatch.setattr(agent_bootstrapper, "install_root", lambda: tmp_path / "install")

    exit_code = agent_bootstrapper.main(["install"])

    payload = json.loads(capsys.readouterr().out)
    assert exit_code == 1
    assert payload["error"]["code"] == "INITIAL_INSTALL_FAILED"
    assert payload["error"]["details"]["reason"] == "EMBEDDED_RUNTIME_METADATA_INVALID"


def test_agent_bootstrapper_runs_persistent_runtime_cli_from_current_state(monkeypatch, tmp_path):
    from cli_anything.indesign import agent_bootstrapper

    runtime_root = tmp_path / "install" / "runtime" / "0.5.0"
    cli = runtime_root / "cli" / "indesign-cli.exe"
    cli.parent.mkdir(parents=True)
    cli.write_text("cli", encoding="utf-8")
    node = runtime_root / "node" / "node.exe"
    node.parent.mkdir()
    node.write_text("node", encoding="utf-8")
    server = runtime_root / "server"
    (server / "src" / "advanced").mkdir(parents=True)
    (server / "package.json").write_text("{}", encoding="utf-8")
    (server / "src" / "index.js").write_text("", encoding="utf-8")
    (server / "src" / "advanced" / "index.js").write_text("", encoding="utf-8")
    captured = {}

    class Result:
        returncode = 0
        stdout = '{"ok":true}'
        stderr = ""

    def fake_run(command, **kwargs):
        captured["command"] = command
        captured["env"] = kwargs["env"]
        return Result()

    monkeypatch.setattr(agent_bootstrapper.subprocess, "run", fake_run)

    result = agent_bootstrapper.run_child(["tool", "domains"], runtime_root=runtime_root)

    assert result["exit_code"] == 0
    assert captured["command"] == [str(cli), "tool", "domains"]
    assert captured["env"]["INDESIGN_CLI_RUNTIME_ROOT"] == str(runtime_root.resolve())


def test_agent_bootstrapper_health_reads_current_runtime_not_embedded(monkeypatch, tmp_path, capsys):
    from cli_anything.indesign import agent_bootstrapper

    root = tmp_path / "install"
    runtime_root = root / "runtime" / "0.5.0"
    runtime_root.mkdir(parents=True)
    plugin = runtime_root / "plugins" / "html-indesign"
    plugin.mkdir(parents=True)
    (plugin / "manifest.json").write_text('{"id":"html-indesign","version":"0.2.0"}', encoding="utf-8")
    state = root / "state" / "current-runtime.json"
    state.parent.mkdir(parents=True)
    state.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "version": "0.5.0",
                "root": str(runtime_root),
                "components": {
                    "indesign_cli": "0.5.0",
                    "html_indesign": "0.2.0",
                    "node": "20.18.1",
                    "winax": "3.6.0",
                    "browser": "msedge",
                },
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(agent_bootstrapper, "embedded_runtime_root", lambda: tmp_path / "embedded")
    monkeypatch.setattr(agent_bootstrapper, "probe_edge", lambda: {"checked": True, "available": True, "browser": "msedge", "path": "C:\\Edge\\msedge.exe"})

    exit_code = agent_bootstrapper.run(["health", "--install-root", str(root)])

    payload = json.loads(capsys.readouterr().out)
    assert exit_code == 0
    assert payload["data"]["current"]["version"] == "0.5.0"
    assert payload["data"]["runtime_root"] == str(runtime_root)
    assert payload["data"]["builtin_html_plugin"]["available"] is True
    assert payload["data"]["edge"]["available"] is True
    assert "embedded_runtime" not in payload["data"]
