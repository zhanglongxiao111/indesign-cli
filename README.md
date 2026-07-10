# 🎨 indesign-cli

**中文** | [English](./README.en.md)

让 AI Agent 直接操作 Adobe InDesign 的命令行工具。

`indesign-cli` 把 InDesign 的自动化能力包装成 Agent 友好的 CLI：Agent 可以查询工具、执行 JSX 脚本、调用排版能力、验证导出文件，并按需配合项目级 Skill 使用。

当前 Node-backed registry 固定包含 **150 个 InDesign 工具**，CLI 还叠加 `server.*`、`session.*`、`script.run`、`export.verify`、`tool.batch`、`feedback.report` 等原生命令和项目插件工具。实时可见能力以 `tool domains` / `tool list` 输出为准，覆盖文档、页面、跨页、母版、图层、文本、图片、基础图形、样式、导出、Book、Presentation、模板槽位、脚本执行和环境检查。

如果你正在做 **AI 生成画册、建筑汇报、品牌手册、版式模板、HTML 转 InDesign** 这类项目，它可以让 Agent 不再靠“猜坐标”和“手搓脚本”工作，而是通过稳定的命令和结构化返回值操作真实 InDesign。

## ✨ 这个项目解决什么问题？

Adobe InDesign 很强，但对 AI Agent 来说并不好用：

- 工具能力多，Agent 不知道该调用哪个。
- JSX 脚本可以执行，但调试、传参、返回值和错误处理都很散。
- MCP 工具很多，直接塞进上下文会占用大量 token。
- 真实导出物是否成功，不能只靠“命令没报错”判断。

`indesign-cli` 做的事情很简单：**把真实 InDesign 自动化能力变成 Agent 更容易使用的一组命令。**

它的关键价值之一是 **省 token**：Agent 不需要一次性读取上百个工具的完整描述，可以先看 `tool domains` 的摘要，再用 `tool search`、`tool list`、`tool schema` 按需加载当前任务需要的工具说明。输出默认是紧凑单行 JSON，需要人工查看时加 `--pretty`。

它不是一个给人类手动排版的 CLI，也不是一个新的排版引擎。它更像是 AI 项目和 InDesign 之间的稳定桥梁。

## 🚀 快速安装

### 事务所内部 Agent 分发

受控工位和无人值守 Agent 优先使用单文件自举入口，而不是让每台电脑安装 Node、npm 或编译 `winax`：

```powershell
indesign-cli-agent install
indesign-cli-agent server health --deep --connect-indesign
```

`indesign-cli-agent.exe` 是单文件成品入口。首次执行 `install` 会安装到当前用户目录并注册 `indesign-cli-agent` 命令；后续 Agent 直接使用 `indesign-cli-agent <indesign-cli 参数...>`。更新源由工具默认处理：NAS 优先，GitHub 兜底；更新失败但本机已有可用版本时，会继续使用本地版本并在 JSON 结果里提示。

发布单文件自举 exe 的构建入口：

```powershell
python scripts\build_agent_bootstrapper.py --node-root D:\node-v20-win-x64 --node-modules D:\indesign-cli-server\node_modules --version 0.4.1 --nas-url "\\daga-nas5\sa-ai-app\tools\indesign-cli\releases\0.4.1\indesign-cli-agent.exe" --github-url "https://github.com/zhanglongxiao111/indesign-cli/releases/download/v0.4.1/indesign-cli-agent.exe" --output-dir dist-agent
```

下面的 PyPI 安装方式保留给开发者和开源用户。

### 1. 准备环境

你需要：

- Windows
- Adobe InDesign 桌面版：推荐 2024-2026；CLI 会尝试连接 2022-2026、CC 版本和通用 `InDesign.Application` COM 入口，实际可用版本取决于本机 COM 注册
- Node.js 18+
- Python 3.10+

InDesign 需要和命令行运行在同一个 Windows 用户会话中。

### 2. 从 PyPI 安装

```powershell
pip install indesign-cli
```

### 3. 安装 Node 依赖

```powershell
indesign-cli server setup
```

这一步会安装 InDesign 自动化所需的 Node 依赖，包括 `winax`。

### 4. 检查环境

```powershell
indesign-cli --pretty server health --deep --connect-indesign
```

如果返回 `ok: true` 且 `data.indesign_com.checked` 为 `true`，真实 InDesign COM 链路已完成只读探针。

### 5. 常见环境问题排查

`server health` 的输出包含工具链诊断：`python`（解释器、用户包目录、包位置）、`node` / `npm`（路径和版本）、`server_root`（路径来源和长路径风险）、当前目录是否 UNC。排查环境问题先看这份输出。

**`ModuleNotFoundError: No module named 'cli_anything'`**

命令入口 `indesign-cli.exe` 和 Python 用户包目录不一致，常见于沙箱或受控 Agent 运行时重定向了 `APPDATA` / `USERPROFILE`。检查用户包目录：

```powershell
python -c "import site; print(site.getuserbase()); print(site.getusersitepackages())"
```

如果指向临时目录，把 `PYTHONUSERBASE` 固定到真实用户目录或稳定短路径，再重新 `pip install indesign-cli`。

**`winax` 编译失败（如 `error C1083`）**

`server setup` 需要用 MSVC 编译原生模块 `winax`，在超长路径（深层临时目录）下容易失败。解决方式是把 server 目录固定到稳定短路径：

```powershell
# 1. 定位当前 server 目录
python -c "from cli_anything.indesign.core.runtime import resolve_server_root; print(resolve_server_root())"
# 2. 把整个目录复制到短路径，例如 D:\indesign-cli-server
# 3. 指向它并重装依赖
setx INDESIGN_CLI_SERVER_ROOT "D:\indesign-cli-server"
indesign-cli server setup
```

`INDESIGN_CLI_SERVER_ROOT` 必须指向包含 `package.json`、`src/index.js`、`src/advanced/index.js` 的目录。这也是推荐的预构建模式：`winax` 构建一次，多个会话和受控环境复用，不必每次临时编译。

**`npm` 不可用（Volta / nvm shim 损坏）**

`server setup` 会先探测 PATH 上的 `npm`；探测失败时自动回退到 Node 自带的 `npm-cli.js`。两者都不可用时报 `NPM_NOT_AVAILABLE`，需要先修复本机 Node / npm 安装。

## 🧠 手动安装 Agent Skill

如果你希望某个项目里的 Agent 自动知道如何使用 `indesign-cli`，需要手动复制 Skill 文档。

Skill 源文件在仓库中：

```text
skills/indesign-cli/SKILL.md
```

如果你是通过 PyPI 安装的 CLI，可以先定位包内副本：

```powershell
python -c "from cli_anything.indesign.core.runtime import skill_source_path; print(skill_source_path())"
```

把这个文件手动复制到目标项目：

```text
D:\AI\your-project\.codex\skills\indesign-cli\SKILL.md
```

CLI 不再提供自动复制 Skill 的命令。复制完成后，该项目中的 Agent 才会获得这套 InDesign CLI 使用说明。

## 🧩 插件接入

`indesign-cli` 支持项目级插件，让上层项目把自己的高层能力接入统一工具目录。比如 HTML-to-InDesign 项目可以注册 `html` 域，Agent 再通过同一套 `tool list/schema/call` 使用它。

本地插件接入示例：

```powershell
indesign-cli plugin install D:\AI\html-indesign
indesign-cli plugin validate D:\AI\html-indesign
indesign-cli plugin doctor html-indesign
indesign-cli tool list --domain html
```

插件工具不会默认挤进 Agent 上下文。Agent 仍然先看 domain 摘要，再按需读取具体 schema。

## 🛠️ 常用能力

### 🔎 查询可用工具

```powershell
indesign-cli tool domains
indesign-cli tool search --query "pdf"
indesign-cli tool list --domain template
indesign-cli tool schema template.populate_template_slots
```

Agent 可以先查有哪些工具，再只读取需要的 schema，减少上下文浪费。

### 🧭 反馈与遥测

CLI 提供 `feedback` 域，用来在 Agent 遇到工具缺口、文档不清、错误信息不可操作或 schema 难用时留下结构化反馈：

```powershell
indesign-cli feedback report --code TOOL_GAP --note "缺少批量替换段落样式的直接工具" --tool style.apply_paragraph_style
indesign-cli tool schema feedback.report
```

通过 `indesign-cli-agent` 成品 EXE 运行时（0.4.1 起），共享遥测默认写入公司 NAS 根目录，`INDESIGN_CLI_TELEMETRY=off` 可随时关闭。pip/源码安装仍保持显式 opt-in，需要自行配置：

```powershell
$env:INDESIGN_CLI_TELEMETRY_DIR="\\daga-nas5\sa-ai-app\feedback-reports\indesign-cli-telemetry"
```

CLI 会直接写入该根目录下的 `sessions/YYYY-MM-DD/*.jsonl` 和 `state/*.json`；`reports/` 预留给后续聚合结果。记录字段只包含白名单元数据：`session_id`、`origin_key`、`cwd_hash`、可选 Agent 线程/运行 ID、工具 id/source、成功失败、错误码、耗时、参数键名、反馈 code/note 和最近调用摘要。

不会记录：参数值、脚本内容、文档内容、客户名称、完整文件路径或完整工作目录。工作目录只保存 hash。可用配置：

| 变量 | 作用 |
| ---- | ---- |
| `INDESIGN_CLI_TELEMETRY_DIR` | 共享遥测根目录；agent EXE 默认注入公司 NAS 路径，pip/源码安装未设置时不写共享遥测 |
| `INDESIGN_CLI_TELEMETRY=off` | 完全关闭遥测 |
| `INDESIGN_CLI_SESSION_ID` | 显式指定完整 telemetry session |
| `INDESIGN_CLI_AGENT_THREAD_ID` | 上层 Agent 线程 ID，由运行时注入 |
| `INDESIGN_CLI_AGENT_RUN_ID` | 上层 Agent 单次运行 ID，由运行时注入 |
| `INDESIGN_CLI_TELEMETRY_IDLE_HOURS` | 默认 session 空闲切分阈值，默认 8 小时 |

### 🧰 能力覆盖

当前 `indesign-cli` 的 InDesign 内置工具来自 `src/tools/index.js` registry，并由 `src/core/indesign-tool-registry.json` artifact 单向投影给 Python CLI。Node-backed 工具基线是 **classic 114 / internal 30 / advanced 6，合计 150**；internal 工具在 CLI 中显示为 `source: hidden_handler`，MCP 不直接暴露。

CLI 工具目录由三类来源合并：

- Node-backed artifact：来自 `src/core/indesign-tool-registry.json`
- CLI primitives：`server.*`、`session.*`、`script.run`、`export.verify`、`tool.batch`、`feedback.report`
- 项目插件：通过 `plugin install/list/validate/doctor` 动态接入

这些能力覆盖 InDesign 绝大部分常用自动化功能，以及大多数 Agent 自动化场景：

- 文档、页面、跨页、母版、图层
- 文本框、表格、图片、基础图形、页面对象
- 段落样式、字符样式、对象样式、色板
- PDF / IDML / 图片导出与产物验证
- Book、Presentation、模板槽位和高级模板填充
- JSX 脚本执行、session 线索和环境检查

这些能力通过 CLI 分域查询，不会一次性占满 Agent 上下文。

### 🧱 Registry 与 artifact

新增或修改内置 InDesign 工具时，不再编辑 `src/handlers/` 或 `src/types/`；这两个目录以及旧 `src/core/InDesignMCPServer.js` 已在终态架构中删除。标准路径是：

1. 修改对应 `src/tools/<domain>/` tool-module，让工具定义、schema、contract、handler 和 CLI id 共置。
2. 在域 `index.js` 聚合；新域再接入全局 `src/tools/index.js`。
3. 生成并校验 artifact：

```powershell
node src\core\artifact.js --write
node src\core\artifact.js --check
```

CLI 的 Node-backed 工具目录只读 artifact。artifact 缺失或 `registry_hash` 不匹配会硬失败，避免 Python 侧重新猜测 domain、schema 或隐藏工具。

### 📜 执行 JSX 脚本

```powershell
indesign-cli --pretty script run test\workspace\probe.jsx
```

适合测试真实 InDesign 行为、创建文档、检查对象、执行复杂排版逻辑。

复杂构建或导出可能超过默认等待时间，可以显式加长脚本通道超时（`script run` 默认 300 秒；`tool call` 默认 30 秒）：

```powershell
indesign-cli --pretty script run test\workspace\build.jsx --timeout-ms 900000
```

短脚本也可以从 stdin 输入：

```powershell
Get-Content test\workspace\probe.jsx | indesign-cli --pretty script run --stdin
```

### 📦 验证导出物

```powershell
indesign-cli export verify output\deck.pdf
```

用于确认 PDF、IDML 等文件真的生成成功，而不是只看命令是否结束。

`export_images` 当前只声明并支持 JPEG。传入 PNG/TIFF 会返回 `ARTIFACT_FORMAT_UNSUPPORTED`，避免生成误导性的 `.jpg` 产物。

### 🛡️ 文档关闭安全

`document.close_document` 默认不会在多文档场景关闭 `activeDocument`。如果确实要关闭本轮创建的测试文档，参数必须显式包含 `expectedDocumentName` 或 `forceActiveDocument:true`；如需丢弃未保存修改，还必须传 `allowDiscard:true`。

### 🧩 使用模板槽位

```powershell
indesign-cli tool call template.list_template_blueprints --args-file args.json
indesign-cli tool call template.inspect_template_blueprint --args-file args.json
indesign-cli tool call template.create_page_with_template --args-file args.json
indesign-cli tool call template.populate_template_slots --args-file args.json
```

适合让 Agent 基于母版、脚本标签和槽位名生成稳定页面。

### 📚 Book / Presentation 工具

`indesign-cli` 也包含 Book 和 Presentation 相关能力，例如：

- 创建和管理 InDesign Book
- 导出 Book
- 创建演示型文档
- 添加封面页、章节页、全幅图片页、图片网格页

这些能力可以通过 `tool domains`、`tool list` 和 `tool schema` 查询。

### 🚨 常见错误码速查

所有命令（含参数拼写错误）都返回统一 JSON envelope（`schema_version: 2`），失败时看 `error.code`、`error.message` 和 `error.hint`。高频错误码：

| 错误码 | 含义 | 典型处置 |
| ------ | ---- | -------- |
| `BAD_CLI_ARGS` | 命令行参数缺失或拼错 | 看 `error.details.usage`，或跑对应 `--help` |
| `ARGS_REQUIRED` / `ARGS_FILE_NOT_FOUND` / `ARGS_JSON_INVALID` / `ARGS_NOT_OBJECT` | 工具参数缺失或 JSON 无效 | 用 `--args-file` 传 UTF-8 JSON 文件，或 `--args -` 走 stdin |
| `ARGS_UNKNOWN_KEY` | 参数名拼错 | 按 `error.details.allowed` 修正键名 |
| `TOOL_NOT_FOUND` / `DOMAIN_NOT_FOUND` | 工具或域不存在 | 先 `tool domains`，再 `tool search --query <关键词>` |
| `MISSING_ARGUMENT` | 缺必填参数 | `tool schema <tool_id>` 查看必填项 |
| `BAD_TIMEOUT` / `TIMEOUT` | 超时参数非法 / 执行超时 | 超时值范围 1-3600 秒；`TIMEOUT` 后先跑 `session doctor` 再重试 |
| `BATCH_PLAN_*` / `BATCH_STEP_INVALID` / `BATCH_STEP_FAILED` | batch plan 格式或步骤失败 | 按 `error.details.expected_step` 修正 plan |
| `MCP_START_FAILED` / `MCP_TOOL_FAILED` / `INDESIGN_SCRIPT_FAILED` | Node 后端或 InDesign 脚本失败 | 跑 `server health` 排查；看 `error.details.result` |
| `NO_ACTIVE_DOCUMENT` | 没有打开的文档 | 先打开或创建文档 |
| `ARTIFACT_*` | 导出物验证失败 | 确认导出成功、路径正确、产物非旧文件 |
| `SERVER_ROOT_*` / `NPM_*` | 环境或依赖问题 | 见上文"常见环境问题排查" |
| `UNEXPECTED_ERROR` | CLI 未预期异常 | 带 `error.details`（含异常类型和位置）反馈 |

## 🧪 示例工作流

一个典型 Agent 流程可能是：

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

Agent 负责生成脚本和参数，`indesign-cli` 负责把它们安全地送进真实 InDesign，并返回结构化结果。

## 💡 适合谁使用？

适合：

- 想让 AI Agent 自动操作 InDesign 的开发者
- 正在做 HTML / JSON / 模板到 InDesign 的转换项目
- 需要自动生成设计汇报、画册、排版文档的团队
- 希望用脚本验证真实 InDesign 输出的 Agent 工作流

不适合：

- 只想手动点按钮排版的普通 InDesign 用户
- 不安装 Adobe InDesign 的纯后端环境
- 希望用它替代浏览器、LaTeX 或其他排版引擎的场景

## 🔧 本地开发

```powershell
git clone https://github.com/zhanglongxiao111/indesign-cli.git
cd indesign-cli
pip install -e .
indesign-cli server setup
indesign-cli server health --deep
```

运行测试：

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

## 📁 项目结构

```text
.
├─ agent-harness/   # Python CLI、CLI 测试
├─ src/core/        # MCP server 工厂、router、runtime、artifact、会话与脚本执行
├─ src/tools/       # domain tool-module；schema、contract、handler、CLI id 共置
├─ scripts/         # 维护脚本和检查脚本
├─ tests/           # 测试和真实 InDesign E2E
├─ docs/            # 设计文档、计划、协作记录
├─ skills/          # 可手动复制到其他项目的 Agent Skill 和预览资产
├─ pyproject.toml   # pip 安装入口
└─ AGENTS.md        # 项目级 Agent 协作规则
```

## 🗺️ 下一步方向

项目后续会重点完善：

- 更稳定的 HTML / 语义模板到 InDesign 转换链路
- 更好用的模板槽位协议
- 更适合 Agent 的排版检查和导出验证
- 更完善的示例项目和真实 E2E 场景

## 📄 License

MIT
