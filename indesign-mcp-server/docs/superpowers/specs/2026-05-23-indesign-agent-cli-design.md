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
- 所有关键命令支持 `--json`，便于 Agent 解析。
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

第一版不提供常驻进程。后续如果冷启动成本明显影响 Agent 连续操作，再单独设计长会话模式。

## 5. 后端优先级

优先级必须明确：

1. 高级模板服务器 `src/advanced/index.js`
2. JSX 脚本执行能力
3. 经典 MCP 服务器 `src/index.js`

默认命令走高级模板服务器。经典服务器必须显式使用 `classic` 命名空间。

## 6. 命令面设计

### 6.1 默认高级模板工具

```powershell
cli-anything-indesign tool list --json
cli-anything-indesign tool schema <tool_name> --json
cli-anything-indesign tool call <tool_name> --args args.json --json
cli-anything-indesign tool call <tool_name> --arg key=value --json
```

说明：

- `tool list` 返回高级模板服务器工具清单。
- `tool schema` 返回单个工具的输入 schema。
- `tool call` 调用高级模板工具。
- `--args` 用 JSON 文件传参，适合复杂对象。
- `--arg key=value` 只作为简单参数便利入口，不作为主路径。

### 6.2 经典 MCP 工具

```powershell
cli-anything-indesign classic tool list --json
cli-anything-indesign classic tool schema <tool_name> --json
cli-anything-indesign classic tool call <tool_name> --args args.json --json
```

说明：

- 经典服务器是补充能力。
- Agent 只有在高级模板和脚本执行不能覆盖时才使用 `classic`。
- 不把经典服务器的所有工具提升成顶层命令。

### 6.3 JSX 脚本执行

```powershell
cli-anything-indesign script run path/to/script.jsx --json
Get-Content path/to/script.jsx | cli-anything-indesign script run --stdin --json
```

说明：

- 文件方式是主路径，便于审计、复现和调试。
- `--stdin` 是临时探索入口。
- 第一版优先复用高级模板服务器中的脚本文件执行能力。
- 若 `--stdin` 需要落地执行，CLI 可以把 stdin 内容写入 `.indesign-cli/tmp/` 下的临时 `.jsx`，再调用同一执行链路。

### 6.4 诊断和状态

```powershell
cli-anything-indesign server health --json
cli-anything-indesign session show --json
cli-anything-indesign session clear --json
```

说明：

- `server health` 检查 Node、项目路径、对应 MCP server 能否启动、工具列表能否返回。
- `session show` 输出 `.indesign-cli/session.json`。
- `session clear` 清空本地 CLI 状态。

### 6.5 产物验证

```powershell
cli-anything-indesign export verify path/to/output.pdf --json
cli-anything-indesign export verify path/to/output.idml --json
```

说明：

- `export verify` 不负责导出，只验证产物。
- PDF 至少检查文件存在、大小大于 0、魔术字节 `%PDF`。
- IDML 至少检查文件存在、大小大于 0、ZIP 文件结构可读。
- 其他格式后续按需要扩展。

## 7. 输出格式

所有 `--json` 输出使用统一 envelope：

```json
{
  "ok": true,
  "command": "tool call",
  "backend": "advanced",
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
  "ok": false,
  "command": "script run",
  "backend": "advanced",
  "error": {
    "type": "McpToolError",
    "message": "脚本执行失败",
    "details": {}
  },
  "warnings": []
}
```

规则：

- 机器可读输出写 `stdout`。
- 诊断日志写 `stderr`。
- `--json` 下不要输出混杂的人类说明。
- 错误也必须尽量保持 JSON envelope。

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
  "recent_calls": []
}
```

边界：

- 路径优先存相对当前工作目录的路径。
- 工作区外路径可存绝对路径，但必须标记 `external: true`。
- 只记录最近活动文档和目录，不扫描目录文件树。
- 不保存文档内容。
- 不保存大段脚本内容。
- `recent_calls` 限制长度，建议最多 20 条。
- 支持 `--no-session` 禁止写入状态。
- `.indesign-cli/` 必须加入 `.gitignore`。

## 9. Agent 使用策略

推荐调用顺序：

1. `tool list --json` 查看高级模板能力。
2. `tool schema <tool_name> --json` 查看目标工具参数。
3. 能用高级工具时，使用 `tool call`。
4. 高级工具不能覆盖时，生成 `.jsx` 文件并用 `script run <file.jsx> --json`。
5. 临时探索可用 `script run --stdin --json`。
6. 仍需调用旧能力时，使用 `classic tool list/schema/call`。
7. 生成导出物后，用 `export verify` 做文件级验证。
8. 用 `session show` 获取最近脚本、最近文档和最近输出线索。

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

每类错误都应包含：

- `message`
- `details`
- `backend`
- `command`
- 可选 `hint`

## 11. 测试策略

第一版测试分三层：

### 11.1 不依赖 InDesign 的单元测试

- 参数解析
- JSON envelope
- session 读写
- 路径相对化和 `external` 标记
- `export verify` 对伪造文件的成功/失败判断
- 后端命令构造

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
- 本地 `.indesign-cli/session.json` 保存最小状态。
- 产物验证独立成命令，帮助 Agent 判断真实结果。
