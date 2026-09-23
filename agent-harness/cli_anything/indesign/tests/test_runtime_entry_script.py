"""runtime 自带入口脚本 indesign-cli.ps1：不经 launcher 的宿主（SA 工具箱）用它启动 CLI。

它必须和 launcher 的 build_runtime_env 设置同一组环境变量。少设了 INDESIGN_CLI_TELEMETRY_DIR，
CLI 就一条使用记录都不写（telemetry._telemetry_root 缺它直接返回 None）；以后要按版本核对
同事有没有升级，靠的正是这些记录。
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

import support  # noqa: F401  把 agent-harness 放进导入路径（同目录测试的统一做法）
from cli_anything.indesign.core.bootstrapper import (
    DEFAULT_TELEMETRY_DIR,
    RUNTIME_ENTRY_SCRIPT_NAME,
    build_runtime_env,
    render_runtime_entry_script,
)

BOM = chr(0xFEFF)


def _fake_runtime(root: Path, cli_bytes: bytes = b"MZcli") -> Path:
    for relative in ("node/node.exe", "server/package.json", "server/src/index.js", "server/src/advanced/index.js"):
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"x")
    cli = root / "cli" / "indesign-cli.exe"
    cli.parent.mkdir(parents=True, exist_ok=True)
    cli.write_bytes(cli_bytes)
    (root / RUNTIME_ENTRY_SCRIPT_NAME).write_text(render_runtime_entry_script(), encoding="utf-8", newline="")
    return root


def _launcher_env_keys(tmp_path: Path) -> set[str]:
    runtime = _fake_runtime(tmp_path / "launcher-runtime")
    base = {"PATH": "x"}
    return set(build_runtime_env(runtime, base_env=base)) - set(base)


def test_entry_script_sets_every_env_key_the_launcher_sets(tmp_path):
    script = render_runtime_entry_script()
    keys = _launcher_env_keys(tmp_path)

    assert keys == {
        "INDESIGN_CLI_RUNTIME_ROOT",
        "INDESIGN_CLI_NODE",
        "INDESIGN_CLI_SERVER_ROOT",
        "INDESIGN_CLI_TELEMETRY_DIR",
    }
    for key in keys:
        assert re.search(rf"\$env:{key}\s*=", script), f"入口脚本没有设置 {key}"
    assert f"'{DEFAULT_TELEMETRY_DIR}'" in script


def test_entry_script_is_bom_crlf_powershell_that_runs_the_bundled_cli():
    script = render_runtime_entry_script()

    assert script.startswith(BOM)
    assert "\r\n" in script and "\n" not in script.replace("\r\n", "")
    assert r"cli\indesign-cli.exe" in script
    assert "@args" in script
    assert "exit $code" in script


def _pwsh() -> str | None:
    return shutil.which("pwsh") if os.name == "nt" else None


def _run_entry(runtime: Path, cli_args: str, extra_env: dict[str, str] | None = None) -> subprocess.CompletedProcess:
    command = (
        f"& '{runtime / RUNTIME_ENTRY_SCRIPT_NAME}' {cli_args}; "
        "$code = $LASTEXITCODE; "
        "Write-Output \"CODE=$code\"; "
        "Write-Output \"AFTER_ROOT=[$env:INDESIGN_CLI_RUNTIME_ROOT]\"; "
        "Write-Output \"AFTER_TELEMETRY_DIR=[$env:INDESIGN_CLI_TELEMETRY_DIR]\""
    )
    env = {key: value for key, value in os.environ.items() if not key.startswith("INDESIGN_CLI_")}
    env.update(extra_env or {})
    return subprocess.run(
        [_pwsh(), "-NoProfile", "-NonInteractive", "-Command", command],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        timeout=60,
    )


def _cmd_runtime(tmp_path: Path) -> Path:
    # 用系统 cmd.exe 冒充 CLI：它能把自己看到的环境变量原样打印出来，也能按指定退出码退出。
    return _fake_runtime(tmp_path / "runtime", cli_bytes=Path(os.environ["SystemRoot"], "System32", "cmd.exe").read_bytes())


@pytest.mark.skipif(_pwsh() is None, reason="需要 Windows 上的 pwsh")
def test_entry_script_gives_cli_the_runtime_env_and_restores_the_caller_env(tmp_path):
    runtime = _cmd_runtime(tmp_path)

    result = _run_entry(runtime, "/c set INDESIGN_CLI")
    seen = dict(line.split("=", 1) for line in result.stdout.splitlines() if line.startswith("INDESIGN_CLI_"))

    assert Path(seen["INDESIGN_CLI_RUNTIME_ROOT"]) == runtime
    assert Path(seen["INDESIGN_CLI_NODE"]) == runtime / "node" / "node.exe"
    assert Path(seen["INDESIGN_CLI_SERVER_ROOT"]) == runtime / "server"
    assert seen["INDESIGN_CLI_TELEMETRY_DIR"] == DEFAULT_TELEMETRY_DIR
    # 调用方的会话里不留痕：入口脚本改的是进程环境，必须改完即还原。
    assert "AFTER_ROOT=[]" in result.stdout
    assert "AFTER_TELEMETRY_DIR=[]" in result.stdout


@pytest.mark.skipif(_pwsh() is None, reason="需要 Windows 上的 pwsh")
def test_entry_script_passes_through_the_cli_exit_code(tmp_path):
    runtime = _cmd_runtime(tmp_path)

    result = _run_entry(runtime, "/c exit 7")

    assert "CODE=7" in result.stdout


@pytest.mark.skipif(_pwsh() is None, reason="需要 Windows 上的 pwsh")
def test_entry_script_honours_telemetry_off_like_the_launcher(tmp_path):
    runtime = _cmd_runtime(tmp_path)

    result = _run_entry(runtime, "/c set INDESIGN_CLI", extra_env={"INDESIGN_CLI_TELEMETRY": "off"})

    assert "INDESIGN_CLI_TELEMETRY=off" in result.stdout
    assert "INDESIGN_CLI_TELEMETRY_DIR=" not in result.stdout


@pytest.mark.skipif(_pwsh() is None, reason="需要 Windows 上的 pwsh")
def test_entry_script_reports_incomplete_runtime_instead_of_running_nothing(tmp_path):
    runtime = _cmd_runtime(tmp_path)
    (runtime / "cli" / "indesign-cli.exe").unlink()

    result = _run_entry(runtime, "--version")

    assert "CODE=1" in result.stdout
    assert "indesign-cli.exe" in result.stderr
