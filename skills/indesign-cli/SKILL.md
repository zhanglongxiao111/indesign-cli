---
name: indesign-cli
description: 当用户需要制作或编辑固定分页 HTML、InDesign 演示文稿、建筑汇报或排版文档，转换 HTML 与 InDesign，修改现有 INDD，或填充既有 InDesign 模板时使用。
tags:
  - InDesign
  - HTML 排版
  - 演示文稿
  - 建筑汇报
---

# InDesign 出版与演示文稿

## 选择路线

- 从零制作、重新设计或制作 HTML/InDesign 演示文稿：读取 [HTML 创作与转换](references/html-authoring.md)，优先用 HTML 完成。
- 编辑现有 INDD：读取 [直接编辑 InDesign](references/direct-indesign-editing.md)。只有非常小的单一修改使用原子工具，稍长的编辑使用脚本。
- 使用现成 INDD 模板填充文字和图片：读取 [填充 InDesign 模板](references/template-filling.md)。
- 现有 INDD 需要大幅重构：先按 [HTML 创作与转换](references/html-authoring.md) 反向导出，再用 HTML 重建。
- 命令不存在、版本过旧或环境异常：读取 [安装与更新](references/installation-and-update.md)。

## 通用规则

- 公司成品统一使用 `indesign-cli-agent`。**一律用绝对路径调用**（Setup 返回的 `registration.launcher_abspath`，下文写作 `<agent-exe>`）；只有 `Get-Command indesign-cli-agent` 能查到时才可用裸命令。PowerShell 优先用 `pwsh`（PowerShell 7）：SA-AIAPP 运行环境已默认配置 `shell: pwsh` 并自动安装便携版（PATH 已前插，环境变量 `SA_AGENT_PWSH` 指向其绝对路径）；只有 `pwsh` 确实不存在时才退回 `powershell.exe`（5.1，注意无 BOM 脚本按 ANSI 解码、中文输出易乱码）。两者都加 `-NoProfile -ExecutionPolicy Bypass`。
- 调用工具前先运行 `tool schema <tool_id>`（`<tool_id>` 是位置参数）；`tool search` 必须带 `--query`；`tool list` 没有 `--all`。
- 复杂参数一律写入 UTF-8 JSON 文件再用 `--args-file` 传入；内联 JSON 会被 shell 转义打坏。
- 不关闭或覆盖用户已经打开的文档；需要改原文件时先确认，默认另存新文件。
- NAS 素材使用主机名 UNC 原位引用；只有用户要求可移动交付包或工具明确需要时才复制。
- 以工具返回的 `ok`、`error` 和 `artifacts` 判断结果；失败时按错误提示处理，不把“命令执行过”当作完成。`error` 里的字段各自含义、`error.category` 五种取值分别该怎么做，见 [失败时能拿到什么](references/failure-handling.md)。
