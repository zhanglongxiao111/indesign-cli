from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import time
import zipfile
from pathlib import Path

import pytest

import support  # noqa: F401
from support import REPO_ROOT


def _write_shallow_runtime(runtime: Path) -> None:
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
        target = runtime / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"MZ" if target.suffix == ".exe" else b"{}")


def _write_current_state(root: Path, runtime: Path, version: str = "0.5.0") -> None:
    state = root / "state" / "current-runtime.json"
    state.parent.mkdir(parents=True, exist_ok=True)
    state.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "version": version,
                "root": str(runtime),
                "components": {
                    "indesign_cli": version,
                    "html_indesign": "0.2.0",
                    "node": "20.18.1",
                    "winax": "3.6.2",
                    "browser": "msedge",
                },
            }
        ),
        encoding="utf-8",
    )


def _write_manifest(path: Path, version: str = "0.5.0") -> Path:
    path.write_text(
        json.dumps(
            {
                "schema_version": 2,
                "name": "indesign-cli-runtime",
                "version": version,
                "platform": "windows-x64",
                "components": {
                    "indesign_cli": version,
                    "html_indesign": "0.2.0",
                    "node": "20.18.1",
                    "winax": "3.6.2",
                    "browser": "msedge",
                },
                "artifact": {
                    "url": str(path.parent / "runtime.zip"),
                    "github_url": "https://github.example/runtime.zip",
                    "sha256": "a" * 64,
                },
            }
        ),
        encoding="utf-8",
    )
    return path


# ---------------------------------------------------------------------------
# 1. runtime_install.py: update-check.json TTL cache
# ---------------------------------------------------------------------------


def test_ensure_runtime_ready_uses_ttl_cache_and_skips_remote_manifest(tmp_path, monkeypatch):
    from cli_anything.indesign.core import runtime_install

    root = tmp_path / "install"
    runtime = root / "runtime" / "0.5.0"
    _write_shallow_runtime(runtime)
    _write_current_state(root, runtime, "0.5.0")
    manifest_file = _write_manifest(tmp_path / "runtime-latest.json", "0.5.0")

    monkeypatch.delenv("INDESIGN_CLI_UPDATE_CHECK_TTL_SECONDS", raising=False)
    calls = 0
    real_loader = runtime_install.load_first_runtime_manifest

    def counting_loader(sources=None):
        nonlocal calls
        calls += 1
        return real_loader(sources)

    monkeypatch.setattr(runtime_install, "load_first_runtime_manifest", counting_loader)

    first = runtime_install.ensure_runtime_ready(root=root, sources=[str(manifest_file)], command_args=["tool", "domains"])
    assert calls == 1
    assert first["updated"] is False
    assert (root / "state" / "update-check.json").is_file()

    # Second call within 4h TTL must skip load_first_runtime_manifest completely.
    second = runtime_install.ensure_runtime_ready(root=root, sources=[str(manifest_file)], command_args=["tool", "domains"])
    assert calls == 1
    assert second["updated"] is False
    assert second["version"] == "0.5.0"
    assert second["runtime_root"] == str(runtime.resolve())
    assert second["update_check_cached"] is True


def test_ensure_runtime_ready_ttl_zero_and_expiry_and_bypass(tmp_path, monkeypatch):
    from cli_anything.indesign.core import runtime_install

    root = tmp_path / "install"
    runtime = root / "runtime" / "0.5.0"
    _write_shallow_runtime(runtime)
    _write_current_state(root, runtime, "0.5.0")
    manifest_file = _write_manifest(tmp_path / "runtime-latest.json", "0.5.0")

    calls = 0
    real_loader = runtime_install.load_first_runtime_manifest

    def counting_loader(sources=None):
        nonlocal calls
        calls += 1
        return real_loader(sources)

    monkeypatch.setattr(runtime_install, "load_first_runtime_manifest", counting_loader)

    # Seed fresh cache.
    monkeypatch.delenv("INDESIGN_CLI_UPDATE_CHECK_TTL_SECONDS", raising=False)
    runtime_install.ensure_runtime_ready(root=root, sources=[str(manifest_file)], command_args=["tool", "domains"])
    assert calls == 1

    # TTL=0 disables cache.
    monkeypatch.setenv("INDESIGN_CLI_UPDATE_CHECK_TTL_SECONDS", "0")
    runtime_install.ensure_runtime_ready(root=root, sources=[str(manifest_file)], command_args=["tool", "domains"])
    assert calls == 2

    # install / health command_args always bypass TTL cache.
    monkeypatch.setenv("INDESIGN_CLI_UPDATE_CHECK_TTL_SECONDS", "14400")
    runtime_install.ensure_runtime_ready(root=root, sources=[str(manifest_file)], command_args=["install"])
    assert calls == 3
    runtime_install.ensure_runtime_ready(root=root, sources=[str(manifest_file)], command_args=["health"])
    assert calls == 4

    # Expired cache refetches manifest.
    cache_path = root / "state" / "update-check.json"
    cache_payload = json.loads(cache_path.read_text(encoding="utf-8"))
    cache_payload["checked_at"] = time.time() - (5 * 3600)
    cache_path.write_text(json.dumps(cache_payload), encoding="utf-8")

    runtime_install.ensure_runtime_ready(root=root, sources=[str(manifest_file)], command_args=["tool", "domains"])
    assert calls == 5


def test_ensure_runtime_ready_cache_hit_still_runs_shallow_validation(tmp_path, monkeypatch):
    from cli_anything.indesign.core import runtime_install
    from cli_anything.indesign.core.errors import CliError

    root = tmp_path / "install"
    runtime = root / "runtime" / "0.5.0"
    _write_shallow_runtime(runtime)
    _write_current_state(root, runtime, "0.5.0")
    manifest_file = _write_manifest(tmp_path / "runtime-latest.json", "0.5.0")
    monkeypatch.delenv("INDESIGN_CLI_UPDATE_CHECK_TTL_SECONDS", raising=False)

    runtime_install.ensure_runtime_ready(root=root, sources=[str(manifest_file)])

    # Corrupt runtime after cache write; cache hit must still catch missing critical entry.
    (runtime / "cli" / "indesign-cli.exe").unlink()
    monkeypatch.setattr(
        runtime_install,
        "load_first_runtime_manifest",
        lambda *_a, **_kw: (_ for _ in ()).throw(AssertionError("manifest should not be fetched on cache hit")),
    )
    with pytest.raises(CliError) as exc:
        runtime_install.ensure_runtime_ready(root=root, sources=[str(manifest_file)])
    assert exc.value.code == "RUNTIME_VALIDATION_FAILED"


# ---------------------------------------------------------------------------
# 2. telemetry.py: single _read_state, 5MB local spool, non-blocking flush
# ---------------------------------------------------------------------------


def test_telemetry_record_event_reads_state_only_once(tmp_path, monkeypatch):
    from cli_anything.indesign.core import telemetry

    root = tmp_path / "telemetry"
    cwd = tmp_path / "workspace"
    cwd.mkdir()
    monkeypatch.setenv("INDESIGN_CLI_TELEMETRY_DIR", str(root))
    monkeypatch.delenv("INDESIGN_CLI_TELEMETRY", raising=False)
    monkeypatch.delenv("INDESIGN_CLI_TELEMETRY_SYNC", raising=False)
    monkeypatch.delenv("INDESIGN_CLI_SESSION_ID", raising=False)
    monkeypatch.delenv("INDESIGN_CLI_AGENT_THREAD_ID", raising=False)
    monkeypatch.delenv("INDESIGN_CLI_AGENT_RUN_ID", raising=False)

    read_calls: list[Path] = []
    real_read = telemetry._read_state

    def spy_read(path: Path):
        read_calls.append(path)
        return real_read(path)

    monkeypatch.setattr(telemetry, "_read_state", spy_read)

    first = telemetry.record_event({"event": "tool_call", "tool_id": "session.show", "ok": True}, cwd=cwd)
    assert first is not None
    assert len(read_calls) == 1

    second = telemetry.record_event({"event": "tool_call", "tool_id": "export.verify", "ok": True}, cwd=cwd)
    assert second is not None
    assert second["session_id"] == first["session_id"]
    assert len(read_calls) == 2

    state_file = root / "state" / f"{first['origin_key']}.json"
    state = json.loads(state_file.read_text(encoding="utf-8"))
    assert state["created_at"] == first["ts"]
    assert state["last_seen_at"] == second["ts"]


def test_telemetry_spool_nonblocking_on_hanging_nas_and_flushes_on_recovery(tmp_path, monkeypatch):
    from cli_anything.indesign.core import telemetry

    local_app_data = tmp_path / "local"
    remote_root = tmp_path / "fake-nas-telemetry"
    cwd = tmp_path / "workspace"
    cwd.mkdir()

    monkeypatch.setenv("LOCALAPPDATA", str(local_app_data))
    monkeypatch.delenv("INDESIGN_CLI_INSTALL_ROOT", raising=False)
    monkeypatch.setenv("INDESIGN_CLI_TELEMETRY_DIR", str(remote_root))
    monkeypatch.setenv("INDESIGN_CLI_TELEMETRY_SYNC", "0")
    monkeypatch.setenv("INDESIGN_CLI_TELEMETRY_FLUSH_TIMEOUT_SECONDS", "0.03")
    monkeypatch.delenv("INDESIGN_CLI_TELEMETRY", raising=False)
    telemetry._REMOTE_BACKOFF_UNTIL.clear()

    # 1) Simulate a hung NAS write (blocked on an Event) — main call must return well under 200ms.
    started_flush = threading.Event()
    release_flush = threading.Event()

    def hanging_remote_write(_root, _batch):
        started_flush.set()
        release_flush.wait(timeout=5.0)
        raise OSError("simulated NAS timeout")

    monkeypatch.setattr(telemetry, "_write_remote_batch", hanging_remote_write)

    t0 = time.monotonic()
    ev1 = telemetry.record_event({"event": "tool_call", "tool_id": "document.info", "ok": True}, cwd=cwd)
    elapsed_first = time.monotonic() - t0
    assert ev1 is not None
    assert elapsed_first < 0.25
    assert started_flush.wait(timeout=1.0)

    # A second event while flush is still hung must return almost immediately (<50ms) and still spool.
    t1 = time.monotonic()
    ev2 = telemetry.record_event({"event": "tool_call", "tool_id": "export.verify", "ok": True}, cwd=cwd)
    elapsed_second = time.monotonic() - t1
    assert ev2 is not None
    assert elapsed_second < 0.1

    spool = telemetry._spool_path()
    assert spool == local_app_data / "indesign-cli" / "state" / "telemetry-spool.jsonl"
    assert len(spool.read_text(encoding="utf-8").splitlines()) == 2

    # Release hanging worker and wait briefly for lock release.
    release_flush.set()
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline:
        if telemetry._FLUSH_LOCK.acquire(blocking=False):
            telemetry._FLUSH_LOCK.release()
            break
        time.sleep(0.01)

    # Both events must still be preserved in the spool after the failed write.
    assert len(spool.read_text(encoding="utf-8").splitlines()) == 2

    # 2) Restore real remote writer and drain spool -> both events land on remote root & spool clears.
    monkeypatch.undo()
    monkeypatch.setenv("LOCALAPPDATA", str(local_app_data))
    monkeypatch.delenv("INDESIGN_CLI_INSTALL_ROOT", raising=False)
    flushed = telemetry.flush_spool(ignore_backoff=True)
    assert flushed == 2
    assert not spool.exists()

    session_files = list((remote_root / "sessions").glob("*/*.jsonl"))
    assert len(session_files) == 1
    lines = [json.loads(line) for line in session_files[0].read_text(encoding="utf-8").splitlines() if line.strip()]
    assert [item["tool_id"] for item in lines] == ["document.info", "export.verify"]


def test_telemetry_spool_enforces_5mb_hard_cap(tmp_path, monkeypatch):
    from cli_anything.indesign.core import telemetry

    assert telemetry._SPOOL_MAX_BYTES == 5 * 1024 * 1024

    spool = tmp_path / "telemetry-spool.jsonl"
    monkeypatch.setattr(telemetry, "_SPOOL_MAX_BYTES", 1024)

    for index in range(30):
        telemetry._append_spool_record(
            spool,
            {
                "root": str(tmp_path / "nas"),
                "date": "2026-11-19",
                "payload": {"tool_id": f"tool.{index}", "note": "x" * 60},
                "state": {"session_id": "s1", "created_at": "2026-11-19T00:00:00+00:00", "last_seen_at": "2026-11-19T00:00:00+00:00", "cwd_hash": "abc"},
            },
        )

    assert spool.exists()
    assert spool.stat().st_size <= 1024
    kept = [json.loads(line)["payload"]["tool_id"] for line in spool.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert kept
    assert kept[-1] == "tool.29"
    assert "tool.0" not in kept


def test_telemetry_mode_selection_for_unc_local_and_sync_override(tmp_path, monkeypatch):
    from cli_anything.indesign.core import telemetry

    unc_root = Path(r"\\daga-nas5\sa-ai-app\tools\indesign-cli\telemetry")
    local_root = tmp_path / "telemetry"

    monkeypatch.delenv("INDESIGN_CLI_TELEMETRY_SYNC", raising=False)
    assert telemetry._use_spool_mode(unc_root) is True
    assert telemetry._use_spool_mode(local_root) is False

    monkeypatch.setenv("INDESIGN_CLI_TELEMETRY_SYNC", "1")
    assert telemetry._use_spool_mode(unc_root) is False

    monkeypatch.setenv("INDESIGN_CLI_TELEMETRY_SYNC", "0")
    assert telemetry._use_spool_mode(local_root) is True


# ---------------------------------------------------------------------------
# 3. session.py: UNC existing session.json skips 170ms replace backoff
# ---------------------------------------------------------------------------


def test_session_unc_existing_file_skips_replace_retries_and_sleep(tmp_path, monkeypatch):
    from cli_anything.indesign.core import session as session_module
    from cli_anything.indesign.core.session import SessionStore

    assert session_module._is_unc_path(Path(r"\\daga-nas5\share\project\.indesign-cli\session.json")) is True
    assert session_module._is_unc_path(tmp_path / ".indesign-cli" / "session.json") is False

    store = SessionStore(tmp_path)
    store.write({"version": 1, "recent_calls": [{"tool_id": "seed", "ok": True}]})
    assert store.path.exists()

    # Simulate UNC path on existing file without requiring a real SMB server.
    monkeypatch.setattr(session_module, "_is_unc_path", lambda p: p == store.path)

    sleep_calls: list[float] = []
    replace_calls: list[tuple[Path, Path]] = []
    overwrite_calls: list[Path] = []
    real_overwrite = session_module._overwrite_in_place

    monkeypatch.setattr(session_module.time, "sleep", lambda seconds: sleep_calls.append(seconds))

    def forbid_replace(self, target):
        replace_calls.append((self, target))
        raise AssertionError("tmp.replace() must be skipped for existing UNC session.json")

    def spy_overwrite(target: Path, serialized: str):
        overwrite_calls.append(target)
        return real_overwrite(target, serialized)

    monkeypatch.setattr(Path, "replace", forbid_replace)
    monkeypatch.setattr(session_module, "_overwrite_in_place", spy_overwrite)

    store.write({"version": 1, "recent_calls": [{"tool_id": "direct.write", "ok": True}]})
    store.record_call(tool_id="document.get_document_info", domain="document", source="classic", ok=True, duration_ms=4)

    assert sleep_calls == []
    assert replace_calls == []
    assert overwrite_calls == [store.path, store.path]
    assert list(store.root.glob("*.tmp")) == []

    stored = store.read(compact=False)
    assert [item["tool_id"] for item in stored["recent_calls"]] == ["document.get_document_info", "direct.write"]


def test_session_unc_initial_write_still_uses_atomic_replace(tmp_path, monkeypatch):
    from cli_anything.indesign.core import session as session_module
    from cli_anything.indesign.core.session import SessionStore

    store = SessionStore(tmp_path)
    assert not store.path.exists()
    monkeypatch.setattr(session_module, "_is_unc_path", lambda p: p == store.path)

    replace_count = 0
    real_replace = Path.replace

    def spy_replace(self, target):
        nonlocal replace_count
        replace_count += 1
        return real_replace(self, target)

    monkeypatch.setattr(Path, "replace", spy_replace)
    store.write({"version": 1, "recent_calls": [{"tool_id": "first", "ok": True}]})

    assert replace_count == 1
    assert store.read(compact=False)["recent_calls"][0]["tool_id"] == "first"


# ---------------------------------------------------------------------------
# 4. paths.py: cached allow_roots resolution
# ---------------------------------------------------------------------------


def test_paths_caches_allow_roots_and_skips_resolve_when_no_path_in_text(tmp_path, monkeypatch):
    from cli_anything.indesign.core import paths as paths_module

    paths_module.clear_allow_roots_cache()
    dir_a = tmp_path / "dir_a"
    dir_b = tmp_path / "dir_b"
    dir_a.mkdir()
    dir_b.mkdir()
    monkeypatch.chdir(dir_a)

    resolve_calls: list[str] = []
    real_resolve = Path.resolve

    def spy_resolve(self, *args, **kwargs):
        resolve_calls.append(str(self))
        return real_resolve(self, *args, **kwargs)

    monkeypatch.setattr(Path, "resolve", spy_resolve)

    # Plain log lines without any path must trigger 0 root resolves.
    for _ in range(10):
        assert paths_module.scrub_text_paths("server listening on stdio") == "server listening on stdio"
    assert resolve_calls == []

    # Repeated calls with matching paths in the same cwd must resolve cwd only once.
    target_a = dir_a / "sub" / "deck.indd"
    for _ in range(5):
        scrubbed = paths_module.scrub_text_paths(f"opened '{target_a}'")
        assert scrubbed == "opened 'sub/deck.indd'"
    cwd_resolves_a = [item for item in resolve_calls if item == str(dir_a)]
    assert len(cwd_resolves_a) == 1

    # Changing cwd updates the cache key so new cwd is resolved cleanly.
    monkeypatch.chdir(dir_b)
    target_b = dir_b / "out.pdf"
    assert paths_module.scrub_text_paths(f"saved '{target_b}'") == "saved 'out.pdf'"
    cwd_resolves_b = [item for item in resolve_calls if item == str(dir_b)]
    assert len(cwd_resolves_b) == 1


# ---------------------------------------------------------------------------
# 5. skills/indesign-cli/scripts/prepare-author-package.ps1
# ---------------------------------------------------------------------------


def test_prepare_author_package_ps1_is_pure_ascii_and_reads_current_runtime_json():
    script_path = REPO_ROOT / "skills" / "indesign-cli" / "scripts" / "prepare-author-package.ps1"
    raw = script_path.read_bytes()
    assert all(byte <= 127 for byte in raw), "prepare-author-package.ps1 must stay pure ASCII"

    text = raw.decode("ascii")
    assert "current-runtime.json" in text
    assert text.index("SA_AGENT_INDESIGN") < text.index("current-runtime.json") < text.index("indesign-cli-agent health")


@pytest.mark.skipif(shutil.which("pwsh") is None or shutil.which("node") is None, reason="requires pwsh and node")
def test_prepare_author_package_ps1_prefers_current_runtime_json_without_agent_exe(tmp_path):
    script_path = REPO_ROOT / "skills" / "indesign-cli" / "scripts" / "prepare-author-package.ps1"
    local_app_data = tmp_path / "local"
    runtime_root = local_app_data / "indesign-cli" / "runtime" / "0.5.0"
    plugin_authoring = runtime_root / "plugins" / "html-indesign" / "src" / "authoring"
    plugin_authoring.mkdir(parents=True)
    (plugin_authoring / "index.js").write_text(
        "module.exports = { writeAuthorPackageEntry(pkg) { return { entryPath: pkg + '.html' }; } };\n",
        encoding="utf-8",
    )
    node_target = runtime_root / "node" / "node.exe"
    node_target.parent.mkdir(parents=True)
    real_node = Path(shutil.which("node"))
    try:
        os.symlink(real_node, node_target)
    except OSError:
        shutil.copy2(real_node, node_target)

    state_file = local_app_data / "indesign-cli" / "state" / "current-runtime.json"
    state_file.parent.mkdir(parents=True)
    state_file.write_text(json.dumps({"schema_version": 1, "version": "0.5.0", "root": str(runtime_root)}), encoding="utf-8")

    deck_config = tmp_path / "deck.config.json"
    deck_config.write_text('{"id":"demo"}', encoding="utf-8")

    # No INDESIGN_CLI_RUNTIME_ROOT, no SA_AGENT_INDESIGN, and no indesign-cli-agent.exe anywhere.
    env = {
        "SystemRoot": os.environ.get("SystemRoot", r"C:\Windows"),
        "PATH": os.environ.get("SystemRoot", r"C:\Windows") + r"\System32",
        "PATHEXT": os.environ.get("PATHEXT", ".COM;.EXE;.BAT;.CMD"),
        "LOCALAPPDATA": str(local_app_data),
    }

    result = subprocess.run(
        [
            shutil.which("pwsh"),
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(script_path),
            "-Package",
            str(deck_config),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    payload = json.loads(result.stdout.strip())
    assert payload["ok"] is True
    assert payload["entryPath"].endswith("deck.config.json.html")

    # When current-runtime.json is removed and no agent exe exists, it falls back to agent lookup.
    state_file.unlink()
    fallback = subprocess.run(
        [
            shutil.which("pwsh"),
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(script_path),
            "-Package",
            str(deck_config),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
        timeout=30,
        check=False,
    )
    assert fallback.returncode != 0
    assert "indesign-cli-agent is not installed" in (fallback.stdout + fallback.stderr)
