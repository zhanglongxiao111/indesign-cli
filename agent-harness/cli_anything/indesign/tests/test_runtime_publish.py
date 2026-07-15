from __future__ import annotations

import hashlib
import importlib.util
import json
import zipfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
SCRIPT_PATH = REPO_ROOT / "scripts" / "publish_agent_runtime.py"


def _load_publisher():
    spec = importlib.util.spec_from_file_location("publish_agent_runtime", SCRIPT_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write_release(root: Path, version: str, plugin_version: str, *, corrupt_checksum: bool = False) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    archive_name = f"runtime-windows-x64-{version}.zip"
    archive = root / archive_name
    components = {
        "indesign_cli": version,
        "html_indesign": plugin_version,
        "node": "22.15.0",
        "winax": "3.6.2",
        "browser": "msedge",
    }
    metadata = {
        "schema_version": 2,
        "name": "indesign-cli-runtime",
        "version": version,
        "platform": "windows-x64",
        "components": components,
        "artifact": {
            "file": archive_name,
            "url": rf"\\daga-nas5\sa-ai-app\tools\indesign-cli\{archive_name}",
            "github_url": f"https://github.com/example/releases/download/v{version}/{archive_name}",
            "sha256": "0" * 64,
        },
    }
    with zipfile.ZipFile(archive, "w") as payload:
        payload.writestr("runtime-metadata.json", json.dumps(metadata))
        payload.writestr("cli/indesign-cli.exe", b"MZcli")
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    manifest = json.loads(json.dumps(metadata))
    manifest["artifact"]["sha256"] = "f" * 64 if corrupt_checksum else digest
    (root / "runtime-latest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (root / f"{archive_name}.sha256").write_text(f"{digest}  {archive_name}\n", encoding="utf-8")
    (root / "indesign-cli-agent-setup.exe").write_bytes(b"MZsetup")
    return root


def test_publish_runtime_dry_run_then_archives_and_switches_current_manifest(tmp_path):
    publisher = _load_publisher()
    nas_root = tmp_path / "nas"
    old_source = _write_release(tmp_path / "old", "0.5.0", "0.2.0")
    for path in old_source.iterdir():
        (nas_root / path.name).parent.mkdir(parents=True, exist_ok=True)
        (nas_root / path.name).write_bytes(path.read_bytes())
    old_archive = nas_root / "releases" / "0.5.0"
    old_archive.mkdir(parents=True)
    for path in old_source.iterdir():
        (old_archive / path.name).write_bytes(path.read_bytes())

    release = _write_release(tmp_path / "new", "0.5.1", "0.2.1")
    dry_run = publisher.publish_release(release, nas_root=nas_root, dry_run=True)
    assert dry_run["ok"] is True
    assert dry_run["dry_run"] is True
    assert not (nas_root / "releases" / "0.5.1").exists()
    assert json.loads((nas_root / "runtime-latest.json").read_text())["version"] == "0.5.0"

    result = publisher.publish_release(release, nas_root=nas_root, dry_run=False)

    assert result["ok"] is True
    assert result["verify"]["version"] == "0.5.1"
    assert result["verify"]["sha256_match"] is True
    assert (nas_root / "releases" / "0.5.0" / "runtime-latest.json").is_file()
    assert (nas_root / "releases" / "0.5.1" / "runtime-latest.json").is_file()
    assert json.loads((nas_root / "runtime-latest.json").read_text())["version"] == "0.5.1"
    assert (nas_root / "runtime-windows-x64-0.5.1.zip").is_file()
    assert not (nas_root / "runtime-windows-x64-0.5.0.zip").exists()


def test_publish_runtime_rejects_manifest_checksum_mismatch(tmp_path):
    publisher = _load_publisher()
    release = _write_release(tmp_path / "release", "0.5.1", "0.2.1", corrupt_checksum=True)

    try:
        publisher.publish_release(release, nas_root=tmp_path / "nas", dry_run=True)
    except SystemExit as exc:
        assert "SHA-256" in str(exc)
    else:
        raise AssertionError("corrupt runtime release was accepted")
