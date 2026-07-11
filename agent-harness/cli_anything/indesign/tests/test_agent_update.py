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


def test_install_root_is_user_localappdata(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "LocalAppData"))
    assert install_root() == tmp_path / "LocalAppData" / "indesign-cli"


def test_default_sources_are_runtime_manifest_nas_then_github():
    assert DEFAULT_SOURCES[0] == r"\\daga-nas5\sa-ai-app\tools\indesign-cli\runtime-latest.json"
    assert DEFAULT_SOURCES[1].endswith("/runtime-latest.json")


def test_ensure_agent_ready_keeps_current_runtime_when_manifest_unavailable(tmp_path, monkeypatch):
    root = tmp_path / "install"
    runtime = root / "runtime" / "0.4.2"
    runtime.mkdir(parents=True)
    state = root / "state" / "current-runtime.json"
    state.parent.mkdir(parents=True)
    state.write_text(json.dumps({"version": "0.4.2", "root": str(runtime), "components": {}}), encoding="utf-8")
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
