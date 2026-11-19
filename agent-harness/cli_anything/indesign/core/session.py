from __future__ import annotations

import errno
import json
import os
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from .errors import CliError
from .paths import scrub_text_paths

_REPLACE_RETRY_DELAYS = (0.02, 0.05, 0.1)
_LOCK_TIMEOUT_SECONDS = 2.0
_INPROC_LOCK = threading.Lock()


def _session_busy_error(lock_path: Path) -> CliError:
    return CliError(
        "Session state is temporarily locked by another process",
        code="SESSION_BUSY",
        retryable=True,
        details={"lock": scrub_text_paths(str(lock_path))},
        hint="另一个进程正在更新 session.json；请稍后重试 `indesign-cli session show` 或 `indesign-cli session doctor`。",
    )


def _is_lock_contention(exc: OSError) -> bool:
    winerror = getattr(exc, "winerror", None)
    if winerror in {33, 36}:
        return True
    return exc.errno in {errno.EACCES, errno.EAGAIN}


@contextmanager
def _session_lock(lock_path: Path, *, timeout_seconds: float = _LOCK_TIMEOUT_SECONDS) -> Iterator[None]:
    start = time.monotonic()
    if not _INPROC_LOCK.acquire(timeout=timeout_seconds):
        raise _session_busy_error(lock_path)
    handle = None
    locked = False
    try:
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with lock_path.open("xb") as init_handle:
                init_handle.write(b"\0")
        except (FileExistsError, PermissionError):
            if not lock_path.exists():
                raise
        handle = lock_path.open("r+b")
        while True:
            try:
                handle.seek(0)
                if os.name == "nt":
                    import msvcrt

                    msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl

                    fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                locked = True
                break
            except OSError as exc:
                if not _is_lock_contention(exc):
                    raise
                if time.monotonic() - start >= timeout_seconds:
                    raise _session_busy_error(lock_path) from exc
                time.sleep(0.01)
        yield
    finally:
        if handle is not None:
            if locked:
                try:
                    handle.seek(0)
                    if os.name == "nt":
                        import msvcrt

                        msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
                    else:
                        import fcntl

                        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
                except OSError:
                    pass
            handle.close()
        _INPROC_LOCK.release()


def _is_unc_path(path: Path) -> bool:
    raw = str(path)
    return raw.startswith("\\\\") or raw.startswith("//")


def _overwrite_in_place(target: Path, serialized: str) -> None:
    data = serialized.encode("utf-8")
    mode = "r+b" if target.exists() else "wb"
    with target.open(mode) as handle:
        handle.seek(0)
        handle.write(data)
        handle.truncate()
        handle.flush()


def _replace_with_smb_fallback(
    tmp: Path,
    target: Path,
    lock_path: Path,
    serialized: str,
    *,
    already_locked: bool = False,
) -> None:
    # UNC/SMB 上覆盖已有目标的 MoveFileExW 几乎必然触发 WinError 5；
    # 直接在文件锁保护下原地覆写，跳过必败的 3 次 rename + 170ms 休眠退避。
    if _is_unc_path(target) and target.exists():
        if already_locked:
            _overwrite_in_place(target, serialized)
        else:
            with _session_lock(lock_path):
                _overwrite_in_place(target, serialized)
        return
    last_exc: OSError | None = None
    for index in range(len(_REPLACE_RETRY_DELAYS) + 1):
        try:
            tmp.replace(target)
            return
        except OSError as exc:
            last_exc = exc
            if index < len(_REPLACE_RETRY_DELAYS):
                time.sleep(_REPLACE_RETRY_DELAYS[index])
    # Windows SMB/NAS 上覆盖已有文件的 MoveFileExW(MOVEFILE_REPLACE_EXISTING) 常报 WinError 5；
    # 非原子原地覆写必须在文件锁保护下执行（seek+write+truncate），拿不到锁或无写权限时保留原文件不删除。
    try:
        if already_locked:
            _overwrite_in_place(target, serialized)
        else:
            with _session_lock(lock_path):
                _overwrite_in_place(target, serialized)
        return
    except OSError:
        if last_exc is not None:
            raise last_exc
        raise


class SessionStore:
    def __init__(self, cwd: Path) -> None:
        self.root = cwd / ".indesign-cli"
        self.path = self.root / "session.json"
        self.lock_path = self.root / "session.lock"

    def _read_unlocked(self, compact: bool = True) -> dict[str, Any]:
        payload: dict[str, Any]
        try:
            raw_text = self.path.read_text(encoding="utf-8")
        except FileNotFoundError:
            payload = {"version": 1, "recent_calls": []}
        except OSError as exc:
            raise CliError(
                "Session state cannot be read",
                code="SESSION_READ_FAILED",
                retryable=True,
                details={"session": scrub_text_paths(str(self.path)), "reason": exc.__class__.__name__},
                hint="无法读取 .indesign-cli/session.json（可能存在网盘共享冲突或权限限制）；请稍后重试。",
            ) from exc
        else:
            try:
                loaded = json.loads(raw_text)
            except json.JSONDecodeError:
                payload = {"version": 1, "recent_calls": []}
            else:
                payload = loaded if isinstance(loaded, dict) else {"version": 1, "recent_calls": []}
                if compact:
                    payload.pop("verbose_paths", None)
        # Agent 自查「我现在在哪」的一部分：回显实际读的是哪个绝对路径的 session 文件，
        # 而不是让 Agent 靠猜测 cwd 来判断。派生字段，write() 不会把它落盘。
        payload["session_path"] = str(self.path)
        return payload

    def read(self, compact: bool = True) -> dict[str, Any]:
        if not self.path.exists():
            return self._read_unlocked(compact=compact)
        if self.lock_path.exists():
            try:
                with _session_lock(self.lock_path):
                    return self._read_unlocked(compact=compact)
            except CliError:
                raise
            except OSError:
                pass
        return self._read_unlocked(compact=compact)

    def _write_unlocked(self, payload: dict[str, Any], *, already_locked: bool) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        to_store = {key: value for key, value in payload.items() if key != "session_path"}
        serialized = json.dumps(to_store, ensure_ascii=False, indent=2)
        if _is_unc_path(self.path) and self.path.exists():
            if already_locked:
                _overwrite_in_place(self.path, serialized)
            else:
                with _session_lock(self.lock_path):
                    _overwrite_in_place(self.path, serialized)
            return
        tmp = self.path.with_name(f"session.{os.getpid()}.{uuid.uuid4().hex[:8]}.tmp")
        try:
            tmp.write_text(serialized, encoding="utf-8")
            _replace_with_smb_fallback(
                tmp,
                self.path,
                self.lock_path,
                serialized,
                already_locked=already_locked,
            )
        finally:
            try:
                tmp.unlink(missing_ok=True)
            except OSError:
                pass

    def write(self, payload: dict[str, Any]) -> None:
        # 临时文件 + 原子替换（含带锁的 SMB/NAS WinError 5 回退），避免多 Agent 并发写出半截 JSON
        self._write_unlocked(payload, already_locked=False)

    def record_call(
        self,
        *,
        tool_id: str,
        domain: str,
        source: str,
        ok: bool,
        duration_ms: int,
        plugin: str | None = None,
        artifacts: list[dict[str, Any]] | None = None,
        request_id: str | None = None,
        command: str | None = None,
        error_code: str | None = None,
        error_summary: str | None = None,
        hint: str | None = None,
        warnings_count: int = 0,
        document_state: dict[str, Any] | None = None,
        state_uncertain: bool = False,
        next_action: str | None = None,
    ) -> None:
        item: dict[str, Any] = {
            "tool_id": tool_id,
            "domain": domain,
            "source": source,
            "ok": ok,
            "duration_ms": duration_ms,
            "time": datetime.now(timezone.utc).isoformat(),
        }
        optional_values = {
            "request_id": request_id,
            "command": command,
            "error_code": error_code,
            "error_summary": scrub_text_paths(error_summary) if isinstance(error_summary, str) else error_summary,
            "hint": hint,
            "documentState": document_state,
            "next_action": next_action,
        }
        for key, value in optional_values.items():
            if value:
                item[key] = value
        if warnings_count:
            item["warnings_count"] = warnings_count
        if state_uncertain:
            item["state_uncertain"] = True
        if plugin:
            item["plugin"] = plugin
        if artifacts:
            item["artifacts"] = [
                {
                    "kind": artifact.get("kind"),
                    "path": artifact.get("path"),
                }
                for artifact in artifacts
                if isinstance(artifact, dict) and artifact.get("path")
            ][:10]

        try:
            lock_ctx = _session_lock(self.lock_path)
            lock_ctx.__enter__()
            has_lock = True
        except OSError:
            lock_ctx = None
            has_lock = False
        try:
            payload = self._read_unlocked(compact=False)
            calls = payload.setdefault("recent_calls", [])
            calls.insert(0, item)
            payload["version"] = 1
            payload["recent_calls"] = calls[:20]
            self._write_unlocked(payload, already_locked=has_lock)
        finally:
            if lock_ctx is not None and has_lock:
                lock_ctx.__exit__(None, None, None)

    def clear(self) -> None:
        self.path.unlink(missing_ok=True)

    def doctor(self) -> dict[str, Any]:
        payload = self.read(compact=True)
        calls = payload.get("recent_calls", [])
        recent_failure = next((call for call in calls if call.get("ok") is False), None)
        recent_artifacts: list[dict[str, Any]] = []
        latest_document_state = None
        for call in calls:
            if latest_document_state is None and isinstance(call.get("documentState"), dict):
                latest_document_state = call["documentState"]
            for artifact in call.get("artifacts") or []:
                if isinstance(artifact, dict):
                    recent_artifacts.append(artifact)
            if len(recent_artifacts) >= 10 and latest_document_state is not None:
                break
        return {
            "recent_failure": recent_failure,
            "recent_artifacts": recent_artifacts[:10],
            "documents": latest_document_state,
            "session_path": payload.get("session_path"),
            "next_action": "Run `indesign-cli server health --deep --connect-indesign` before mutating documents.",
        }
