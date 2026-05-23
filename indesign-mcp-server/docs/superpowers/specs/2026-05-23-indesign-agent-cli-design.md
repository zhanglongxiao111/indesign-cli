# InDesign Agent CLI 设计

日期：2026-05-23

## 1. 背景

本项目已有两套 MCP 入口：

- 高级模板服务器：`src/advanced/index.js`
- 经典 MCP 服务器：`src/index.js`

当前 CLI 化目标不是给人类用户做一套完整命令行工具，而是给 Agent 提供稳定、可发现、可脚本化的 InDesign 操作入口。CLI 应配合项目级工作流使用，重点是让 Agent 能可靠调用现有能力、执行 ExtendScript/JSX、验证产物，并保留最小会话线索。

Agent 看到的能力不应按后端分裂为高级服务器和经典服务器，而应按 InDesign 功能域组织成统一目录。高级模板、经典 MCP、CLI primitive 和 JSX 执行能力都进入同一目录，后端来源只作为工具条目的元数据。

## 2. 目标

- 提供 Agent 专用 CLI：`cli-anything-indesign`。
- 对 Agent 暴露统一功能域目录，而不是暴露多套后端入口。
- 高级模板服务器能力在目录中优先级最高。
- 经典 MCP 工具作为补充能力归入对应功能域。
- 支持通用工具发现和调用，而不是给所有工具手写人类友好子命令。
- 支持 `script run <file.jsx>` 和 `script run --stdin`。
- 默认输出 JSON，便于 Agent 解析；需要查看时使用 `--pretty` 格式化 JSON。
- 工具发现默认精简，完整 schema 必须按需读取。
- 使用当前工作目录下的 `.indesign-cli/session.json` 保存最小运行状态。
- 第一版不引入常驻服务、HTTP 服务或后台 daemon。

## 3. 非目标

- 不做面向人类用户的完整交互式产品。
- 不为 100 多个经典 MCP 工具逐个包装漂亮子命令。
- 不重写 InDesign 自动化能力。
- 不做玩具模拟器；真实能力必须最终走 Adobe InDesign。
- 不扫描或记录客户文档目录文件树。
- 第一版不做常驻 Node MCP server。

## 4. 总体架构

```text
Agent
  |
  v
cli-anything-indesign
  |
  +-- 统一工具目录
  |     +-- domains
  |     +-- list/search/schema/call
  |     +-- source: cli | script | advanced | classic
  |
  +-- 后端路由
  |     +-- cli primitive
  |     +-- script run
  |     +-- node src/advanced/index.js
  |     +-- node src/index.js
  |
  +-- 本地状态：.indesign-cli/session.json
```

每次 CLI 命令执行时，CLI 启动对应 Node MCP server 子进程，通过 `stdio` 完成 MCP 请求，拿到结果后关闭子进程并退出。

第一版不提供常驻进程。为避免一次性子进程模式失控，所有后端调用必须支持超时、失败分类和子进程强制清理，并在输出中暴露耗时。后续如果冷启动成本明显影响 Agent 连续操作，再单独设计长会话模式。

## 5. 工具目录与后端优先级

### 5.1 功能域优先

Agent 的第一步应是查询功能域，而不是查询某个后端：

```powershell
cli-anything-indesign tool domains
cli-anything-indesign tool list --domain template
cli-anything-indesign tool search --domain export --query pdf
```

建议功能域：

| domain | 用途 |
| ------ | ---- |
| `template` | 模板槽位、脚本标签、母版占位和模板填充 |
| `document` | 打开、保存、关闭、文档信息 |
| `page` | 页面、页面尺寸和页面基础操作 |
| `spread` | 跨页、跨页布局和跨页范围操作 |
| `master` | 母版、母版跨页和母版对象 |
| `layer` | 图层创建、查询、锁定、显示和删除 |
| `object` | 页面对象、对象组、几何位置、脚本标签 |
| `text` | 文本框、文本内容、段落和字符操作 |
| `graphics` | 图片、图形框、适配和基础绘制 |
| `style` | 段落样式、字符样式、对象样式 |
| `export` | PDF、IDML、图片等导出和产物验证 |
| `book` | InDesign Book 文件、章节和书籍级同步 |
| `presentation` | 演示型版面、页面序列和早期 presentation handler 能力 |
| `script` | JSX 文件执行和 stdin 临时脚本 |
| `session` | CLI 本地状态、最近文档和最近输出 |
| `server` | 依赖、后端、InDesign COM 健康检查 |
| `utility` | 难以归入以上域的辅助能力 |

### 5.2 来源标签

每个工具条目必须标明来源，但来源不是主要分类：

| source | 含义 |
| ------ | ---- |
| `cli` | CLI 自带 primitive，例如 `export.verify`、`server.health`、`session.show` |
| `script` | JSX 执行能力，例如 `script.run` |
| `advanced` | 高级模板服务器工具 |
| `classic` | 经典 MCP 服务器工具 |

`source` 只表示能力来源，不自动决定推荐顺序。推荐顺序由 `rank` 决定。

### 5.3 使用优先级

1. 模板槽位、高级模板流程、已有高级能力：优先使用高级模板服务器 `src/advanced/index.js`。
2. 普通 InDesign 自动化、多步骤操作、现有工具覆盖不清楚的任务：优先生成 JSX 并通过 `script run` 执行。
3. 已知稳定、低成本、参数明确的旧能力：可以使用经典 MCP 服务器 `src/index.js`。

经典 MCP 工具必须归入对应功能域，并在条目中标记 `source: "classic"`。如果某个经典工具没有高级替代，且参数明确、行为稳定，它可以在该 domain 内获得较高 `rank`。Agent 不应先进入一个叫 `classic` 的大入口。

### 5.4 可用性边界

第一版目录包含：

- 当前高级模板服务器 `ListTools` 暴露的工具。
- 当前经典 MCP 服务器 `ListTools` 暴露的工具。
- 有 handler 实现但当前未通过 `ListTools` 暴露的能力。
- CLI 自带 primitive。
- `script.run`。

有 handler 但当前没有通过 `ListTools` 暴露的能力也进入功能域目录，但必须标记为不可直接调用：

```json
{
  "availability": "hidden_handler",
  "callable": false
}
```

这样 Agent 能知道项目里存在这类能力，并据此判断是否应写 JSX、请求重新暴露 schema，或在后续 CLI 化阶段补入口。

默认 `tool list --domain <domain>` 返回该 domain 下的精简目录，包括 `exposed` 和 `hidden_handler`。但只有 `callable: true` 的条目允许 `tool schema` 和 `tool call`。如果 Agent 只想看当前可直接调用能力，可使用：

```powershell
cli-anything-indesign tool list --domain export --callable-only
```

## 6. 命令面设计

### 6.1 工具目录

```powershell
cli-anything-indesign tool domains
cli-anything-indesign tool list --domain template
cli-anything-indesign tool list --domain export --source classic
cli-anything-indesign tool search --domain document --query "active document"
cli-anything-indesign tool schema document.get_info
cli-anything-indesign tool call document.get_info --args args.json
```

说明：

- `tool domains` 返回功能域目录和每个域的工具数量摘要。
- `tool list --domain <domain>` 是主要发现入口。
- `tool list` 不带 `--domain` 时只返回 domains 摘要，不返回全量工具。
- `tool list --source classic` 只用于调试或审查，不是 Agent 主路径。
- `tool search` 用于按关键词查找工具，避免全量读取。
- `tool schema` 返回单个工具的完整输入 schema。
- `tool call` 根据工具条目的 `source/backend` 路由到 CLI primitive、JSX、高级模板服务器或经典服务器。
- `--args` 用 JSON 文件传参，适合复杂对象。
- `--args -` 从 `stdin` 读取 JSON，适合 Agent 临时生成参数。
- 命令默认输出 JSON；`--json` 可作为显式兼容参数保留。

`tool domains` 摘要应包含低 token 信息：

```json
{
  "domain": "export",
  "summary": "PDF、IDML、图片等导出和产物验证",
  "count_by_source": {
    "cli": 1,
    "advanced": 0,
    "classic": 3
  },
  "top_tools": ["export.verify", "export.pdf"]
}
```

工具条目默认精简格式：

```json
{
  "id": "export.pdf",
  "domain": "export",
  "name": "export_pdf",
  "one_line_purpose": "将当前 InDesign 文档导出为 PDF",
  "arg_names": ["outputPath", "preset"],
  "source": "classic",
  "rank": 20,
  "schema_size": "medium",
  "availability": "exposed",
  "callable": true,
  "requires": ["active_document"],
  "side_effects": ["filesystem_write"],
  "artifact_kinds": ["pdf"],
  "destructive": false,
  "target_scope": "active_document",
  "needs_indesign": true,
  "produces_artifacts": true
}
```

字段规则：

- `id` 是 Agent 调用的稳定标识，格式为 `<domain>.<name>`。
- `source` 表示能力来源，不作为主导航。
- `rank` 是推荐顺序，数字越小越优先。
- `schema_size` 可取 `small`、`medium`、`large`，用于提示读取 schema 的 token 成本。
- `availability` 可取 `exposed`、`hidden_handler`、`planned`。
- `callable: false` 表示该条目只能作为目录线索，不能直接 `schema/call`。
- `requires`、`side_effects`、`artifact_kinds`、`destructive`、`target_scope` 帮助 Agent 在不读完整 schema 时判断风险。
- 同一功能如果同时有多个来源，默认只把 `rank` 更高的条目放进 `top_tools`。
- `tool schema <id>` 才返回完整参数、描述和示例。

### 6.2 JSX 脚本执行

```powershell
cli-anything-indesign script run path/to/script.jsx
Get-Content path/to/script.jsx | cli-anything-indesign script run --stdin
```

说明：

- 文件方式是主路径，便于审计、复现和调试。
- `--stdin` 是临时探索入口。
- 第一版优先复用高级模板服务器中的脚本文件执行能力。
- 若 `--stdin` 需要落地执行，CLI 可以把 stdin 内容写入 `.indesign-cli/tmp/` 下的临时 `.jsx`，再调用同一执行链路。
- CLI 接受相对路径，但调用后端前必须解析为绝对路径，并在输出中同时返回 `input_path` 和 `resolved_path`。
- JSX 脚本应返回单个 JSON 对象，至少包含 `ok`、`data`、`warnings`、`artifacts`。
- Agent 不应依赖脚本里的自然语言日志判断成功失败。
- `script.run` 同时作为 `script` domain 下的工具条目出现，便于统一发现。

### 6.3 诊断和状态

```powershell
cli-anything-indesign server health
cli-anything-indesign server health --deep
cli-anything-indesign session show
cli-anything-indesign session show --verbose
cli-anything-indesign session clear
```

说明：

- `server health` 分层检查 Node、项目路径、高级 MCP、经典 MCP。
- `server health --deep` 额外检查 `winax` 和 InDesign COM 可用性。
- `session show` 默认输出精简状态。
- `session show --verbose` 才输出允许展示的完整路径细节。
- `session clear` 清空本地 CLI 状态。
- `server.health`、`session.show`、`session.clear` 同时作为 `server`、`session` domain 下的 CLI primitive 出现。

### 6.4 产物验证

```powershell
cli-anything-indesign export verify path/to/output.pdf
cli-anything-indesign export verify path/to/output.idml --created-after 2026-05-23T15:00:00+08:00
```

说明：

- `export verify` 不负责导出，只验证产物。
- PDF 至少检查文件存在、大小大于 0、魔术字节 `%PDF`。
- IDML 至少检查文件存在、大小大于 0、ZIP 文件结构可读，并包含 `designmap.xml`。
- 输出必须包含 `size_bytes`、`mtime`、`signature_ok`、`kind`。
- 支持 `--created-after`，避免 Agent 验证到旧产物。
- 其他格式后续按需要扩展。
- `export.verify` 同时作为 `export` domain 下的 CLI primitive 出现。

## 7. 输出格式

默认 JSON 输出使用统一 envelope：

```json
{
  "schema_version": 1,
  "ok": true,
  "exit_code": 0,
  "request_id": "20260523-150000-001",
  "command": "tool call",
  "tool_id": "template.run_jsx_file",
  "domain": "template",
  "source": "advanced",
  "backend": "advanced",
  "backend_entry": "src/advanced/index.js",
  "tool_name": "run_jsx_file",
  "mcp_ok": true,
  "tool_success": true,
  "raw_result_type": "json",
  "duration_ms": 1234,
  "data": {},
  "session": {
    "updated": true,
    "path": ".indesign-cli/session.json"
  },
  "warnings": []
}
```

失败输出：

```json
{
  "schema_version": 1,
  "ok": false,
  "exit_code": 1,
  "request_id": "20260523-150000-002",
  "command": "script run",
  "tool_id": "script.run",
  "domain": "script",
  "source": "script",
  "backend": "advanced",
  "backend_entry": "src/advanced/index.js",
  "mcp_ok": true,
  "tool_success": false,
  "raw_result_type": "text",
  "duration_ms": 1234,
  "error": {
    "type": "McpToolError",
    "code": "MCP_TOOL_FAILED",
    "message": "脚本执行失败",
    "details": {},
    "retryable": false,
    "hint": "查看脚本返回的错误位置并修正 JSX",
    "raw_backend_error": "Error: ..."
  },
  "warnings": []
}
```

规则：

- 机器可读输出写 `stdout`。
- 诊断日志写 `stderr`。
- JSON 是默认输出；`--pretty` 只格式化 JSON，不改变字段。
- JSON 输出下不要混杂人类说明。
- 错误也必须尽量保持 JSON envelope。
- `ok` 表示 CLI 视角的最终成功；`mcp_ok` 表示 MCP 协议调用是否成功；`tool_success` 表示工具或脚本业务结果是否成功。

## 8. 会话状态

状态文件位置：

```text
.indesign-cli/session.json
```

第一版记录最小状态：

```json
{
  "version": 1,
  "last_tool": {
    "id": "template.run_jsx_file",
    "domain": "template",
    "source": "advanced",
    "backend": "advanced",
    "name": "run_jsx_file",
    "ok": true,
    "time": "2026-05-23T15:00:00+08:00"
  },
  "last_script": {
    "path": "scripts/check.jsx",
    "source": "file",
    "ok": true,
    "time": "2026-05-23T15:00:00+08:00"
  },
  "last_document": {
    "path": "samples/booklet.indd",
    "dir": "samples",
    "external": false,
    "source": "indesign-active-document",
    "time": "2026-05-23T15:00:00+08:00"
  },
  "last_output": {
    "path": "output/booklet.pdf",
    "kind": "pdf",
    "ok": true,
    "time": "2026-05-23T15:00:00+08:00"
  },
  "recent_calls": [
    {
      "tool_id": "template.run_jsx_file",
      "domain": "template",
      "source": "advanced",
      "backend": "advanced",
      "name": "run_jsx_file",
      "ok": true,
      "duration_ms": 1234,
      "time": "2026-05-23T15:00:00+08:00"
    }
  ]
}
```

边界：

- 路径优先存相对当前工作目录的路径。
- 工作区外路径默认只保存 `kind`、扩展名、salted hash、`external: true`，不保存 `basename`。
- 只有显式传入 `--allow-external-session-paths` 时，才允许保存外部完整路径。
- 只记录最近活动文档和目录，不扫描目录文件树。
- 不保存文档内容。
- 不保存大段脚本内容。
- `recent_calls` 不保存完整 args，只保存工具名、状态、耗时和 artifact 摘要。
- `recent_calls` 限制长度，建议最多 20 条。
- 支持 `--no-session` 禁止写入状态。
- `.indesign-cli/` 必须加入 `.gitignore`。
- 所有写入 session 和 JSON envelope 的错误详情都要经过路径脱敏，避免 `raw_backend_error` 泄露客户名或完整路径。

## 9. 跨步骤状态设计

第一版 CLI 不做常驻服务，每次命令都会启动新 MCP 子进程。这个设计不会让 InDesign 本身断开：Adobe InDesign 进程、当前打开文档和文档内部对象仍然可以跨 CLI 调用存在。真正不能依赖的是 Node MCP server 进程内的临时内存。

处理原则：

- 所有跨步骤需要继续使用的信息，都必须通过 JSON 显式返回给 Agent。
- Agent 可以依赖上一条命令返回的结构化字段，例如文档路径、对象 ID、脚本标签、页面索引、几何 bounds、输出路径。
- CLI 的 `.indesign-cli/session.json` 只保存 Agent 可用的本地线索，不等同于 Node MCP 内存 session。
- Node MCP server 里的临时内存不会跨 CLI 调用保留，例如未返回给 Agent 的最近创建对象、页面尺寸缓存、智能定位历史等。
- 因此，跨命令连续操作必须依赖 InDesign 真实状态、显式文件路径、显式对象标识、脚本标签或 CLI `.indesign-cli/session.json`。
- 如果一个现有 handler 依赖 Node 进程内记忆，但没有把必要状态返回给 Agent，该能力在 CLI 目录中应降低 `rank`，并在 `requires` 或 `side_effects` 中标明状态依赖。
- 多步骤且中间状态难以结构化表达的操作，优先合并进单个 JSX 文件。
- 如果工具需要 active document、selection 或当前页面，必须在工具条目的 `requires` 字段中标出。
- 第一版不做 MCP session rehydrate；需要连续性的地方，优先通过结构化返回值和显式参数解决。

示例返回：

```json
{
  "ok": true,
  "data": {
    "document": {
      "path": "samples/booklet.indd",
      "active": true
    },
    "object": {
      "id": 123,
      "label": "title_slot",
      "page_index": 0,
      "bounds": [10, 10, 80, 200]
    }
  }
}
```

## 10. Agent 使用策略

推荐调用顺序：

1. 先用 `tool domains` 看功能域目录。
2. 按任务选择 domain，例如 `template`、`document`、`export`。
3. 用 `tool list --domain <domain>` 或 `tool search --domain <domain> --query <keyword>` 获取精简候选。
4. 根据 `source`、`rank`、`schema_size`、`requires`、`side_effects` 选择候选。
5. 找到明确匹配工具后，用 `tool schema <tool_id>` 读取单个 schema。
6. 能用高级工具或 CLI primitive 低成本完成时，使用 `tool call <tool_id>`。
7. 普通 InDesign 自动化、多步骤操作或工具选择不明确时，优先生成 `.jsx` 文件并用 `script run <file.jsx>`。
8. 临时探索可用 `script run --stdin`。
9. 如果 `source: "classic"` 的工具在该 domain 中 `rank` 较高且行为明确，可以直接使用；否则优先 JSX。
10. 生成导出物后，用 `export verify` 做文件级验证。
11. 用 `session show` 获取最近脚本、最近文档和最近输出线索。

省 token 原则：

- 不默认拉完整工具 schema。
- 不提供默认全量工具列表；默认先返回功能域目录。
- 经典工具只作为对应 domain 下的 fallback 条目出现。
- 多步骤 InDesign 操作优先合并进一个 JSX 文件。
- session 默认 compact，避免反复输出长路径和历史参数。

## 11. 错误处理

错误需要区分来源：

| 类型 | 示例 | 处理 |
| ---- | ---- | ---- |
| CLI 参数错误 | 缺少 `--args` 文件 | 返回 `CliArgumentError` |
| 后端启动错误 | Node 不存在、入口文件不存在 | 返回 `BackendStartError` |
| MCP 协议错误 | list/call 请求失败 | 返回 `McpProtocolError` |
| 工具执行错误 | handler 返回失败 | 返回 `McpToolError` |
| InDesign/COM 错误 | InDesign 未安装或 COM 不可用 | 返回 `InDesignRuntimeError` |
| 脚本错误 | JSX 语法或运行时错误 | 返回 `ScriptExecutionError` |
| 产物验证错误 | PDF 不存在或格式不对 | 返回 `ArtifactValidationError` |
| 超时错误 | MCP 子进程或 COM 调用卡住 | 返回 `TimeoutError` 并清理子进程 |

每类错误都应包含：

- `message`
- `details`
- `backend`
- `command`
- 可选 `hint`
- `retryable`
- `duration_ms`

所有 `details`、`hint`、`raw_backend_error` 写入 JSON 前必须做路径和客户名脱敏。

## 12. 测试策略

第一版测试分三层：

### 12.1 不依赖 InDesign 的单元测试

- 参数解析
- JSON envelope
- session 读写
- 路径相对化和 `external` 标记
- 外部路径脱敏和 `--allow-external-session-paths`
- `export verify` 对伪造文件的成功/失败判断
- 后端命令构造
- 子进程超时和清理逻辑
- domain 映射、`rank` 排序、`source` 过滤
- hidden handler 进入目录但 `callable: false`

### 12.2 MCP 后端冒烟测试

- `server health`
- `tool domains`
- `tool list --domain template`
- `tool list --domain export`
- 至少一个包含 `source: "classic"` 的 domain 查询

这些测试只验证 server 能启动和返回工具清单，不要求真实创建文档。

### 12.3 真实 InDesign E2E

需要 Windows + Adobe InDesign + `winax` 可用：

- 执行简单 JSX，确认能读取 InDesign 状态。
- 创建或打开测试文档。
- 运行高级模板脚本文件。
- 导出 PDF，并用 `export verify` 验证。

没有真实环境时，E2E 不能伪造成功，必须清晰失败或显式跳过。

## 13. 实施边界

第一版建议落地文件：

```text
agent-harness/
├── INDESIGN.md
├── setup.py
└── cli_anything/
    └── indesign/
        ├── README.md
        ├── __init__.py
        ├── __main__.py
        ├── indesign_cli.py
        ├── core/
        │   ├── mcp_backend.py
        │   ├── session.py
        │   ├── artifacts.py
        │   └── paths.py
        └── tests/
            ├── TEST.md
            ├── test_core.py
            └── test_full_e2e.py
```

`cli_anything/` 顶层不放 `__init__.py`，保持命名空间包形态。

## 14. 设计结论

第一版采用“Agent 专用轻量 CLI”：

- 不做常驻服务。
- 不做人类友好全量命令包装。
- 对 Agent 暴露统一功能域目录。
- 高级模板 server 条目默认优先。
- 经典 MCP server 作为对应功能域下的 fallback 来源。
- `tool call` 和 `script run` 同级重要。
- 普通多步骤自动化优先让 Agent 写 JSX，减少 schema 查询和多次工具调用。
- 本地 `.indesign-cli/session.json` 保存最小状态。
- 产物验证独立成命令，帮助 Agent 判断真实结果。
