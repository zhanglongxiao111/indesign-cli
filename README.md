# 🎨 indesign-cli

**中文** | [English](./README.en.md)

让 AI Agent 直接操作 Adobe InDesign 的命令行工具。

`indesign-cli` 把 InDesign 的自动化能力包装成 Agent 友好的 CLI：Agent 可以查询工具、执行 JSX 脚本、调用排版能力、验证导出文件，并按需配合项目级 Skill 使用。

当前 CLI 可发现 **147 个可调用能力**，覆盖 InDesign 绝大部分常用自动化功能：文档、页面、跨页、母版、图层、文本、图片、基础图形、样式、导出、Book、Presentation、模板槽位、脚本执行和环境检查。

如果你正在做 **AI 生成画册、建筑汇报、品牌手册、版式模板、HTML 转 InDesign** 这类项目，它可以让 Agent 不再靠“猜坐标”和“手搓脚本”工作，而是通过稳定的命令和结构化返回值操作真实 InDesign。

## ✨ 这个项目解决什么问题？

Adobe InDesign 很强，但对 AI Agent 来说并不好用：

- 工具能力多，Agent 不知道该调用哪个。
- JSX 脚本可以执行，但调试、传参、返回值和错误处理都很散。
- MCP 工具很多，直接塞进上下文会占用大量 token。
- 真实导出物是否成功，不能只靠“命令没报错”判断。

`indesign-cli` 做的事情很简单：**把真实 InDesign 自动化能力变成 Agent 更容易使用的一组命令。**

它的关键价值之一是 **省 token**：Agent 不需要一次性读取 147 个工具的完整描述，可以先看 `tool domains` 的摘要，再用 `tool search`、`tool list`、`tool schema` 按需加载当前任务需要的工具说明。

它不是一个给人类手动排版的 CLI，也不是一个新的排版引擎。它更像是 AI 项目和 InDesign 之间的稳定桥梁。

## 🚀 快速安装

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
indesign-cli --json --pretty server health
```

如果返回 `ok: true`，CLI 基础环境就绪。

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

### 🧰 能力覆盖

当前 `indesign-cli` 可发现 **147 个可调用能力**，覆盖 InDesign 绝大部分常用自动化功能，以及大多数 Agent 自动化场景：

- 文档、页面、跨页、母版、图层
- 文本框、表格、图片、基础图形、页面对象
- 段落样式、字符样式、对象样式、色板
- PDF / IDML / 图片导出与产物验证
- Book、Presentation、模板槽位和高级模板填充
- JSX 脚本执行、session 线索和环境检查

这些能力通过 CLI 分域查询，不会一次性占满 Agent 上下文。

### 📜 执行 JSX 脚本

```powershell
indesign-cli --json --pretty script run test\workspace\probe.jsx
```

适合测试真实 InDesign 行为、创建文档、检查对象、执行复杂排版逻辑。

复杂构建或导出可能超过默认等待时间，可以显式加长脚本通道超时：

```powershell
indesign-cli --json --pretty script run test\workspace\build.jsx --timeout 900
```

短脚本也可以从 stdin 输入：

```powershell
Get-Content test\workspace\probe.jsx | indesign-cli --json --pretty script run --stdin
```

### 📦 验证导出物

```powershell
indesign-cli export verify output\deck.pdf
```

用于确认 PDF、IDML 等文件真的生成成功，而不是只看命令是否结束。

### 🧩 使用模板槽位

```powershell
indesign-cli tool call template.list_template_blueprints --args args.json
indesign-cli tool call template.inspect_template_blueprint --args args.json
indesign-cli tool call template.create_page_with_template --args args.json
indesign-cli tool call template.populate_template_slots --args args.json
```

适合让 Agent 基于母版、脚本标签和槽位名生成稳定页面。

### 📚 Book / Presentation 工具

`indesign-cli` 也包含 Book 和 Presentation 相关能力，例如：

- 创建和管理 InDesign Book
- 导出 Book
- 创建演示型文档
- 添加封面页、章节页、全幅图片页、图片网格页

这些能力可以通过 `tool domains`、`tool list` 和 `tool schema` 查询。

## 🧪 示例工作流

一个典型 Agent 流程可能是：

```powershell
indesign-cli --json --pretty server health
indesign-cli tool domains
indesign-cli tool search --query "template"
indesign-cli tool schema template.populate_template_slots
indesign-cli --json --pretty script run test\workspace\build.jsx
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
indesign-cli server health
```

运行测试：

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
node scripts\validate_schemas.js
node scripts\check_duplicates.mjs
node tests\index.js --required
```

## 📁 项目结构

```text
.
├─ agent-harness/   # Python CLI、CLI 测试
├─ src/             # MCP Server、InDesign handler、JSX/COM 执行链路
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
