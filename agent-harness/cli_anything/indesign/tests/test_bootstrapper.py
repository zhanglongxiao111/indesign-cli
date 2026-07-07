from support import *


def test_agent_bootstrapper_refuses_to_run_when_required_update_fails(tmp_path):
    install_root = tmp_path / "install"
    current_dir = install_root / "current"
    current_dir.mkdir(parents=True)
    (current_dir / "manifest.json").write_text(json.dumps({"version": "0.4.1"}), encoding="utf-8")

    release = tmp_path / "release" / "indesign-cli-agent.exe"
    release.parent.mkdir(parents=True)
    release.write_text("new release", encoding="utf-8")
    latest = tmp_path / "latest.json"
    latest.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "version": "0.4.2",
                "force": True,
                "url": str(release),
                "sha256": "0" * 64,
            }
        ),
        encoding="utf-8",
    )

    result = run_agent_module(
        "run",
        "--install-root",
        str(install_root),
        "--source",
        str(latest),
        "--",
        "--version",
    )

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "UPDATE_REQUIRED_BUT_FAILED"
    assert payload["current"] == "0.4.1"
    assert payload["latest"] == "0.4.2"


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


def test_agent_bootstrapper_installs_embedded_runtime_without_node_or_npm(tmp_path):
    embedded = tmp_path / "embedded-runtime"
    node = embedded / "node" / "node.exe"
    server = embedded / "server"
    node.parent.mkdir(parents=True)
    node.write_text("", encoding="utf-8")
    (server / "src" / "advanced").mkdir(parents=True)
    (server / "node_modules" / "winax").mkdir(parents=True)
    (server / "package.json").write_text("{}", encoding="utf-8")
    (server / "src" / "index.js").write_text("// classic", encoding="utf-8")
    (server / "src" / "advanced" / "index.js").write_text("// advanced", encoding="utf-8")

    release = tmp_path / "release" / "indesign-cli-agent.exe"
    release.parent.mkdir(parents=True)
    release.write_text("bootstrapper", encoding="utf-8")
    digest = __import__("hashlib").sha256(release.read_bytes()).hexdigest()
    latest = tmp_path / "latest.json"
    latest.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "version": "0.4.2",
                "force": True,
                "url": str(release),
                "sha256": digest,
            }
        ),
        encoding="utf-8",
    )

    install_root = tmp_path / "install"
    result = run_agent_module(
        "update",
        "--install-root",
        str(install_root),
        "--source",
        str(latest),
        env_overrides={"INDESIGN_CLI_EMBEDDED_RUNTIME_ROOT": str(embedded)},
    )

    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    current = json.loads((install_root / "current" / "manifest.json").read_text(encoding="utf-8"))
    runtime_root = Path(current["runtime_root"])
    assert current["version"] == "0.4.2"
    assert (runtime_root / "node" / "node.exe").exists()
    assert (runtime_root / "server" / "node_modules" / "winax").exists()


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
