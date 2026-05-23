import json
import os
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
HARNESS_ROOT = REPO_ROOT / "agent-harness"
sys.path.insert(0, str(HARNESS_ROOT))


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


def test_external_path_is_scrubbed():
    from cli_anything.indesign.core.paths import scrub_path

    scrubbed = scrub_path(r"D:\Clients\AcmeSecret\layout.indd", Path.cwd())
    assert scrubbed["external"] is True
    assert scrubbed["extension"] == ".indd"
    assert "AcmeSecret" not in json.dumps(scrubbed, ensure_ascii=False)
    assert "layout.indd" not in json.dumps(scrubbed, ensure_ascii=False)
    assert len(scrubbed["hash"]) == 16


def test_failure_envelope_has_machine_fields():
    from cli_anything.indesign.core.envelope import failure
    from cli_anything.indesign.core.errors import CliError

    payload = failure(
        command="unit",
        error=CliError("Bad input", code="BAD_INPUT", retryable=False),
        duration_ms=12,
    )
    assert payload["ok"] is False
    assert payload["exit_code"] == 1
    assert payload["schema_version"] == 1
    assert payload["error"]["code"] == "BAD_INPUT"
    assert payload["error"]["retryable"] is False
