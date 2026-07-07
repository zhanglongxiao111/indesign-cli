# InDesign MCP / CLI 架构全面重构 Implementation Plan

> **状态：已被 `docs/superpowers/plans/2026-07-06-indesign-terminal-architecture-plan.md` 取代（2026-07-06 用户决策：放弃渐进兼容，一次性重构到终态）。本文档仅存档，不要按此执行。旧 `src/handlers/`、`src/types/`、`src/core/InDesignMCPServer.js` 已删除，本文相关内容只用于历史追溯。**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/superpowers/specs/2026-07-04-indesign-architecture-refactor-design.md` 先完成 canonical registry、router、CLI artifact、handler runtime 和测试拆分，为后续语义契约清掉重复映射和历史包袱。

**Architecture:** `src/core/toolRegistry.js` 是唯一 Node-backed built-in source map；`src/core/toolRouter.js` 只做分发；`src/core/toolRegistryArtifact.js` 只做 CLI / docs 投影。CLI primitive 和 plugin 继续在 Python / manifest overlay 中维护，advanced server 保持独立入口，只共享 registry schema、validator 和 artifact projection。

**Tech Stack:** Node.js ESM、Windows COM/winax、Python CLI harness、现有 MCP handler/type/test 结构、real E2E runner。

---

## 计划口径

这个计划是语义契约实施计划的前置计划。执行顺序必须先完成本计划的 Task 1 到 Task 4，再执行 `docs/superpowers/plans/2026-07-04-indesign-tool-semantics-plan.md`。

这个计划不写伪代码。每个任务只描述文件范围、机械动作、验证命令和完成条件。重构期间不得改变现有工具外部行为。

## 执行前必读

- `docs/AI协作/本地Agent/进行中/2026-07-04_架构全面重构审查/README.md`：本轮架构审查目录入口，包含子 agent 任务书和报告清单。
- `docs/AI协作/本地Agent/进行中/2026-07-04_架构全面重构审查/99_汇总结论与spec修订记录.md`：主 agent 采纳结论和 spec 修订记录。
- `docs/AI协作/本地Agent/进行中/2026-07-04_架构全面重构审查/报告_plan审核_Agent_2026-07-05.md`：`gpt-5.5 xhigh` 对本 plan 的二次审核和已采纳修订点。
- `docs/superpowers/specs/2026-07-04-indesign-architecture-refactor-design.md`：本计划对应的正式架构设计。

## 文件边界

### 新增

- `src/core/toolRegistry.js`：Node-backed built-in 工具 source map，覆盖 `classic.exposed`、`classic.hidden_handler`、`advanced.exposed`。
- `src/core/toolRouter.js`：按 registry entry 调用 handler 的薄 dispatch。
- `src/core/toolRegistryArtifact.js`：把 registry 投影为 CLI / docs 可消费 artifact。
- `src/core/indesign-tool-registry.json`：由生成命令写出的 canonical artifact，不手工编辑。
- `src/handlers/runtime.js`：执行、JSON parse、响应包装薄助手。
- `scripts/check_architecture.mjs`：registry、switch、help catalog、大文件 guardrail 检查，初期 warning。
- `tests/architecture/registry.test.mjs`：registry/source map 对账测试。
- `tests/architecture/required-runner.test.mjs`：确认 architecture suite 已进入 `tests/index.js --required`。
- `tests/unit/toolRouter.test.mjs`：router 行为测试。
- `tests/unit/handlerRuntime.test.mjs`：handler runtime 薄层测试。

### 修改

- `src/core/InDesignMCPServer.js`：从手写 switch 迁移到 `toolRouter.call()`。
- `src/advanced/index.js`：保持独立入口，接入 registry 校验和 artifact 投影。
- `src/handlers/index.js`：继续导出兼容 facade。
- `src/handlers/helpHandlers.js`：从 registry 派生或接受 registry 对账。
- `src/handlers/*.js`：分批使用 `runtime.js`，再按职责拆分大 handler。
- `src/types/index.js`、`src/types/toolDefinitionsAdvancedTemplates.js`：作为 registry 输入，不能另建平行 schema。
- `agent-harness/cli_anything/indesign/core/catalog.py`：优先读取 canonical artifact。
- `agent-harness/cli_anything/indesign/core/domains.py`：退为 fallback；Node-backed 工具不再靠它推断 domain / id。
- `agent-harness/cli_anything/indesign/core/hidden_handler_schemas.py`：迁移期间保留兼容。
- `agent-harness/cli_anything/indesign/tests/test_core.py`：补 artifact、overlay、fallback 契约测试。
- `MANIFEST.in`、`pyproject.toml`：确认 `src/core/indesign-tool-registry.json` 随 server assets 进入 sdist / wheel。
- `tests/index.js`、`tests/tool-suite/run-all-tools.js`、`tests/real-e2e/lib/scenarios.mjs`：接入新检查，后续拆分大测试。
- `README.md`、`README.en.md`、`skills/indesign-cli/SKILL.md`、`docs/MCP_INSTRUCTIONS.md`、`docs/LLM_PROMPT.md`、`docs/README.md`：同步工具目录来源和执行基线。

---

## Task 1: canonical registry/source map

**Files:**
- Create: `src/core/toolRegistry.js`
- Create: `src/core/toolRegistryArtifact.js`
- Generate: `src/core/indesign-tool-registry.json`
- Create: `scripts/check_architecture.mjs`
- Create: `tests/architecture/registry.test.mjs`
- Create: `tests/architecture/required-runner.test.mjs`
- Modify: `tests/index.js`

- [ ] 从 `src/types/index.js` 收集 `114` 个 `classic.exposed` 工具。
- [ ] 从 `src/core/InDesignMCPServer.js` 收集 `30` 个 switch-only 工具，并标记为 `classic.hidden_handler`。
- [ ] 从 `src/types/toolDefinitionsAdvancedTemplates.js` 和 `src/advanced/index.js` 收集 `6` 个 `advanced.exposed` 工具。
- [ ] 每个 entry 显式声明 `name`、`source`、`visibility`、`domain`、`definition`、`handler`、`cli.id`、`cli.aliases`、`contract`。
- [ ] `classic.exposed` 的 `definition.name` 必须等于 `entry.name`。
- [ ] `classic.hidden_handler` 必须有 handler 和 schema 来源；没有 schema 的 entry 必须记录迁移备注，不能删除。
- [ ] `cli.primitive` 和 `plugin.exposed` 不写入 Node registry，只在 artifact 合并规则里保留字段契约。
- [ ] `toolRegistryArtifact.js` 提供确定命令：`node src/core/toolRegistryArtifact.js --write` 写入 artifact，`node src/core/toolRegistryArtifact.js --check` 校验 artifact 未漂移。
- [ ] `scripts/check_architecture.mjs` 输出 exposed、hidden、advanced、missing handler、missing definition、help catalog drift、大文件 warning；registry/source/switch/help/catalog 漂移 hard fail，文件大小 guardrail 初期 warning。
- [ ] `tests/architecture/registry.test.mjs` 固定 `114 / 30 / 6` 基线，防止工具数量静默漂移。
- [ ] `tests/architecture/required-runner.test.mjs` 断言 architecture suite 已进入 `tests/index.js --required`。
- [ ] `tests/index.js` 接入 `Architecture Registry` suite，且该 suite 必须 `required: true`。

**Verify:**

- [ ] `node --check src/core/toolRegistry.js`
- [ ] `node --check src/core/toolRegistryArtifact.js`
- [ ] `node --check scripts/check_architecture.mjs`
- [ ] `node src/core/toolRegistryArtifact.js --write`
- [ ] `node src/core/toolRegistryArtifact.js --check`
- [ ] `node tests/architecture/registry.test.mjs`
- [ ] `node tests/architecture/required-runner.test.mjs`
- [ ] `node scripts/check_architecture.mjs`
- [ ] `node scripts/validate_schemas.js`
- [ ] `node scripts/check_duplicates.mjs`
- [ ] `node scripts/quick_check.mjs`
- [ ] `node tests/index.js --required`

**Complete when:**

- [ ] registry 能列出 `classic.exposed: 114`、`classic.hidden_handler: 30`、`advanced.exposed: 6`。
- [ ] architecture check 能发现 switch / definitions / advanced map / help catalog 的漂移。
- [ ] artifact stale 会被 `toolRegistryArtifact.js --check` 或 `scripts/check_architecture.mjs` 阻断。
- [ ] runtime 行为没有改动。

## Task 2: thin router and help projection

**Files:**
- Create: `src/core/toolRouter.js`
- Create: `tests/unit/toolRouter.test.mjs`
- Modify: `src/core/InDesignMCPServer.js`
- Modify: `src/advanced/index.js`
- Modify: `src/handlers/helpHandlers.js`
- Modify: `tests/index.js`

- [ ] `toolRouter.call(name, args)` 只负责查 registry、校验 handler 存在、调用 handler、返回 handler 原结果。
- [ ] `InDesignMCPServer.js` 的手写 switch 改为 registry dispatch。
- [ ] Task 2 完成后，`InDesignMCPServer.js` 不允许新增工具 `case`；新增工具只能进入 `toolRegistry.js` 和对应 types / handlers。
- [ ] unknown tool 的错误信息保持现有 MCP 行为。
- [ ] `classic.hidden_handler` 不进入 MCP exposed definitions，但 router 可按内部调用入口调度。
- [ ] `src/advanced/index.js` 不并入 classic server，只共享 registry 校验和 artifact projection。
- [ ] `HelpHandlers` 从 registry 派生工具目录；迁移不到位的 help 文本必须被 `scripts/check_architecture.mjs` 检查。
- [ ] `tests/unit/toolRouter.test.mjs` 覆盖 exposed 调用、hidden 调用、unknown tool、handler missing。

**Verify:**

- [ ] `node --check src/core/InDesignMCPServer.js`
- [ ] `node --check src/advanced/index.js`
- [ ] `node --check src/core/toolRouter.js`
- [ ] `node tests/unit/toolRouter.test.mjs`
- [ ] `node tests/index.js --required`
- [ ] `node tests/real-e2e/run-architecture-presentation.mjs --inventory --offline`

**Complete when:**

- [ ] `InDesignMCPServer.js` 不再维护完整工具 switch。
- [ ] classic exposed 工具行为不变。
- [ ] hidden handler 没有被误删。

## Task 3: CLI catalog artifact and overlays

**Files:**
- Modify: `src/core/toolRegistryArtifact.js`
- Generate: `src/core/indesign-tool-registry.json`
- Modify: `agent-harness/cli_anything/indesign/core/catalog.py`
- Modify: `agent-harness/cli_anything/indesign/core/domains.py`
- Modify: `agent-harness/cli_anything/indesign/core/hidden_handler_schemas.py`
- Modify: `agent-harness/cli_anything/indesign/tests/test_core.py`
- Modify: `MANIFEST.in`
- Modify: `pyproject.toml`

- [ ] artifact 输出 `schema_version`、`generated_at`、`tool_count`、`registry_hash`、source 分组。
- [ ] 每个 Node-backed 工具输出 `name`、`source`、`visibility`、`domain`、`cli.id`、`aliases`、`contract`、`arg_names`、`schema_size`。
- [ ] Python CLI 优先读取 active server root 的 `src/core/indesign-tool-registry.json`。
- [ ] Python CLI fallback 到 wheel 内 server root artifact。
- [ ] fallback 到旧 `infer_domain()` 时必须返回 warning，不能静默当 truth。
- [ ] `export.verify`、`server.*`、`session.*`、`script.run`、`tool.batch` 保持 Python CLI primitive overlay。
- [ ] plugin 工具保持 runtime manifest overlay，不写入静态 artifact。
- [ ] `hidden_handler_schemas.py` 在迁移完成前保留，且与 registry source 对账。
- [ ] packaging 测试确认 artifact 进入 sdist / wheel。
- [ ] packaging smoke 不只检查 artifact 文件存在，还要检查 wheel / sdist 内 artifact 的 `registry_hash` 与当前 source map 一致。

**Verify:**

- [ ] `indesign-cli tool domains`
- [ ] `indesign-cli tool list --source classic --callable-only`
- [ ] `indesign-cli tool list --source advanced --callable-only`
- [ ] `indesign-cli tool schema export.verify`
- [ ] `indesign-cli tool schema script.run`
- [ ] `python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q`
- [ ] `node src/core/toolRegistryArtifact.js --check`
- [ ] `node scripts/check_architecture.mjs`

**Complete when:**

- [ ] Node-backed 工具的 CLI id / domain / alias 来自 artifact。
- [ ] CLI primitive 和 plugin overlay 没有被 artifact 覆盖。
- [ ] artifact 打包路径可验证。

## Task 4: thin handler runtime

**Files:**
- Create: `src/handlers/runtime.js`
- Create: `tests/unit/handlerRuntime.test.mjs`
- Modify: `src/handlers/layerHandlers.js`
- Modify: `src/handlers/utilityHandlers.js`
- Modify: `src/handlers/exportHandlers.js`
- Modify: `src/handlers/spreadHandlers.js`
- Modify: `src/handlers/bookHandlers.js`

- [ ] `runtime.js` 只提供执行、JSON parse、响应包装助手。
- [ ] `runtime.js` 不读取或写入 `sessionManager`。
- [ ] `runtime.js` 不承担 target resolution、slot、label、template、documentState。
- [ ] 迁移顺序固定为 `layerHandlers.js`、`utilityHandlers.js`、`exportHandlers.js`、`spreadHandlers.js`、`bookHandlers.js`。
- [ ] 每迁移一个 handler 文件，保持外部响应 envelope 不变。
- [ ] `tests/unit/handlerRuntime.test.mjs` 覆盖 strict JSON、structured error、raw result fallback。

**Verify:**

- [ ] `node --check src/handlers/runtime.js`
- [ ] `node tests/unit/handlerRuntime.test.mjs`
- [ ] `node scripts/validate_schemas.js`
- [ ] `node scripts/check_duplicates.mjs`
- [ ] `node scripts/quick_check.mjs`
- [ ] `node tests/index.js --required`

**Complete when:**

- [ ] 小 handler 的执行和 JSON parse 重复逻辑已收口。
- [ ] runtime 没有吸收业务语义。

## Task 5: split large handlers by responsibility

**Files:**
- Create: `src/handlers/pageItem/basic.js`
- Create: `src/handlers/pageItem/scriptLabels.js`
- Create: `src/handlers/pageItem/listing.js`
- Create: `src/handlers/template/fileRunner.js`
- Create: `src/handlers/template/inspection.js`
- Create: `src/handlers/template/composition.js`
- Create: `src/handlers/template/population.js`
- Create: `src/handlers/page/lifecycle.js`
- Create: `src/handlers/page/properties.js`
- Create: `src/handlers/page/layout.js`
- Create: `src/handlers/page/placement.js`
- Create: `src/handlers/page/snapshot.js`
- Create: `src/handlers/page/guides.js`
- Create: `src/handlers/page/background.js`
- Create: `src/handlers/graphics/shapes.js`
- Create: `src/handlers/graphics/images.js`
- Create: `src/handlers/graphics/objectStyles.js`
- Create: `src/handlers/graphics/inspection.js`
- Create: `src/handlers/document/lifecycle.js`
- Create: `src/handlers/document/inspection.js`
- Create: `src/handlers/document/preferences.js`
- Create: `src/handlers/document/structure.js`
- Create: `src/handlers/document/cloud.js`
- Create: `src/handlers/document/layout.js`
- Create: `src/handlers/document/validation.js`
- Modify: existing facade files under `src/handlers/`
- Modify: `src/handlers/index.js`
- Modify: `src/core/toolRegistry.js`

- [ ] 每个 domain 先建细模块，再让旧 facade re-export / 合并细模块。
- [ ] registry 可逐步指向细模块，但旧 import 路径保持兼容。
- [ ] 拆分顺序固定为 `pageItemHandlers.js`、`advancedTemplateHandlers.js`、`pageHandlers.js`、`graphicsHandlers.js`、`documentHandlers.js`。
- [ ] `documentHandlers.js` 最后拆；它包含 lifecycle、preferences、XML、cloud、layout、validation，回归面最大。
- [ ] 拆分期间不改工具名、不改参数、不改响应 envelope。
- [ ] facade 文件不继续承接新功能。

**Verify after each domain:**

- [ ] 对本 domain 的变更 JS/MJS 文件逐个运行 `node --check`。
- [ ] `node tests/index.js --required`
- [ ] `pageItemHandlers.js` 拆分后运行：`node tests/real-e2e/run-architecture-presentation.mjs --phase destructive_scratch --offline`
- [ ] `advancedTemplateHandlers.js` 拆分后运行：`node tests/real-e2e/run-architecture-presentation.mjs --phase template_flow --offline`
- [ ] `pageHandlers.js` 拆分后运行：`node tests/real-e2e/run-architecture-presentation.mjs --phase main_deck_setup --offline`
- [ ] `graphicsHandlers.js` 拆分后运行：`node tests/real-e2e/run-architecture-presentation.mjs --phase content_text_table --offline`
- [ ] `documentHandlers.js` 拆分后运行：`node tests/real-e2e/run-architecture-presentation.mjs --phase export_package --offline`
- [ ] `node scripts/check_architecture.mjs`

**Complete when:**

- [ ] 大 handler 按职责拆分。
- [ ] 旧 facade 保持兼容。
- [ ] registry 指向清晰模块。

## Task 6: split tests and strengthen gates

**Files:**
- Create: `tests/real-e2e/scenarios/bootstrap_contract.mjs`
- Create: `tests/real-e2e/scenarios/main_deck_setup.mjs`
- Create: `tests/real-e2e/scenarios/content_text_table.mjs`
- Create: `tests/real-e2e/scenarios/template_flow.mjs`
- Create: `tests/real-e2e/scenarios/destructive_scratch.mjs`
- Create: `tests/real-e2e/scenarios/presentation_hidden.mjs`
- Create: `tests/real-e2e/scenarios/book_hidden.mjs`
- Create: `tests/real-e2e/scenarios/export_package.mjs`
- Create: `agent-harness/cli_anything/indesign/tests/test_cli_entrypoint.py`
- Create: `agent-harness/cli_anything/indesign/tests/test_package_metadata.py`
- Create: `agent-harness/cli_anything/indesign/tests/test_catalog_router.py`
- Create: `agent-harness/cli_anything/indesign/tests/test_plugins.py`
- Create: `agent-harness/cli_anything/indesign/tests/test_health_runtime.py`
- Create: `agent-harness/cli_anything/indesign/tests/test_paths_envelope.py`
- Create: `agent-harness/cli_anything/indesign/tests/test_bootstrapper.py`
- Modify / keep gated: `agent-harness/cli_anything/indesign/tests/test_full_e2e.py`
- Modify: `tests/real-e2e/lib/scenarios.mjs`
- Modify: `agent-harness/cli_anything/indesign/tests/test_core.py`
- Modify: `tests/tool-suite/run-all-tools.js`
- Modify: `tests/index.js`

- [ ] `tests/real-e2e/lib/scenarios.mjs` 只保留兼容聚合，不继续新增场景。
- [ ] Python `test_core.py` 只保留兼容入口，不继续新增 catalog / plugin / runtime 场景。
- [ ] `tests/tool-suite/run-all-tools.js` 改为消费 registry artifact 或 CLI catalog。
- [ ] `tests/index.js --required` 保持顶层基础门禁，文档中不再把它描述成全覆盖。
- [ ] `tests/unified-test-runner.js` 标记 legacy，确认无调用者后再迁走或删除。

**Verify:**

- [ ] `node tests/index.js --required`
- [ ] `node tests/tool-suite/run-all-tools.js`
- [ ] `node tests/real-e2e/run-agent-ux-hardening.mjs --offline`
- [ ] `node tests/real-e2e/run-architecture-presentation.mjs --inventory --offline`
- [ ] `node scripts/check_architecture.mjs`
- [ ] `python -m pytest agent-harness\cli_anything\indesign\tests -q`

**Complete when:**

- [ ] 大测试文件职责拆出。
- [ ] registry / router / catalog 改坏时不会被 `tests/index.js --required` 单独掩盖。

## Task 7: cleanup and docs

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `skills/indesign-cli/SKILL.md`
- Modify: `docs/MCP_INSTRUCTIONS.md`
- Modify: `docs/LLM_PROMPT.md`
- Modify: `docs/README.md`
- Modify: `docs/技术决策/` new or existing architecture decision document

- [ ] 删除无引用 fallback。
- [ ] 删除不再承担 Node-backed 工具职责的 domain 推断规则。
- [ ] 清理过时 README / Skill / MCP prompt 工具目录说法。
- [ ] 将长期约束沉淀到 `docs/技术决策/` 或更新 `AGENTS.md`。
- [ ] 保留本轮审查目录，不移动原始报告。

**Verify:**

- [ ] `rg -n "src/tools|src/semantics/registry|semantics-registry|export_semantics_registry" .`
- [ ] `git diff --check`
- [ ] `node scripts/check_architecture.mjs`
- [ ] `node tests/index.js --required`
- [ ] `python -m pytest agent-harness\cli_anything\indesign\tests -q`

**Complete when:**

- [ ] 文档、Skill、CLI help 和 registry source map 口径一致。
- [ ] 旧双 registry 口径不存在。
- [ ] 语义契约计划可以在 canonical registry 基础上执行。

## 执行顺序

1. Task 1 到 Task 3 必须连续完成，避免 registry、router、CLI catalog 半迁移。
2. Task 4 可以在 Task 3 后独立推进。
3. Task 5 每次只拆一个 domain。
4. Task 6 在 Task 1 到 Task 3 后开始，随后伴随 Task 5 分批补强。
5. Task 7 只能在前面任务验证完成后执行。

## 最小验证集合

每个批次结束至少运行：

```powershell
git diff --check
node scripts\validate_schemas.js
node scripts\check_duplicates.mjs
node scripts\quick_check.mjs
node src\core\toolRegistryArtifact.js --check
node scripts\check_architecture.mjs
node tests\architecture\registry.test.mjs
node tests\index.js --required
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
```

触及真实 InDesign 行为时追加：

```powershell
node tests\real-e2e\run-architecture-presentation.mjs --phase main_deck_setup --offline
node tests\real-e2e\run-architecture-presentation.mjs --phase content_text_table --offline
node tests\real-e2e\run-architecture-presentation.mjs --phase template_flow --offline
node tests\real-e2e\run-architecture-presentation.mjs --phase destructive_scratch --offline
node tests\real-e2e\run-architecture-presentation.mjs --phase presentation_hidden --offline
node tests\real-e2e\run-architecture-presentation.mjs --phase book_hidden --offline
node tests\real-e2e\run-architecture-presentation.mjs --phase export_package --offline
```

发布前追加：

```powershell
node tests\tool-suite\run-all-tools.js
node tests\real-e2e\run-agent-ux-hardening.mjs --offline
node tests\real-e2e\run-architecture-presentation.mjs --full --offline
INDESIGN_E2E=1 python -m pytest agent-harness\cli_anything\indesign\tests\test_full_e2e.py -q
```
