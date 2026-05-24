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

    def record_call(self, *, tool_id: str, domain: str, source: str, ok: bool, duration_ms: int) -> None:
        payload = self.read(compact=False)
        calls = payload.setdefault("recent_calls", [])
        calls.insert(
            0,
            {
                "tool_id": tool_id,
                "domain": domain,
                "source": source,
                "ok": ok,
                "duration_ms": duration_ms,
                "time": datetime.now(timezone.utc).isoformat(),
            },
        )
        payload["version"] = 1
        payload["recent_calls"] = calls[:20]
        self.write(payload)

    def clear(self) -> None:
        if self.path.exists():
            self.path.unlink()
