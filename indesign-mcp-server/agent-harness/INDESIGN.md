# InDesign CLI

`indesign-cli` 是给 Agent 使用的 InDesign CLI。默认输出 JSON，主要用于发现工具、调用现有 MCP 能力、执行 JSX、验证产物和读取最小 session 线索。

旧命令 `cli-anything-indesign` 保留为兼容别名；新项目统一使用 `indesign-cli`。

推荐顺序：

1. `tool domains`
2. `tool list --domain <domain>`
3. `tool schema <tool_id>`
4. `tool call <tool_id> --args args.json`
5. 多步骤自动化优先写 JSX，再执行 `script run <file.jsx>`
6. 生成 PDF 或 IDML 后执行 `export verify <path>`

`script run` 注意事项：

- 支持 `script run <file.jsx>` 和 `script run --stdin`。
- `--stdin` 支持中文脚本输入，会按 UTF-8 和本机编码兜底读取。
- ExtendScript 执行环境会补最小 `JSON.stringify` / `JSON.parse`，Agent 可以直接让 JSX 返回 JSON 字符串。
- JSX 返回 JSON 字符串时，CLI 会保留 `data.parsed.result`，并额外提供已解析的 `data.result_json`。
- 失败调用也会写入 `.indesign-cli/session.json`，便于复盘最近一次失败。
- 复杂多步骤操作优先写进一个 JSX 文件，避免跨 Node 子进程依赖内存状态。

第一版不做常驻服务。InDesign 进程和打开文档可以连续存在，Node MCP 子进程内存不跨命令保留。跨步骤需要继续使用的信息，必须依赖命令 JSON 返回值、InDesign 真实文档状态、脚本标签、显式文件路径或 `.indesign-cli/session.json`。

不要把客户文档内容、客户名称或外部资产完整路径写进日志和 session。外部路径默认只保留扩展名和 hash。
