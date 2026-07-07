# plan 审核 Agent 任务书

日期：2026-07-05

模型：`gpt-5.5` / `xhigh`

状态：已派发

## 目标

独立审核当前架构全面重构调研文档、正式 spec 和两个 plan，判断 plan 是否已经正确吸收调研结论，是否仍存在双 registry、hidden handler 误删、CLI overlay 被覆盖、advanced server 边界混乱、测试门禁不足、过度设计或执行顺序不可控的问题。

## 必读文档

- `AGENTS.md`
- `docs/README.md`
- `docs/AI协作/本地Agent/进行中/2026-07-04_架构全面重构审查/README.md`
- `docs/AI协作/本地Agent/进行中/2026-07-04_架构全面重构审查/00_审查总账.md`
- `docs/AI协作/本地Agent/进行中/2026-07-04_架构全面重构审查/01_结构图与指标.md`
- `docs/AI协作/本地Agent/进行中/2026-07-04_架构全面重构审查/99_汇总结论与spec修订记录.md`
- `docs/AI协作/本地Agent/进行中/2026-07-04_架构全面重构审查/报告_*.md`
- `docs/superpowers/specs/2026-07-04-indesign-architecture-refactor-design.md`
- `docs/superpowers/plans/2026-07-05-indesign-architecture-refactor-plan.md`
- `docs/superpowers/specs/2026-07-03-indesign-tool-semantics-design.md`
- `docs/superpowers/plans/2026-07-04-indesign-tool-semantics-plan.md`

## 必查代码锚点

- `src/types/index.js`
- `src/core/InDesignMCPServer.js`
- `src/advanced/index.js`
- `src/types/toolDefinitionsAdvancedTemplates.js`
- `src/handlers/helpHandlers.js`
- `agent-harness/cli_anything/indesign/core/catalog.py`
- `agent-harness/cli_anything/indesign/core/domains.py`
- `agent-harness/cli_anything/indesign/core/hidden_handler_schemas.py`
- `agent-harness/cli_anything/indesign/tests/test_core.py`
- `tests/real-e2e/lib/scenarios.mjs`
- `tests/tool-suite/run-all-tools.js`
- `MANIFEST.in`
- `pyproject.toml`

## 审核重点

1. 架构 plan 是否把 canonical registry/source map 放在第一优先级。
2. 语义 plan 是否已经彻底取消独立 `src/semantics/registry.js` / `semantics-registry.json` 口径。
3. `classic.hidden_handler` 是否被保护为待归类对象，而不是被推断为死代码。
4. CLI primitive 和 plugin overlay 是否不会被 Node artifact 覆盖。
5. advanced server 是否保持独立入口，只共享 registry schema / validator / artifact projection。
6. handler runtime 是否足够薄，没有吸收 session、target、slot、label、documentState。
7. 测试计划是否能避免 `tests/index.js --required` false green。
8. 执行顺序是否避免半迁移状态。
9. plan 是否机械可执行，是否仍存在模糊词、占位项或伪代码。

## 输出要求

只允许新增报告文件：

```text
docs/AI协作/本地Agent/进行中/2026-07-04_架构全面重构审查/报告_plan审核_Agent_2026-07-05.md
```

报告必须包含：

- 总体结论：`可执行` / `先修订` / `不建议执行`
- P0 / P1 / P2 findings，按严重程度排序
- 每条 finding 必须包含文件路径、行号或可复现命令、证据、影响、建议改法
- 明确列出“确认无问题”的关键点
- 不要修改 plan、spec 或代码
