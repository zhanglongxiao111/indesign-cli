# InDesign MCP / CLI Prompt

你可以通过 InDesign MCP server 或 `indesign-cli` 操作真实 Adobe InDesign。先发现工具，再调用工具；不要把工具清单、schema 或参数名凭记忆写死。

## 当前入口

- 经典 MCP：`node src/index.js`
- 高级模板 MCP：`node src/advanced/index.js`
- Agent CLI：`indesign-cli`

MCP 两个入口都通过 `src/core/mcpServer.js` 和 `src/core/toolRouter.js` 调用 `src/tools/index.js` registry。旧 `src/handlers/`、`src/types/`、`src/core/InDesignMCPServer.js` 已删除。

## 发现工具

使用 CLI 时，按需查询：

```powershell
indesign-cli tool domains
indesign-cli tool search --query "<keyword>"
indesign-cli tool list --domain <domain>
indesign-cli tool schema <tool_id>
indesign-cli tool explain <tool_id>
```

Node-backed 工具来自 `src/core/indesign-tool-registry.json` artifact。当前基线是 classic 114 / internal 30 / advanced 6，合计 150。internal 工具在 CLI 中显示为 `source: hidden_handler`，MCP 不直接暴露。

## 常用工作流

1. 检查环境：

```powershell
indesign-cli server health --deep --connect-indesign
```

2. 查询 domain 和目标工具 schema。
3. 用 `tool call <tool_id> --args-file args.json` 调用单个明确工具。
4. 多步骤、复杂排版、调试探针或可复跑逻辑写成 `.jsx`，用 `script run` 执行。
5. 导出后用 `export verify` 验证产物。

## 调用注意事项

- 需要真实文档上下文的工具，先创建或打开文档。
- 文件路径使用绝对路径；复杂参数写入 UTF-8 JSON 文件。
- 不要关闭用户已有 InDesign 文档；只关闭本轮明确创建的临时文档。
- 工具返回失败时读取 `error.code`、`error.message`、`error.hint` 或 MCP 返回体，不要盲目重试写操作。
- `state_uncertain: true` 后先运行 `indesign-cli session doctor`。
- 客户文档内容、客户名称和完整私有路径不要写入日志、反馈或文档。

## 工具选择

优先使用已有工具：

- 文档、页面、跨页、图层、母版、页面对象、分组
- 文本框、表格、图片、基础图形、样式、色板
- PDF / IDML / 图片导出和验证
- Book、Presentation、模板槽位

找不到明确工具时，先用 `tool search` 换英文关键词继续查；确实缺工具再使用 `script.run` 写短 JSX 或文件模式 JSX。明显工具缺口应通过 `feedback.report` 上报。

## 开发口径

新增或修改内置工具时，当前标准路径是：

1. 修改 `src/tools/<domain>/` tool-module。
2. 由域 `index.js` 聚合；新域再接入 `src/tools/index.js`。
3. 运行：

```powershell
node src/core/artifact.js --write
node src/core/artifact.js --check
node scripts/check_architecture.mjs
node tests/architecture/registry.test.mjs
```

Python CLI 不扫描旧 handler/type 路径，也不维护平行 schema。artifact 是从 registry 单向投影出来的消费物，不是真相本身。
