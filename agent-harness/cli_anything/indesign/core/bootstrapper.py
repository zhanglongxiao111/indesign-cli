from __future__ import annotations

import os
import sys
from pathlib import Path

from .errors import CliError

# 公司分发默认遥测根目录：仅 agent bootstrapper 组装的运行环境注入；
# pip/源码安装不经过这里，保持显式 opt-in。INDESIGN_CLI_TELEMETRY=off 始终优先。
DEFAULT_TELEMETRY_DIR = r"\\daga-nas5\sa-ai-app\feedback-reports\indesign-cli-telemetry"


def build_runtime_env(runtime_root: Path, *, base_env: dict[str, str] | None = None) -> dict[str, str]:
    runtime_root = runtime_root.resolve()
    node = runtime_root / "node" / ("node.exe" if os.name == "nt" else "node")
    server = runtime_root / "server"
    expected = [node, server / "package.json", server / "src" / "index.js", server / "src" / "advanced" / "index.js"]
    missing = [str(path) for path in expected if not path.exists()]
    if missing:
        raise CliError(
            "Runtime is incomplete",
            code="RUNTIME_INVALID",
            details={"runtime_root": str(runtime_root), "missing": missing},
            next_action="Reinstall indesign-cli-agent.",
        )
    env = dict(base_env if base_env is not None else os.environ)
    env["INDESIGN_CLI_RUNTIME_ROOT"] = str(runtime_root)
    env["INDESIGN_CLI_NODE"] = str(node)
    env["INDESIGN_CLI_SERVER_ROOT"] = str(server)
    if env.get("INDESIGN_CLI_TELEMETRY", "").lower() != "off" and not env.get("INDESIGN_CLI_TELEMETRY_DIR"):
        env["INDESIGN_CLI_TELEMETRY_DIR"] = DEFAULT_TELEMETRY_DIR
    return env


# runtime 根目录自带的 PowerShell 入口：给不走 launcher 的宿主用（SA-AIAPP 工具箱把 runtime ZIP
# 解压到自己的目录，经 SA_AGENT_INDESIGN 交给 Agent）。它做的事就是上面的 build_runtime_env，
# 写成脚本随 ZIP 分发，由本仓库这一处定义：宿主那边不抄第二份，这边改了环境约定也不会让宿主悄悄过时。
# 两者设同一组变量由 tests/test_runtime_entry_script.py 守着。
RUNTIME_ENTRY_SCRIPT_NAME = "indesign-cli.ps1"
_RUNTIME_ENTRY_ENV_KEYS = (
    "INDESIGN_CLI_RUNTIME_ROOT",
    "INDESIGN_CLI_NODE",
    "INDESIGN_CLI_SERVER_ROOT",
    "INDESIGN_CLI_TELEMETRY_DIR",
)


def render_runtime_entry_script() -> str:
    names = ", ".join(f"'{name}'" for name in _RUNTIME_ENTRY_ENV_KEYS)
    lines = [
        "# indesign-cli runtime 入口：由 build_agent_bootstrapper 生成，随 runtime 分发，不要手改。",
        "# 与 launcher 的 build_runtime_env 设置同一组环境变量；设置只在本次调用内生效，结束即还原。",
        "$cli = Join-Path $PSScriptRoot 'cli\\indesign-cli.exe'",
        "if (-not (Test-Path -LiteralPath $cli)) {",
        "  [Console]::Error.WriteLine(\"indesign-cli 运行环境不完整，缺少 $cli；请重启 SA-AIAPP 让工具箱重新安装。\")",
        "  exit 1",
        "}",
        f"$names = @({names})",
        "$saved = @{}",
        "foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }",
        "$code = 1",
        "try {",
        "  $env:INDESIGN_CLI_RUNTIME_ROOT = $PSScriptRoot",
        "  $env:INDESIGN_CLI_NODE = Join-Path $PSScriptRoot 'node\\node.exe'",
        "  $env:INDESIGN_CLI_SERVER_ROOT = Join-Path $PSScriptRoot 'server'",
        "  if ($env:INDESIGN_CLI_TELEMETRY -ne 'off' -and -not $env:INDESIGN_CLI_TELEMETRY_DIR) {",
        f"    $env:INDESIGN_CLI_TELEMETRY_DIR = '{DEFAULT_TELEMETRY_DIR}'",
        "  }",
        "  & $cli @args",
        "  $code = $LASTEXITCODE",
        "} finally {",
        "  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }",
        "}",
        "exit $code",
    ]
    # BOM 让 Windows PowerShell 5.1 也按 UTF-8 读中文提示；CRLF 与 SA 工具箱现写的垫片一致。
    return chr(0xFEFF) + "\r\n".join(lines) + "\r\n"


def embedded_runtime_root() -> Path | None:
    override = os.environ.get("INDESIGN_CLI_EMBEDDED_RUNTIME_ROOT")
    if override:
        return Path(override)
    frozen_root = getattr(sys, "_MEIPASS", None)
    if frozen_root:
        candidate = Path(str(frozen_root)) / "runtime"
        if candidate.exists():
            return candidate
    return None
