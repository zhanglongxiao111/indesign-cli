import os
import subprocess
import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[4]
HARNESS_ROOT = REPO_ROOT / "agent-harness"


def run_cli(*args: str) -> subprocess.CompletedProcess[str]:
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


@pytest.mark.skipif(
    os.environ.get("INDESIGN_E2E") != "1",
    reason="Set INDESIGN_E2E=1 to run real InDesign tests",
)
def test_real_indesign_script_run_requires_opt_in(tmp_path):
    health = run_cli("server", "health", "--deep")
    assert health.returncode == 0, health.stderr

    script_path = tmp_path / "smoke.jsx"
    script_path.write_text('"indesign-e2e-ok";\n', encoding="utf-8")
    result = run_cli("script", "run", str(script_path))
    assert result.returncode == 0, result.stdout + result.stderr
