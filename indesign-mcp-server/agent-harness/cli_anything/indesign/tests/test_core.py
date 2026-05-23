import json
import os
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
HARNESS_ROOT = REPO_ROOT / "agent-harness"


def run_module(*args: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(HARNESS_ROOT)
    return subprocess.run(
        [sys.executable, "-m", "cli_anything.indesign", *args],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def test_version_returns_json():
    result = run_module("--version")
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["data"]["name"] == "cli-anything-indesign"
    assert payload["data"]["version"] == "0.1.0"
