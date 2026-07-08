import json
import hashlib

import pytest

from cli_anything.indesign.core.agent_update import (
    DEFAULT_SOURCES,
    Manifest,
    UserUpdateLock,
    compare_versions,
    copy_artifact,
    ensure_agent_ready,
    install_or_replace_exe,
    install_root,
    parse_manifest,
    parse_version,
    read_manifest_file,
    sha256_file,
    update_state_path,
)
from cli_anything.indesign.core.errors import CliError


def test_install_root_is_user_localappdata(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "LocalAppData"))
    assert install_root() == tmp_path / "LocalAppData" / "indesign-cli"


def test_default_sources_are_nas_then_github():
    assert DEFAULT_SOURCES[0].startswith("\\\\daga-nas5\\sa-ai-app\\tools\\indesign-cli\\latest.json")
    assert DEFAULT_SOURCES[1] == "https://github.com/zhanglongxiao111/indesign-cli/releases/latest/download/latest.json"


def test_parse_version_accepts_semver_and_rejects_prefix_in_manifest():
    assert parse_version("0.4.1") == (0, 4, 1)
    assert parse_version("10.20.30") == (10, 20, 30)
    assert parse_version("v0.4.1") is None
    assert parse_version("0.4.1-beta.1") is None


def test_compare_versions_handles_unknown_local():
    assert compare_versions("0.4.0", "0.4.1") == -1
    assert compare_versions("0.4.1", "0.4.1") == 0
    assert compare_versions("0.4.2", "0.4.1") == 1
    assert compare_versions("unknown", "0.4.1") == -1


def test_parse_manifest_reads_artifact_contract():
    payload = {
        "schema_version": 1,
        "name": "indesign-cli-agent",
        "version": "0.4.1",
        "channel": "stable",
        "platform": "windows-x64",
        "artifact": {
            "file": "indesign-cli-agent.exe",
            "url": "\\\\server\\tools\\indesign-cli\\releases\\0.4.1\\indesign-cli-agent.exe",
            "github_url": "https://github.com/example/release/indesign-cli-agent.exe",
            "sha256": "a" * 64,
        },
    }
    manifest = parse_manifest(payload, source="nas")
    assert manifest == Manifest(
        version="0.4.1",
        artifact_url="\\\\server\\tools\\indesign-cli\\releases\\0.4.1\\indesign-cli-agent.exe",
        github_url="https://github.com/example/release/indesign-cli-agent.exe",
        sha256="a" * 64,
        source="nas",
    )


def test_read_manifest_file_parses_json_manifest(tmp_path):
    manifest_path = tmp_path / "latest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "name": "indesign-cli-agent",
                "version": "0.4.1",
                "artifact": {
                    "url": str(tmp_path / "indesign-cli-agent.exe"),
                    "sha256": "b" * 64,
                },
            }
        ),
        encoding="utf-8",
    )
    manifest = read_manifest_file(manifest_path)
    assert manifest.version == "0.4.1"
    assert manifest.source == str(manifest_path)


def test_sha256_file_matches_hashlib(tmp_path):
    artifact = tmp_path / "agent.exe"
    artifact.write_bytes(b"agent")
    assert sha256_file(artifact) == hashlib.sha256(b"agent").hexdigest()


def test_copy_artifact_rejects_checksum_mismatch(tmp_path):
    source = tmp_path / "agent.exe"
    target = tmp_path / "download.exe"
    source.write_bytes(b"bad")
    with pytest.raises(CliError) as exc:
        copy_artifact(str(source), target, expected_sha256="c" * 64)
    assert exc.value.code == "UPDATE_SHA256_MISMATCH"
    assert not target.exists()


def test_copy_artifact_cleans_partial_file_on_missing_source(tmp_path):
    target = tmp_path / "download.exe"
    with pytest.raises(CliError) as exc:
        copy_artifact(str(tmp_path / "missing.exe"), target, expected_sha256="d" * 64)
    assert exc.value.code == "UPDATE_ARTIFACT_NOT_FOUND"
    assert not target.exists()


def test_user_update_lock_blocks_second_holder(tmp_path):
    lock_path = tmp_path / "state" / "update.lock"
    with UserUpdateLock(lock_path, timeout_seconds=0):
        with pytest.raises(CliError) as exc:
            with UserUpdateLock(lock_path, timeout_seconds=0):
                pass
    assert exc.value.code == "UPDATE_LOCK_TIMEOUT"
    assert not lock_path.exists()


def _manifest_for(source, sha: str) -> Manifest:
    return Manifest(version="0.4.2", artifact_url=str(source), github_url=None, sha256=sha, source="test")


def test_install_or_replace_exe_installs_to_user_bin_and_cleans_tmp(tmp_path):
    source = tmp_path / "release" / "indesign-cli-agent.exe"
    source.parent.mkdir()
    source.write_bytes(b"new agent")
    sha = hashlib.sha256(b"new agent").hexdigest()
    target = install_or_replace_exe(_manifest_for(source, sha), root=tmp_path / "install")
    assert target == tmp_path / "install" / "bin" / "indesign-cli-agent.exe"
    assert target.read_bytes() == b"new agent"
    assert list((tmp_path / "install" / "tmp").glob("*")) == []
    assert list((tmp_path / "install" / "bin").glob(".*.new")) == []
    assert not (tmp_path / "install" / "bin" / "indesign-cli-agent.exe.bak").exists()


def test_install_or_replace_exe_keeps_old_exe_when_checksum_fails(tmp_path):
    root = tmp_path / "install"
    current = root / "bin" / "indesign-cli-agent.exe"
    current.parent.mkdir(parents=True)
    current.write_bytes(b"old agent")
    source = tmp_path / "release" / "indesign-cli-agent.exe"
    source.parent.mkdir()
    source.write_bytes(b"new agent")
    with pytest.raises(CliError):
        install_or_replace_exe(_manifest_for(source, "e" * 64), root=root)
    assert current.read_bytes() == b"old agent"
    assert not (root / "bin" / "indesign-cli-agent.exe.bak").exists()


def test_install_or_replace_exe_writes_update_state(tmp_path):
    source = tmp_path / "release" / "indesign-cli-agent.exe"
    source.parent.mkdir()
    source.write_bytes(b"new agent")
    sha = hashlib.sha256(b"new agent").hexdigest()
    root = tmp_path / "install"
    install_or_replace_exe(_manifest_for(source, sha), root=root)
    state = json.loads(update_state_path(root).read_text(encoding="utf-8"))
    assert state["version"] == "0.4.2"
    assert state["source"] == "test"
    assert state["status"] == "updated"


def test_ensure_agent_ready_continues_when_manifest_unavailable_but_exe_exists(tmp_path, monkeypatch):
    root = tmp_path / "install"
    exe = root / "bin" / "indesign-cli-agent.exe"
    exe.parent.mkdir(parents=True)
    exe.write_bytes(b"current")
    monkeypatch.setattr("cli_anything.indesign.core.agent_update.install_root", lambda: root)

    result = ensure_agent_ready(command_args=["tool", "domains"], sources=[str(tmp_path / "missing-latest.json")])

    assert result["updated"] is False
    assert result["warnings"][0]["code"] == "UPDATE_CHECK_FAILED"
    assert not (root / "runtime").exists()
    assert not (root / "current").exists()


def test_ensure_agent_ready_fails_initial_install_when_sources_missing(tmp_path, monkeypatch):
    monkeypatch.setattr("cli_anything.indesign.core.agent_update.install_root", lambda: tmp_path / "install")

    with pytest.raises(CliError) as exc:
        ensure_agent_ready(command_args=["tool", "domains"], sources=[str(tmp_path / "missing-latest.json")])

    assert exc.value.code == "INITIAL_INSTALL_FAILED"
