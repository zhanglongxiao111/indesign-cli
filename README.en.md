# 🎨 indesign-cli

[中文](./README.md) | **English**

An Agent-friendly CLI for controlling Adobe InDesign.

`indesign-cli` wraps real InDesign automation behind a stable command-line interface. AI agents can discover available tools, run JSX scripts, call layout operations, verify exported files, and install a project-level Skill for repeatable InDesign workflows.

It is designed for projects such as **AI-generated design decks, architecture presentations, brand manuals, template-driven publishing, and HTML-to-InDesign pipelines**.

## ✨ What problem does it solve?

Adobe InDesign is powerful, but it is not easy for AI agents to use directly:

- There are many operations, and agents need a compact way to discover them.
- JSX execution needs reliable input, output, and error handling.
- Large MCP tool lists consume too much context.
- Export success should be verified by artifacts, not by assumptions.

`indesign-cli` provides a practical bridge between AI projects and real Adobe InDesign.

It is not a manual layout CLI for humans, and it is not a new layout engine. It is an execution layer for agents that need to automate InDesign safely.

## 🚀 Quick install

### 1. Requirements

- Windows
- Adobe InDesign desktop
- Node.js 18+
- Python 3.10+

InDesign must run in the same Windows user session as the CLI.

### 2. Install from GitHub

```powershell
pip install "git+https://github.com/zhanglongxiao111/indesign-cli.git"
```

### 3. Install Node dependencies

```powershell
indesign-cli server setup
```

This installs the bundled Node server dependencies, including `winax`.

### 4. Check the environment

```powershell
indesign-cli --json --pretty server health
```

If the response contains `ok: true`, the base CLI environment is ready.

## 🧠 Install the Agent Skill into another project

```powershell
indesign-cli skill install --target D:\AI\your-project
```

This writes:

```text
D:\AI\your-project\.codex\skills\indesign-cli\SKILL.md
```

Agents working in that project can then use the InDesign CLI with the right workflow guidance.

## 🛠️ Common capabilities

### 🔎 Discover tools

```powershell
indesign-cli tool domains
indesign-cli tool search --query "pdf"
indesign-cli tool list --domain template
indesign-cli tool schema template.populate_template_slots
```

### 📜 Run JSX scripts

```powershell
indesign-cli --json --pretty script run test\workspace\probe.jsx
```

Short probes can also be passed through stdin:

```powershell
Get-Content test\workspace\probe.jsx | indesign-cli --json --pretty script run --stdin
```

### 📦 Verify exports

```powershell
indesign-cli export verify output\deck.pdf
```

### 🧩 Work with template slots

```powershell
indesign-cli tool call template.list_template_blueprints --args args.json
indesign-cli tool call template.inspect_template_blueprint --args args.json
indesign-cli tool call template.create_page_with_template --args args.json
indesign-cli tool call template.populate_template_slots --args args.json
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
indesign-cli --json --pretty server health
indesign-cli tool domains
indesign-cli tool search --query "template"
indesign-cli tool schema template.populate_template_slots
indesign-cli --json --pretty script run test\workspace\build.jsx
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
indesign-cli server health
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
├─ agent-harness/   # Python CLI, bundled Skill, CLI tests
├─ src/             # MCP server, InDesign handlers, JSX/COM execution
├─ scripts/         # Maintenance and validation scripts
├─ tests/           # Tests and real InDesign E2E scenarios
├─ docs/            # Design notes, plans, collaboration records
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
