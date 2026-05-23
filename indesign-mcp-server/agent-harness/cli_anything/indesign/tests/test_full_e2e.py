import os
import json
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
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


@pytest.mark.skipif(
    os.environ.get("INDESIGN_E2E") != "1",
    reason="Set INDESIGN_E2E=1 to run real InDesign tests",
)
def test_real_indesign_creates_and_saves_document(tmp_path):
    health = run_cli("server", "health", "--deep")
    assert health.returncode == 0, health.stderr

    output_path = tmp_path / "cli-anything-real-e2e.indd"
    output_jsx_path = str(output_path).replace("\\", "/")
    script_path = tmp_path / "create-document.jsx"
    script_path.write_text(
        f"""
try {{
  app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;
  var doc = app.documents.add();
  doc.documentPreferences.pageWidth = "210mm";
  doc.documentPreferences.pageHeight = "297mm";
  var page = doc.pages.item(0);
  var frame = page.textFrames.add();
  frame.geometricBounds = ["30mm", "25mm", "80mm", "185mm"];
  frame.contents = "CLI-Anything real InDesign document E2E";
  frame.label = "cli_anything_e2e_text_frame";
  var file = File("{output_jsx_path}");
  doc.save(file);
  doc.close(SaveOptions.YES);
  "DOC_CREATE_OK|" + file.fsName;
}} catch (e) {{
  "Error: " + e.message;
}}
""",
        encoding="utf-8",
    )

    result = run_cli("script", "run", str(script_path))
    assert result.returncode == 0, result.stdout + result.stderr
    payload = json.loads(result.stdout)
    assert payload["data"]["parsed"]["result"].startswith("DOC_CREATE_OK|")
    assert output_path.exists()
    assert output_path.stat().st_size > 0


@pytest.mark.skipif(
    os.environ.get("INDESIGN_E2E") != "1",
    reason="Set INDESIGN_E2E=1 to run real InDesign tests",
)
def test_real_indesign_script_error_returns_failure(tmp_path):
    script_path = tmp_path / "bad-script.jsx"
    script_path.write_text('throw new Error("intentional e2e failure");\n', encoding="utf-8")

    result = run_cli("script", "run", str(script_path))
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "MCP_TOOL_FAILED"
