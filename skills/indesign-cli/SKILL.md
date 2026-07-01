---
name: indesign-cli
description: 当 Agent 需要通过 indesign-cli 操作真实 Adobe InDesign、执行 JSX、调用现有工具、验证导出物，或在其他项目中接入 InDesign 自动化能力时使用。
tags:
  - Adobe InDesign
  - CLI
  - 自动化
  - 排版
  - 设计工具
---

# InDesign CLI

## 定位

使用 `indesign-cli` 连接真实 Adobe InDesign。CLI 是工具目录、schema、参数、可调用性、健康检查和 session 输出的真相来源；不要把这些可发现信息硬编码进任务上下文。

本 skill 只补 CLI 自己无法判断的 Agent 行为约束：什么时候查目录、什么时候写 JSX、状态如何跨命令传递、临时文件放哪里，以及失败时如何处理。

## 使用顺序

从目标项目根目录运行命令，让 `.indesign-cli/session.json`、相对资源路径和测试产物都落在当前项目内。

如果命令不存在，默认从 PyPI 安装：

```powershell
pip install indesign-cli
indesign-cli server setup
```

真实操作前先检查环境：

```powershell
indesign-cli --json --pretty server health --deep
```

## 打开与文件保护

打开或连接 InDesign 的推荐方式是运行只读 JSX 探针；如果 InDesign 未启动，COM 会启动它，如果已启动，则连接现有进程：

```powershell
@'
JSON.stringify({ ok: true, appName: app.name, version: app.version, documentsCount: app.documents.length });
'@ | indesign-cli --json --pretty script run --stdin --timeout 60
```

公司内部使用时必须保护用户现场：

- 不得关闭用户已经打开的 InDesign 文档，也不要运行 `app.quit()`、`documents.everyItem().close()` 或批量关闭逻辑。
- 脚本只能关闭本轮明确创建且标记为临时测试用途的文档；不确定归属时保持打开。
- 正式成果文件保持打开，方便用户直接在 InDesign 中检查；导出 PDF/IDML 后也不要自动关闭对应 INDD。
- 状态检查只记录文档数量、输出路径和脱敏信息，不记录客户文档名称或私有路径。

工具选择不明确时，按需渐进发现：

```powershell
indesign-cli tool domains
indesign-cli tool search --query "<关键词>"
indesign-cli tool list --domain <domain>
indesign-cli tool schema <tool_id>
```

单个明确工具用 `tool call`。多步骤排版、复杂状态检查、E2E 验证、HTML/JSON 构建指令落地、或需要稳定复现的问题，优先写成 `.jsx` 文件再执行：

```powershell
indesign-cli --json --pretty script run test\workspace\probe.jsx
```

直接 `script run` 的默认脚本通道超时是 300 秒。复杂构建、导出或回环测试预计更久时，显式加 `--timeout <秒>`，最大 3600：

```powershell
indesign-cli --json --pretty script run test\workspace\build.jsx --timeout 900
```

`script run --stdin` 只用于很短的临时探针；需要复跑、引用文件、相对 `#include`、保存证据或多人协作时，用文件模式。

导出 PDF、IDML 或图片后，用 CLI 验证产物，不要只看文件是否存在：

```powershell
indesign-cli export verify path/to/output.pdf
```

## 插件工具

上层项目可以通过 `indesign-cli` 插件把自己的高层能力接入统一工具目录。需要 HTML-to-InDesign、语义模板、回环验证等能力时，先检查插件是否存在，不要假设它已经安装：

```powershell
indesign-cli plugin list
indesign-cli tool list --domain html
```

本地插件接入或排查时使用：

```powershell
indesign-cli plugin install <plugin-root>
indesign-cli plugin validate <plugin-root>
indesign-cli plugin doctor <plugin-id>
```

只有用户明确要求安装本地插件时才运行 `plugin install`。日常使用先查 `plugin list` 和 `tool list --domain <domain>`。

插件工具仍然优先通过 `tool schema <tool_id>` 和 `tool call <tool_id>` 使用。不要绕过宿主直接调用插件内部脚本；需要真实 InDesign 的插件能力应由宿主执行 `script.run`、`export.verify` 等受控动作。

## 高级模板常用能力

高级模板工具数量少、使用频率高，可以直接优先考虑。完整参数仍以 `tool schema <tool_id>` 为准。

推荐流程：

1. 打开或指定模板 INDD。
2. `template.list_template_blueprints` 快速看当前文档有哪些母版模板。
3. `template.inspect_template_blueprint` 读取槽位名、说明和 PageNotes。
4. `template.create_page_with_template` 新建页面并套用母版。
5. `page.get_page_information` 复核页面、母版和 override 后的槽位。
6. `template.populate_template_slots` 用 inspect/page info 返回的槽位名填文字和图片。

每个工具调用前先运行 `indesign-cli tool schema <tool_id>`，再把参数写进 `args.json` 调用：

```powershell
indesign-cli --json --pretty tool call <tool_id> --args test\workspace\args.json
```

槽位名必须以 `inspect_template_blueprint` 或 `get_page_information` 返回值为准，不要凭视觉猜。图片填充常用 `FILL_FRAME` 或 `PROPORTIONALLY`；保留整图优先用 `PROPORTIONALLY`，铺满画面优先用 `FILL_FRAME`。

`template.run_jsx_file` 是高级模板服务器的兼容入口，参数是绝对 `filePath`。普通 Agent 调试优先用 CLI 原生命令 `script run <file.jsx>`，除非需要复用高级模板工具链。

## 读取结果

- 给测试脚本或后续 Agent 判断使用时，加 `--json --pretty`。
- 判断执行结果时看 `ok`、`exit_code`、`tool_success`、`warnings` 和 `data`，不要只看自然语言输出。
- JSX 可以返回普通字符串，也可以返回 `JSON.stringify(...)`。
- JSX 返回 JSON 字符串时，优先读取 `data.result_json`，不要让后续步骤重复解析 `data.parsed.result`。

## 状态模型

- CLI 不是常驻服务；每次命令会按需启动并关闭 Node MCP/bridge 子进程。
- InDesign 进程、打开的文档和文档内对象可以延续；Node 子进程内存状态不会跨命令延续。
- 跨步骤状态必须显式落到 JSON 返回值、文件路径、InDesign 文档状态、脚本标签，或当前目录 `.indesign-cli/session.json`。
- `tool domains`、`tool list`、`tool search`、`tool schema` 不写 session；`tool call`、`script run`、`export verify` 会写 session。
- 不要假设上一次命令里创建的 JS 变量、缓存对象或临时内存还能被下一次命令读取。

## 上层项目边界

- 上层项目负责自己的语义、schema、validator、compiler output 和测试断言。
- CLI 只负责把能力发现、工具调用、JSX 传输、COM 执行和导出验证做稳。
- 如果上层项目是 HTML-to-InDesign 或模板编译器，不要把 HTML 解析、语义推理、大段校验逻辑塞进 JSX；JSX 应尽量接收已校验的构建指令。
- 不要为了 InDesign 实现细节让 HTML 或源数据变得反常；翻译层负责把自然输入转换成 InDesign 合适的样式、页面对象和资源置入。

## 测试卫生

- 临时真实测试放到目标项目已忽略的工作目录；没有约定时使用 `test/workspace/<日期时间>/`，并确认它不进 git。
- 不记录客户文档内容、客户名称或私有资产完整路径；必须引用外部文件时，用临时副本或脱敏路径。
- 创建临时 InDesign 文档后，测试结束要保存到工作目录或关闭，避免堆积标签页。
- `server health --deep`、COM 或 InDesign 环境失败时，报告环境阻塞；不要绕过 CLI 写模拟成功。
