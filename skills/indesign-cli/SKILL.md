---
name: indesign-cli
description: Use when 用户需要制作或编辑固定分页 HTML、InDesign 演示文稿、建筑汇报或排版文档，转换 HTML 与 InDesign，修改现有 INDD，或填充既有 InDesign 模板。
---

# InDesign 出版与演示文稿

## 选择路线

- 从零制作、重新设计或制作 HTML/InDesign 演示文稿：读取 [HTML 创作与转换](references/html-authoring.md)，优先用 HTML 完成。
- 编辑现有 INDD：读取 [直接编辑 InDesign](references/direct-indesign-editing.md)。只有非常小的单一修改使用原子工具，稍长的编辑使用脚本。
- 使用现成 INDD 模板填充文字和图片：读取 [填充 InDesign 模板](references/template-filling.md)。
- 现有 INDD 需要大幅重构：先按 [HTML 创作与转换](references/html-authoring.md) 反向导出，再用 HTML 重建。
- 命令不存在、版本过旧或环境异常：读取 [安装与更新](references/installation-and-update.md)。

## 通用规则

- 公司成品统一使用 `indesign-cli-agent`。
- 调用工具前先运行 `tool schema <tool_id>`；复杂参数写入 UTF-8 JSON，再用 `--args-file` 传入。
- 不关闭或覆盖用户已经打开的文档；需要改原文件时先确认，默认另存新文件。
- NAS 素材使用主机名 UNC 原位引用；只有用户要求可移动交付包或工具明确需要时才复制。
- 以工具返回的 `ok`、`error` 和 `artifacts` 判断结果；失败时按错误提示处理，不把“命令执行过”当作完成。
