from __future__ import annotations

from typing import Any


class CliError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "CLI_ERROR",
        retryable: bool = False,
        details: dict[str, Any] | None = None,
        hint: str | None = None,
        state_uncertain: bool = False,
        next_action: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.retryable = retryable
        self.details = details or {}
        self.hint = hint
        self.state_uncertain = state_uncertain
        self.next_action = next_action


class TimeoutError(CliError):
    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(
            message,
            code="TIMEOUT",
            retryable=True,
            details=details,
            hint="缩短脚本或增加 --timeout；若 InDesign 卡住，先检查应用窗口状态。",
            state_uncertain=True,
            next_action="Run `indesign-cli session doctor` and inspect the active InDesign document before retrying mutating work.",
        )
