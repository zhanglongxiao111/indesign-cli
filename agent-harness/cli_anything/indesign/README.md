# indesign-cli

Agent 专用 InDesign CLI harness。

常用命令：

```powershell
indesign-cli --version
indesign-cli tool domains
indesign-cli tool list --domain template
indesign-cli tool schema template.run_jsx_file
indesign-cli tool call template.run_jsx_file --args-file args.json
indesign-cli script run scripts/check.jsx
indesign-cli script run --stdin
indesign-cli export verify output/result.pdf
indesign-cli server setup
indesign-cli server health
indesign-cli-agent run --source \\server\tools\indesign-cli\latest.json -- server health --deep --connect-indesign
indesign-cli session show
```

配套 Skill 文档需要手动复制：

```text
skills/indesign-cli/SKILL.md
```

目标项目路径：

```text
<project-root>\.codex\skills\indesign-cli\SKILL.md
```

`script run` 是 Agent 做真实 InDesign 验证的主入口：

- 文件模式保留 `$.fileName` 和相对 `#include` 行为。
- stdin 模式适合临时探针脚本，并支持中文输入。
- JSX 可以返回普通字符串，也可以返回 `JSON.stringify(...)` 的字符串。
- 返回 JSON 字符串时，CLI 输出会包含 `data.result_json`，避免调用方二次解析 `data.parsed.result`。
- 成功和失败都会记录到当前目录的 `.indesign-cli/session.json`。

环境变量 `INDESIGN_CLI_SERVER_ROOT` 可把内置 Node server 目录固定到稳定短路径（须包含 `package.json`、`src/index.js`、`src/advanced/index.js`），用于规避长路径下 `winax` 构建失败；排查步骤见根 `README.md`。

受控工位可用 `indesign-cli-agent.exe` 单文件自举入口：它释放内置 Node/server/预编译 `winax` 到 `%LOCALAPPDATA%\indesign-cli\`，并在每次 `run` 前按服务器 `latest.json` 强制更新。

本 CLI 复用当前项目的 MCP server 和 ExtendScript/COM 执行链路，不重新实现 InDesign 自动化能力。
