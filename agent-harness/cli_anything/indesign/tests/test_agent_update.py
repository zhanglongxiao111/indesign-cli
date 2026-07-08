import json

from cli_anything.indesign.core.agent_update import (
    DEFAULT_SOURCES,
    Manifest,
    compare_versions,
    install_root,
    parse_manifest,
    parse_version,
)


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
