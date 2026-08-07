import json

import pytest

import support  # noqa: F401
from cli_anything.indesign.core.agent_update import (
    DEFAULT_SOURCES,
    ensure_agent_ready,
    install_root,
    path_needs_registration,
    register_user_command,
    updated_user_path,
)
from cli_anything.indesign.core.errors import CliError


def _write_shallow_runtime(runtime):
    files = [
        "cli/indesign-cli.exe",
        "cli/_internal/cli_anything/indesign/node/internal_tool_bridge.mjs",
        "node/node.exe",
        "server/package.json",
        "server/src/index.js",
        "server/src/advanced/index.js",
        "server/node_modules/winax/package.json",
        "plugins/html-indesign/manifest.json",
        "plugins/html-indesign/index.js",
    ]
    for relative in files:
        path = runtime / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"MZ" if path.suffix == ".exe" else b"{}")


def test_install_root_is_user_localappdata(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "LocalAppData"))
    assert install_root() == tmp_path / "LocalAppData" / "indesign-cli"


def test_install_root_explicit_override_wins(tmp_path, monkeypatch):
    monkeypatch.setenv("INDESIGN_CLI_INSTALL_ROOT", str(tmp_path / "managed"))
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "LocalAppData"))
    assert install_root() == (tmp_path / "managed").resolve()


def test_frozen_installed_launcher_derives_root_from_its_bin(monkeypatch, tmp_path):
    from cli_anything.indesign.core import agent_update

    launcher = tmp_path / "custom-root" / "bin" / "indesign-cli-agent.exe"
    monkeypatch.delenv("INDESIGN_CLI_INSTALL_ROOT", raising=False)
    monkeypatch.setattr(agent_update.sys, "frozen", True, raising=False)
    monkeypatch.setattr(agent_update.sys, "executable", str(launcher))

    assert agent_update.install_root() == tmp_path / "custom-root"


def test_frozen_setup_does_not_derive_install_root_from_its_location(monkeypatch, tmp_path):
    from cli_anything.indesign.core import agent_update

    monkeypatch.delenv("INDESIGN_CLI_INSTALL_ROOT", raising=False)
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "LocalAppData"))
    monkeypatch.setattr(agent_update.sys, "frozen", True, raising=False)
    monkeypatch.setattr(agent_update.sys, "executable", str(tmp_path / "downloads" / "indesign-cli-agent-setup.exe"))

    assert agent_update.install_root() == tmp_path / "LocalAppData" / "indesign-cli"


def test_default_sources_are_runtime_manifest_nas_then_github():
    assert DEFAULT_SOURCES[0] == r"\\daga-nas5\sa-ai-app\tools\indesign-cli\runtime-latest.json"
    assert DEFAULT_SOURCES[1].endswith("/runtime-latest.json")


def test_ensure_agent_ready_keeps_current_runtime_when_manifest_unavailable(tmp_path, monkeypatch):
    root = tmp_path / "install"
    runtime = root / "runtime" / "0.4.2"
    runtime.mkdir(parents=True)
    _write_shallow_runtime(runtime)
    state = root / "state" / "current-runtime.json"
    state.parent.mkdir(parents=True)
    state.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "version": "0.4.2",
                "root": str(runtime),
                "components": {
                    "indesign_cli": "0.4.2",
                    "html_indesign": "0.1.0",
                    "node": "20.18.1",
                    "winax": "3.6.0",
                    "browser": "msedge",
                },
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr("cli_anything.indesign.core.agent_update.install_root", lambda: root)

    result = ensure_agent_ready(command_args=["tool", "domains"], sources=[str(tmp_path / "missing.json")])

    assert result["updated"] is False
    assert result["version"] == "0.4.2"
    assert result["runtime_root"] == str(runtime)
    assert result["warnings"][0]["code"] == "UPDATE_CHECK_FAILED"


def test_ensure_agent_ready_without_current_runtime_fails_initial_install(tmp_path, monkeypatch):
    monkeypatch.setattr("cli_anything.indesign.core.agent_update.install_root", lambda: tmp_path / "install")

    with pytest.raises(CliError) as exc:
        ensure_agent_ready(command_args=["tool", "domains"], sources=[str(tmp_path / "missing.json")])

    assert exc.value.code == "INITIAL_INSTALL_FAILED"


def test_path_needs_registration_detects_missing_bin(tmp_path):
    bin_path = tmp_path / "bin"
    assert path_needs_registration(str(bin_path), current_path="C:\\Windows") is True
    assert path_needs_registration(str(bin_path), current_path=f"C:\\Windows;{bin_path}") is False


def test_updated_user_path_appends_bin_once(tmp_path):
    bin_path = tmp_path / "bin"
    first = updated_user_path(str(bin_path), current_path="C:\\Windows")
    assert updated_user_path(str(bin_path), current_path=first) == first


def test_register_user_command_writes_user_path_without_process_path(monkeypatch, tmp_path):
    from cli_anything.indesign.core import agent_update

    written = {}
    monkeypatch.setenv("PATH", r"C:\Windows;C:\System")
    monkeypatch.setattr(agent_update, "read_user_path", lambda: r"C:\Users\me\bin")
    monkeypatch.setattr(agent_update, "write_user_path", lambda value: written.setdefault("path", value))

    result = register_user_command(root=tmp_path)

    assert result["registered"] is True
    assert str(tmp_path / "bin") in written["path"]
    assert r"C:\Windows" not in written["path"]


def test_register_user_command_reports_launcher_path_and_path_effectiveness(monkeypatch, tmp_path):
    from cli_anything.indesign.core import agent_update

    monkeypatch.setenv("PATH", r"C:\Windows")
    monkeypatch.setattr(agent_update, "read_user_path", lambda: r"C:\Users\me\bin")
    monkeypatch.setattr(agent_update, "write_user_path", lambda value: None)

    result = register_user_command(root=tmp_path)

    assert result["launcher_abspath"] == str(tmp_path / "bin" / "indesign-cli-agent.exe")
    assert result["path_effective_in_current_process"] is False


def test_register_user_command_reports_launcher_path_when_already_registered(monkeypatch, tmp_path):
    from cli_anything.indesign.core import agent_update

    already = str(tmp_path / "bin")
    monkeypatch.setenv("PATH", already)
    monkeypatch.setattr(agent_update, "read_user_path", lambda: already)

    result = register_user_command(root=tmp_path)

    assert result["registered"] is False
    assert result["launcher_abspath"] == str(tmp_path / "bin" / "indesign-cli-agent.exe")
    assert result["path_effective_in_current_process"] is False


def test_legacy_update_state_compatibility_api_is_removed():
    from cli_anything.indesign.core import agent_update

    assert not hasattr(agent_update, "read_update_state")


def test_read_runtime_manifest_times_out_on_hanging_source(monkeypatch, tmp_path):
    import time

    import pytest

    from cli_anything.indesign.core import runtime_manifest
    from cli_anything.indesign.core.errors import CliError

    class HangingPath:
        def __init__(self, *args, **kwargs):
            pass

        def read_text(self, *args, **kwargs):
            time.sleep(5)
            return "{}"

    monkeypatch.setattr(runtime_manifest, "Path", HangingPath)
    monkeypatch.setattr(runtime_manifest, "_MANIFEST_READ_TIMEOUT_SECONDS", 0.2)

    with pytest.raises(CliError) as exc_info:
        runtime_manifest.read_runtime_manifest(r"\unreachable-nas\share\runtime-latest.json")

    assert exc_info.value.code == "UPDATE_CHECK_FAILED"


def test_load_first_runtime_manifest_falls_through_after_source_timeout(monkeypatch, tmp_path):
    import json as json_module

    from cli_anything.indesign.core import runtime_manifest
    from cli_anything.indesign.core.errors import CliError

    good = tmp_path / "runtime-latest.json"
    good.write_text(
        json_module.dumps(
            {
                "schema_version": 2,
                "name": "indesign-cli-runtime",
                "platform": "windows-x64",
                "version": "0.5.3",
                "components": {
                    "indesign_cli": "0.5.3",
                    "html_indesign": "0.2.3",
                    "node": "20.0.0",
                    "winax": "3.4.0",
                    "browser": "msedge",
                },
                "artifact": {
                    "url": "https://example.com/runtime.zip",
                    "github_url": "https://example.com/runtime.zip",
                    "sha256": "a" * 64,
                },
            }
        ),
        encoding="utf-8",
    )

    original_read = runtime_manifest.read_runtime_manifest

    def fake_read(source):
        if str(source).startswith("\\unreachable"):
            raise CliError("Cannot read runtime manifest", code="UPDATE_CHECK_FAILED", details={"source": str(source)})
        return original_read(source)

    monkeypatch.setattr(runtime_manifest, "read_runtime_manifest", fake_read)

    manifest, warnings = runtime_manifest.load_first_runtime_manifest(
        [r"\unreachable-nas\share\runtime-latest.json", str(good)]
    )

    assert manifest is not None
    assert manifest.version == "0.5.3"
    assert warnings and warnings[0]["code"] == "UPDATE_CHECK_FAILED"
