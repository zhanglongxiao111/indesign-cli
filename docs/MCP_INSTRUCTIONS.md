# InDesign MCP 使用说明

本文说明当前 MCP server 的接入和使用口径。长期开发边界以 `AGENTS.md` 为准；工具事实以当前代码和 registry artifact 为准。

## 环境要求

- Windows
- Adobe InDesign 桌面版，与 server 运行在同一 Windows 用户会话
- Node.js 18+
- `winax` 可用

运行时通过 Windows COM 控制 InDesign。`stdout` 保留给 MCP 协议，日志和诊断信息写 `stderr`。

## 启动入口

经典 MCP server：

```powershell
node src/index.js
```

高级模板 MCP server：

```powershell
node src/advanced/index.js
```

两个入口都通过 `src/core/mcpServer.js` 创建 server，并通过 `src/core/toolRouter.js` 调用 registry entry。差异只在 profile：

| 入口 | profile | 用途 |
| ---- | ------- | ---- |
| `src/index.js` | `classic` | 常规 InDesign 自动化工具 |
| `src/advanced/index.js` | `advanced` | 高级模板工具 |

旧 `src/core/InDesignMCPServer.js` 已删除。

## 工具真相

当前工具真相是 `src/tools/index.js` registry。每个内置工具在 `src/tools/<domain>/` 内共置：

- MCP tool name
- JSON Schema
- contract
- handler
- CLI id / alias

`src/handlers/` 和 `src/types/` 已删除，不再作为工具定义或实现来源。

registry 按 profile 控制 MCP 暴露：

| registry profile | MCP 暴露 | CLI source |
| ---------------- | -------- | ---------- |
| `classic` | 经典 server 暴露 | `classic` |
| `advanced` | 高级 server 暴露 | `advanced` |
| internal | MCP 不暴露 | `hidden_handler` |

internal 工具不是死代码；它们经 artifact 进入 CLI 和 E2E，可按产品决策调整 profile。

## CLI artifact

Python CLI 的 Node-backed 工具目录只读 checked-in artifact：

```text
src/core/indesign-tool-registry.json
```

生成和校验：

```powershell
node src/core/artifact.js --write
node src/core/artifact.js --check
```

artifact 缺失或 `registry_hash` 不符是硬错误。不要让 CLI 重新扫描旧 handler/type 路径或在 Python 侧维护 hidden schema。

当前 Node-backed 基线：

| source | 数量 |
| ------ | ---- |
| `classic` | 114 |
| `hidden_handler` | 30 |
| `advanced` | 6 |
| 合计 | 150 |

CLI 展示 domain 可能沿用历史 id，如 `master.*`、`page.*`；tool-module 归属域仍以 `src/tools/<domain>/` 和 registry `domain` 为准。

## MCP 配置示例

```json
{
  "mcpServers": {
    "indesign": {
      "command": "node",
      "args": ["D:/AI/mcp-indesign/src/index.js"],
      "env": {}
    },
    "indesign-advanced": {
      "command": "node",
      "args": ["D:/AI/mcp-indesign/src/advanced/index.js"],
      "env": {}
    }
  }
}
```

## 使用原则

- 先创建或打开文档，再调用需要文档上下文的工具。
- 图片、导出和脚本文件使用绝对路径，尤其是中文、空格、反斜杠和网络路径。
- 生成 JSX 时必须处理字符串和路径转义。
- 不要关闭用户已有文档；只关闭本轮明确创建的临时测试文档。
- 导出 PDF、IDML 或图片后，用 `indesign-cli export verify <path>` 验证产物。
- 工具参数以 MCP `ListTools` 返回的 schema 或 CLI `tool schema <tool_id>` 为准，不要凭旧文档猜字段。

## 维护基线

文档或工具目录变更后至少运行：

```powershell
node src/core/artifact.js --check
node scripts/check_architecture.mjs
node tests/architecture/registry.test.mjs
node tests/index.js --required
python -m pytest agent-harness\cli_anything\indesign\tests -q
```

触及真实 InDesign 行为时，再运行对应 `tests/real-e2e/` 阶段或全量测试，并在结果中说明是否跑了真实 InDesign。
