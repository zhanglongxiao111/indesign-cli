# 直接编辑 InDesign

适用于修改现有 INDD，不经过 HTML。

## 选择执行方式

- 只有非常小的单一修改才使用原子工具，例如替换一处文字、修改一个属性或置入一张图片。
- 只要涉及多个对象、多个步骤、重复操作、前后依赖或统一调整，就写成 JSX 文件，通过 `script run` 一次执行。
- 不要把一段连续编辑拆成大量原子工具调用。

## 原子工具

```powershell
indesign-cli-agent tool search --query "<英文动作或对象>"
indesign-cli-agent tool call <tool_id> --args-file args.json
```

参数以 `tool schema <tool_id>` 为准。

## 脚本编辑

把完整操作写入一个 `.jsx` 文件，并返回包含 `ok`、`step`、`data` 和 `error` 的 JSON 结果：

```powershell
indesign-cli-agent script run "<script.jsx>" --timeout-ms 900000
```

脚本应自行完成目标确认、连续修改、保存和必要的结果检查。不要依赖上一次命令留下的变量。

## 文件保护

- 不关闭用户原有文档，不调用 `app.quit()`，不批量关闭文档。
- 默认另存新文件；只有用户明确要求时才覆盖原文件。
- 多文档场景必须明确目标文档，不能依赖“当前活动文档”猜测。
- 导出后用 `export verify` 检查产物；正式成果保持打开供用户查看。
