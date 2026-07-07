# 任务：测试 / E2E 审查

## 角色

你是只读架构审查 Agent。不要修改任何文件，不要运行破坏性命令，不要提交。

模型要求：`gpt-5.4-mini`，reasoning effort `xhigh`。

## 目标

审查当前测试入口、真实 E2E 场景和 Python CLI 测试结构，给出重构期间的验证策略和测试拆分方案。

## 重点文件

- `tests/index.js`
- `tests/unified-test-runner.js`
- `tests/real-e2e/lib/scenarios.mjs`
- `tests/real-e2e/run-architecture-presentation.mjs`
- `tests/real-e2e/validators/`
- `tests/tool-suite/`
- `tests/test-*.js`
- `agent-harness/cli_anything/indesign/tests/test_core.py`
- `docs/superpowers/specs/2026-07-04-indesign-architecture-refactor-design.md`

## 必答问题

1. 当前测试入口有哪些？哪些适合每批重构必跑？
2. `tests/real-e2e/lib/scenarios.mjs` 应如何按职责拆分？
3. Python `test_core.py` 应如何拆分，哪些测试必须保留在兼容入口？
4. registry / router / handler runtime / CLI artifact 各自需要哪些新增测试？
5. 当前 spec 的验证基线是否足够，是否漏掉重要命令？

## 输出格式

返回一份可直接落盘为 `报告_tests_e2e_Agent.md` 的 Markdown：

- 结论摘要
- 当前测试地图
- 分批验证矩阵
- 测试拆分建议
- 风险列表：P0/P1/P2
- 对正式 spec 的修改建议
- 建议的验证命令

