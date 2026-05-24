# indesign-cli

Agent 专用 InDesign CLI harness。

常用命令：

```powershell
indesign-cli --version
indesign-cli tool domains
indesign-cli tool list --domain template
indesign-cli tool schema template.run_jsx_file
indesign-cli tool call template.run_jsx_file --args args.json
indesign-cli script run scripts/check.jsx
indesign-cli script run --stdin
indesign-cli export verify output/result.pdf
indesign-cli server setup
indesign-cli server health
indesign-cli session show
indesign-cli skill install --target D:\AI\html-indesign
```

`cli-anything-indesign` 仍可作为旧项目兼容别名使用。

`script run` 是 Agent 做真实 InDesign 验证的主入口：

- 文件模式保留 `$.fileName` 和相对 `#include` 行为。
- stdin 模式适合临时探针脚本，并支持中文输入。
- JSX 可以返回普通字符串，也可以返回 `JSON.stringify(...)` 的字符串。
- 返回 JSON 字符串时，CLI 输出会包含 `data.result_json`，避免调用方二次解析 `data.parsed.result`。
- 成功和失败都会记录到当前目录的 `.indesign-cli/session.json`。

本 CLI 复用当前项目的 MCP server 和 ExtendScript/COM 执行链路，不重新实现 InDesign 自动化能力。
