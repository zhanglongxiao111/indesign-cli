# 🎨 indesign-cli

[中文](./README.md) | **English**

An Agent-friendly CLI for controlling Adobe InDesign.

`indesign-cli` wraps real InDesign automation behind a stable command-line interface. AI agents can discover available tools, run JSX scripts, call layout operations, verify exported files, and use a project-level Skill when installed manually.

The Node-backed registry currently contains **150 InDesign tools**. The CLI also overlays native commands such as `server.*`, `session.*`, `script.run`, `export.verify`, `tool.batch`, `feedback.report`, plus project plugin tools. Use `tool domains` / `tool list` for the live catalog. The built-in coverage includes documents, pages, spreads, masters, layers, text, images, basic graphics, styles, exports, Book, Presentation, template slots, JSX execution, and environment checks.

It is designed for projects such as **AI-generated design decks, architecture presentations, brand manuals, template-driven publishing, and HTML-to-InDesign pipelines**.

## ✨ What problem does it solve?

Adobe InDesign is powerful, but it is not easy for AI agents to use directly:

- There are many operations, and agents need a compact way to discover them.
- JSX execution needs reliable input, output, and error handling.
- Large MCP tool lists consume too much context.
- Export success should be verified by artifacts, not by assumptions.

`indesign-cli` provides a practical bridge between AI projects and real Adobe InDesign.

One of its main benefits is **token efficiency**: agents do not need to load every full tool description into context. They can start with compact `tool domains` summaries, then load only the relevant details through `tool search`, `tool list`, and `tool schema`. Output is compact single-line JSON by default; add `--pretty` for human inspection.

It is not a manual layout CLI for humans, and it is not a new layout engine. It is an execution layer for agents that need to automate InDesign safely.

## 🚀 Quick install

### Internal agent distribution

For managed workstations and unattended agents, prefer the single-file bootstrapper instead of installing Node, npm, or compiling `winax` on every machine:

```powershell
Copy-Item "\\server\tools\indesign-cli\bootstrap\indesign-cli-agent.exe" "$env:TEMP\indesign-cli-agent.exe" -Force
& "$env:TEMP\indesign-cli-agent.exe" run --source "\\server\tools\indesign-cli\latest.json" -- server health --deep --connect-indesign
```

`indesign-cli-agent.exe` extracts its embedded Node runtime, server files, and prebuilt `winax` into `%LOCALAPPDATA%\indesign-cli\`. Every `run` checks `latest.json` first; if a newer version exists, it updates before executing the requested command.

Build entry for the single-file bootstrapper:

```powershell
python scripts\build_agent_bootstrapper.py --node-root D:\node-v20-win-x64 --node-modules D:\indesign-cli-server\node_modules --output-dir dist-agent
```

The PyPI flow below remains available for developers and open-source users.

### 1. Requirements

- Windows
- Adobe InDesign desktop: 2024-2026 recommended. The CLI probes 2022-2026, CC ProgIDs, and the generic `InDesign.Application` COM entry; actual availability depends on local COM registration.
- Node.js 18+
- Python 3.10+

InDesign must run in the same Windows user session as the CLI.

### 2. Install from PyPI

```powershell
pip install indesign-cli
```

### 3. Install Node dependencies

```powershell
indesign-cli server setup
```

This installs the bundled Node server dependencies, including `winax`.

### 4. Check the environment

```powershell
indesign-cli --pretty server health --deep --connect-indesign
```

If the response contains `ok: true` and `data.indesign_com.checked` is `true`, the real InDesign COM path has been probed read-only.

### 5. Troubleshooting common environment issues

The `server health` output includes toolchain diagnostics: `python` (interpreter, user package dirs, package location), `node` / `npm` (path and version), `server_root` (source and long-path risk), and whether the current directory is a UNC path. Start there when the environment misbehaves.

**`ModuleNotFoundError: No module named 'cli_anything'`**

The `indesign-cli.exe` entry point and the Python user package directory are out of sync, typically because a sandbox or managed agent runtime redirected `APPDATA` / `USERPROFILE`. Inspect the user package dirs:

```powershell
python -c "import site; print(site.getuserbase()); print(site.getusersitepackages())"
```

If they point into a temp directory, pin `PYTHONUSERBASE` to the real user directory or a stable short path, then reinstall with `pip install indesign-cli`.

**`winax` build failures (e.g. `error C1083`)**

`server setup` compiles the native module `winax` with MSVC, which is fragile under very long paths (deeply nested temp directories). Pin the server directory to a stable short path:

```powershell
# 1. Locate the current server root
python -c "from cli_anything.indesign.core.runtime import resolve_server_root; print(resolve_server_root())"
# 2. Copy the whole directory to a short path, e.g. D:\indesign-cli-server
# 3. Point the CLI at it and reinstall dependencies
setx INDESIGN_CLI_SERVER_ROOT "D:\indesign-cli-server"
indesign-cli server setup
```

`INDESIGN_CLI_SERVER_ROOT` must point to a directory containing `package.json`, `src/index.js`, and `src/advanced/index.js`. This is also the recommended prebuilt pattern: build `winax` once and reuse it across sessions and managed environments instead of recompiling every time.

**`npm` unusable (broken Volta / nvm shim)**

`server setup` probes the `npm` found on PATH first; if the probe fails it falls back to the `npm-cli.js` bundled with Node. If neither works it fails with `NPM_NOT_AVAILABLE`, and the local Node / npm installation needs fixing first.

## 🧠 Manually install the Agent Skill

If you want agents in another project to know how to use `indesign-cli`, copy the Skill document manually.

The source file in this repository is:

```text
skills/indesign-cli/SKILL.md
```

If you installed the CLI from PyPI, locate the packaged copy with:

```powershell
python -c "from cli_anything.indesign.core.runtime import skill_source_path; print(skill_source_path())"
```

Copy that file to the target project:

```text
D:\AI\your-project\.codex\skills\indesign-cli\SKILL.md
```

The CLI no longer auto-copies the Skill. After the manual copy, agents working in that project can use the InDesign CLI with the right workflow guidance.

## 🧩 Plugin integration

`indesign-cli` supports project-level plugins, so higher-level projects can expose their own capabilities through the same tool catalog. For example, an HTML-to-InDesign project can register the `html` domain and let agents use it through `tool list/schema/call`.

Local plugin example:

```powershell
indesign-cli plugin install D:\AI\html-indesign
indesign-cli plugin validate D:\AI\html-indesign
indesign-cli plugin doctor html-indesign
indesign-cli tool list --domain html
```

Plugin tools do not have to occupy the agent context by default. Agents can still inspect compact domain summaries first, then load schemas only when needed.

## 🛠️ Common capabilities

### 🔎 Discover tools

```powershell
indesign-cli tool domains
indesign-cli tool search --query "pdf"
indesign-cli tool list --domain template
indesign-cli tool schema template.populate_template_slots
```

Agents can inspect domains first, then load only the schema they need instead of spending context on every tool description.

### 🧭 Feedback and telemetry

The CLI exposes a `feedback` domain so agents can report tool gaps, unclear docs, unhelpful errors, or confusing schemas at the moment of friction:

```powershell
indesign-cli feedback report --code TOOL_GAP --note "Need a direct tool for bulk paragraph style replacement" --tool style.apply_paragraph_style
indesign-cli tool schema feedback.report
```

Shared telemetry is written only when `INDESIGN_CLI_TELEMETRY_DIR` is configured. The internal default NAS root is:

```powershell
$env:INDESIGN_CLI_TELEMETRY_DIR="\\daga-nas5\sa-ai-app\feedback-reports\indesign-cli-telemetry"
```

The CLI writes directly under `sessions/YYYY-MM-DD/*.jsonl` and `state/*.json`; `reports/` is reserved for aggregate outputs. The allowlisted fields are metadata only: `session_id`, `origin_key`, `cwd_hash`, optional agent thread/run IDs, tool id/source, success status, error code, duration, argument key names, feedback code/note, and recent-call summaries.

It does not record argument values, script bodies, document contents, customer names, full file paths, or the full working directory. The working directory is stored only as a hash. Configuration:

| Variable | Purpose |
| -------- | ------- |
| `INDESIGN_CLI_TELEMETRY_DIR` | Shared telemetry root; if unset, no shared telemetry is written |
| `INDESIGN_CLI_TELEMETRY=off` | Disable telemetry completely |
| `INDESIGN_CLI_SESSION_ID` | Explicit full telemetry session ID |
| `INDESIGN_CLI_AGENT_THREAD_ID` | Upstream agent thread ID, injected by the runtime |
| `INDESIGN_CLI_AGENT_RUN_ID` | Upstream agent run ID, injected by the runtime |
| `INDESIGN_CLI_TELEMETRY_IDLE_HOURS` | Idle rollover threshold; defaults to 8 hours |

### 🧰 Capability coverage

The built-in InDesign tools come from the `src/tools/index.js` registry and are projected one-way into `src/core/indesign-tool-registry.json` for the Python CLI. The Node-backed baseline is **classic 114 / internal 30 / advanced 6, total 150**. Internal tools appear in the CLI as `source: hidden_handler` and are not exposed directly through MCP.

The CLI catalog merges three sources:

- Node-backed artifact: `src/core/indesign-tool-registry.json`
- CLI primitives: `server.*`, `session.*`, `script.run`, `export.verify`, `tool.batch`, `feedback.report`
- Project plugins: installed and diagnosed through `plugin install/list/validate/doctor`

Together they cover most commonly automated InDesign features and agent-facing workflows:

- Documents, pages, spreads, masters, and layers
- Text frames, tables, images, basic shapes, and page items
- Paragraph styles, character styles, object styles, and swatches
- PDF / IDML / image export and artifact verification
- Book, Presentation, template slots, and advanced template filling
- JSX execution, session hints, and environment checks

These capabilities are discoverable by domain through the CLI, so they do not have to occupy the agent context all at once.

### 🧱 Registry and artifact

When adding or changing a built-in InDesign tool, do not edit `src/handlers/` or `src/types/`; both directories and the old `src/core/InDesignMCPServer.js` were removed in the terminal architecture. The standard path is:

1. Change the corresponding `src/tools/<domain>/` tool-module so the tool definition, schema, contract, handler, and CLI id stay colocated.
2. Aggregate it through the domain `index.js`; for a new domain, also aggregate it in `src/tools/index.js`.
3. Regenerate and check the artifact:

```powershell
node src\core\artifact.js --write
node src\core\artifact.js --check
```

The Python CLI reads Node-backed tools only from the artifact. A missing artifact or `registry_hash` mismatch is a hard error, so Python does not infer domains, schemas, or internal tools independently.

### 📜 Run JSX scripts

```powershell
indesign-cli --pretty script run test\workspace\probe.jsx
```

Long builds or exports can use a longer script-channel timeout (`script run` defaults to 300 seconds; `tool call` defaults to 30 seconds):

```powershell
indesign-cli --pretty script run test\workspace\build.jsx --timeout-ms 900000
```

Short probes can also be passed through stdin:

```powershell
Get-Content test\workspace\probe.jsx | indesign-cli --pretty script run --stdin
```

### 📦 Verify exports

```powershell
indesign-cli export verify output\deck.pdf
```

`export_images` currently declares and supports JPEG only. PNG/TIFF requests fail with `ARTIFACT_FORMAT_UNSUPPORTED` instead of creating misleading `.jpg` output.

### 🛡️ Document close safety

`document.close_document` does not close `activeDocument` by default when multiple documents are open. To close a test document created by the current run, pass `expectedDocumentName` or `forceActiveDocument:true`; discarding unsaved changes also requires `allowDiscard:true`.

### 🧩 Work with template slots

```powershell
indesign-cli tool call template.list_template_blueprints --args-file args.json
indesign-cli tool call template.inspect_template_blueprint --args-file args.json
indesign-cli tool call template.create_page_with_template --args-file args.json
indesign-cli tool call template.populate_template_slots --args-file args.json
```

### 📚 Book and Presentation tools

The CLI also exposes Book and Presentation-oriented capabilities, including:

- Creating and managing InDesign Book files
- Exporting Books
- Creating presentation documents
- Adding cover pages, section pages, full-bleed image pages, and image grids

Use `tool domains`, `tool list`, and `tool schema` to inspect the available commands.

### 🚨 Common error codes

Every command (including argument typos) returns the unified JSON envelope (`schema_version: 2`); on failure read `error.code`, `error.message`, and `error.hint`. Frequent codes:

| Code | Meaning | Typical fix |
| ---- | ------- | ----------- |
| `BAD_CLI_ARGS` | Missing or misspelled command-line arguments | Read `error.details.usage` or run the subcommand with `--help` |
| `ARGS_REQUIRED` / `ARGS_FILE_NOT_FOUND` / `ARGS_JSON_INVALID` / `ARGS_NOT_OBJECT` | Tool arguments missing or invalid JSON | Pass a UTF-8 JSON file via `--args-file`, or use `--args -` with stdin |
| `ARGS_UNKNOWN_KEY` | Misspelled argument key | Fix keys per `error.details.allowed` |
| `TOOL_NOT_FOUND` / `DOMAIN_NOT_FOUND` | Unknown tool or domain | Run `tool domains`, then `tool search --query <keyword>` |
| `MISSING_ARGUMENT` | Required argument missing | Check `tool schema <tool_id>` |
| `BAD_TIMEOUT` / `TIMEOUT` | Invalid timeout value / execution timed out | Timeouts accept 1-3600 seconds; after `TIMEOUT`, run `session doctor` before retrying |
| `BATCH_PLAN_*` / `BATCH_STEP_INVALID` / `BATCH_STEP_FAILED` | Batch plan format or step failure | Fix the plan per `error.details.expected_step` |
| `MCP_START_FAILED` / `MCP_TOOL_FAILED` / `INDESIGN_SCRIPT_FAILED` | Node backend or InDesign script failure | Run `server health`; inspect `error.details.result` |
| `NO_ACTIVE_DOCUMENT` | No document is open | Open or create a document first |
| `ARTIFACT_*` | Export verification failed | Confirm the export succeeded and the path points at a fresh artifact |
| `SERVER_ROOT_*` / `NPM_*` | Environment or dependency issues | See the troubleshooting section above |
| `UNEXPECTED_ERROR` | Unexpected CLI exception | Report it with `error.details` (exception type and location) |

## 🧪 Example workflow

```powershell
indesign-cli server health --deep --connect-indesign
indesign-cli tool domains
indesign-cli tool search --query "template"
indesign-cli tool schema template.populate_template_slots
indesign-cli tool explain template.populate_template_slots
indesign-cli script run test\workspace\build.jsx
indesign-cli session doctor
indesign-cli export verify output\presentation.pdf
```

The agent generates scripts and arguments. `indesign-cli` sends them to real InDesign and returns structured results.

## 💡 Who is it for?

Good fit for:

- Developers building AI agents that automate InDesign
- HTML / JSON / template-to-InDesign workflows
- Teams generating design decks, reports, catalogs, or presentation documents
- Agent workflows that need real InDesign verification

Not a good fit for:

- Manual InDesign users who only want a GUI workflow
- Backend-only environments without Adobe InDesign
- Replacing browser layout, LaTeX, or other publishing engines

## 🔧 Local development

```powershell
git clone https://github.com/zhanglongxiao111/indesign-cli.git
cd indesign-cli
pip install -e .
indesign-cli server setup
indesign-cli server health --deep
```

Run tests:

```powershell
git diff --check
node src\core\artifact.js --check
node scripts\check_architecture.mjs
node tests\architecture\registry.test.mjs
node scripts\validate_schemas.js
node scripts\check_duplicates.mjs
node tests\index.js --required
python -m pytest agent-harness\cli_anything\indesign\tests -q
```

## 📁 Repository layout

```text
.
├─ agent-harness/   # Python CLI and CLI tests
├─ src/core/        # MCP server factory, router, runtime, artifact, session and script execution
├─ src/tools/       # Domain tool-modules with schema, contract, handler, and CLI id colocated
├─ scripts/         # Maintenance and validation scripts
├─ tests/           # Tests and real InDesign E2E scenarios
├─ docs/            # Design notes, plans, collaboration records
├─ skills/          # Agent Skill source and preview assets for manual copy
├─ pyproject.toml   # pip installation entry
└─ AGENTS.md        # Project-level agent collaboration rules
```

## 🗺️ Roadmap

- Better HTML / semantic template to InDesign workflows
- More stable template slot protocols
- Stronger layout checks and export validation
- More examples and real E2E scenarios

## 📄 License

MIT
