# 任务：MCP / registry / router 审查

## 角色

你是只读架构审查 Agent。不要修改任何文件，不要运行破坏性命令，不要提交。

模型要求：`gpt-5.4-mini`，reasoning effort `xhigh`。

## 目标

审查当前 MCP 工具定义、server 调度和 handler export 结构，判断 `src/tools/registry.js` + `src/core/toolRouter.js` 的重构设计是否完整、是否漏掉现有能力。

## 重点文件

- `AGENTS.md`
- `src/core/InDesignMCPServer.js`
- `src/types/index.js`
- `src/types/toolDefinitions*.js`
- `src/handlers/index.js`
- `src/advanced/index.js`
- `scripts/validate_schemas.js`
- `scripts/check_duplicates.mjs`
- `scripts/quick_check.mjs`
- `docs/superpowers/specs/2026-07-04-indesign-architecture-refactor-design.md`

## 必答问题

1. 当前 MCP exposed tool、handler method、server switch 是否存在数量或命名不一致？
2. registry entry 至少需要哪些字段，才能替代当前 switch 并服务 CLI？
3. `src/advanced/index.js` 是否也需要纳入同一 registry，还是保持独立？
4. 哪些 hidden / partial / currently unexposed 能力不能被误删？
5. 设计文档中 registry / router 批次是否有遗漏或顺序风险？

## 输出格式

返回一份可直接落盘为 `报告_MCP_registry_router_Agent.md` 的 Markdown：

- 结论摘要
- 证据表：文件、行号或可搜索片段、观察
- 风险列表：P0/P1/P2
- 对正式 spec 的修改建议
- 建议的验证命令

