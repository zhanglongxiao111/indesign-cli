# indesign-cli Agent UX Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the full Agent experience and reliability gap documented in `docs/superpowers/specs/2026-07-01-indesign-cli-agent-ux-hardening-design.md`.

**Architecture:** Keep the CLI as the single Agent-facing contract. Strengthen `agent-harness` envelope/session/catalog/router layers first, then make Node handlers return structured data through the existing MCP path, then verify with real InDesign smoke tests and updated Skill/docs.

**Tech Stack:** Python CLI (`argparse`, `pytest`), Node.js MCP server, Adobe InDesign COM through existing `winax`/JSX execution, Markdown docs.

---

## Scope

This plan is one complete整改包. Do not split scope out of this整改. The work is complete only when the report issues around false success, document safety, timeout, plugin contract, command discovery, path/JSON friction, batch execution, structured classic returns, docs, and real smoke verification all have tests and implementation.

## File Structure

| Path | Responsibility |
| ---- | -------------- |
| `agent-harness/cli_anything/indesign/indesign_cli.py` | CLI parser, timing, `--args-file`, `--timeout-ms`, `tool explain`, `agent quickstart`, `session doctor`, `tool batch`, health flags |
| `agent-harness/cli_anything/indesign/core/envelope.py` | Stable success/failure envelope, request id, duration, `state_uncertain`, `next_action` |
| `agent-harness/cli_anything/indesign/core/errors.py` | Stable `CliError` / timeout metadata |
| `agent-harness/cli_anything/indesign/core/router.py` | Tool schema/call routing, schema examples, timeout propagation, args loading |
| `agent-harness/cli_anything/indesign/core/mcp_backend.py` | MCP response parsing, legacy string failure compatibility, `{ok:false}` propagation |
| `agent-harness/cli_anything/indesign/core/catalog.py` | Tool metadata, task-level discovery fields, `tool explain` data source |
| `agent-harness/cli_anything/indesign/core/session.py` | Rich session records, `session doctor`, artifacts, document state, errors |
| `agent-harness/cli_anything/indesign/core/health.py` | `--connect-indesign` COM read-only probe |
| `agent-harness/cli_anything/indesign/core/batch.py` | New lightweight batch runner |
| `agent-harness/cli_anything/indesign/core/plugins/*.py` | Plugin manifest/validate/backend/session contract hardening |
| `src/utils/stringUtils.js` | Node response helpers and legacy failure recognition |
| `src/handlers/documentHandlers.js` | Document structured returns and document target safety |
| `src/handlers/graphicsHandlers.js` | Rectangle corner fix and graphics structured returns |
| `src/handlers/textHandlers.js` | Text/table structured returns for common tools |
| `src/handlers/exportHandlers.js` | Export structured returns, artifacts, JPEG-only `export_images` unless real PNG is implemented |
| `src/handlers/advancedTemplateHandlers.js` | Template document state metadata |
| `src/types/toolDefinitions*.js` | Schema corrections where behavior changes |
| `agent-harness/cli_anything/indesign/tests/test_core.py` | CLI unit/red tests |
| `tests/test-response-semantics.js` | Node response helper tests |
| `tests/real-e2e/run-agent-ux-hardening.mjs` | Real InDesign smoke runner for this整改 |
| `skills/indesign-cli/SKILL.md` | Agent usage guardrails only |
| `README.md`, `README.en.md`, `AGENTS.md` | Human docs and developer contract updates |

## Task 0: Baseline And Ownership Check

**Files:**
- Read: `git status --short --branch`
- Read: `skills/indesign-cli/SKILL.md`
- Read: `skills/indesign-cli/preview.png`

- [ ] **Step 1: Record current dirty state**

Run:

```powershell
git status --short --branch
```

Expected: existing user/doc changes are visible. Do not clean or overwrite `skills/indesign-cli/SKILL.md` or `skills/indesign-cli/preview.png`.

- [ ] **Step 2: Run current fast baseline**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
node scripts\validate_schemas.js
node scripts\check_duplicates.mjs
```

Expected: record pass/fail state before edits. If failures exist, keep them separate from this整改 and do not hide them.

- [ ] **Step 3: Capture current CLI behavior evidence**

Run:

```powershell
indesign-cli tool domains
indesign-cli tool schema document.get_document_info
indesign-cli tool schema script.run
indesign-cli server health --deep
```

Expected: save outputs mentally as baseline. Do not edit generated output into the repo.

## Task 1: CLI Red Tests For Envelope, Args, Timeout, Session, Batch

**Files:**
- Modify: `agent-harness/cli_anything/indesign/tests/test_core.py`

- [ ] **Step 1: Add tests for stable failure envelope**

Add tests that assert every CLI failure exposes top-level fields, not only nested `error`.

```python
def assert_failure_envelope(payload, code):
    assert payload["ok"] is False
    assert payload["exit_code"] == 1
    assert payload["error"]["code"] == code
    assert isinstance(payload["request_id"], str)
    assert isinstance(payload["duration_ms"], int)
    assert "state_uncertain" in payload
    assert "next_action" in payload
```

Use this helper in tests for `ARGS_FILE_NOT_FOUND`, `ARGS_JSON_INVALID`, and `TIMEOUT`.

- [ ] **Step 2: Add tests for optional args and args file**

Add tests covering:

```python
def test_empty_schema_tool_call_can_omit_args():
    result = run_cli(["tool", "call", "session.show"])
    assert result["ok"] is True

def test_required_schema_without_args_returns_json_failure():
    result = run_cli(["tool", "call", "export.verify"])
    assert result["ok"] is False
    assert result["error"]["code"] in {"ARGS_REQUIRED", "MISSING_ARGUMENT"}

def test_args_file_accepts_unicode_path(tmp_path):
    args = tmp_path / "参数.json"
    args.write_text('{"verbose": true}', encoding="utf-8")
    result = run_cli(["tool", "call", "session.show", "--args-file", str(args)])
    assert result["ok"] is True
```

- [ ] **Step 3: Add tests for timeout semantics**

Use a fake router/backend path or a monkeypatch that raises the existing timeout exception. Assert:

```python
assert result["ok"] is False
assert result["error"]["code"] == "TIMEOUT"
assert result["state_uncertain"] is True
```

- [ ] **Step 4: Add tests for `session doctor`**

Add a test that writes a session with one failure and asserts:

```python
result = run_cli(["session", "doctor"])
assert result["ok"] is True
assert "recent_failure" in result["data"]
assert "next_action" in result["data"]
```

- [ ] **Step 5: Add tests for `tool batch`**

Create a temp batch file with `session.show` then an invalid tool. Assert:

```python
assert result["ok"] is False
assert result["data"]["failed_step"] == "bad-step"
assert result["data"]["steps"][0]["ok"] is True
```

- [ ] **Step 6: Run red tests**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
```

Expected: new tests fail for missing fields/commands/options. Existing unrelated tests should retain baseline behavior.

## Task 2: Envelope, Error, Timing, And Session Core

**Files:**
- Modify: `agent-harness/cli_anything/indesign/core/envelope.py`
- Modify: `agent-harness/cli_anything/indesign/core/errors.py`
- Modify: `agent-harness/cli_anything/indesign/core/session.py`
- Modify: `agent-harness/cli_anything/indesign/indesign_cli.py`

- [ ] **Step 1: Extend `CliError` metadata**

Ensure `CliError` supports `state_uncertain` and `next_action` without changing existing call sites.

Implementation shape:

```python
class CliError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "CLI_ERROR",
        details: dict[str, Any] | None = None,
        retryable: bool = False,
        hint: str | None = None,
        state_uncertain: bool = False,
        next_action: str | None = None,
    ) -> None:
        ...
```

- [ ] **Step 2: Extend envelope output**

Update `success()` and `failure()` so both include:

```python
"state_uncertain": False,
"next_action": None,
```

`failure()` must copy values from `CliError`.

- [ ] **Step 3: Replace zero durations in command handlers**

In `indesign_cli.py`, measure per command with `now_ms()` around each branch that emits success. Use one helper:

```python
def elapsed(start_ms: int) -> int:
    return max(1, now_ms() - start_ms)
```

Every emitted success from `run()` must pass `duration_ms=elapsed(start)`, except `version` may remain 0.

- [ ] **Step 4: Expand session records**

Update `SessionStore.record_call()` to accept:

```python
request_id: str | None = None
command: str | None = None
error_code: str | None = None
error_summary: str | None = None
warnings_count: int = 0
document_state: dict[str, Any] | None = None
state_uncertain: bool = False
next_action: str | None = None
```

Store these fields only when non-empty, and keep the most recent 20 calls.

- [ ] **Step 5: Add `SessionStore.doctor()`**

Return compact read-only diagnostics:

```python
{
  "recent_failure": failure_or_none,
  "recent_artifacts": artifacts,
  "documents": latest_document_state_or_none,
  "next_action": "Run server health --deep --connect-indesign before mutating documents."
}
```

- [ ] **Step 6: Wire `session doctor` command**

Add parser subcommand and command branch:

```powershell
indesign-cli session doctor
```

The command must never open, close, or save InDesign documents.

- [ ] **Step 7: Run tests**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
```

Expected: envelope/session/duration tests pass; missing args, timeout, batch, metadata tests may still fail.

- [ ] **Step 8: Commit**

Commit only if the user has approved committing during implementation:

```powershell
git add agent-harness\cli_anything\indesign\core\envelope.py agent-harness\cli_anything\indesign\core\errors.py agent-harness\cli_anything\indesign\core\session.py agent-harness\cli_anything\indesign\indesign_cli.py agent-harness\cli_anything\indesign\tests\test_core.py
git commit -m "fix(cli): harden envelope and session diagnostics"
```

## Task 3: Args File, Optional Args, And Timeout Flags

**Files:**
- Modify: `agent-harness/cli_anything/indesign/indesign_cli.py`
- Modify: `agent-harness/cli_anything/indesign/core/router.py`
- Modify: `agent-harness/cli_anything/indesign/core/mcp_backend.py`
- Modify: `agent-harness/cli_anything/indesign/core/plugins/backend.py`
- Modify: `agent-harness/cli_anything/indesign/tests/test_core.py`

- [ ] **Step 1: Change parser options**

For `tool call`, replace required `--args` with:

```python
call_parser.add_argument("--args", help="JSON 参数文件路径；兼容旧写法")
call_parser.add_argument("--args-file", help="JSON 参数文件路径；推荐写法")
call_parser.add_argument("--timeout-ms", type=int, help="本次调用超时毫秒")
```

For `script run`, add:

```python
run_parser.add_argument("--timeout-ms", type=int, help="脚本执行超时毫秒")
```

Keep existing `--timeout` seconds as compatibility, but normalize internally to milliseconds.

- [ ] **Step 2: Implement args resolution**

Replace direct `load_args(args.args)` with a helper:

```python
def load_call_args(args, schema):
    path_value = args.args_file or args.args
    if path_value:
        return load_args(path_value)
    required = schema.get("required") or []
    if required:
        raise CliError("Arguments are required", code="ARGS_REQUIRED", details={"required": required})
    return {}
```

Use the schema from `router.schema(tool_id)["inputSchema"]`.

- [ ] **Step 3: Preserve stdin JSON**

Keep `load_args("-")` support. Error codes must remain:

- `ARGS_FILE_NOT_FOUND`
- `ARGS_JSON_INVALID`
- `ARGS_NOT_OBJECT`

- [ ] **Step 4: Normalize timeout milliseconds**

Add parser helper:

```python
def timeout_seconds_from_ms(timeout_ms: int | None, fallback_seconds: int | None = None) -> int | None:
    if timeout_ms is None:
        return fallback_seconds
    if timeout_ms < 1 or timeout_ms > 3_600_000:
        raise CliError("timeout_ms must be between 1 and 3600000", code="BAD_TIMEOUT")
    return max(1, int((timeout_ms + 999) / 1000))
```

Pass normalized seconds into `Router(..., backend_timeout_seconds=...)`.

- [ ] **Step 5: Map backend timeout to stable failure**

When backend timeout happens, ensure top-level failure code is `TIMEOUT`, `state_uncertain:true`, and `next_action` tells Agent to inspect session and active document before retrying.

- [ ] **Step 6: Run tests**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
```

Expected: args and timeout red tests pass.

- [ ] **Step 7: Commit**

```powershell
git add agent-harness\cli_anything\indesign\indesign_cli.py agent-harness\cli_anything\indesign\core\router.py agent-harness\cli_anything\indesign\core\mcp_backend.py agent-harness\cli_anything\indesign\core\plugins\backend.py agent-harness\cli_anything\indesign\tests\test_core.py
git commit -m "fix(cli): support args files and timeout semantics"
```

## Task 4: MCP Response Semantics And Script JSON Failure

**Files:**
- Modify: `agent-harness/cli_anything/indesign/core/mcp_backend.py`
- Modify: `agent-harness/cli_anything/indesign/core/scripts.py`
- Modify: `agent-harness/cli_anything/indesign/tests/test_core.py`

- [ ] **Step 1: Add legacy failure classifier in Python**

Implement a private helper in `mcp_backend.py`:

```python
LEGACY_FAILURE_PATTERNS = (
    "No document open",
    "No document to close",
    "Error ",
    "ERROR:",
    "Failed ",
)

def classify_legacy_failure(text: str) -> tuple[str, str] | None:
    stripped = text.strip()
    if "No document open" in stripped:
        return ("NO_ACTIVE_DOCUMENT", "No active document")
    if "No document to close" in stripped:
        return ("NO_ACTIVE_DOCUMENT", "No document to close")
    if stripped.startswith(("Error ", "ERROR:", "Failed ")):
        return ("INDESIGN_SCRIPT_FAILED", stripped[:200])
    return None
```

- [ ] **Step 2: Parse `{ok:false}` and `{success:false}` consistently**

In `_parse_tool_response()`, fail when parsed dict has:

```python
parsed.get("success") is False or parsed.get("ok") is False
```

If `parsed["result"]` is a JSON string and that result has `ok:false`, fail with details from `result_json`.

- [ ] **Step 3: Preserve success `result_json`**

When `parsed["result"]` is JSON and `ok:true`, keep:

```python
payload["result_json"] = result_json
```

Do not mark success false.

- [ ] **Step 4: Add script wrapper tests**

Add tests that feed fake MCP content equivalent to:

```json
{"success": true, "result": "{\"ok\": false, \"step\": \"export\", \"error\": \"boom\"}"}
```

Expected CLI failure:

```python
assert result["error"]["code"] == "INDESIGN_SCRIPT_FAILED"
assert result["error"]["details"]["step"] == "export"
```

- [ ] **Step 5: Run tests**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
```

Expected: MCP/script failure semantics pass.

- [ ] **Step 6: Commit**

```powershell
git add agent-harness\cli_anything\indesign\core\mcp_backend.py agent-harness\cli_anything\indesign\core\scripts.py agent-harness\cli_anything\indesign\tests\test_core.py
git commit -m "fix(cli): propagate tool and script failures"
```

## Task 5: Catalog Metadata, Tool Explain, And Agent Quickstart

**Files:**
- Modify: `agent-harness/cli_anything/indesign/core/catalog.py`
- Modify: `agent-harness/cli_anything/indesign/core/router.py`
- Modify: `agent-harness/cli_anything/indesign/indesign_cli.py`
- Modify: `agent-harness/cli_anything/indesign/tests/test_core.py`

- [ ] **Step 1: Add metadata fields to all catalog entries**

Every tool entry must include:

```python
"requires_active_document": bool,
"requires_active_page": bool,
"uses_selection": bool,
"opens_document": bool,
"closes_document": bool,
"may_close_document": bool,
"mutates_document": bool,
"writes_filesystem": bool,
"returns_artifacts": bool,
"return_shape": dict,
"return_example": dict,
"failure_example": dict,
"preconditions": list[str],
"safe_usage_notes": list[str],
"common_next_steps": list[str],
```

Populate conservative defaults from existing `side_effects`, `target_scope`, `needs_indesign`, `destructive`, and domain/name heuristics.

- [ ] **Step 2: Add focused overrides**

Hard-code high-risk tools:

- `document.close_document`: `may_close_document:true`, `closes_document:true`, `mutates_document:true`
- `document.save_document`: `mutates_document:true`, `requires_active_document:true`
- `export.export_pdf`: `writes_filesystem:true`, `returns_artifacts:true`
- `export.export_images`: `writes_filesystem:true`, `returns_artifacts:true`
- `template.inspect_template_blueprint`: `opens_document:true`, `may_close_document:true`
- `script.run`: `mutates_document:true`, `safe_usage_notes` says complex scripts need wrapper

- [ ] **Step 3: Include metadata in schema output**

`Router.schema()` must return:

```python
{
  "tool": tool,
  "inputSchema": schema,
  "metadata": { ...same selected metadata... }
}
```

- [ ] **Step 4: Implement `tool explain`**

Add parser and command:

```powershell
indesign-cli tool explain graphics.create_rectangle
```

Return one JSON object containing tool id, purpose, args, preconditions, side effects, safe usage notes, return example, failure example, and common next steps.

- [ ] **Step 5: Implement `agent quickstart`**

Add command:

```powershell
indesign-cli agent quickstart
```

Return a compact list of canonical commands:

```json
{
  "commands": [
    "indesign-cli server health --deep --connect-indesign",
    "indesign-cli tool domains",
    "indesign-cli tool search --query <keyword>",
    "indesign-cli tool schema <tool_id>",
    "indesign-cli tool call <tool_id> --args-file args.json",
    "indesign-cli script run file.jsx --timeout-ms 120000",
    "indesign-cli export verify output.pdf"
  ]
}
```

- [ ] **Step 6: Run tests**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
```

Expected: catalog metadata, schema metadata, `tool explain`, and quickstart tests pass.

- [ ] **Step 7: Commit**

```powershell
git add agent-harness\cli_anything\indesign\core\catalog.py agent-harness\cli_anything\indesign\core\router.py agent-harness\cli_anything\indesign\indesign_cli.py agent-harness\cli_anything\indesign\tests\test_core.py
git commit -m "feat(cli): add task-level tool discovery metadata"
```

## Task 6: Health COM Probe And Document State Diagnostics

**Files:**
- Modify: `agent-harness/cli_anything/indesign/core/health.py`
- Modify: `agent-harness/cli_anything/indesign/indesign_cli.py`
- Modify: `agent-harness/cli_anything/indesign/tests/test_core.py`

- [ ] **Step 1: Add `--connect-indesign` parser flag**

For `server health`:

```python
health_parser.add_argument("--connect-indesign", action="store_true", help="执行只读 InDesign COM 探针")
```

- [ ] **Step 2: Implement read-only COM probe**

In `health.py`, add function shape:

```python
def indesign_com_probe(repo_root: Path) -> dict[str, Any]:
    # execute a minimal Node/winax probe
    # read app.name, app.version, app.documents.length
    # do not open/save/close documents
```

Return:

```json
{
  "checked": true,
  "available": true,
  "appName": "Adobe InDesign",
  "version": "20.x",
  "documentsCount": 0
}
```

On failure, return checked/available false inside health data if the health command itself still completed. Use CLI failure only when the probe process cannot run at all due to CLI-side errors.

- [ ] **Step 3: Keep `--deep` non-connecting**

Assert in tests that `health(deep=True, connect_indesign=False)` marks COM as `checked:false` or absent. It must not connect to InDesign.

- [ ] **Step 4: Run tests**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
```

Expected: health flag tests pass without requiring real InDesign.

- [ ] **Step 5: Commit**

```powershell
git add agent-harness\cli_anything\indesign\core\health.py agent-harness\cli_anything\indesign\indesign_cli.py agent-harness\cli_anything\indesign\tests\test_core.py
git commit -m "feat(cli): add explicit InDesign COM health probe"
```

## Task 7: Plugin Contract Hardening

**Files:**
- Modify: `agent-harness/cli_anything/indesign/core/plugins/manifest.py`
- Modify: `agent-harness/cli_anything/indesign/core/plugins/validate.py`
- Modify: `agent-harness/cli_anything/indesign/core/plugins/backend.py`
- Modify: `agent-harness/cli_anything/indesign/core/plugins/host_actions.py`
- Modify: `agent-harness/cli_anything/indesign/core/catalog.py`
- Modify: `agent-harness/cli_anything/indesign/tests/fixtures/plugins/fake-html-plugin/manifest.json`
- Modify: `agent-harness/cli_anything/indesign/tests/fixtures/plugins/fake-html-plugin/index.js`
- Modify: `agent-harness/cli_anything/indesign/tests/test_core.py`

- [ ] **Step 1: Extend fake plugin manifest**

Add required fields:

```json
{
  "timeout_default_ms": 30000,
  "document_state_policy": "host_reported",
  "host_actions": ["script.run", "export.verify", "session.show"]
}
```

Each fake plugin tool must include metadata equivalent to catalog fields: preconditions, side effects, return example, failure example.

- [ ] **Step 2: Validate plugin manifest contract**

`plugin validate` must fail if required fields are missing:

- `timeout_default_ms`
- `document_state_policy`
- `host_actions`

Failure code: `PLUGIN_MANIFEST_INVALID`.

- [ ] **Step 3: Validate plugin tool contract**

Each plugin tool from `tools/list` must include:

- `side_effects`
- `artifact_kinds`
- `needs_indesign`
- `preconditions`
- `return_example`
- `failure_example`

Fail validation for missing fields, but do not crash unrelated non-plugin CLI commands.

- [ ] **Step 4: Apply timeout to plugin calls**

`PluginBackend` must accept timeout seconds from router/CLI and convert plugin timeout to `TIMEOUT` with `state_uncertain:true`.

- [ ] **Step 5: Host actions keep allowlist**

Confirm host actions are still limited to:

```python
{"script.run", "export.verify", "session.show"}
```

Reject any other action with `PLUGIN_HOST_ACTION_FORBIDDEN`.

- [ ] **Step 6: Session records plugin metadata**

Plugin calls record:

- `plugin`
- `tool_id`
- `duration_ms`
- `error_code`
- `artifacts`
- `documentState`
- `state_uncertain`

- [ ] **Step 7: Run tests**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
```

Expected: fake plugin passes; broken fixture missing `document_state_policy` fails validation; plugin timeout returns `TIMEOUT`.

- [ ] **Step 8: Commit**

```powershell
git add agent-harness\cli_anything\indesign\core\plugins agent-harness\cli_anything\indesign\core\catalog.py agent-harness\cli_anything\indesign\tests
git commit -m "fix(plugin): enforce host contract metadata"
```

## Task 8: Batch Runner

**Files:**
- Create: `agent-harness/cli_anything/indesign/core/batch.py`
- Modify: `agent-harness/cli_anything/indesign/indesign_cli.py`
- Modify: `agent-harness/cli_anything/indesign/core/catalog.py`
- Modify: `agent-harness/cli_anything/indesign/core/router.py`
- Modify: `agent-harness/cli_anything/indesign/tests/test_core.py`

- [ ] **Step 1: Add CLI primitive metadata**

Add `tool.batch` to `CLI_PRIMITIVES` with:

```python
{
  "id": "tool.batch",
  "domain": "tool",
  "name": "batch",
  "one_line_purpose": "按 JSON plan 顺序执行多个工具调用，失败时停止并返回 failed_step",
  "arg_names": ["plan", "on_error", "timeout_ms"],
  "source": "cli",
  "callable": True,
  "side_effects": ["session_write"],
  "mutates_document": True,
  "returns_artifacts": True
}
```

- [ ] **Step 2: Implement `batch.py`**

Function shape:

```python
def run_batch(router: Router, plan_path: Path, *, on_error: str = "stop") -> dict[str, Any]:
    payload = load_json_object(plan_path)
    steps = payload.get("steps")
    if not isinstance(steps, list):
        raise CliError("Batch plan steps must be a list", code="BATCH_PLAN_INVALID")
    ...
```

Each step must require:

- `id`
- `type: "tool"`
- `tool`
- `args` object

- [ ] **Step 3: Stop on first failure**

When a step raises `CliError`, return a top-level data object:

```json
{
  "ok": false,
  "failed_step": "step-id",
  "steps": [...],
  "state_uncertain": true,
  "cleanup_suggestions": ["Inspect session doctor before retrying mutating steps."]
}
```

The outer CLI envelope should be `ok:false`.

- [ ] **Step 4: Wire parser**

Add:

```powershell
indesign-cli tool batch --plan .\batch.json --on-error stop --timeout-ms 120000
```

Only support `--on-error stop`.

- [ ] **Step 5: Run tests**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
```

Expected: batch tests pass.

- [ ] **Step 6: Commit**

```powershell
git add agent-harness\cli_anything\indesign\core\batch.py agent-harness\cli_anything\indesign\indesign_cli.py agent-harness\cli_anything\indesign\core\catalog.py agent-harness\cli_anything\indesign\core\router.py agent-harness\cli_anything\indesign\tests\test_core.py
git commit -m "feat(cli): add resumable batch runner"
```

## Task 9: Node Response Semantics Red Tests And Utility

**Files:**
- Create: `tests/test-response-semantics.js`
- Modify: `src/utils/stringUtils.js`
- Modify: `tests/index.js`

- [ ] **Step 1: Add Node red tests**

Create `tests/test-response-semantics.js` using Node `assert`.

Test cases:

```javascript
import assert from 'node:assert/strict';
import { formatScriptResult } from '../src/utils/stringUtils.js';

assert.equal(formatScriptResult('No document open', 'Get Document Info').success, false);
assert.equal(formatScriptResult('Error creating rectangle: x', 'Create Rectangle').success, false);
assert.equal(formatScriptResult(JSON.stringify({ success: false, error: 'x' }), 'Operation').success, false);
assert.equal(formatScriptResult('Document created', 'Create Document').success, true);
```

- [ ] **Step 2: Verify red**

Run:

```powershell
node tests\test-response-semantics.js
```

Expected: fails because `formatScriptResult` does not exist.

- [ ] **Step 3: Implement `formatScriptResult`**

In `src/utils/stringUtils.js`, add a function that:

- Parses JSON strings.
- Returns parsed object when it already contains `success` or `ok`.
- Converts known legacy failure strings to `success:false`.
- Keeps normal strings as `success:true`.

Return shape:

```javascript
{
  success: false,
  operation,
  code: 'NO_ACTIVE_DOCUMENT',
  result: 'No document open',
  timestamp: new Date().toISOString()
}
```

- [ ] **Step 4: Update `formatResponse`**

Make `formatResponse(result, operation)` delegate to `formatScriptResult(result, operation)` so old handlers benefit without broad edits.

- [ ] **Step 5: Add to test runner**

Update `tests/index.js` so `node tests/index.js --required` includes `test-response-semantics.js`.

- [ ] **Step 6: Run tests**

Run:

```powershell
node tests\test-response-semantics.js
node tests\index.js --required
```

Expected: response semantics tests pass; required suite matches baseline except fixed semantics.

- [ ] **Step 7: Commit**

```powershell
git add src\utils\stringUtils.js tests\test-response-semantics.js tests\index.js
git commit -m "fix(server): classify handler failure responses"
```

## Task 10: Classic Handler Structured Returns And Document Safety

**Files:**
- Modify: `src/handlers/documentHandlers.js`
- Modify: `src/handlers/graphicsHandlers.js`
- Modify: `src/handlers/textHandlers.js`
- Modify: `src/handlers/exportHandlers.js`
- Modify: `src/handlers/advancedTemplateHandlers.js`
- Modify: `src/types/toolDefinitionsDocument.js`
- Modify: `src/types/toolDefinitionsExport.js`
- Modify: `src/types/toolDefinitionsAdvancedTemplates.js`

- [ ] **Step 1: Fix `create_rectangle` corner radius**

Replace `rectangle.cornerRadius` usage with per-corner properties:

```javascript
rectangle.topLeftCornerRadius = cornerRadius;
rectangle.topRightCornerRadius = cornerRadius;
rectangle.bottomLeftCornerRadius = cornerRadius;
rectangle.bottomRightCornerRadius = cornerRadius;
```

Wrap each optional property set in JSX-side guarded assignment so unsupported versions create a warning instead of failing object creation.

- [ ] **Step 2: Add object locator payloads**

For create/edit/place tools, returned `data` must include:

```json
{
  "itemId": 123,
  "constructorName": "Rectangle",
  "pageIndex": 0,
  "bounds": [20, 20, 80, 120],
  "label": "agent-created-..."
}
```

Keep old `result` summary.

- [ ] **Step 3: Add document state payloads**

For document/template/export tools, returned `data.documentState` must include:

- `documentsCount`
- `activeDocumentName`
- `activeDocumentPathKnown`
- `modified`
- `targetWasExplicit`
- `state_uncertain`

- [ ] **Step 4: Guard dangerous document operations**

For close/save/export/package:

- If multiple documents are open and no explicit target is supplied, return structured failure with `code:"DOCUMENT_TARGET_AMBIGUOUS"` for close/save-overwrite operations.
- Export may warn when using implicit active document, but must report the target document state.

- [ ] **Step 5: Align `export_images` schema with implementation**

If implementation remains JPEG-only:

- Remove PNG from schema enum.
- Reject `format:"PNG"` with `ARTIFACT_FORMAT_UNSUPPORTED`.
- Return `artifacts[]` with `.jpg` paths and `kind:"image/jpeg"`.

- [ ] **Step 6: Template inspect state**

`inspect_template_blueprint` must return:

```json
{
  "documentState": {
    "openedDocument": true,
    "closedAfterInspect": true,
    "activeDocumentRequiredForNextStep": true,
    "activeDocumentBefore": "...",
    "activeDocumentAfter": "..."
  }
}
```

- [ ] **Step 7: Run syntax and schema checks**

Run:

```powershell
node --check src\handlers\documentHandlers.js
node --check src\handlers\graphicsHandlers.js
node --check src\handlers\textHandlers.js
node --check src\handlers\exportHandlers.js
node --check src\handlers\advancedTemplateHandlers.js
node scripts\validate_schemas.js
node scripts\check_duplicates.mjs
```

Expected: all pass.

- [ ] **Step 8: Commit**

```powershell
git add src\handlers src\types
git commit -m "fix(server): return structured InDesign tool results"
```

## Task 11: Real InDesign Smoke Runner

**Files:**
- Create: `tests/real-e2e/run-agent-ux-hardening.mjs`
- Create: `tests/real-e2e/validators/agent-ux-hardening.jsx`
- Modify: `tests/real-e2e/README.md`

- [ ] **Step 1: Build isolated run directory**

Use existing `tests/real-e2e/lib/run-dir.mjs`. The runner must create:

```text
.indesign-e2e-runs/YYYYMMDD_HHMM_agent_ux_hardening/
```

The directory remains ignored by git.

- [ ] **Step 2: Implement scenario commands**

The runner must execute:

```powershell
indesign-cli server health --deep --connect-indesign
indesign-cli tool call document.create_document --args-file create-document.json
indesign-cli tool call document.get_document_info
indesign-cli tool call graphics.create_rectangle --args-file rectangle.json
indesign-cli tool call text.create_text_frame --args-file text-frame.json
indesign-cli tool call export.export_images --args-file export-jpeg.json
indesign-cli tool call export.export_images --args-file export-png.json
indesign-cli script run wrapper-fail.jsx --timeout-ms 120000
indesign-cli tool batch --plan batch.json --on-error stop --timeout-ms 120000
indesign-cli session doctor
```

Expected:

- JPEG export succeeds and returns artifacts.
- PNG export fails with `ARTIFACT_FORMAT_UNSUPPORTED`.
- wrapper failure returns `INDESIGN_SCRIPT_FAILED` with step.
- batch returns step results.

- [ ] **Step 3: Add multi-document safety check**

Create or open two test documents, then call close without explicit target. Expected:

```json
{
  "ok": false,
  "error": {"code": "DOCUMENT_TARGET_AMBIGUOUS"}
}
```

Close only the documents created by the runner at the end. Do not close user documents.

- [ ] **Step 4: Emit machine-readable report**

Write:

```text
coverage-report.json
agent-ux-hardening-report.json
```

Report must include each spec requirement id or short name and pass/fail evidence.

- [ ] **Step 5: Run smoke**

Run only when InDesign is available:

```powershell
node tests\real-e2e\run-agent-ux-hardening.mjs --offline
```

Expected: pass. If InDesign is unavailable, do not claim this task complete.

- [ ] **Step 6: Commit**

```powershell
git add tests\real-e2e\run-agent-ux-hardening.mjs tests\real-e2e\validators\agent-ux-hardening.jsx tests\real-e2e\README.md
git commit -m "test(e2e): cover agent UX hardening flows"
```

## Task 12: Skill, README, AGENTS, And Plan/Spec Index Updates

**Files:**
- Modify: `skills/indesign-cli/SKILL.md`
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `AGENTS.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Update Skill guardrails**

Keep Skill Chinese. Add concise rules:

- Prefer `pwsh.exe -NoProfile -ExecutionPolicy Bypass -File` for `.ps1`.
- Prefer `--args-file` for JSON with Chinese, UNC, spaces, or backslashes.
- Before save/close/export/overwrite, check document state.
- Multiple open documents means do not rely on implicit active document.
- Complex JSX must use the wrapper and return JSON.
- Timeout on mutating operation means inspect `session doctor` before retry.
- Multi-step low-risk tool calls can use `tool batch`; complex layout still uses one JSX file.

- [ ] **Step 2: Update README files**

README should explain human-facing facts only:

- `--connect-indesign` is the real COM probe.
- Tool outputs are structured.
- `export_images` supports only the actually implemented formats.
- Plugins must pass `plugin validate` and use host contract.
- Skill is manually installable from `skills/indesign-cli/SKILL.md`.

- [ ] **Step 3: Update AGENTS developer contract**

Keep AGENTS developer-oriented. Add only:

- CLI contract changes require test + README + Skill sync.
- Do not put Agent usage tutorials in AGENTS.
- Plugin tools must obey the same envelope/session/schema/document-state contract.

- [ ] **Step 4: Update docs index**

Add links to:

- `docs/superpowers/specs/2026-07-01-indesign-cli-agent-ux-hardening-design.md`
- `docs/superpowers/plans/2026-07-01-indesign-cli-agent-ux-hardening-plan.md`

- [ ] **Step 5: Search for stale wording**

Run:

```powershell
rg -n "148|Skill 安装能力|powershell -File|export_images.*PNG|PNG.*export_images" README.md README.en.md AGENTS.md docs skills
```

Expected: only intentional negative mentions remain, such as “do not use `powershell -File`”.

- [ ] **Step 6: Commit**

```powershell
git add skills\indesign-cli\SKILL.md README.md README.en.md AGENTS.md docs\README.md docs\superpowers\plans\2026-07-01-indesign-cli-agent-ux-hardening-plan.md docs\superpowers\specs\2026-07-01-indesign-cli-agent-ux-hardening-design.md
git commit -m "docs: document indesign-cli agent UX contract"
```

## Task 13: Final Verification And Report Closure

**Files:**
- Read: all changed files
- No source edits unless verification exposes a concrete failure

- [ ] **Step 1: Run Python tests**

Run:

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
```

Expected: pass.

- [ ] **Step 2: Run Node checks**

Run:

```powershell
node scripts\validate_schemas.js
node scripts\check_duplicates.mjs
node tests\index.js --required
```

Expected: pass.

- [ ] **Step 3: Run real InDesign smoke**

Run only with InDesign available:

```powershell
node tests\real-e2e\run-agent-ux-hardening.mjs --offline
```

Expected: pass and report generated in ignored E2E run directory.

- [ ] **Step 4: Build package**

Run:

```powershell
python -m build
```

Expected: pass.

- [ ] **Step 5: Diff hygiene**

Run:

```powershell
git diff --check
git status --short --branch
```

Expected: no whitespace errors. Only intended files are modified. Ignored E2E outputs are not staged.

- [ ] **Step 6: Produce closure summary**

In final implementation summary, map every report category:

- P0 false success and no active document
- P1 args, template state, export format, structured returns, PowerShell, JSX wrapper, duration, health
- P2 session, schema metadata, plugin contract, batch, docs

Include exact verification commands and outcomes.

## Self-Review

- Spec coverage: every section in `2026-07-01-indesign-cli-agent-ux-hardening-design.md` maps to at least one task above.
- Red-flag scan: this plan gives concrete file paths, commands, expected outcomes, and implementation shapes.
- Type consistency: all new recurring names are stable: `state_uncertain`, `next_action`, `documentState`, `artifacts`, `--args-file`, `--timeout-ms`, `tool explain`, `agent quickstart`, `session doctor`, `tool batch`.
