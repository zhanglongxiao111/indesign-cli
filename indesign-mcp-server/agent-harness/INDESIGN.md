# InDesign Agent CLI

`cli-anything-indesign` 是给 Agent 使用的 InDesign CLI。默认输出 JSON，主要用于发现工具、调用现有 MCP 能力、执行 JSX、验证产物和读取最小 session 线索。

推荐顺序：

1. `tool domains`
2. `tool list --domain <domain>`
3. `tool schema <tool_id>`
4. `tool call <tool_id> --args args.json`
5. 多步骤自动化优先写 JSX，再执行 `script run <file.jsx>`
6. 生成 PDF 或 IDML 后执行 `export verify <path>`

第一版不做常驻服务。InDesign 进程和打开文档可以连续存在，Node MCP 子进程内存不跨命令保留。跨步骤需要继续使用的信息，必须依赖命令 JSON 返回值、InDesign 真实文档状态、脚本标签、显式文件路径或 `.indesign-cli/session.json`。

不要把客户文档内容、客户名称或外部资产完整路径写进日志和 session。外部路径默认只保留扩展名和 hash。
