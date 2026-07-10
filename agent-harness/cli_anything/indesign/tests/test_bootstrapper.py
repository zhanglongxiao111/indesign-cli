from support import *


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
        return {"updated": False, "warnings": []}

    def fake_run_child(cli_args, runtime_root=None):
        calls["child"] = {"cli_args": cli_args, "runtime_root": runtime_root}
        return {"exit_code": 0, "stdout_json": {"ok": True}, "stdout_tail": "", "stderr_tail": ""}

    monkeypatch.setattr(agent_bootstrapper, "ensure_agent_ready", fake_ensure_agent_ready)
    monkeypatch.setattr(agent_bootstrapper, "run_child", fake_run_child)

    assert agent_bootstrapper.main(["tool", "domains"]) == 0
    assert calls["ready"] == {"command_args": ["tool", "domains"], "sources": None}
    assert calls["child"] == {"cli_args": ["tool", "domains"], "runtime_root": None}


def test_agent_bootstrapper_run_child_uses_embedded_runtime_when_available(monkeypatch, tmp_path):
    from cli_anything.indesign import agent_bootstrapper

    runtime_root = tmp_path / "runtime"
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

    monkeypatch.setattr(agent_bootstrapper, "embedded_runtime_root", lambda: runtime_root)
    monkeypatch.setattr(agent_bootstrapper.subprocess, "run", fake_run)

    result = agent_bootstrapper.run_child(["--version"])

    assert result["exit_code"] == 0
    env = captured["env"]
    assert env["INDESIGN_CLI_RUNTIME_ROOT"] == str(runtime_root.resolve())
    assert env["INDESIGN_CLI_NODE"] == str(node.resolve())
    assert env["INDESIGN_CLI_SERVER_ROOT"] == str(server.resolve())


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


def test_agent_bootstrapper_child_command_self_dispatches_when_frozen(monkeypatch):
    from cli_anything.indesign import agent_bootstrapper

    monkeypatch.setattr(agent_bootstrapper.sys, "frozen", True, raising=False)
    monkeypatch.setattr(agent_bootstrapper.sys, "executable", r"D:\tools\indesign-cli-agent.exe")

    assert agent_bootstrapper.child_command(["--version"]) == [
        r"D:\tools\indesign-cli-agent.exe",
        "__cli__",
        "--version",
    ]
