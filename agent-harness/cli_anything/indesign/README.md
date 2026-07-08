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
indesign-cli-agent install
indesign-cli-agent server health --deep --connect-indesign
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
- 返回 JSON 对象字符串时，CLI 输出会把解析后的对象字段直接放在 `data.parsed`；普通文本结果仍在 `data.parsed.result`。
- 成功和失败都会记录到当前目录的 `.indesign-cli/session.json`。

环境变量 `INDESIGN_CLI_SERVER_ROOT` 可把内置 Node server 目录固定到稳定短路径（须包含 `package.json`、`src/index.js`、`src/advanced/index.js`），用于规避长路径下 `winax` 构建失败；排查步骤见根 `README.md`。

受控工位可用 `indesign-cli-agent.exe` 单文件自举入口：先执行 `indesign-cli-agent install` 注册当前用户命令，之后直接运行 `indesign-cli-agent <indesign-cli 参数...>`。更新源由工具默认处理：NAS 优先，GitHub 兜底；不再使用旧版 `run` 子命令配 `--source` 的入口。

本 CLI 复用当前项目的 MCP server 和 ExtendScript/COM 执行链路，不重新实现 InDesign 自动化能力。
