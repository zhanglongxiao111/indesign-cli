# indesign-cli Agent User-Level Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the single-EXE, user-level `indesign-cli-agent` update flow: user command registration, NAS-first/GitHub-fallback update checks, safe in-place EXE replacement, and removal of the old public `run --source` product entry.

**Architecture:** Keep the product as one `indesign-cli-agent.exe`. Move release/update responsibility into a focused Python update layer used by the agent bootstrapper before dispatching normal CLI commands. The new public path is `indesign-cli-agent <indesign-cli args...>`; old `run --source` must disappear from public docs/help and must not drive runtime/current updates.

**Tech Stack:** Python 3.10+, PyInstaller onefile, Windows user PATH or equivalent user-level command registration, pathlib/shutil/subprocess/hashlib/json, pytest.

---

## Source Spec

Implement against `docs/superpowers/specs/2026-07-08-indesign-cli-agent-user-update-design.md`.

Hard decisions from the user:

- Product remains a single EXE.
- Old `run --source` product entry is directly deprecated; do not keep it as a public compatibility path.
- First release must register a current-user command so new Agent threads can call `indesign-cli-agent` without rediscovering the EXE path.
- Update failure may fall back to the existing local EXE when it exists.
- No `.bak`, no historical versions, no per-project EXE copies.

## File Structure

**Create**

- `agent-harness/cli_anything/indesign/core/agent_update.py`  
  Owns manifest loading, source selection, version comparison, download/copy, hash verification, user-level install path, lock acquisition, and safe EXE replacement.

- `agent-harness/cli_anything/indesign/tests/test_agent_update.py`  
  Unit tests for first install, manifest fallback, version comparison, failed update fallback, cleanup, and lock behavior.

**Modify**

- `agent-harness/cli_anything/indesign/agent_bootstrapper.py`  
  Public entry changes from `run --source ... -- <args>` to direct `indesign-cli-agent <args>`. It calls the update layer before dispatching to `indesign_cli`. Remove public `run/update --source` parser entries. Keep `version` and `health`; add `install` only if needed for first-run registration.

- `agent-harness/cli_anything/indesign/core/bootstrapper.py`  
  Retire or narrow old runtime/current update helpers so they cannot remain the product path. Shared helpers that still make sense, such as `default_install_root` and hashing, can move to `agent_update.py`.

- `agent-harness/cli_anything/indesign/tests/test_bootstrapper.py`  
  Replace old `run --source` expectations with direct invocation expectations. Keep tests that prove frozen self-dispatch still works.

- `scripts/build_agent_bootstrapper.py`  
  Ensure the built onefile EXE still embeds runtime, but no release contract depends on old `runtime_dir` or top-level `url/sha256` manifest fields.

- `README.md`, `README.en.md`, `agent-harness/cli_anything/indesign/README.md`, `skills/indesign-cli/SKILL.md`  
  Replace old examples with user-level command registration and direct `indesign-cli-agent` usage.

---

### Task 1: Add User-Level Update Primitives

**Files:**
- Create: `agent-harness/cli_anything/indesign/core/agent_update.py`
- Test: `agent-harness/cli_anything/indesign/tests/test_agent_update.py`

- [ ] **Step 1: Write tests for paths, SemVer parsing, and manifest parsing**

Create `agent-harness/cli_anything/indesign/tests/test_agent_update.py` with these tests first:

```python
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
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_agent_update.py -q
```

Expected: import failure because `cli_anything.indesign.core.agent_update` does not exist.

- [ ] **Step 3: Implement the minimal update primitives**

Create `agent-harness/cli_anything/indesign/core/agent_update.py`:

```python
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .errors import CliError


DEFAULT_SOURCES = (
    r"\\daga-nas5\sa-ai-app\tools\indesign-cli\latest.json",
    "https://github.com/zhanglongxiao111/indesign-cli/releases/latest/download/latest.json",
)


@dataclass(frozen=True)
class Manifest:
    version: str
    artifact_url: str
    github_url: str | None
    sha256: str
    source: str


def install_root() -> Path:
    base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    return Path(base) / "indesign-cli"


def bin_dir(root: Path | None = None) -> Path:
    return (root or install_root()) / "bin"


def agent_exe_path(root: Path | None = None) -> Path:
    return bin_dir(root) / "indesign-cli-agent.exe"


def tmp_dir(root: Path | None = None) -> Path:
    return (root or install_root()) / "tmp"


def state_dir(root: Path | None = None) -> Path:
    return (root or install_root()) / "state"


def parse_version(value: str | None) -> tuple[int, int, int] | None:
    if not value:
        return None
    parts = str(value).split(".")
    if len(parts) != 3:
        return None
    parsed: list[int] = []
    for part in parts:
        if not part.isdigit():
            return None
        parsed.append(int(part))
    return (parsed[0], parsed[1], parsed[2])


def compare_versions(local: str | None, remote: str) -> int:
    remote_key = parse_version(remote)
    if remote_key is None:
        raise CliError(
            "Remote indesign-cli-agent version is not valid SemVer",
            code="UPDATE_MANIFEST_INVALID",
            details={"version": remote},
        )
    local_key = parse_version(local)
    if local_key is None:
        return -1
    if local_key < remote_key:
        return -1
    if local_key > remote_key:
        return 1
    return 0


def parse_manifest(payload: dict[str, Any], *, source: str) -> Manifest:
    artifact = payload.get("artifact")
    if not isinstance(artifact, dict):
        raise CliError("Release manifest is missing artifact", code="UPDATE_MANIFEST_INVALID", details={"source": source})
    version = str(payload.get("version") or "")
    if parse_version(version) is None:
        raise CliError("Release manifest version is invalid", code="UPDATE_MANIFEST_INVALID", details={"source": source, "version": version})
    artifact_url = str(artifact.get("url") or "")
    sha256 = str(artifact.get("sha256") or "")
    if not artifact_url or len(sha256) != 64:
        raise CliError("Release manifest artifact is invalid", code="UPDATE_MANIFEST_INVALID", details={"source": source})
    github_url = artifact.get("github_url")
    return Manifest(
        version=version,
        artifact_url=artifact_url,
        github_url=str(github_url) if github_url else None,
        sha256=sha256,
        source=source,
    )
```

- [ ] **Step 4: Run tests and verify they pass**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_agent_update.py -q
```

Expected: all tests in `test_agent_update.py` pass.

- [ ] **Step 5: Commit**

```powershell
git add agent-harness\cli_anything\indesign\core\agent_update.py agent-harness\cli_anything\indesign\tests\test_agent_update.py
git commit -m "feat: add agent update primitives"
```

---

### Task 2: Implement Source Loading, Hashing, Locking, and Cleanup

**Files:**
- Modify: `agent-harness/cli_anything/indesign/core/agent_update.py`
- Test: `agent-harness/cli_anything/indesign/tests/test_agent_update.py`

- [ ] **Step 1: Add tests for local manifests, artifact copy, checksum, and lock cleanup**

Append to `test_agent_update.py`:

```python
import hashlib

import pytest

from cli_anything.indesign.core.agent_update import (
    UserUpdateLock,
    copy_artifact,
    read_manifest_file,
    sha256_file,
)
from cli_anything.indesign.core.errors import CliError


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
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_agent_update.py -q
```

Expected: import failures for the new functions/classes.

- [ ] **Step 3: Implement source loading, local artifact copy, checksum, and lock**

Append/update `agent_update.py`:

```python
import hashlib
import json
import shutil
import time


def read_manifest_file(path: Path) -> Manifest:
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except OSError as exc:
        raise CliError(
            "Cannot read release manifest",
            code="UPDATE_CHECK_FAILED",
            details={"source": str(path)},
        ) from exc
    except json.JSONDecodeError as exc:
        raise CliError(
            "Release manifest is not valid JSON",
            code="UPDATE_MANIFEST_INVALID",
            details={"source": str(path), "position": f"line {exc.lineno} column {exc.colno}"},
        ) from exc
    if not isinstance(payload, dict):
        raise CliError("Release manifest must be a JSON object", code="UPDATE_MANIFEST_INVALID", details={"source": str(path)})
    return parse_manifest(payload, source=str(path))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copy_artifact(source_url: str, target: Path, *, expected_sha256: str) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        target.unlink()
    source = Path(source_url)
    try:
        shutil.copy2(source, target)
        actual = sha256_file(target)
    except OSError as exc:
        if target.exists():
            target.unlink()
        raise CliError(
            "Cannot copy indesign-cli-agent artifact",
            code="UPDATE_ARTIFACT_NOT_FOUND",
            details={"source": source_url, "target": str(target)},
        ) from exc
    if actual.lower() != expected_sha256.lower():
        target.unlink(missing_ok=True)
        raise CliError(
            "indesign-cli-agent artifact sha256 mismatch",
            code="UPDATE_SHA256_MISMATCH",
            details={"source": source_url, "expected": expected_sha256, "actual": actual},
        )
    return target


class UserUpdateLock:
    def __init__(self, path: Path, *, timeout_seconds: float = 30.0) -> None:
        self.path = path
        self.timeout_seconds = timeout_seconds
        self._fd: int | None = None

    def __enter__(self) -> "UserUpdateLock":
        self.path.parent.mkdir(parents=True, exist_ok=True)
        start = time.monotonic()
        while True:
            try:
                self._fd = os.open(str(self.path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(self._fd, json.dumps({"pid": os.getpid(), "start_time": time.time()}).encode("utf-8"))
                return self
            except FileExistsError as exc:
                if time.monotonic() - start >= self.timeout_seconds:
                    raise CliError(
                        "Timed out waiting for indesign-cli-agent update lock",
                        code="UPDATE_LOCK_TIMEOUT",
                        details={"lock": str(self.path)},
                    ) from exc
                time.sleep(0.1)

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._fd is not None:
            os.close(self._fd)
            self._fd = None
        try:
            self.path.unlink()
        except FileNotFoundError:
            pass
```

- [ ] **Step 4: Run tests and verify they pass**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_agent_update.py -q
```

Expected: all tests in `test_agent_update.py` pass.

- [ ] **Step 5: Commit**

```powershell
git add agent-harness\cli_anything\indesign\core\agent_update.py agent-harness\cli_anything\indesign\tests\test_agent_update.py
git commit -m "feat: add agent update IO and locking"
```

---

### Task 3: Implement User-Level Install and Safe Replace

**Files:**
- Modify: `agent-harness/cli_anything/indesign/core/agent_update.py`
- Test: `agent-harness/cli_anything/indesign/tests/test_agent_update.py`

- [ ] **Step 1: Add tests for first install, replacement, and no `.bak`**

Append to `test_agent_update.py`:

```python
from cli_anything.indesign.core.agent_update import (
    install_or_replace_exe,
    update_state_path,
)


def _manifest_for(source: Path, sha: str) -> Manifest:
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
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_agent_update.py -q
```

Expected: import failure for `install_or_replace_exe` and `update_state_path`.

- [ ] **Step 3: Implement install/replace and state writing**

Append/update `agent_update.py`:

```python
def update_state_path(root: Path | None = None) -> Path:
    return state_dir(root) / "update-state.json"


def write_update_state(root: Path, payload: dict[str, Any]) -> None:
    path = update_state_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def install_or_replace_exe(manifest: Manifest, *, root: Path | None = None) -> Path:
    actual_root = root or install_root()
    target = agent_exe_path(actual_root)
    temp_download = tmp_dir(actual_root) / f"{os.getpid()}.download"
    staged = target.with_name(f".{target.name}.{os.getpid()}.new")
    lock = state_dir(actual_root) / "update.lock"
    with UserUpdateLock(lock):
        copy_artifact(manifest.artifact_url, temp_download, expected_sha256=manifest.sha256)
        target.parent.mkdir(parents=True, exist_ok=True)
        if staged.exists():
            staged.unlink()
        shutil.move(str(temp_download), str(staged))
        try:
            os.replace(staged, target)
        finally:
            temp_download.unlink(missing_ok=True)
            staged.unlink(missing_ok=True)
        write_update_state(
            actual_root,
            {"status": "updated", "version": manifest.version, "source": manifest.source, "target": str(target)},
        )
    return target
```

- [ ] **Step 4: Run tests and verify they pass**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_agent_update.py -q
```

Expected: all tests in `test_agent_update.py` pass.

- [ ] **Step 5: Commit**

```powershell
git add agent-harness\cli_anything\indesign\core\agent_update.py agent-harness\cli_anything\indesign\tests\test_agent_update.py
git commit -m "feat: install agent exe at user level"
```

---

### Task 4: Change Public Agent Command Shape

**Files:**
- Modify: `agent-harness/cli_anything/indesign/agent_bootstrapper.py`
- Modify: `agent-harness/cli_anything/indesign/tests/test_bootstrapper.py`

- [ ] **Step 1: Write tests that reject public `run --source` and dispatch direct commands**

In `test_bootstrapper.py`, add or replace command-shape tests:

```python
def test_agent_bootstrapper_rejects_legacy_run_source(run_agent):
    result = run_agent(["run", "--source", "latest.json", "--", "tool", "domains"])
    assert result.returncode == 1
    payload = result.stdout_json
    assert payload["ok"] is False
    assert payload["error"]["code"] == "LEGACY_COMMAND_REMOVED"


def test_agent_bootstrapper_direct_command_dispatches(monkeypatch, tmp_path):
    from cli_anything.indesign import agent_bootstrapper

    calls = []

    def fake_ensure_agent_ready(*, command_args):
        calls.append(tuple(command_args))
        return {"updated": False, "warnings": []}

    def fake_child(cli_args):
        return {"exit_code": 0, "stdout_json": {"ok": True}, "stdout_tail": "", "stderr_tail": ""}

    monkeypatch.setattr(agent_bootstrapper, "ensure_agent_ready", fake_ensure_agent_ready)
    monkeypatch.setattr(agent_bootstrapper, "run_child", lambda cli_args, runtime_root=None: fake_child(cli_args))
    exit_code = agent_bootstrapper.main(["tool", "domains"])
    assert exit_code == 0
    assert calls == [("tool", "domains")]
```

If `run_agent` is not already available as a fixture, adapt the existing helper in `tests/support.py` exactly as existing tests do.

- [ ] **Step 2: Run bootstrapper tests and verify they fail**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_bootstrapper.py -q
```

Expected: old parser still accepts `run --source`, and direct dispatch path does not call the new readiness function.

- [ ] **Step 3: Update `agent_bootstrapper.py` parser and dispatch**

Modify `build_parser()`:

```python
def build_parser() -> argparse.ArgumentParser:
    parser = AgentArgumentParser(prog="indesign-cli-agent", description="Agent bootstrapper for indesign-cli runtime.")
    parser.add_argument("--pretty", action="store_true", help="输出缩进 JSON")
    sub = parser.add_subparsers(dest="command")

    install = sub.add_parser("install", help="安装或修复用户级 indesign-cli-agent 命令入口")
    install.add_argument("--source", action="append", help="可选 latest.json 源；未指定时使用默认 NAS/GitHub")

    health = sub.add_parser("health", help="读取 bootstrapper 和当前 runtime 状态")
    health.add_argument("--json", action="store_true", help="兼容参数；输出恒为 JSON")

    version = sub.add_parser("version", help="输出 bootstrapper 版本")
    version.add_argument("--json", action="store_true", help="兼容参数；输出恒为 JSON")

    parser.add_argument("cli_args", nargs=argparse.REMAINDER, help="indesign-cli 参数")
    return parser
```

Add a legacy guard near `run()` argument handling:

```python
if actual_argv[:1] in (["run"], ["update"]):
    raise CliError(
        "The run/update --source agent entry has been removed. Use indesign-cli-agent <command>.",
        code="LEGACY_COMMAND_REMOVED",
        details={"command": actual_argv[0]},
        next_action="Run indesign-cli-agent install, then call indesign-cli-agent tool domains.",
    )
```

Add/update direct dispatch flow:

```python
from .core.agent_update import ensure_agent_ready


def run(argv: list[str] | None = None) -> int:
    start = now_ms()
    actual_argv = list(sys.argv[1:] if argv is None else argv)
    if actual_argv and actual_argv[0] in {"run", "update"}:
        raise CliError(
            "The run/update --source agent entry has been removed. Use indesign-cli-agent <command>.",
            code="LEGACY_COMMAND_REMOVED",
            details={"command": actual_argv[0]},
        )
    parser = build_parser()
    args = parser.parse_args(actual_argv)
    pretty = bool(getattr(args, "pretty", False))
    if args.command == "version":
        return emit(ok("version", {"bootstrapper_version": __version__}, elapsed(start)), pretty=pretty)
    if args.command == "install":
        data = ensure_agent_ready(command_args=["install"], sources=getattr(args, "source", None))
        return emit(ok("install", data, elapsed(start)), pretty=pretty)
    cli_args = normalized_cli_args(actual_argv)
    if not cli_args:
        raise CliError("Command is required", code="COMMAND_REQUIRED")
    update_data = ensure_agent_ready(command_args=cli_args)
    child = run_child(cli_args)
    payload = ok("run", {"update": update_data, "child": child}, elapsed(start))
    if child["exit_code"] != 0:
        payload["ok"] = False
        payload["exit_code"] = child["exit_code"]
    return emit(payload, pretty=pretty)
```

This step may require adapting exact parser flow to preserve existing `__cli__` self-dispatch.

- [ ] **Step 4: Run bootstrapper tests**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_bootstrapper.py -q
```

Expected: bootstrapper tests pass after updating any old expectations.

- [ ] **Step 5: Commit**

```powershell
git add agent-harness\cli_anything\indesign\agent_bootstrapper.py agent-harness\cli_anything\indesign\tests\test_bootstrapper.py
git commit -m "feat: use direct agent command entry"
```

---

### Task 5: Wire Readiness Checks Without Runtime Garbage

**Files:**
- Modify: `agent-harness/cli_anything/indesign/core/agent_update.py`
- Modify: `agent-harness/cli_anything/indesign/agent_bootstrapper.py`
- Test: `agent-harness/cli_anything/indesign/tests/test_agent_update.py`
- Test: `agent-harness/cli_anything/indesign/tests/test_bootstrapper.py`

- [ ] **Step 1: Add tests for update failure fallback and no runtime/current writes**

Append to `test_agent_update.py`:

```python
from cli_anything.indesign.core.agent_update import ensure_agent_ready


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
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_agent_update.py -q
```

Expected: `ensure_agent_ready` missing or incomplete.

- [ ] **Step 3: Implement `ensure_agent_ready`**

Add to `agent_update.py`:

```python
def load_first_manifest(sources: list[str] | tuple[str, ...] | None = None) -> tuple[Manifest | None, list[dict[str, Any]]]:
    warnings: list[dict[str, Any]] = []
    for source in sources or DEFAULT_SOURCES:
        try:
            if str(source).startswith("http://") or str(source).startswith("https://"):
                raise CliError(
                    "HTTP manifest loading is not implemented yet",
                    code="UPDATE_HTTP_NOT_IMPLEMENTED",
                    details={"source": source},
                )
            return read_manifest_file(Path(source)), warnings
        except CliError as exc:
            warnings.append({"code": exc.code, "source": source, "message": exc.message})
    return None, warnings


def ensure_agent_ready(*, command_args: list[str], sources: list[str] | None = None) -> dict[str, Any]:
    root = install_root()
    exe = agent_exe_path(root)
    manifest, warnings = load_first_manifest(sources)
    if manifest is None:
        if exe.exists():
            return {"updated": False, "version": None, "warnings": warnings}
        raise CliError(
            "Cannot install indesign-cli-agent because no update source is available",
            code="INITIAL_INSTALL_FAILED",
            details={"sources": list(sources or DEFAULT_SOURCES), "warnings": warnings},
        )
    if not exe.exists():
        install_or_replace_exe(manifest, root=root)
        return {"updated": True, "version": manifest.version, "source": manifest.source, "warnings": warnings}
    return {"updated": False, "version": manifest.version, "source": manifest.source, "warnings": warnings}
```

This first implementation deliberately handles only local/NAS paths. HTTP GitHub download support is added in Task 6.

- [ ] **Step 4: Run tests and verify no runtime/current writes**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_agent_update.py -q
```

Expected: all update tests pass.

- [ ] **Step 5: Commit**

```powershell
git add agent-harness\cli_anything\indesign\core\agent_update.py agent-harness\cli_anything\indesign\agent_bootstrapper.py agent-harness\cli_anything\indesign\tests\test_agent_update.py agent-harness\cli_anything\indesign\tests\test_bootstrapper.py
git commit -m "feat: check agent updates before commands"
```

---

### Task 6: Add GitHub HTTP Manifest and Artifact Fallback

**Files:**
- Modify: `agent-harness/cli_anything/indesign/core/agent_update.py`
- Test: `agent-harness/cli_anything/indesign/tests/test_agent_update.py`

- [ ] **Step 1: Add HTTP tests using monkeypatched opener**

Append to `test_agent_update.py`:

```python
from io import BytesIO

from cli_anything.indesign.core.agent_update import read_http_json, copy_http_artifact


def test_read_http_json_uses_utf8_json(monkeypatch):
    class Response:
        def __enter__(self):
            return BytesIO(json.dumps({"ok": True}).encode("utf-8"))

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr("cli_anything.indesign.core.agent_update.urlopen", lambda url, timeout=30: Response())
    assert read_http_json("https://example.test/latest.json") == {"ok": True}


def test_copy_http_artifact_verifies_sha(monkeypatch, tmp_path):
    data = b"http agent"

    class Response:
        def __enter__(self):
            return BytesIO(data)

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr("cli_anything.indesign.core.agent_update.urlopen", lambda url, timeout=60: Response())
    target = tmp_path / "agent.exe"
    copy_http_artifact("https://example.test/agent.exe", target, expected_sha256=hashlib.sha256(data).hexdigest())
    assert target.read_bytes() == data
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_agent_update.py -q
```

Expected: import failures for HTTP helpers.

- [ ] **Step 3: Implement HTTP helpers and manifest source selection**

Modify `agent_update.py`:

```python
from urllib.request import urlopen


def read_http_json(url: str) -> dict[str, Any]:
    try:
        with urlopen(url, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8-sig"))
    except Exception as exc:
        raise CliError("Cannot read HTTP release manifest", code="UPDATE_CHECK_FAILED", details={"source": url}) from exc
    if not isinstance(payload, dict):
        raise CliError("HTTP release manifest must be a JSON object", code="UPDATE_MANIFEST_INVALID", details={"source": url})
    return payload


def copy_http_artifact(url: str, target: Path, *, expected_sha256: str) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        target.unlink()
    try:
        with urlopen(url, timeout=60) as response:
            target.write_bytes(response.read())
    except Exception as exc:
        target.unlink(missing_ok=True)
        raise CliError("Cannot download indesign-cli-agent artifact", code="UPDATE_ARTIFACT_NOT_FOUND", details={"source": url}) from exc
    actual = sha256_file(target)
    if actual.lower() != expected_sha256.lower():
        target.unlink(missing_ok=True)
        raise CliError("indesign-cli-agent artifact sha256 mismatch", code="UPDATE_SHA256_MISMATCH", details={"source": url, "expected": expected_sha256, "actual": actual})
    return target
```

Update `load_first_manifest()` to call `read_http_json()` for HTTP sources and `parse_manifest(payload, source=source)`.

Update `copy_artifact()` to delegate to `copy_http_artifact()` when `source_url` starts with `http://` or `https://`.

- [ ] **Step 4: Run tests**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_agent_update.py -q
```

Expected: all update tests pass.

- [ ] **Step 5: Commit**

```powershell
git add agent-harness\cli_anything\indesign\core\agent_update.py agent-harness\cli_anything\indesign\tests\test_agent_update.py
git commit -m "feat: support github fallback updates"
```

---

### Task 7: Register Current-User Command Entry

**Files:**
- Modify: `agent-harness/cli_anything/indesign/core/agent_update.py`
- Modify: `agent-harness/cli_anything/indesign/agent_bootstrapper.py`
- Test: `agent-harness/cli_anything/indesign/tests/test_agent_update.py`

- [ ] **Step 1: Add tests for user PATH registration payload**

Append to `test_agent_update.py`:

```python
from cli_anything.indesign.core.agent_update import path_needs_registration, updated_user_path


def test_path_needs_registration_detects_missing_bin(tmp_path):
    bin_path = tmp_path / "bin"
    assert path_needs_registration(str(bin_path), current_path="C:\\Windows") is True
    assert path_needs_registration(str(bin_path), current_path=f"C:\\Windows;{bin_path}") is False


def test_updated_user_path_appends_bin_once(tmp_path):
    bin_path = tmp_path / "bin"
    first = updated_user_path(str(bin_path), current_path="C:\\Windows")
    second = updated_user_path(str(bin_path), current_path=first)
    assert first.endswith(str(bin_path))
    assert second == first
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_agent_update.py -q
```

Expected: import failures.

- [ ] **Step 3: Implement PATH helper without writing HKLM**

Add to `agent_update.py`:

```python
def _path_entries(current_path: str) -> list[str]:
    return [entry.strip().rstrip("\\/") for entry in current_path.split(os.pathsep) if entry.strip()]


def path_needs_registration(bin_path: str, *, current_path: str | None = None) -> bool:
    current = current_path if current_path is not None else os.environ.get("PATH", "")
    normalized = str(Path(bin_path)).rstrip("\\/")
    return normalized.lower() not in {entry.lower() for entry in _path_entries(current)}


def updated_user_path(bin_path: str, *, current_path: str | None = None) -> str:
    current = current_path if current_path is not None else os.environ.get("PATH", "")
    if not path_needs_registration(bin_path, current_path=current):
        return current
    return f"{current}{os.pathsep if current else ''}{bin_path}"
```

Add a Windows-specific function for implementation:

```python
def register_user_command(root: Path | None = None) -> dict[str, Any]:
    actual_root = root or install_root()
    directory = str(bin_dir(actual_root))
    new_path = updated_user_path(directory)
    if new_path == os.environ.get("PATH", ""):
        return {"registered": False, "bin": directory}
    if os.name == "nt":
        import winreg

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment", 0, winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, "Path", 0, winreg.REG_EXPAND_SZ, new_path)
    os.environ["PATH"] = new_path
    return {"registered": True, "bin": directory}
```

This writes only HKCU Environment, not HKLM. If product policy later rejects HKCU registry, replace this implementation with an equivalent current-user shim path.

- [ ] **Step 4: Wire `install` command to register user command**

In `agent_bootstrapper.py`, when handling `install`, call:

```python
from .core.agent_update import register_user_command

data = ensure_agent_ready(command_args=["install"], sources=getattr(args, "source", None))
registration = register_user_command()
data["registration"] = registration
return emit(ok("install", data, elapsed(start)), pretty=pretty)
```

- [ ] **Step 5: Run tests**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_agent_update.py agent-harness\cli_anything\indesign\tests\test_bootstrapper.py -q
```

Expected: update and bootstrapper tests pass.

- [ ] **Step 6: Commit**

```powershell
git add agent-harness\cli_anything\indesign\core\agent_update.py agent-harness\cli_anything\indesign\agent_bootstrapper.py agent-harness\cli_anything\indesign\tests\test_agent_update.py
git commit -m "feat: register user-level agent command"
```

---

### Task 8: Update Build and Release Manifest Contract

**Files:**
- Modify: `scripts/build_agent_bootstrapper.py`
- Modify: `agent-harness/cli_anything/indesign/tests/test_package_metadata.py`
- Create or modify: release helper tests if present

- [ ] **Step 1: Add a dry-run test for release manifest fields**

In `test_package_metadata.py`, add:

```python
def test_agent_release_manifest_uses_artifact_schema():
    script = REPO_ROOT / "scripts" / "build_agent_bootstrapper.py"
    text = script.read_text(encoding="utf-8")
    assert '"artifact"' in text
    assert '"github_url"' in text
    assert '"runtime_dir"' not in text
```

Use the existing `REPO_ROOT` helper from that file; if absent, define:

```python
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
```

- [ ] **Step 2: Run metadata tests and verify they fail**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_package_metadata.py -q
```

Expected: the script still lacks release manifest artifact schema.

- [ ] **Step 3: Extend build script to emit release metadata**

In `scripts/build_agent_bootstrapper.py`, add arguments:

```python
parser.add_argument("--version", required=True, help="Release version such as 0.4.1")
parser.add_argument("--nas-url", required=True, help="NAS artifact URL/path for latest.json")
parser.add_argument("--github-url", required=True, help="GitHub artifact URL for latest.json")
```

After successful build, compute SHA-256 and write:

```python
manifest = {
    "schema_version": 1,
    "name": "indesign-cli-agent",
    "version": args.version,
    "channel": "stable",
    "platform": "windows-x64",
    "artifact": {
        "file": "indesign-cli-agent.exe",
        "url": args.nas_url,
        "github_url": args.github_url,
        "sha256": sha256_file(output_dir / "indesign-cli-agent.exe"),
    },
}
(output_dir / "latest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
(output_dir / "sha256.txt").write_text(manifest["artifact"]["sha256"] + "  indesign-cli-agent.exe\n", encoding="utf-8")
```

- [ ] **Step 4: Run metadata tests**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_package_metadata.py -q
```

Expected: metadata tests pass.

- [ ] **Step 5: Commit**

```powershell
git add scripts\build_agent_bootstrapper.py agent-harness\cli_anything\indesign\tests\test_package_metadata.py
git commit -m "feat: emit agent release manifest"
```

---

### Task 9: Update README and Skill

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `agent-harness/cli_anything/indesign/README.md`
- Modify: `skills/indesign-cli/SKILL.md`

- [ ] **Step 1: Replace old user examples**

In all four files, remove examples shaped like:

```powershell
Copy-Item "\\server\tools\indesign-cli\bootstrap\indesign-cli-agent.exe" "$env:TEMP\indesign-cli-agent.exe" -Force
& "$env:TEMP\indesign-cli-agent.exe" run --source "\\server\tools\indesign-cli\latest.json" -- server health --deep --connect-indesign
```

Replace with:

```powershell
indesign-cli-agent install
indesign-cli-agent server health --deep --connect-indesign
```

- [ ] **Step 2: Add Skill top rule**

At the top of `skills/indesign-cli/SKILL.md`, add:

```markdown
## Agent 成品入口规则

- 成品 EXE 用户必须使用 `indesign-cli-agent` 命令入口。
- 正式调用前先执行 `indesign-cli-agent install` 或确认该命令可用。
- 不使用项目目录、线程目录、`%TEMP%` 中的 EXE 副本作为长期入口。
- 不再使用 `run --source <latest.json> -- ...`。
- 更新源由工具默认规则处理：NAS 优先，GitHub 兜底。
- 如果更新失败但本机命令可用，可以继续执行，并在结果里说明继续使用本地版本。
```

- [ ] **Step 3: Search for forbidden old entry**

Run:

```powershell
rg "run --source|latest\\.json.*--|bootstrap\\\\indesign-cli-agent\\.exe|\\$env:TEMP\\\\indesign-cli-agent" README.md README.en.md agent-harness\cli_anything\indesign\README.md skills\indesign-cli\SKILL.md
```

Expected: no matches except historical/spec references outside these files.

- [ ] **Step 4: Commit**

```powershell
git add README.md README.en.md agent-harness\cli_anything\indesign\README.md skills\indesign-cli\SKILL.md
git commit -m "docs: document user-level agent command"
```

---

### Task 10: Final Verification and Cleanup

**Files:**
- Verify all changed files

- [ ] **Step 1: Run Python CLI tests**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests -q
```

Expected: all CLI tests pass. Existing InDesign-gated tests may skip if `INDESIGN_E2E` is not set.

- [ ] **Step 2: Run required Node checks**

Run:

```powershell
node scripts\check_architecture.mjs
node tests\architecture\registry.test.mjs
node tests\index.js --required
```

Expected: all commands pass.

- [ ] **Step 3: Run diff checks and old-entry search**

Run:

```powershell
git diff --check
rg "run --source" agent-harness README.md README.en.md skills\indesign-cli\SKILL.md
```

Expected: `git diff --check` passes. `rg "run --source"` returns no public docs/help references except tests asserting rejection or archived specs/plans if included in broader searches.

- [ ] **Step 4: Verify no generated garbage is tracked**

Run:

```powershell
git status --short
```

Expected: only intended source, test, doc, and script files are modified. No `dist-agent/`, `.build/`, `.exe`, `.tmp`, `.bak`, or `__pycache__` files are staged.

- [ ] **Step 5: Commit verification fixes if needed**

If verification required small fixes:

```powershell
git add <fixed-files>
git commit -m "fix: finish agent update flow verification"
```

If no fixes were required, do not create an empty commit.

---

## Execution Notes

- Keep implementation small. Do not add a service, installer, multi-file launcher, or background updater.
- Do not keep `.bak` or historical EXE versions.
- Do not write project directories during install/update tests.
- Do not silently preserve the old public `run --source` path.
- Treat GitHub HTTP fallback as static file download only.
- If Windows PATH registration through HKCU `Environment\Path` proves unreliable in tests, implement an equivalent current-user command shim, but keep the external command name `indesign-cli-agent`.

## Self-Review

- Spec coverage: covered product shape, first install, user-level command registration, NAS/GitHub fallback, manifest schema, version comparison, locking, replacement cleanup, old `run --source` removal, docs/Skill, and verification.
- Placeholder scan: no unresolved placeholders. Steps include concrete file paths, commands, and expected results.
- Type consistency: planned core module is `agent_update.py`; public functions used by tests are defined in earlier tasks before later usage.
