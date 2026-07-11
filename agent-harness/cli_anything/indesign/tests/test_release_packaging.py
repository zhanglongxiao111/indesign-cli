from __future__ import annotations

import importlib.util
import io
import json
import tarfile
import zipfile
from pathlib import Path
from types import SimpleNamespace


REPO_ROOT = Path(__file__).resolve().parents[4]
SCRIPT_PATH = REPO_ROOT / "scripts" / "build_agent_bootstrapper.py"


def _load_builder():
    spec = importlib.util.spec_from_file_location("build_agent_bootstrapper", SCRIPT_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write_file(path: Path, data: bytes = b"payload") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def _write_html_plugin_tgz(path: Path) -> None:
    package = {
        "package/package.json": json.dumps(
            {
                "name": "@sa/html-indesign",
                "version": "0.2.0",
                "dependencies": {"cheerio": "1.1.2", "playwright": "1.61.0", "reveal.js": "6.0.1"},
            }
        ).encode(),
        "package/src/indesign-cli-plugin/manifest.json": json.dumps(
            {
                "schema_version": 1,
                "protocol": "indesign-cli-plugin.v1",
                "id": "html-indesign",
                "name": "html-indesign",
                "version": "0.2.0",
                "kind": "node-plugin",
                "domain": "html",
                "entry": "src/indesign-cli-plugin/index.js",
            }
        ).encode(),
        "package/src/indesign-cli-plugin/index.js": b"process.stdout.write('ok')",
        "package/_indesign_scripts/build_from_instructions.jsx": b"// jsx",
        "package/_indesign_scripts/lib/shared.jsx": b"// shared",
        "package/presets/default.json": b"{}",
    }
    with tarfile.open(path, "w:gz") as archive:
        for name, data in package.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))


def _fixture_inputs(tmp_path: Path):
    cli = tmp_path / "cli-dist" / "indesign-cli"
    _write_file(cli / "indesign-cli.exe", b"MZcli")
    _write_file(cli / "_internal" / "python3.dll")
    node = tmp_path / "portable-node"
    _write_file(node / "node.exe", b"MZnode")
    _write_file(node / "npm.cmd", b"@echo off")
    node_modules = tmp_path / "server-node_modules"
    _write_file(node_modules / "winax" / "package.json", b'{"version":"3.6.2"}')
    _write_file(node_modules / "winax" / "build" / "Release" / "node_activex.node")
    tgz = tmp_path / "sa-html-indesign-0.2.0.tgz"
    _write_html_plugin_tgz(tgz)
    return cli, node, node_modules, tgz


def test_pyinstaller_plan_keeps_only_persistent_cli_as_onedir(tmp_path):
    builder = _load_builder()
    plan = builder.build_pyinstaller_plan(stage=tmp_path / "stage", output_dir=tmp_path / "out")

    assert "--onedir" in plan["cli"]
    assert "--onefile" not in plan["cli"]
    assert "--onefile" in plan["launcher"]
    assert "--add-data" not in plan["launcher"]
    assert "--onefile" in plan["setup"]
    assert "--add-data" in plan["setup"]
    cli_text = "\n".join(plan["cli"])
    assert "internal_tool_bridge.mjs" in cli_text
    assert "cli_anything/indesign/node" in cli_text.replace("\\", "/")


def test_default_npm_uses_portable_node_root_on_windows(tmp_path):
    builder = _load_builder()
    node_root = tmp_path / "node"
    _write_file(node_root / "npm.cmd", b"@echo off")

    assert builder.resolve_npm_bin(node_root, "npm") == str(node_root / "npm.cmd")


def test_assemble_runtime_contains_cli_node_server_plugin_dependencies_and_jsx(tmp_path):
    builder = _load_builder()
    cli, node, node_modules, tgz = _fixture_inputs(tmp_path)
    commands = []

    def fake_runner(args, **_kwargs):
        commands.append(args)
        plugin_root = Path(_kwargs["cwd"])
        for dependency in ("cheerio", "playwright", "reveal.js"):
            _write_file(plugin_root / "node_modules" / dependency / "package.json", b'{"version":"1.0.0"}')
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    runtime = builder.assemble_runtime(
        cli_onedir=cli,
        node_root=node,
        node_modules=node_modules,
        html_plugin_tgz=tgz,
        target=tmp_path / "runtime",
        npm_bin="npm.cmd",
        runner=fake_runner,
    )

    assert (runtime / "cli" / "indesign-cli.exe").read_bytes().startswith(b"MZ")
    assert (runtime / "cli" / "_internal" / "python3.dll").is_file()
    assert (runtime / "node" / "node.exe").is_file()
    assert (runtime / "server" / "src" / "index.js").is_file()
    assert (runtime / "server" / "node_modules" / "winax" / "build" / "Release" / "node_activex.node").is_file()
    plugin = runtime / "plugins" / "html-indesign"
    assert json.loads((plugin / "manifest.json").read_text())["version"] == "0.2.0"
    assert (plugin / "src" / "indesign-cli-plugin" / "index.js").is_file()
    assert (plugin / "_indesign_scripts" / "build_from_instructions.jsx").is_file()
    assert (plugin / "_indesign_scripts" / "lib" / "shared.jsx").is_file()
    assert (plugin / "presets" / "default.json").is_file()
    for dependency in ("cheerio", "playwright", "reveal.js"):
        assert (plugin / "node_modules" / dependency / "package.json").is_file()
    assert commands and "--omit=dev" in commands[0]


def test_release_artifacts_use_schema_v2_and_setup_embeds_runtime(tmp_path):
    builder = _load_builder()
    cli, node, node_modules, tgz = _fixture_inputs(tmp_path)

    def fake_runner(args, **kwargs):
        plugin_root = Path(kwargs["cwd"])
        for dependency in ("cheerio", "playwright", "reveal.js"):
            _write_file(plugin_root / "node_modules" / dependency / "package.json", b"{}")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    runtime = builder.assemble_runtime(
        cli_onedir=cli,
        node_root=node,
        node_modules=node_modules,
        html_plugin_tgz=tgz,
        target=tmp_path / "runtime",
        npm_bin="npm.cmd",
        runner=fake_runner,
    )
    artifacts = builder.write_runtime_release(
        runtime,
        output_dir=tmp_path / "out",
        version="0.5.0",
        nas_url=r"\\daga-nas5\sa-ai-app\tools\indesign-cli\runtime-windows-x64-0.5.0.zip",
        github_url="https://github.com/example/releases/download/v0.5.0/runtime-windows-x64-0.5.0.zip",
        components={
            "indesign_cli": "0.5.0",
            "html_indesign": "0.2.0",
            "node": "22.15.0",
            "winax": "3.6.2",
            "browser": "msedge",
        },
    )

    manifest = json.loads(artifacts["manifest"].read_text())
    assert manifest["schema_version"] == 2
    assert manifest["name"] == "indesign-cli-runtime"
    assert manifest["version"] == manifest["components"]["indesign_cli"] == "0.5.0"
    assert manifest["components"]["html_indesign"] == "0.2.0"
    assert manifest["artifact"]["file"] == artifacts["archive"].name
    assert manifest["artifact"]["sha256"] == builder.sha256_file(artifacts["archive"])
    embedded_metadata = json.loads((runtime / "runtime-metadata.json").read_text())
    assert embedded_metadata["artifact"]["sha256"] == "0" * 64
    assert embedded_metadata["components"] == manifest["components"]
    with zipfile.ZipFile(artifacts["archive"]) as payload:
        archived_metadata = json.loads(payload.read("runtime-metadata.json"))
    assert archived_metadata == embedded_metadata

    plan = builder.build_pyinstaller_plan(
        stage=tmp_path / "stage",
        output_dir=tmp_path / "out",
        runtime_root=runtime,
        launcher_exe=tmp_path / "out" / "indesign-cli-agent.exe",
    )
    setup_args = plan["setup"]
    joined = "\n".join(setup_args)
    assert str(runtime) in joined and "runtime" in joined
    assert "indesign-cli-agent.exe" in joined and "payload" in joined


def test_setup_installer_supports_explicit_install_root_and_copies_launcher(monkeypatch, tmp_path, capsys):
    from cli_anything.indesign import setup_installer

    payload = tmp_path / "payload"
    runtime = tmp_path / "runtime"
    _write_file(payload / "indesign-cli-agent.exe", b"MZlauncher")
    runtime.mkdir()
    root = tmp_path / "installed"
    monkeypatch.setattr(setup_installer, "setup_payload_root", lambda: tmp_path)
    monkeypatch.setattr(
        setup_installer,
        "install_embedded_runtime",
        lambda embedded, root: SimpleNamespace(runtime_root=root / "runtime" / "0.5.0", installed=True, warnings=()),
    )
    monkeypatch.setattr(setup_installer, "register_user_command", lambda root: {"registered": True, "bin": str(root / "bin")})

    assert setup_installer.main(["--install-root", str(root)]) == 0
    response = json.loads(capsys.readouterr().out)
    assert response["ok"] is True
    assert response["data"]["install_root"] == str(root.resolve())
    assert (root / "bin" / "indesign-cli-agent.exe").read_bytes() == b"MZlauncher"


def test_setup_installer_can_skip_path_registration_for_isolated_validation(monkeypatch, tmp_path, capsys):
    from cli_anything.indesign import setup_installer

    _write_file(tmp_path / "payload" / "indesign-cli-agent.exe", b"MZlauncher")
    (tmp_path / "runtime").mkdir()
    root = tmp_path / "installed"
    monkeypatch.setattr(setup_installer, "setup_payload_root", lambda: tmp_path)
    monkeypatch.setattr(
        setup_installer,
        "install_embedded_runtime",
        lambda embedded, root: SimpleNamespace(runtime_root=root / "runtime" / "0.5.0", installed=True, warnings=()),
    )
    monkeypatch.setattr(
        setup_installer,
        "register_user_command",
        lambda _root: (_ for _ in ()).throw(AssertionError("PATH registration must be skipped")),
    )

    assert setup_installer.main(["--install-root", str(root), "--no-register-path"]) == 0
    response = json.loads(capsys.readouterr().out)
    assert response["data"]["registration"] == {"registered": False, "skipped": True, "bin": str(root / "bin")}


def test_setup_launcher_copy_failure_never_touches_current_runtime(monkeypatch, tmp_path):
    from cli_anything.indesign import setup_installer

    _write_file(tmp_path / "payload" / "indesign-cli-agent.exe", b"MZnew")
    (tmp_path / "runtime").mkdir()
    root = tmp_path / "installed"
    _write_file(root / "bin" / "indesign-cli-agent.exe", b"MZold")
    current = root / "state" / "current-runtime.json"
    _write_file(current, b'{"version":"0.4.2"}')
    monkeypatch.setattr(setup_installer, "setup_payload_root", lambda: tmp_path)
    monkeypatch.setattr(
        setup_installer,
        "_install_launcher",
        lambda *_args: (_ for _ in ()).throw(OSError("launcher copy failed")),
    )
    monkeypatch.setattr(
        setup_installer,
        "install_embedded_runtime",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("runtime must not be touched")),
    )

    try:
        setup_installer.main(["--install-root", str(root), "--no-register-path"])
    except OSError as exc:
        assert "launcher copy failed" in str(exc)
    else:
        raise AssertionError("launcher copy failure was swallowed")
    assert (root / "bin" / "indesign-cli-agent.exe").read_bytes() == b"MZold"
    assert current.read_bytes() == b'{"version":"0.4.2"}'


def test_setup_runtime_failure_restores_old_launcher_and_042_state(monkeypatch, tmp_path):
    from cli_anything.indesign import setup_installer

    _write_file(tmp_path / "payload" / "indesign-cli-agent.exe", b"MZnew")
    (tmp_path / "runtime").mkdir()
    root = tmp_path / "installed"
    launcher = root / "bin" / "indesign-cli-agent.exe"
    _write_file(launcher, b"MZold")
    current = root / "state" / "current-runtime.json"
    _write_file(current, b'{"version":"0.4.2"}')
    monkeypatch.setattr(setup_installer, "setup_payload_root", lambda: tmp_path)

    def fail_runtime(_embedded, *, root):
        assert launcher.read_bytes() == b"MZnew"
        raise RuntimeError("runtime validation failed")

    monkeypatch.setattr(setup_installer, "install_embedded_runtime", fail_runtime)

    try:
        setup_installer.main(["--install-root", str(root), "--no-register-path"])
    except RuntimeError as exc:
        assert "runtime validation failed" in str(exc)
    else:
        raise AssertionError("runtime failure was swallowed")
    assert launcher.read_bytes() == b"MZold"
    assert current.read_bytes() == b'{"version":"0.4.2"}'


def test_setup_runtime_failure_removes_new_launcher_when_none_existed(monkeypatch, tmp_path):
    from cli_anything.indesign import setup_installer

    _write_file(tmp_path / "payload" / "indesign-cli-agent.exe", b"MZnew")
    (tmp_path / "runtime").mkdir()
    root = tmp_path / "installed"
    monkeypatch.setattr(setup_installer, "setup_payload_root", lambda: tmp_path)
    monkeypatch.setattr(
        setup_installer,
        "install_embedded_runtime",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("runtime failed")),
    )

    try:
        setup_installer.main(["--install-root", str(root), "--no-register-path"])
    except RuntimeError:
        pass
    else:
        raise AssertionError("runtime failure was swallowed")
    assert not (root / "bin" / "indesign-cli-agent.exe").exists()


def test_setup_path_registration_failure_is_warning_after_successful_install(monkeypatch, tmp_path, capsys):
    from cli_anything.indesign import setup_installer

    _write_file(tmp_path / "payload" / "indesign-cli-agent.exe", b"MZnew")
    (tmp_path / "runtime").mkdir()
    root = tmp_path / "installed"
    monkeypatch.setattr(setup_installer, "setup_payload_root", lambda: tmp_path)
    monkeypatch.setattr(
        setup_installer,
        "install_embedded_runtime",
        lambda _embedded, *, root: SimpleNamespace(runtime_root=root / "runtime" / "0.5.0", installed=True, warnings=()),
    )
    monkeypatch.setattr(
        setup_installer,
        "register_user_command",
        lambda _root: (_ for _ in ()).throw(OSError("registry denied")),
    )

    assert setup_installer.main(["--install-root", str(root)]) == 0
    response = json.loads(capsys.readouterr().out)
    assert response["data"]["registration"]["registered"] is False
    assert response["data"]["registration"]["code"] == "PATH_REGISTRATION_FAILED"
    assert response["data"]["warnings"] == [{"code": "PATH_REGISTRATION_FAILED", "message": "registry denied"}]
    assert (root / "bin" / "indesign-cli-agent.exe").read_bytes() == b"MZnew"


def test_html_plugin_tgz_rejects_path_traversal(tmp_path):
    builder = _load_builder()
    archive = tmp_path / "unsafe.tgz"
    with tarfile.open(archive, "w:gz") as payload:
        data = b"escape"
        member = tarfile.TarInfo("../escape.txt")
        member.size = len(data)
        payload.addfile(member, io.BytesIO(data))

    try:
        builder._safe_extract_tgz(archive, tmp_path / "extract")
    except SystemExit as exc:
        assert "unsafe path" in str(exc)
    else:
        raise AssertionError("unsafe tgz was accepted")
    assert not (tmp_path / "escape.txt").exists()
