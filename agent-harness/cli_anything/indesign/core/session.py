from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class SessionStore:
    def __init__(self, cwd: Path) -> None:
        self.root = cwd / ".indesign-cli"
        self.path = self.root / "session.json"

    def read(self, compact: bool = True) -> dict[str, Any]:
        if not self.path.exists():
            return {"version": 1, "recent_calls": []}
        payload = json.loads(self.path.read_text(encoding="utf-8"))
        if compact:
            payload.pop("verbose_paths", None)
        return payload

    def write(self, payload: dict[str, Any]) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

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
        if self.path.exists():
            self.path.unlink()

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
            "next_action": "Run `indesign-cli server health --deep --connect-indesign` before mutating documents.",
        }
