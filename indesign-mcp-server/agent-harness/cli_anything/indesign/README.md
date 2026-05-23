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
cli-anything-indesign export verify output/result.pdf
cli-anything-indesign server health
cli-anything-indesign session show
```

本 CLI 复用当前项目的 MCP server 和 ExtendScript/COM 执行链路，不重新实现 InDesign 自动化能力。
