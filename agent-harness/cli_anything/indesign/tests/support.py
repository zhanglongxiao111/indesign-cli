import io
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[4]
HARNESS_ROOT = REPO_ROOT / "agent-harness"
FAKE_PLUGIN_ROOT = HARNESS_ROOT / "cli_anything" / "indesign" / "tests" / "fixtures" / "plugins" / "fake-html-plugin"
sys.path.insert(0, str(HARNESS_ROOT))

def run_module(*args: str, cwd: Path = REPO_ROOT, env_overrides: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(HARNESS_ROOT)
    env["PYTHONIOENCODING"] = "utf-8"
    if env_overrides:
        env.update(env_overrides)
    return subprocess.run(
        [sys.executable, "-m", "cli_anything.indesign", *args],
        cwd=cwd,
        env=env,
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )



def assert_failure_envelope(payload, code):
    assert payload["ok"] is False
    assert payload["exit_code"] == 1
    assert payload["error"]["code"] == code
    assert isinstance(payload["request_id"], str)
    assert isinstance(payload["duration_ms"], int)
    assert "state_uncertain" in payload
    assert "next_action" in payload



def run_agent_module(
    *args: str,
    cwd: Path = REPO_ROOT,
    env_overrides: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(HARNESS_ROOT)
    env["PYTHONIOENCODING"] = "utf-8"
    if env_overrides:
        env.update(env_overrides)
    return subprocess.run(
        [sys.executable, "-m", "cli_anything.indesign.agent_bootstrapper", *args],
        cwd=cwd,
        env=env,
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
