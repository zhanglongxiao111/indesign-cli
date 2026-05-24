# indesign-cli

面向 Agent 的 Adobe InDesign CLI。它把本仓库已有的 MCP server、Windows COM、ExtendScript/JSX 执行链路包装成按需命令，让 Agent 可以发现工具、调用 InDesign 能力、执行脚本、验证导出物，并把配套 skill 安装到其他项目。

这个项目不是给人类手敲排版命令用的，也不是重新实现一套 InDesign 自动化。它的重点是给 Agent 一个稳定、省上下文、可脚本化的入口。

## 能做什么

- 发现工具域、搜索工具、读取工具 schema。
- 调用已有 MCP/handler 能力。
- 执行 `.jsx` 文件或短 stdin 探针。
- 验证 PDF、IDML 等导出产物。
- 安装 `indesign-cli` skill 到目标项目。
- 使用高级模板能力读取母版槽位、创建模板页、填充文本和图片。
- 暴露当前未作为 MCP 工具公开的 Book / Presentation handler 能力。

## 环境要求

- Windows。
- Adobe InDesign 已安装，并和 CLI 在同一用户会话中运行。
- Node.js 18 及以上。
- Python 3.10 及以上。

## 安装

远程安装：

```powershell
pip install "git+https://github.com/zhanglongxiao111/indesign-cli.git"
indesign-cli server setup
indesign-cli server health
```

`server setup` 会在 CLI 打包的 Node server 目录中执行 `npm install`，用于安装 `@modelcontextprotocol/sdk` 和 `winax` 等依赖。

本地开发安装：

```powershell
git clone https://github.com/zhanglongxiao111/indesign-cli.git
cd indesign-cli
pip install -e .
indesign-cli server setup
indesign-cli server health
```

旧命令 `cli-anything-indesign` 仍然保留为兼容别名，新项目统一使用 `indesign-cli`。

## 给其他项目安装 skill

在目标项目中执行：

```powershell
indesign-cli skill install --target D:\AI\html-indesign
```

它会写入：

```text
D:\AI\html-indesign\.codex\skills\indesign-cli\SKILL.md
```

目标项目的 Agent 之后会自动知道如何使用 `indesign-cli`。

## 常用命令

健康检查：

```powershell
indesign-cli --json --pretty server health
```

发现能力：

```powershell
indesign-cli tool domains
indesign-cli tool search --query "pdf"
indesign-cli tool list --domain template
indesign-cli tool schema template.populate_template_slots
```

调用工具：

```powershell
indesign-cli --json --pretty tool call export.verify --args args.json
```

执行 JSX：

```powershell
indesign-cli --json --pretty script run test\workspace\probe.jsx
```

短探针可以走 stdin：

```powershell
Get-Content test\workspace\probe.jsx | indesign-cli --json --pretty script run --stdin
```

验证导出物：

```powershell
indesign-cli export verify output\deck.pdf
```

## 高级模板常用流程

```powershell
indesign-cli tool call template.list_template_blueprints --args args.json
indesign-cli tool call template.inspect_template_blueprint --args args.json
indesign-cli tool call template.create_page_with_template --args args.json
indesign-cli tool call page.get_page_information --args args.json
indesign-cli tool call template.populate_template_slots --args args.json
```

槽位名必须以 `inspect_template_blueprint` 或 `page.get_page_information` 返回结果为准，不要凭视觉猜。

## 状态模型

- CLI 不启动常驻服务；每次调用按需启动 Node MCP/bridge 子进程，调用完退出。
- InDesign 进程和打开文档可以连续存在。
- Node 子进程内存不会跨命令保留。
- 连续操作要依赖 JSON 返回值、显式文件路径、InDesign 文档状态、脚本标签，或当前目录 `.indesign-cli/session.json`。
- JSX 返回 `JSON.stringify(...)` 时，CLI 会额外解析为 `data.result_json`，Agent 应优先读取这个字段。

## 仓库结构

```text
.
├─ agent-harness/   # Python CLI、内置 skill、CLI 测试
├─ src/             # MCP server、handler、ExtendScript/COM 执行链路
├─ scripts/         # 维护脚本和轻量检查
├─ tests/           # 单元、场景和真实 InDesign E2E
├─ docs/            # 当前文档、方案、计划、审查和历史资料
├─ pyproject.toml   # 远程 pip 安装入口
└─ AGENTS.md        # 项目级 Agent 协作规则
```

## 验证

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
node scripts\validate_schemas.js
node scripts\check_duplicates.mjs
node tests\index.js --required
```

真实 InDesign E2E 依赖本机 InDesign 和 COM 会话：

```powershell
node tests\real-e2e\run-architecture-presentation.mjs --full --offline
```

## 文档

- `AGENTS.md`：项目级协作入口和硬规则。
- `docs/README.md`：文档目录索引。
- `docs/superpowers/specs/`：方案设计。
- `docs/superpowers/plans/`：实施计划。
- `docs/AI协作/`：Agent 协作过程材料。

## 许可

MIT。详见 `LICENSE`。
