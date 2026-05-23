from __future__ import annotations


class CliError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "CLI_ERROR",
        retryable: bool = False,
        details: dict | None = None,
        hint: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.retryable = retryable
        self.details = details or {}
        self.hint = hint


class TimeoutError(CliError):
    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(
            message,
            code="TIMEOUT",
            retryable=True,
            details=details,
            hint="缩短脚本或增加 --timeout；若 InDesign 卡住，先检查应用窗口状态。",
        )
