---
name: cli-anything-indesign
description: 当 Agent 需要通过本项目 CLI 操作 Adobe InDesign、发现工具、调用 MCP 能力、执行 JSX 或验证导出产物时使用。
---

# cli-anything-indesign

## 使用入口

优先使用：

```powershell
cli-anything-indesign tool domains
cli-anything-indesign tool list --domain template
cli-anything-indesign tool schema template.run_jsx_file
cli-anything-indesign tool call template.run_jsx_file --args args.json
```

多步骤或工具选择不明确时，优先生成 `.jsx` 文件并执行：

```powershell
cli-anything-indesign script run path/to/script.jsx
```

导出后必须验证产物：

```powershell
cli-anything-indesign export verify path/to/output.pdf
```

## 规则

- 默认读取 domain 摘要，不默认拉全量 schema。
- 只对明确候选执行 `tool schema`。
- `hidden_handler` 只能作为能力线索，不能直接调用。
- 需要连续状态时，依赖 JSON 返回值、脚本标签、显式路径或 `.indesign-cli/session.json`。
- 不记录客户文档内容、客户名称或外部完整路径。
- 真实 InDesign 行为必须走现有 MCP/COM/JSX 链路，不做模拟成功。
