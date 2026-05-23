# InDesign Agent CLI 设计

日期：2026-05-23

## 1. 背景

本项目已有两套 MCP 入口：

- 高级模板服务器：`src/advanced/index.js`
- 经典 MCP 服务器：`src/index.js`

当前 CLI 化目标不是给人类用户做一套完整命令行工具，而是给 Agent 提供稳定、可发现、可脚本化的 InDesign 操作入口。CLI 应配合项目级工作流使用，重点是让 Agent 能可靠调用现有能力、执行 ExtendScript/JSX、验证产物，并保留最小会话线索。

## 2. 目标

- 提供 Agent 专用 CLI：`cli-anything-indesign`。
- 默认优先使用高级模板服务器能力。
- 保留经典 MCP 工具作为补充能力。
- 支持通用工具发现和调用，而不是给所有工具手写人类友好子命令。
- 支持 `script run <file.jsx>` 和 `script run --stdin`。
- 默认输出 JSON，便于 Agent 解析；人类查看使用 `--text` 或 `--pretty`。
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
  +-- 默认后端：node src/advanced/index.js
  |     +-- advanced tool list
  |     +-- advanced tool call
  |     +-- run_jsx_file
  |
  +-- 补充后端：node src/index.js
  |     +-- classic tool list
  |     +-- classic tool call
  |
  +-- 本地状态：.indesign-cli/session.json
```

每次 CLI 命令执行时，CLI 启动对应 Node MCP server 子进程，通过 `stdio` 完成 MCP 请求，拿到结果后关闭子进程并退出。

第一版不提供常驻进程。为避免一次性子进程模式失控，所有后端调用必须支持超时、失败分类和子进程强制清理，并在输出中暴露耗时。后续如果冷启动成本明显影响 Agent 连续操作，再单独设计长会话模式。

## 5. 后端优先级

后端优先级和使用策略必须明确：

1. 模板槽位、高级模板流程、已有高级能力：优先使用高级模板服务器 `src/advanced/index.js`。
2. 普通 InDesign 自动化、多步骤操作、现有工具覆盖不清楚的任务：优先生成 JSX 并通过 `script run` 执行。
3. 已知稳定、低成本、参数明确的旧能力：使用经典 MCP 服务器 `src/index.js`。

默认命令走高级模板服务器。经典服务器必须显式使用 `classic` 命名空间。

## 6. 命令面设计

### 6.1 默认高级模板工具

```powershell
cli-anything-indesign tool list
cli-anything-indesign tool search --query "template slots"
cli-anything-indesign tool schema <tool_name>
cli-anything-indesign tool call <tool_name> --args args.json
cli-anything-indesign tool call <tool_name> --arg key=value
```

说明：

- `tool list` 默认返回精简清单，只包含 `name`、`one_line_purpose`、`arg_names`、`category`、`recommended`。
- `tool list --full` 才返回完整工具描述；Agent 默认不应使用。
- `tool search` 用于按关键词查找工具，避免全量读取。
- `tool schema` 返回单个工具的完整输入 schema。
- `tool call` 调用高级模板工具。
- `--args` 用 JSON 文件传参，适合复杂对象。
- `--arg key=value` 只作为简单参数便利入口，不作为主路径。
- 命令默认输出 JSON；`--json` 可作为显式兼容参数保留。

### 6.2 经典 MCP 工具

```powershell
cli-anything-indesign classic tool list
cli-anything-indesign classic tool list --filter export
cli-anything-indesign classic tool search --query "document info"
cli-anything-indesign classic tool schema <tool_name>
cli-anything-indesign classic tool call <tool_name> --args args.json
```

说明：

- 经典服务器是补充能力。
- Agent 只有在高级模板和脚本执行不能覆盖时才使用 `classic`。
- 不把经典服务器的所有工具提升成顶层命令。
- `classic tool list` 默认必须精简，并在输出中标记 `fallback: true`、`token_cost: "high"`。
- `classic tool list --filter <domain>` 和 `classic tool search` 是推荐发现方式。

### 6.3 JSX 脚本执行

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

### 6.4 诊断和状态

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

### 6.5 产物验证

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

## 7. 输出格式

默认 JSON 输出使用统一 envelope：

```json
{
  "schema_version": 1,
  "ok": true,
  "exit_code": 0,
  "request_id": "20260523-150000-001",
  "command": "tool call",
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
- JSON 是默认输出；`--text` 或 `--pretty` 才输出面向人类的格式。
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
- 工作区外路径默认只保存 `basename`、`kind`、`hash`、`external: true`。
- 只有显式传入 `--allow-external-session-paths` 时，才允许保存外部完整路径。
- 只记录最近活动文档和目录，不扫描目录文件树。
- 不保存文档内容。
- 不保存大段脚本内容。
- `recent_calls` 不保存完整 args，只保存工具名、状态、耗时和 artifact 摘要。
- `recent_calls` 限制长度，建议最多 20 条。
- 支持 `--no-session` 禁止写入状态。
- `.indesign-cli/` 必须加入 `.gitignore`。

## 9. Agent 使用策略

推荐调用顺序：

1. 模板槽位和高级模板流程：先用 `tool list` 或 `tool search` 查看高级模板能力。
2. 找到明确匹配工具后，用 `tool schema <tool_name>` 读取单个 schema。
3. 能用高级工具低成本完成时，使用 `tool call`。
4. 普通 InDesign 自动化、多步骤操作或工具选择不明确时，优先生成 `.jsx` 文件并用 `script run <file.jsx>`。
5. 临时探索可用 `script run --stdin`。
6. 只有高级工具和 JSX 都不合适时，使用 `classic tool search/schema/call`。
7. 生成导出物后，用 `export verify` 做文件级验证。
8. 用 `session show` 获取最近脚本、最近文档和最近输出线索。

省 token 原则：

- 不默认拉完整工具 schema。
- 不默认拉经典工具全量列表。
- 多步骤 InDesign 操作优先合并进一个 JSX 文件。
- session 默认 compact，避免反复输出长路径和历史参数。

## 10. 错误处理

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

## 11. 测试策略

第一版测试分三层：

### 11.1 不依赖 InDesign 的单元测试

- 参数解析
- JSON envelope
- session 读写
- 路径相对化和 `external` 标记
- 外部路径脱敏和 `--allow-external-session-paths`
- `export verify` 对伪造文件的成功/失败判断
- 后端命令构造
- 子进程超时和清理逻辑

### 11.2 MCP 后端冒烟测试

- `server health --json`
- 高级模板 `tool list --json`
- 经典 `classic tool list --json`

这些测试只验证 server 能启动和返回工具清单，不要求真实创建文档。

### 11.3 真实 InDesign E2E

需要 Windows + Adobe InDesign + `winax` 可用：

- 执行简单 JSX，确认能读取 InDesign 状态。
- 创建或打开测试文档。
- 运行高级模板脚本文件。
- 导出 PDF，并用 `export verify` 验证。

没有真实环境时，E2E 不能伪造成功，必须清晰失败或显式跳过。

## 12. 实施边界

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

## 13. 设计结论

第一版采用“Agent 专用轻量 CLI”：

- 不做常驻服务。
- 不做人类友好全量命令包装。
- 默认走高级模板 server。
- 经典 MCP server 作为显式补充。
- `tool call` 和 `script run` 同级重要。
- 普通多步骤自动化优先让 Agent 写 JSX，减少 schema 查询和多次工具调用。
- 本地 `.indesign-cli/session.json` 保存最小状态。
- 产物验证独立成命令，帮助 Agent 判断真实结果。
