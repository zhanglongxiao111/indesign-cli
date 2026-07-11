# 直接编辑 InDesign

适用于小幅修改现有 INDD，不经过 HTML。

1. 检查 InDesign 连接：

```powershell
indesign-cli-agent server health --deep --connect-indesign
```

2. 查找工具：

```powershell
indesign-cli-agent tool search --query "<英文动作或对象>"
```

3. 按顶层规则读取 schema、写入参数并调用：

```powershell
indesign-cli-agent tool call <tool_id> --args-file args.json
```

没有合适工具时，才编写短小的 JSX 文件并用 `script run` 执行。

操作规则：

- 不关闭用户原有文档，不调用 `app.quit()`，不批量关闭文档。
- 默认另存新文件；只有用户明确要求时才覆盖原文件。
- 多文档场景必须明确目标文档，不能依赖“当前活动文档”猜测。
- 导出后用 `export verify` 检查产物；正式成果保持打开供用户查看。
