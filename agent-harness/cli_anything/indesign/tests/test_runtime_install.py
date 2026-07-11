import hashlib
import json
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace

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
        "artifact": {"url": str(artifact), "github_url": "https://github.example/runtime.zip", "sha256": sha256},
    }


def _write_runtime_zip(path, *, marker="runtime", plugin_manifest=None, include_plugin_entry=True, cli_bytes=None, include_winax_binding=True):
    plugin_manifest = plugin_manifest if plugin_manifest is not None else {
        "schema_version": 1,
        "protocol": "indesign-cli-plugin.v1",
        "id": "html-indesign",
        "name": "HTML InDesign",
        "version": "0.2.0",
        "kind": "node-plugin",
        "domain": "html",
        "entry": "index.js",
    }
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("cli/indesign-cli.exe", cli_bytes if cli_bytes is not None else b"MZ" + marker.encode())
        archive.writestr("node/node.exe", b"MZnode")
        archive.writestr("server/package.json", "{}")
        archive.writestr("server/src/index.js", "// classic")
        archive.writestr("server/src/advanced/index.js", "// advanced")
        archive.writestr("server/node_modules/winax/package.json", "{}")
        if include_winax_binding:
            archive.writestr("server/node_modules/winax/build/Release/node_activex.node", b"binding")
        archive.writestr("plugins/html-indesign/manifest.json", json.dumps(plugin_manifest) if isinstance(plugin_manifest, dict) else plugin_manifest)
        if include_plugin_entry:
            archive.writestr("plugins/html-indesign/index.js", "// plugin")


def _probe_ok(args, **kwargs):
    return SimpleNamespace(returncode=0, stdout="0.5.0", stderr="")


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
        github_url="https://github.example/runtime.zip",
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


def test_runtime_manifest_v2_requires_github_fallback(tmp_path):
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.runtime_manifest import parse_runtime_manifest

    payload = _manifest_payload(tmp_path / "runtime.zip", "a" * 64)
    payload["artifact"].pop("github_url")

    with pytest.raises(CliError) as exc:
        parse_runtime_manifest(payload, source="nas")

    assert exc.value.code == "UPDATE_MANIFEST_INVALID"


@pytest.mark.parametrize(
    "archive_kwargs, expected_code",
    [
        ({"cli_bytes": b"not-pe"}, "RUNTIME_EXECUTABLE_INVALID"),
        ({"plugin_manifest": "{bad-json"}, "BUILTIN_PLUGIN_INVALID"),
        ({"include_plugin_entry": False}, "BUILTIN_PLUGIN_INVALID"),
        ({"include_winax_binding": False}, "WINAX_INVALID"),
    ],
)
def test_runtime_validation_rejects_invalid_payload_without_switching_or_deleting_current(tmp_path, archive_kwargs, expected_code):
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.runtime_install import install_runtime

    root = tmp_path / "install"
    current = root / "runtime" / "0.4.2"
    current.mkdir(parents=True)
    state = root / "state" / "current-runtime.json"
    state.parent.mkdir(parents=True)
    state.write_text(json.dumps({"version": "0.4.2", "root": str(current), "components": {}}), encoding="utf-8")
    archive = tmp_path / "runtime.zip"
    _write_runtime_zip(archive, **archive_kwargs)
    manifest_file = _write_manifest(tmp_path / "runtime-latest.json", archive)

    with pytest.raises(CliError) as exc:
        install_runtime(manifest_file, root=root, edge_probe=lambda: {"available": True}, probe_runner=_probe_ok)

    assert exc.value.code == expected_code
    assert json.loads(state.read_text(encoding="utf-8"))["version"] == "0.4.2"
    assert current.exists()
    assert not (root / "runtime" / "0.5.0").exists()


@pytest.mark.parametrize("failed_probe", ["cli", "node", "winax"])
def test_runtime_validation_rejects_nonzero_health_probe_without_switching(tmp_path, failed_probe):
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

    def runner(args, **kwargs):
        kind = "winax" if "require('winax')" in " ".join(args) else ("node" if "node.exe" in args[0] else "cli")
        return SimpleNamespace(returncode=1 if kind == failed_probe else 0, stdout="", stderr="failed")

    with pytest.raises(CliError) as exc:
        install_runtime(manifest_file, root=root, edge_probe=lambda: {"available": True}, probe_runner=runner)

    assert exc.value.code == "RUNTIME_PROBE_FAILED"
    assert exc.value.details["probe"] == failed_probe
    assert json.loads(state.read_text(encoding="utf-8"))["version"] == "0.4.2"
    assert current.exists()


def test_runtime_install_layout_is_persistent_and_switches_atomically(tmp_path, monkeypatch):
    from cli_anything.indesign.core.runtime_install import RuntimeLayout, install_runtime, read_current_runtime

    root = tmp_path / "install"
    archive = tmp_path / "runtime.zip"
    _write_runtime_zip(archive)
    manifest_file = _write_manifest(tmp_path / "runtime-latest.json", archive)
    monkeypatch.setenv("HTML_INDESIGN_BROWSER_EXECUTABLE", str(tmp_path / "msedge.exe"))
    (tmp_path / "msedge.exe").write_text("edge", encoding="utf-8")

    result = install_runtime(manifest_file, root=root, probe_runner=_probe_ok)
    runtime_root = result.runtime_root

    layout = RuntimeLayout(root)
    assert runtime_root == layout.runtime / "0.5.0"
    assert (runtime_root / "cli" / "indesign-cli.exe").read_bytes() == b"MZruntime"
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
        runtime_install.install_runtime(manifest_file, root=root, edge_probe=lambda: {"available": True}, probe_runner=_probe_ok)

    assert json.loads(state.read_text(encoding="utf-8"))["version"] == "0.4.2"
    assert current.exists()
    assert not (root / "runtime" / "0.5.0").exists()


def test_runtime_installer_never_overwrites_current_version_in_place(tmp_path):
    from cli_anything.indesign.core.runtime_install import install_runtime

    root = tmp_path / "install"
    current = root / "runtime" / "0.5.0"
    current_archive = tmp_path / "current.zip"
    _write_runtime_zip(current_archive, marker="current")
    with zipfile.ZipFile(current_archive) as payload:
        payload.extractall(current)
    state = root / "state" / "current-runtime.json"
    state.parent.mkdir(parents=True)
    state.write_text(json.dumps({"version": "0.5.0", "root": str(current), "components": {}}), encoding="utf-8")
    archive = tmp_path / "runtime.zip"
    _write_runtime_zip(archive, marker="replacement")
    manifest_file = _write_manifest(tmp_path / "runtime-latest.json", archive)

    result = install_runtime(manifest_file, root=root, edge_probe=lambda: {"available": True}, probe_runner=_probe_ok)

    assert result.installed is False
    assert (current / "cli" / "indesign-cli.exe").read_bytes().startswith(b"MZcurrent")


def test_runtime_install_success_deletes_all_old_versions_and_staging(tmp_path):
    from cli_anything.indesign.core.runtime_install import install_runtime

    root = tmp_path / "install"
    for name in ("0.4.1", "0.4.2", ".staging-abandoned"):
        (root / "runtime" / name).mkdir(parents=True)
    archive = tmp_path / "runtime.zip"
    _write_runtime_zip(archive)
    manifest_file = _write_manifest(tmp_path / "runtime-latest.json", archive)

    install_runtime(manifest_file, root=root, edge_probe=lambda: {"available": True}, probe_runner=_probe_ok)

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


def test_runtime_update_lock_reclaims_dead_owner(tmp_path):
    from cli_anything.indesign.core.runtime_install import RuntimeUpdateLock

    path = tmp_path / "state" / "runtime-update.lock"
    path.parent.mkdir()
    path.write_text(json.dumps({"pid": 424242, "started_at": 1000.0}), encoding="utf-8")

    with RuntimeUpdateLock(path, timeout_seconds=0, stale_after_seconds=3600, clock=lambda: 1001.0, pid_alive=lambda _pid: False):
        assert path.exists()

    assert not path.exists()


def test_runtime_update_lock_reclaims_live_owner_only_after_safety_threshold(tmp_path):
    from cli_anything.indesign.core.runtime_install import RuntimeUpdateLock

    path = tmp_path / "state" / "runtime-update.lock"
    path.parent.mkdir()
    path.write_text(json.dumps({"pid": 42, "started_at": 1000.0}), encoding="utf-8")

    with RuntimeUpdateLock(path, timeout_seconds=0, stale_after_seconds=60, clock=lambda: 1061.0, pid_alive=lambda _pid: True):
        assert path.exists()


def test_runtime_update_lock_does_not_reclaim_live_fresh_owner(tmp_path):
    from cli_anything.indesign.core.errors import CliError
    from cli_anything.indesign.core.runtime_install import RuntimeUpdateLock

    path = tmp_path / "state" / "runtime-update.lock"
    path.parent.mkdir()
    original = {"pid": 42, "started_at": 1000.0}
    path.write_text(json.dumps(original), encoding="utf-8")

    with pytest.raises(CliError) as exc:
        with RuntimeUpdateLock(path, timeout_seconds=0, stale_after_seconds=60, clock=lambda: 1001.0, pid_alive=lambda _pid: True):
            pass

    assert exc.value.code == "UPDATE_LOCK_TIMEOUT"
    assert json.loads(path.read_text(encoding="utf-8")) == original


def test_runtime_update_lock_exit_does_not_remove_replacement_owner(tmp_path):
    from cli_anything.indesign.core.runtime_install import RuntimeUpdateLock

    path = tmp_path / "state" / "runtime-update.lock"
    with RuntimeUpdateLock(path, timeout_seconds=0):
        replacement = {"pid": 999, "started_at": 2000.0, "token": "replacement"}
        path.write_text(json.dumps(replacement), encoding="utf-8")

    assert json.loads(path.read_text(encoding="utf-8")) == replacement


def test_cleanup_failure_keeps_new_current_and_returns_structured_warning_for_retry(tmp_path, monkeypatch):
    from cli_anything.indesign.core import runtime_install

    root = tmp_path / "install"
    old = root / "runtime" / "0.4.2"
    old.mkdir(parents=True)
    state = root / "state" / "current-runtime.json"
    state.parent.mkdir(parents=True)
    state.write_text(json.dumps({"version": "0.4.2", "root": str(old), "components": {}}), encoding="utf-8")
    archive = tmp_path / "runtime.zip"
    _write_runtime_zip(archive)
    manifest_file = _write_manifest(tmp_path / "runtime-latest.json", archive)
    real_remove = runtime_install._remove_runtime_path

    def fail_old(path):
        if path == old:
            raise OSError("old runtime locked")
        return real_remove(path)

    monkeypatch.setattr(runtime_install, "_remove_runtime_path", fail_old)

    result = runtime_install.install_runtime(manifest_file, root=root, edge_probe=lambda: {"available": True}, probe_runner=_probe_ok)

    current = json.loads(state.read_text(encoding="utf-8"))
    assert current["version"] == "0.5.0"
    assert Path(current["root"]).exists()
    assert old.exists()
    assert result.installed is True
    assert result.warnings == ({"code": "RUNTIME_CLEANUP_FAILED", "path": str(old), "message": "old runtime locked"},)

    monkeypatch.setattr(runtime_install, "_remove_runtime_path", real_remove)
    retry = runtime_install.install_runtime(manifest_file, root=root, edge_probe=lambda: {"available": True}, probe_runner=_probe_ok)
    assert retry.installed is False
    assert retry.warnings == ()
    assert not old.exists()
    assert json.loads(state.read_text(encoding="utf-8"))["root"] == current["root"]


def test_ensure_runtime_ready_retries_cleanup_for_equal_current_version(tmp_path, monkeypatch):
    from cli_anything.indesign.core import runtime_install

    root = tmp_path / "install"
    current = root / "runtime" / "0.5.0"
    current.mkdir(parents=True)
    state = root / "state" / "current-runtime.json"
    state.parent.mkdir(parents=True)
    state.write_text(json.dumps({"version": "0.5.0", "root": str(current), "components": {}}), encoding="utf-8")
    manifest_file = tmp_path / "runtime-latest.json"
    manifest_file.write_text(json.dumps(_manifest_payload(tmp_path / "runtime.zip", "a" * 64)), encoding="utf-8")
    calls = []

    def idempotent_install(manifest, *, root):
        calls.append((manifest.version, root))
        return runtime_install.RuntimeInstallResult(
            runtime_root=current,
            installed=False,
            warnings=({"code": "RUNTIME_CLEANUP_FAILED", "path": str(root / "runtime" / "old"), "message": "locked"},),
        )

    monkeypatch.setattr(runtime_install, "install_runtime", idempotent_install)

    result = runtime_install.ensure_runtime_ready(root=root, sources=[str(manifest_file)])

    assert calls == [("0.5.0", root)]
    assert result["updated"] is False
    assert result["warnings"][0]["code"] == "RUNTIME_CLEANUP_FAILED"


def test_install_runtime_rereads_current_after_acquiring_lock_and_noops_stale_view(tmp_path, monkeypatch):
    from cli_anything.indesign.core import runtime_install

    root = tmp_path / "install"
    old = root / "runtime" / "0.4.2"
    old.mkdir(parents=True)
    target = root / "runtime" / "0.5.0"
    archive = tmp_path / "runtime.zip"
    _write_runtime_zip(archive, marker="already-installed")
    with zipfile.ZipFile(archive) as payload:
        payload.extractall(target)
    state = root / "state" / "current-runtime.json"
    state.parent.mkdir(parents=True)
    state.write_text(json.dumps({"version": "0.4.2", "root": str(old), "components": {}}), encoding="utf-8")
    manifest_file = _write_manifest(tmp_path / "runtime-latest.json", archive)
    real_lock = runtime_install.RuntimeUpdateLock

    class SwitchBeforeLockRead(real_lock):
        def __enter__(self):
            result = super().__enter__()
            state.write_text(json.dumps({"version": "0.5.0", "root": str(target), "components": _manifest_payload(archive, "a" * 64)["components"]}), encoding="utf-8")
            return result

    monkeypatch.setattr(runtime_install, "RuntimeUpdateLock", SwitchBeforeLockRead)

    result = runtime_install.install_runtime(manifest_file, root=root, edge_probe=lambda: {"available": True}, probe_runner=_probe_ok)

    assert result.installed is False
    assert (target / "cli" / "indesign-cli.exe").read_bytes().startswith(b"MZalready-installed")


def test_two_concurrent_updaters_install_once_and_second_is_idempotent(tmp_path):
    from cli_anything.indesign.core.runtime_install import install_runtime

    root = tmp_path / "install"
    archive = tmp_path / "runtime.zip"
    _write_runtime_zip(archive)
    manifest_file = _write_manifest(tmp_path / "runtime-latest.json", archive)

    def update():
        return install_runtime(manifest_file, root=root, edge_probe=lambda: {"available": True}, probe_runner=_probe_ok)

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _item: update(), range(2)))

    assert sorted(result.installed for result in results) == [False, True]
    assert json.loads((root / "state" / "current-runtime.json").read_text(encoding="utf-8"))["version"] == "0.5.0"
    assert [path.name for path in (root / "runtime").iterdir()] == ["0.5.0"]


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

    installed = install_embedded_runtime(embedded, root=root, edge_probe=lambda: {"available": True}, probe_runner=_probe_ok)

    assert installed == root / "runtime" / "0.5.0"
    assert (installed / "cli" / "indesign-cli.exe").read_bytes() == b"MZembedded"
    assert read_current_runtime(root)["version"] == "0.5.0"
    assert embedded.exists()


def test_embedded_runtime_state_switch_failure_removes_new_target(tmp_path, monkeypatch):
    from cli_anything.indesign.core import runtime_install

    embedded = tmp_path / "embedded"
    archive = tmp_path / "embedded.zip"
    _write_runtime_zip(archive)
    with zipfile.ZipFile(archive) as payload:
        payload.extractall(embedded)
    (embedded / "runtime-metadata.json").write_text(
        json.dumps({"version": "0.5.0", "components": _manifest_payload(archive, "a" * 64)["components"]}),
        encoding="utf-8",
    )
    root = tmp_path / "install"
    monkeypatch.setattr(runtime_install, "_write_current_state", lambda *_args: (_ for _ in ()).throw(OSError("state failed")))

    with pytest.raises(OSError, match="state failed"):
        runtime_install.install_embedded_runtime(embedded, root=root, edge_probe=lambda: {"available": True}, probe_runner=_probe_ok)

    assert not (root / "runtime" / "0.5.0").exists()
    assert not (root / "state" / "current-runtime.json").exists()
