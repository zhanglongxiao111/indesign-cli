# cli-anything-indesign

Agent 专用 InDesign CLI harness。

常用命令：

```powershell
cli-anything-indesign --version
cli-anything-indesign tool domains
cli-anything-indesign tool list --domain template
cli-anything-indesign tool schema template.run_jsx_file
cli-anything-indesign tool call template.run_jsx_file --args args.json
cli-anything-indesign script run scripts/check.jsx
cli-anything-indesign script run --stdin
cli-anything-indesign export verify output/result.pdf
cli-anything-indesign server health
cli-anything-indesign session show
```

`script run` 是 Agent 做真实 InDesign 验证的主入口：

- 文件模式保留 `$.fileName` 和相对 `#include` 行为。
- stdin 模式适合临时探针脚本，并支持中文输入。
- JSX 可以返回普通字符串，也可以返回 `JSON.stringify(...)` 的字符串。
- 返回 JSON 字符串时，CLI 输出会包含 `data.result_json`，避免调用方二次解析 `data.parsed.result`。
- 成功和失败都会记录到当前目录的 `.indesign-cli/session.json`。

本 CLI 复用当前项目的 MCP server 和 ExtendScript/COM 执行链路，不重新实现 InDesign 自动化能力。
