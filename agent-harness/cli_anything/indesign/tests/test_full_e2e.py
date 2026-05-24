import os
import json
import subprocess
import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[4]
HARNESS_ROOT = REPO_ROOT / "agent-harness"


def run_cli(*args: str, input_data: str | None = None) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(HARNESS_ROOT)
    return subprocess.run(
        [sys.executable, "-m", "cli_anything.indesign", *args],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        encoding="utf-8",
        errors="replace",
        input=input_data,
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

    stdin_probe = run_cli(
        "script",
        "run",
        "--stdin",
        input_data='try { "STDIN_PROBE_OK|中文|documents=" + app.documents.length; } catch (e) { "Error: " + e.message; }',
    )
    assert stdin_probe.returncode == 0, stdin_probe.stdout + stdin_probe.stderr
    stdin_payload = json.loads(stdin_probe.stdout)
    assert stdin_payload["data"]["parsed"]["result"].startswith("STDIN_PROBE_OK|中文|documents=")

    json_script_path = tmp_path / "json-return.jsx"
    json_script_path.write_text(
        'JSON.stringify({ ok: true, marker: "JSON_POLYFILL_OK", text: "中文" });\n',
        encoding="utf-8",
    )
    json_result = run_cli("script", "run", str(json_script_path))
    assert json_result.returncode == 0, json_result.stdout + json_result.stderr
    json_payload = json.loads(json_result.stdout)
    returned_json = json.loads(json_payload["data"]["parsed"]["result"])
    assert returned_json["marker"] == "JSON_POLYFILL_OK"
    assert returned_json["text"] == "中文"

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

    inspect_script_path = tmp_path / "inspect-document.jsx"
    inspect_script_path.write_text(
        f"""
try {{
  app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;
  var file = File("{output_jsx_path}");
  var doc = app.open(file, false);
  var items = doc.pageItems.everyItem().getElements();
  var labelText = "";
  for (var i = 0; i < items.length; i++) {{
    if (items[i].label == "cli_anything_e2e_text_frame") {{
      labelText = items[i].contents;
      break;
    }}
  }}
  var pageCount = doc.pages.length;
  doc.close(SaveOptions.NO);
  "DOC_INSPECT_OK|pages=" + pageCount + "|labelText=" + labelText;
}} catch (e) {{
  "Error: " + e.message;
}}
""",
        encoding="utf-8",
    )

    inspect = run_cli("script", "run", str(inspect_script_path))
    assert inspect.returncode == 0, inspect.stdout + inspect.stderr
    inspect_payload = json.loads(inspect.stdout)
    result_text = inspect_payload["data"]["parsed"]["result"]
    assert result_text.startswith("DOC_INSPECT_OK|")
    assert "pages=1" in result_text
    assert "CLI-Anything real InDesign document E2E" in result_text


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
