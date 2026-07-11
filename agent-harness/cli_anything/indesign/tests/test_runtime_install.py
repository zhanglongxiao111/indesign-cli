import hashlib
import json
import zipfile

import pytest

import support  # noqa: F401


def _manifest_payload(artifact, sha256, version="0.5.0"):
    return {
        "schema_version": 2,
        "name": "indesign-cli-runtime",
        "version": version,
        "platform": "windows-x64",
        "components": {
            "indesign_cli": version,
            "html_indesign": "0.2.0",
            "node": "20.18.1",
            "browser": "msedge",
        },
        "artifact": {"url": str(artifact), "sha256": sha256},
    }


def _write_runtime_zip(path, *, marker="runtime"):
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("cli/indesign-cli.exe", marker)
        archive.writestr("node/node.exe", "node")
        archive.writestr("server/package.json", "{}")
        archive.writestr("server/src/index.js", "// classic")
        archive.writestr("server/src/advanced/index.js", "// advanced")
        archive.writestr("server/node_modules/winax/package.json", "{}")
        archive.writestr("plugins/html-indesign/manifest.json", "{}")


def _write_manifest(path, artifact, *, version="0.5.0", sha256=None):
    sha = sha256 or hashlib.sha256(artifact.read_bytes()).hexdigest()
    path.write_text(json.dumps(_manifest_payload(artifact, sha, version)), encoding="utf-8")
    return path


def test_runtime_manifest_v2_parses_components_and_runtime_artifact(tmp_path):
    from cli_anything.indesign.core.runtime_manifest import RuntimeManifest, parse_runtime_manifest

    payload = _manifest_payload(tmp_path / "runtime.zip", "a" * 64)

    manifest = parse_runtime_manifest(payload, source="nas")

    assert manifest == RuntimeManifest(
        schema_version=2,
        name="indesign-cli-runtime",
        version="0.5.0",
        platform="windows-x64",
        components={
            "indesign_cli": "0.5.0",
            "html_indesign": "0.2.0",
            "node": "20.18.1",
            "browser": "msedge",
        },
        artifact_url=str(tmp_path / "runtime.zip"),
        github_url=None,
        sha256="a" * 64,
        source="nas",
    )


@pytest.mark.parametrize("field,value", [("schema_version", 1), ("name", "indesign-cli-agent"), ("platform", "linux-x64")])
def test_runtime_manifest_v2_rejects_wrong_identity(tmp_path, field, value):
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.runtime_manifest import parse_runtime_manifest

    payload = _manifest_payload(tmp_path / "runtime.zip", "a" * 64)
    payload[field] = value

    with pytest.raises(CliError) as exc:
        parse_runtime_manifest(payload, source="test")

    assert exc.value.code == "UPDATE_MANIFEST_INVALID"


def test_runtime_install_layout_is_persistent_and_switches_atomically(tmp_path, monkeypatch):
    from cli_anything.indesign.core.runtime_install import RuntimeLayout, install_runtime, read_current_runtime

    root = tmp_path / "install"
    archive = tmp_path / "runtime.zip"
    _write_runtime_zip(archive)
    manifest_file = _write_manifest(tmp_path / "runtime-latest.json", archive)
    monkeypatch.setenv("HTML_INDESIGN_BROWSER_EXECUTABLE", str(tmp_path / "msedge.exe"))
    (tmp_path / "msedge.exe").write_text("edge", encoding="utf-8")

    runtime_root = install_runtime(manifest_file, root=root)

    layout = RuntimeLayout(root)
    assert runtime_root == layout.runtime / "0.5.0"
    assert (runtime_root / "cli" / "indesign-cli.exe").read_text() == "runtime"
    state = read_current_runtime(root)
    assert state["version"] == "0.5.0"
    assert state["root"] == str(runtime_root)
    assert state["components"]["browser"] == "msedge"
    assert list(layout.tmp.iterdir()) == []


def test_runtime_install_rejects_sha_mismatch_and_keeps_current(tmp_path, monkeypatch):
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.runtime_install import install_runtime

    root = tmp_path / "install"
    current = root / "runtime" / "0.4.2"
    current.mkdir(parents=True)
    state = root / "state" / "current-runtime.json"
    state.parent.mkdir(parents=True)
    state.write_text(json.dumps({"version": "0.4.2", "root": str(current), "components": {}}), encoding="utf-8")
    archive = tmp_path / "runtime.zip"
    _write_runtime_zip(archive)
    manifest_file = _write_manifest(tmp_path / "runtime-latest.json", archive, sha256="f" * 64)

    with pytest.raises(CliError) as exc:
        install_runtime(manifest_file, root=root)

    assert exc.value.code == "UPDATE_SHA256_MISMATCH"
    assert json.loads(state.read_text(encoding="utf-8"))["version"] == "0.4.2"
    assert current.exists()
    assert not (root / "runtime" / "0.5.0").exists()


def test_runtime_install_rejects_corrupt_zip(tmp_path):
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.runtime_install import install_runtime

    archive = tmp_path / "runtime.zip"
    archive.write_bytes(b"not a zip")
    manifest_file = _write_manifest(tmp_path / "runtime-latest.json", archive)

    with pytest.raises(CliError) as exc:
        install_runtime(manifest_file, root=tmp_path / "install", edge_probe=lambda: {"available": True})

    assert exc.value.code == "RUNTIME_ARCHIVE_INVALID"


def test_runtime_install_rejects_zip_traversal(tmp_path):
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.runtime_install import install_runtime

    archive = tmp_path / "runtime.zip"
    with zipfile.ZipFile(archive, "w") as payload:
        payload.writestr("../escaped.txt", "escape")
    manifest_file = _write_manifest(tmp_path / "runtime-latest.json", archive)

    with pytest.raises(CliError) as exc:
        install_runtime(manifest_file, root=tmp_path / "install", edge_probe=lambda: {"available": True})

    assert exc.value.code == "RUNTIME_ARCHIVE_UNSAFE"
    assert not (tmp_path / "escaped.txt").exists()


def test_runtime_install_interrupted_validation_cleans_staging_and_preserves_current(tmp_path):
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.runtime_install import install_runtime

    root = tmp_path / "install"
    current = root / "runtime" / "0.4.2"
    current.mkdir(parents=True)
    state = root / "state" / "current-runtime.json"
    state.parent.mkdir(parents=True)
    state.write_text(json.dumps({"version": "0.4.2", "root": str(current), "components": {}}), encoding="utf-8")
    archive = tmp_path / "runtime.zip"
    _write_runtime_zip(archive)
    manifest_file = _write_manifest(tmp_path / "runtime-latest.json", archive)

    def interrupted(_root, **_kwargs):
        raise CliError("interrupted", code="RUNTIME_VALIDATION_FAILED")

    with pytest.raises(CliError):
        install_runtime(manifest_file, root=root, validator=interrupted)

    assert json.loads(state.read_text(encoding="utf-8"))["version"] == "0.4.2"
    assert current.exists()
    assert not list((root / "runtime").glob(".staging-*"))


def test_runtime_install_atomic_state_switch_failure_removes_new_runtime_and_keeps_current(tmp_path, monkeypatch):
    from cli_anything.indesign.core import runtime_install

    root = tmp_path / "install"
    current = root / "runtime" / "0.4.2"
    current.mkdir(parents=True)
    state = root / "state" / "current-runtime.json"
    state.parent.mkdir(parents=True)
    state.write_text(json.dumps({"version": "0.4.2", "root": str(current), "components": {}}), encoding="utf-8")
    archive = tmp_path / "runtime.zip"
    _write_runtime_zip(archive)
    manifest_file = _write_manifest(tmp_path / "runtime-latest.json", archive)
    monkeypatch.setattr(runtime_install, "_write_current_state", lambda *_args: (_ for _ in ()).throw(OSError("switch interrupted")))

    with pytest.raises(OSError, match="switch interrupted"):
        runtime_install.install_runtime(manifest_file, root=root, edge_probe=lambda: {"available": True})

    assert json.loads(state.read_text(encoding="utf-8"))["version"] == "0.4.2"
    assert current.exists()
    assert not (root / "runtime" / "0.5.0").exists()


def test_runtime_installer_never_overwrites_current_version_in_place(tmp_path):
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.runtime_install import install_runtime

    root = tmp_path / "install"
    current = root / "runtime" / "0.5.0"
    current.mkdir(parents=True)
    marker = current / "keep.txt"
    marker.write_text("current", encoding="utf-8")
    state = root / "state" / "current-runtime.json"
    state.parent.mkdir(parents=True)
    state.write_text(json.dumps({"version": "0.5.0", "root": str(current), "components": {}}), encoding="utf-8")
    archive = tmp_path / "runtime.zip"
    _write_runtime_zip(archive, marker="replacement")
    manifest_file = _write_manifest(tmp_path / "runtime-latest.json", archive)

    with pytest.raises(CliError) as exc:
        install_runtime(manifest_file, root=root, edge_probe=lambda: {"available": True})

    assert exc.value.code == "RUNTIME_IN_USE"
    assert marker.read_text(encoding="utf-8") == "current"


def test_runtime_install_success_deletes_all_old_versions_and_staging(tmp_path):
    from cli_anything.indesign.core.runtime_install import install_runtime

    root = tmp_path / "install"
    for name in ("0.4.1", "0.4.2", ".staging-abandoned"):
        (root / "runtime" / name).mkdir(parents=True)
    archive = tmp_path / "runtime.zip"
    _write_runtime_zip(archive)
    manifest_file = _write_manifest(tmp_path / "runtime-latest.json", archive)

    install_runtime(manifest_file, root=root, edge_probe=lambda: {"available": True})

    assert [item.name for item in (root / "runtime").iterdir()] == ["0.5.0"]


def test_ensure_runtime_ready_initial_failure_has_stable_error(tmp_path):
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.runtime_install import ensure_runtime_ready

    with pytest.raises(CliError) as exc:
        ensure_runtime_ready(root=tmp_path / "install", sources=[str(tmp_path / "missing.json")])

    assert exc.value.code == "INITIAL_INSTALL_FAILED"


def test_runtime_update_lock_blocks_concurrent_installer(tmp_path):
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.runtime_install import RuntimeUpdateLock

    path = tmp_path / "state" / "runtime-update.lock"
    with RuntimeUpdateLock(path, timeout_seconds=0):
        with pytest.raises(CliError) as exc:
            with RuntimeUpdateLock(path, timeout_seconds=0):
                pass

    assert exc.value.code == "UPDATE_LOCK_TIMEOUT"


def test_embedded_runtime_is_copied_only_into_persistent_initial_install(tmp_path):
    from cli_anything.indesign.core.runtime_install import install_embedded_runtime, read_current_runtime

    embedded = tmp_path / "embedded"
    archive = tmp_path / "embedded.zip"
    _write_runtime_zip(archive, marker="embedded")
    with zipfile.ZipFile(archive) as payload:
        payload.extractall(embedded)
    (embedded / "runtime-metadata.json").write_text(
        json.dumps({
            "version": "0.5.0",
            "components": {"indesign_cli": "0.5.0", "html_indesign": "0.2.0", "node": "20.18.1", "browser": "msedge"},
        }),
        encoding="utf-8",
    )
    root = tmp_path / "install"

    installed = install_embedded_runtime(embedded, root=root, edge_probe=lambda: {"available": True})

    assert installed == root / "runtime" / "0.5.0"
    assert (installed / "cli" / "indesign-cli.exe").read_text() == "embedded"
    assert read_current_runtime(root)["version"] == "0.5.0"
    assert embedded.exists()
