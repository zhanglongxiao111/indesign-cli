from __future__ import annotations

import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPLACE_RETRY_DELAYS = (0.02, 0.05, 0.1)


def _replace_with_smb_fallback(tmp: Path, target: Path, serialized: str) -> None:
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
    # 先删目标再改名，若仍被拒绝则直接原地覆写目标文件。
    try:
        target.unlink(missing_ok=True)
        tmp.replace(target)
        return
    except OSError:
        pass
    try:
        target.write_text(serialized, encoding="utf-8")
        return
    except OSError:
        if last_exc is not None:
            raise last_exc
        raise


class SessionStore:
    def __init__(self, cwd: Path) -> None:
        self.root = cwd / ".indesign-cli"
        self.path = self.root / "session.json"

    def read(self, compact: bool = True) -> dict[str, Any]:
        payload: dict[str, Any]
        if not self.path.exists():
            payload = {"version": 1, "recent_calls": []}
        else:
            try:
                loaded = json.loads(self.path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                payload = {"version": 1, "recent_calls": []}
            else:
                payload = loaded if isinstance(loaded, dict) else {"version": 1, "recent_calls": []}
                if compact:
                    payload.pop("verbose_paths", None)
        # Agent 自查「我现在在哪」的一部分：回显实际读的是哪个绝对路径的 session 文件，
        # 而不是让 Agent 靠猜测 cwd 来判断。派生字段，write() 不会把它落盘。
        payload["session_path"] = str(self.path)
        return payload

    def write(self, payload: dict[str, Any]) -> None:
        # 临时文件 + 原子替换（含 SMB/NAS WinError 5 回退），避免多 Agent 并发写出半截 JSON
        self.root.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(f"session.{os.getpid()}.{uuid.uuid4().hex[:8]}.tmp")
        to_store = {key: value for key, value in payload.items() if key != "session_path"}
        serialized = json.dumps(to_store, ensure_ascii=False, indent=2)
        try:
            tmp.write_text(serialized, encoding="utf-8")
            _replace_with_smb_fallback(tmp, self.path, serialized)
        finally:
            try:
                tmp.unlink(missing_ok=True)
            except OSError:
                pass

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
        payload = self.read(compact=False)
        calls = payload.setdefault("recent_calls", [])
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
            "error_summary": error_summary,
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
        calls.insert(
            0,
            item,
        )
        payload["version"] = 1
        payload["recent_calls"] = calls[:20]
        self.write(payload)

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
