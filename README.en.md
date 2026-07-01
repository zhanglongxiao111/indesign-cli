# 🎨 indesign-cli

[中文](./README.md) | **English**

An Agent-friendly CLI for controlling Adobe InDesign.

`indesign-cli` wraps real InDesign automation behind a stable command-line interface. AI agents can discover available tools, run JSX scripts, call layout operations, verify exported files, and use a project-level Skill when installed manually.

The CLI currently exposes **147 callable capabilities**, covering most commonly automated InDesign features: documents, pages, spreads, masters, layers, text, images, basic graphics, styles, exports, Book, Presentation, template slots, JSX execution, and environment checks.

It is designed for projects such as **AI-generated design decks, architecture presentations, brand manuals, template-driven publishing, and HTML-to-InDesign pipelines**.

## ✨ What problem does it solve?

Adobe InDesign is powerful, but it is not easy for AI agents to use directly:

- There are many operations, and agents need a compact way to discover them.
- JSX execution needs reliable input, output, and error handling.
- Large MCP tool lists consume too much context.
- Export success should be verified by artifacts, not by assumptions.

`indesign-cli` provides a practical bridge between AI projects and real Adobe InDesign.

One of its main benefits is **token efficiency**: agents do not need to load all 147 full tool descriptions into context. They can start with compact `tool domains` summaries, then load only the relevant details through `tool search`, `tool list`, and `tool schema`.

It is not a manual layout CLI for humans, and it is not a new layout engine. It is an execution layer for agents that need to automate InDesign safely.

## 🚀 Quick install

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
indesign-cli --json --pretty server health --deep --connect-indesign
```

If the response contains `ok: true` and `data.indesign_com.checked` is `true`, the real InDesign COM path has been probed read-only.

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

### 🧰 Capability coverage

`indesign-cli` currently exposes **147 callable capabilities**, covering most commonly automated InDesign features and agent-facing workflows:

- Documents, pages, spreads, masters, and layers
- Text frames, tables, images, basic shapes, and page items
- Paragraph styles, character styles, object styles, and swatches
- PDF / IDML / image export and artifact verification
- Book, Presentation, template slots, and advanced template filling
- JSX execution, session hints, and environment checks

These capabilities are discoverable by domain through the CLI, so they do not have to occupy the agent context all at once.

### 📜 Run JSX scripts

```powershell
indesign-cli --json --pretty script run test\workspace\probe.jsx
```

Long builds or exports can use a longer script-channel timeout:

```powershell
indesign-cli --json --pretty script run test\workspace\build.jsx --timeout-ms 900000
```

Short probes can also be passed through stdin:

```powershell
Get-Content test\workspace\probe.jsx | indesign-cli --json --pretty script run --stdin
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

## 🧪 Example workflow

```powershell
indesign-cli --json --pretty server health --deep --connect-indesign
indesign-cli tool domains
indesign-cli tool search --query "template"
indesign-cli tool schema template.populate_template_slots
indesign-cli tool explain template.populate_template_slots
indesign-cli --json --pretty script run test\workspace\build.jsx
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
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
node scripts\validate_schemas.js
node scripts\check_duplicates.mjs
node tests\index.js --required
```

## 📁 Repository layout

```text
.
├─ agent-harness/   # Python CLI and CLI tests
├─ src/             # MCP server, InDesign handlers, JSX/COM execution
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
