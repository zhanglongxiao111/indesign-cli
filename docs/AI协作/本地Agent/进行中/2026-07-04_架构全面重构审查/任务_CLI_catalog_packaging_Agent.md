# 任务：CLI catalog / packaging 审查

## 角色

你是只读架构审查 Agent。不要修改任何文件，不要运行破坏性命令，不要提交。

模型要求：`gpt-5.4-mini`，reasoning effort `xhigh`。

## 目标

审查 Python CLI 工具目录、domain 推断、server root 解析和打包清单，判断 Node registry artifact 接入设计是否可行。

## 重点文件

- `agent-harness/cli_anything/indesign/core/catalog.py`
- `agent-harness/cli_anything/indesign/core/domains.py`
- `agent-harness/cli_anything/indesign/core/router.py`
- `agent-harness/cli_anything/indesign/core/runtime.py`
- `agent-harness/cli_anything/indesign/core/mcp_backend.py`
- `agent-harness/cli_anything/indesign/core/hidden_backend.py`
- `agent-harness/cli_anything/indesign/core/hidden_handler_schemas.py`
- `agent-harness/cli_anything/indesign/indesign_cli.py`
- `MANIFEST.in`
- `pyproject.toml`
- `docs/superpowers/specs/2026-07-04-indesign-architecture-refactor-design.md`

## 必答问题

1. 当前 CLI catalog 的真相源有哪些？哪些字段是推断出来的？
2. Node registry artifact 应该放在哪里，Python 读取优先级应该如何设计？
3. 打包时哪些文件必须进入 wheel / sdist？
4. hidden handler 能力迁移到 registry 后，`hidden_handler_schemas.py` 如何处理？
5. 当前 spec 是否漏了 CLI alias、plugin tool、batch、script.run、export.verify 等非 MCP 工具？

## 输出格式

返回一份可直接落盘为 `报告_CLI_catalog_packaging_Agent.md` 的 Markdown：

- 结论摘要
- CLI 真相源和推断点列表
- artifact 接入建议
- packaging 修改清单
- 风险列表：P0/P1/P2
- 对正式 spec 的修改建议
- 建议的验证命令

