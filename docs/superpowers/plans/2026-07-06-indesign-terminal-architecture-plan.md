# InDesign 终态架构一次性重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/superpowers/specs/2026-07-06-indesign-terminal-architecture-design.md` 一次性重构到终态：tool-module 共置、registry 纯聚合、双入口共享 server 工厂、CLI artifact-only、旧结构物理删除。行为等价由 golden master 保证，不留兼容垫片。

**Architecture:** `src/tools/<domain>/` 按域组织自包含 tool-module（schema + contract + handler 共置）；`src/tools/index.js` 纯聚合 + 加载校验；`src/core/mcpServer.js` 唯一 server 工厂按 profile 过滤；`src/core/artifact.js` 单向投影 JSON 给 Python CLI；`src/types/`、`src/handlers/`、`InDesignMCPServer.js`、`domains.py`、`hidden_handler_schemas.py` 终态不存在。

**Tech Stack:** Node.js ESM、Windows COM/winax、Python CLI harness、real E2E runner。

---

## 执行进度

| Task | 状态 | 负责人 | 更新时间 | 备注 |
| ---- | ---- | ------ | -------- | ---- |
| Task 0 冻结、快照与基线导出 | completed | implementation subagent (`gpt-5.5 high`) / review subagent (`gpt-5.4 xhigh`) | 2026-07-07 | spec review 与 code quality rereview 已通过；stabilized golden baseline 可作为 Task 1+ 对比基线 |
| Task 1 终态骨架 + layer 试点域 | completed | implementation subagent (`gpt-5.5 high`) / review subagent (`gpt-5.4 xhigh`) | 2026-07-07 | 最终复审 PASS；layer 试点、profile gate、artifact 幂等和 Task 1 验证清单均已通过 |
| Task 2 15 个域并行迁移 | completed | per-domain implementation subagents (`gpt-5.5 high`) / review subagent (`gpt-5.4 xhigh`) | 2026-07-07 | 最终复审 PASS；15 域迁移、150-tool 聚合、CLI metadata 对账、help registry 派生、`page`/`group` 顺序与拆分均已通过 |
| Task 3 原子切换与物理删除 | completed | implementation subagent (`gpt-5.5 high`) / review subagent (`gpt-5.4 xhigh`) | 2026-07-07 | 二轮复审 PASS；入口切换、旧结构物理删除、full golden A 门禁和旧口径清理均已通过 |
| Task 4 CLI artifact-only 终态 | completed | implementation subagent (`gpt-5.5 high`) / review subagent (`gpt-5.4 xhigh`) | 2026-07-07 | 二次复审 PASS；artifact-only catalog/internal bridge、legacy token 门禁、E2E backend 口径和 Task 4 验证清单均已通过 |
| Task 5 测试架构终态 | review | implementation subagent (`gpt-5.5 high`) / review subagent (`gpt-5.4 xhigh`) | 2026-07-07 | P0 修复已提交：`tool-suite` 区分 skipped/expectedFailure/failed，runner error 或 unexpected failure 非零退出，最新 artifact-driven run 为 114/114 passed；待复审 |
| Task 6 终局验收 | pending | controller + review subagent (`gpt-5.4 xhigh`) | 2026-07-07 | 未启动 |
| Task 7 文档与治理同步 | pending | implementation subagent (`gpt-5.5 high`) | 2026-07-07 | 未启动 |

## 计划口径

- 本计划取代 `docs/superpowers/plans/2026-07-05-indesign-architecture-refactor-plan.md`。
- 全程在专用分支 `refactor/terminal-architecture` 上执行；golden master 全绿 + 全量验证矩阵通过后才合并 `master`。回滚 = 放弃分支。
- 重构期间冻结功能开发：不新增工具、不改工具行为。冻结点在 pre-freeze stabilization 完成后、正式 golden master 录制前；golden master 录制后到 Task 6 验收前，`master` 上如有并行提交必须 rebase 并重录快照。
- 语义契约计划已重写为 `docs/superpowers/plans/2026-07-06-indesign-tool-semantics-plan.md`（终态口径），在本计划完成并合并 `master` 后执行。
- 不写伪代码。每个任务只描述文件范围、机械动作、验证命令和完成条件。

## 执行前必读

- `docs/superpowers/specs/2026-07-06-indesign-terminal-architecture-design.md`：本计划对应的终态设计（含 tool-module 契约、profiles 模型、golden master 方法、完成标准）。
- `docs/AI协作/本地Agent/进行中/2026-07-04_架构全面重构审查/`：现状调研事实基线（数量、耦合、CLI 结构）仍然有效。
- `AGENTS.md`：沟通、文档、测试规则。

## 域清单与并行分工

16 个域，域间零 import。`layer`（最小，75 行 / 少量工具）作为试点域在 Task 1 打穿全链路；其余 15 个域在 Task 2 可由并行 agent 各自迁移：

| 域 | 旧 handler 来源 | 旧 schema 来源 | profiles | 备注 |
| --- | --- | --- | --- | --- |
| layer | `layerHandlers.js` | `toolDefinitionsLayer.js` | classic | Task 1 试点 |
| document | `documentHandlers.js` | `toolDefinitionsDocument.js` | classic + internal(9) | 9 个 internal 需补写 schema |
| page | `pageHandlers.js` | `toolDefinitionsPage.js` | classic | |
| text | `textHandlers.js` | `toolDefinitionsContent.js`（部分） | classic | |
| style | `styleHandlers.js` | `toolDefinitionsContent.js`（部分） | classic | |
| graphics | `graphicsHandlers.js` | `toolDefinitionsContent.js`（部分） | classic | |
| masterSpread | `masterSpreadHandlers.js` | `toolDefinitionsMasterSpread.js` | classic | |
| spread | `spreadHandlers.js` | `toolDefinitionsSpread.js` | classic | `place_xml_on_spread` 为 internal |
| pageItem | `pageItemHandlers.js` | `toolDefinitionsPageItemGroup.js`（部分） | classic | |
| group | `groupHandlers.js` | `toolDefinitionsPageItemGroup.js`（部分） | classic | |
| book | `bookHandlers.js` | `toolDefinitionsBook.js` + `hidden_handler_schemas.py` | internal(15) | Python schema 翻译为 JS |
| presentation | `presentationHandlers.js` | `toolDefinitionsPresentation.js` + `hidden_handler_schemas.py` | internal(6) | Python schema 翻译为 JS |
| export | `exportHandlers.js` | `toolDefinitionsExport.js` | classic | |
| utility | `utilityHandlers.js` | `toolDefinitionsUtility.js` | classic | |
| help | `helpHandlers.js` | （手写目录，废弃） | classic | 输出改为 registry 派生 |
| template | `advancedTemplateHandlers.js` | `toolDefinitionsAdvancedTemplates.js` | advanced(6) | |

工具归属以 `InDesignMCPServer.js` switch 的 handler 绑定为准；`toolDefinitionsContent.js` / `toolDefinitionsPageItemGroup.js` 等一对多 schema 文件按工具逐个归入对应域。

每域迁移的统一机械规则：

1. 按职责拆职责模块（参考旧方案拆分表：document → lifecycle/inspection/preferences/structure/cloud/layout/validation 等），每个模块导出 `tools` 数组。
2. 每个工具 = 一个 `defineTool({...})`：`name`、`domain`、`profiles`、`cli`、`contract`、`inputSchema`、`handler` 齐全。`cli.id` 与 `domain` 按当前 CLI catalog 现值固化，不改现有 id。
3. handler 方法体从旧 handler 类的 `static async` 方法原样搬入，仅替换执行/解析调用为 `core/runtime.js` 助手；**不改脚本拼装逻辑**（golden C 会逐工具对比生成脚本）。
4. 域内共享 JSX helper 放 `<domain>/_shared.js`；发现跨域引用则提升到 `src/utils/` 并记入迁移报告。
5. `contract` 初值按 `catalog.py` 当前推断值填写（Task 0 导出的 contract 基线表），存疑处标记待 Task 6 对账确认。
6. 域 `index.js` 聚合本域全部 `tools` 并导出。

---

## Pre-freeze stabilization

Task 0 允许在正式冻结和 golden master 录制前完成有限的 baseline blocker fixes。它们的目的只是在现有架构上得到可录制、可重放的稳定基线；它们不是 Task 1+ 的终态架构迁移，也不能扩展为新增工具、改工具语义或重写 handler/schema/runner。

允许范围只包含阻塞 C=150 快照构造、CLI catalog/schema 稳定性、contract baseline 真实性或 D offline runner 通过的最小修复。真实 stabilization 提交集合是：

- `adc13f2`：首次落盘 Task 0 baseline，同时包含 D blocker 修复、exposed schema 漏项修复和 E2E 关闭目标修复。
- `4fe0c03`：修复 C 快照覆盖缺口和 D stale failure artifact。
- `ed59ed7`：把 contract baseline 推断收回到 CLI 当前口径。
- `881ed01`：抽出 `catalog.py` canonical `_destructive()` helper，并把 D inventory 纳入 `cli.primitive/feedback.report`。
- `5c3f7bc`：为 D runner 增加 fresh raw catalog evidence 校验和 golden evidence 文件。

代码和 golden 的冻结点定义为 `5c3f7bc` 完成之后、Task 1 启动之前；后续文档提交只说明边界，不改变基线事实。

完整 sanctioned touched surface：

- `src/handlers/groupHandlers.js`：修正 `page.add_item_to_group` 使用不存在的 `group.add(item)`，改为保留原 group 元数据并通过 `page.groups.add(groupItems)` 重新成组；否则 D runner 无法通过。
- `tests/test-handler-contracts.js`：为 `page.add_item_to_group` 的 group API 修复增加轻量回归断言，防止恢复为不存在的 `group.add(item)`。
- `src/types/toolDefinitionsContent.js`、`src/types/toolDefinitionsMasterSpread.js`、`src/types/toolDefinitionsPage.js`：补齐 3 处 exposed schema 漏项，使 C 快照构造和 CLI catalog/schema 输出稳定；这不是新增工具。
- `tests/real-e2e/lib/scenarios.mjs`：`close_document` 在 D runner 中显式传入 `expectedDocumentName` 和 `allowDiscard`，避免多文档状态下关闭目标不明确。
- `scripts/migration/record_golden.mjs`：补齐 C 参数构造覆盖、清理 stale D failure、使用稳定 D run-id 投影，并在 D runner 后读取 raw `reports/tool-catalog-summary.json` / `tool-catalog.json` 做硬校验。
- `scripts/migration/contract_baseline.py`：按当前 CLI 真实目录导出 150 个 Node-backed 工具 contract baseline，switch-only 工具通过 CLI canonical helper/contract path 推断字段。
- `agent-harness/cli_anything/indesign/core/catalog.py` 与 `agent-harness/cli_anything/indesign/tests/test_core.py`：最小抽取 `_destructive()` canonical helper，并覆盖 `feedback.report` / `cli.primitive` catalog 口径。
- `tests/real-e2e/lib/catalog.mjs`：把 `cli.primitive` 纳入 D inventory，使 feedback 域进入 raw D evidence。
- `tests/migration/record-golden-d-evidence.test.mjs`：验证 D raw evidence golden 文件包含 `total=150`、`cli.primitive=1` 和 `feedback.report`。
- `docs/AI协作/本地Agent/进行中/2026-07-06_终态重构/golden/`：A/B/C/D 快照、contract baseline、schema net-new whitelist、skip 清单和 D raw evidence 文件。

后续 Task 1+ 的 golden diff 均以该 stabilized baseline 为准。

冻结后仍保持原计划原则：不新增工具、不改工具行为；除计划白名单明确记录的 schema 净新增、help 派生输出和 artifact 字段外，Task 1+ 的 golden 回放必须白名单外 diff 为零。

## Task 0: 冻结、快照与基线导出

**Files:**
- Create: `scripts/migration/record_golden.mjs`
- Create: `scripts/migration/contract_baseline.py`
- Generate: `docs/AI协作/本地Agent/进行中/2026-07-06_终态重构/golden/`（A/B/C/D 快照与 contract 基线表）
- Create: `docs/AI协作/本地Agent/进行中/2026-07-06_终态重构/README.md`（迁移目录入口）
- Modify during pre-freeze stabilization only: `src/handlers/groupHandlers.js`、`tests/test-handler-contracts.js`、`src/types/toolDefinitionsContent.js`、`src/types/toolDefinitionsMasterSpread.js`、`src/types/toolDefinitionsPage.js`、`tests/real-e2e/lib/scenarios.mjs`、`agent-harness/cli_anything/indesign/core/catalog.py`、`agent-harness/cli_anything/indesign/tests/test_core.py`、`tests/real-e2e/lib/catalog.mjs`
- Create during pre-freeze stabilization only: `tests/migration/record-golden-d-evidence.test.mjs`

- [ ] 前置确认：反馈闭环批 1（`docs/superpowers/plans/2026-07-06-indesign-agent-feedback-loop-plan.md` Task 1–3，含 `feedback` 域）已合并 `master`——它会改变 `tool list` 输出，必须先合并再录 golden master。
- [ ] 建分支 `refactor/terminal-architecture`。
- [ ] `record_golden.mjs` 录制 **A**：classic / advanced 两个 server 的 ListTools 全量 JSON（工具名 + inputSchema）。
- [ ] 录制 **B**：`indesign-cli tool list --json`（全 source）与当前 CLI 可发现工具的 `tool schema` 输出；当前不可发现的 9 个 switch-only 工具不伪造 CLI schema，记录为"终态 schema 净新增"白名单。
- [ ] 录制 **C**：150 个 Node-backed 工具 × 最小合法 args。114 个 classic + 6 个 advanced 从 MCP schema 构造；21 个 Book/Presentation 从 `hidden_handler_schemas.py` 构造；9 个当前无 schema 的 switch-only 工具从 handler 参数用法手工构造并在 skip/白名单中注明证据来源。mock `scriptExecutor` 捕获生成的 JSX 脚本文本 + 响应 envelope 形状。无法构造或拼装前依赖外部状态的工具标记 skip 并记录原因清单。
- [ ] 录制 **D**：`node tests/real-e2e/run-architecture-presentation.mjs --full --offline` 与 `node tests/real-e2e/run-agent-ux-hardening.mjs --offline` 通过基线（保存 runner 输出摘要）。
- [ ] `contract_baseline.py` 不直接用裸 `Catalog()`；必须按当前 CLI 构建真实目录：`McpBackend(repo_root, 'src/index.js')` + `McpBackend(repo_root, 'src/advanced/index.js')` + hidden handler scan，再排除 `CLI_PRIMITIVES` / plugin，导出 150 个 Node-backed 工具的 `side_effects` / `destructive` / `mutates_document` / `writes_filesystem` / `needs_indesign` / `requires_active_document` 推断值为 JSON 基线表（供 Task 2 填 contract、Task 6 对账）。9 个当前无 CLI schema 的 switch-only 工具仍必须进入 contract baseline。
- [ ] 9 个无 schema 工具（`preflight_document`、`data_merge`、`get_document_xml_structure`、`export_document_xml`、`save_document_to_cloud`、`open_cloud_document`、`validate_document`、`cleanup_document`、`place_xml_on_spread`）在 golden 目录记录"schema 净新增"白名单。

**Verify:**

- [ ] golden 目录含 A/B/C/D 四组快照 + contract 基线表 + skip 清单。
- [ ] `git status` 确认快照已落盘在迁移目录。

**Complete when:**

- [ ] 四组快照可重放（脚本幂等，重跑 diff 为空）。
- [ ] 此后 `master` 方向功能冻结生效。

## Task 1: 终态骨架 + layer 试点域打穿全链路

**Files:**
- Create: `src/tools/_contract.js`
- Create: `src/tools/index.js`
- Create: `src/tools/layer/`（职责模块 + `index.js`）
- Create: `src/core/mcpServer.js`
- Create: `src/core/toolRouter.js`
- Create: `src/core/runtime.js`
- Create: `src/core/artifact.js`
- Create: `tests/architecture/registry.test.mjs`
- Create: `tests/architecture/required-runner.test.mjs`
- Create: `tests/unit/toolRouter.test.mjs`
- Create: `tests/unit/handlerRuntime.test.mjs`
- Modify: `tests/index.js`（接入 `Architecture Registry` suite，`required: true`）

- [ ] `_contract.js`：`defineTool()` 校验必填字段、schema 形状、handler 为函数、contract 布尔全集、profiles 合法；`buildRegistry()` 断言 name / cli.id 唯一、domain 与目录一致、静态不变量（`destructive ⇒ mutatesDocument`、`requiresActiveDocument ⇒ needsInDesign`、export 域 `writesFilesystem`、`producesArtifacts ⇒ writesFilesystem`）。
- [ ] `runtime.js`：`runScript` / `runJsonScript` / `runScriptFile` / `parseJsonResult` + 响应包装复用；支持 strict / structured error / raw fallback 策略；禁止 sessionManager 与业务语义（测试断言其 import 面）。
- [ ] `mcpServer.js`：`createMcpServer({ profile })`，ListTools = registry 按 profile 过滤，CallTool → `toolRouter.call`；unknown tool 错误保持现有 MCP 行为。
- [ ] `toolRouter.js`：查 registry、校验 handler、调用、原样返回；internal 工具可被内部调用入口调度但不进 ListTools。
- [ ] `artifact.js`：`--write` / `--check`；输出 `schema_version` / `generated_at` / `registry_hash` / `tool_count` / source 分组 / 每工具完整 `inputSchema` 与 `contract`。
- [ ] 迁移 `layer` 域为试点：按统一机械规则完成 tool-module 化。
- [ ] `registry.test.mjs`：加载校验 + 数量断言（试点期断言 layer 域数量，Task 3 后升级为 114/30/6 全量基线）+ artifact `--check`。
- [ ] `required-runner.test.mjs`：断言 architecture suite 在 `--required` 选择结果中。
- [ ] 双轨验证：临时脚本对比 layer 域新链路（mcpServer ListTools + router 调用 mock 执行）与 golden A/C 中 layer 工具的快照，diff 为空。此时旧 `InDesignMCPServer.js` 尚未改动，线上行为不变。

**Verify:**

- [ ] 新增 JS 文件逐个 `node --check`
- [ ] `node tests/architecture/registry.test.mjs`
- [ ] `node tests/architecture/required-runner.test.mjs`
- [ ] `node tests/unit/toolRouter.test.mjs`
- [ ] `node tests/unit/handlerRuntime.test.mjs`
- [ ] `node src/core/artifact.js --write && node src/core/artifact.js --check`
- [ ] `python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q`
- [ ] `node tests/index.js --required`

**Complete when:**

- [ ] layer 域工具在新链路上与 golden 快照逐字节一致（schema 与生成脚本）。
- [ ] tool-module 契约、聚合校验、artifact 投影全部被试点域验证过。
- [ ] 并行迁移的模板（目录形态 + 机械规则 + 验收方式）就绪。

## Task 2: 15 个域并行迁移

**Files:**
- Create: `src/tools/document/`、`page/`、`text/`、`style/`、`graphics/`、`masterSpread/`、`spread/`、`pageItem/`、`group/`、`book/`、`presentation/`、`export/`、`utility/`、`help/`、`template/`
- Modify: `src/tools/index.js`（逐域接入聚合）

每域一个并行 agent，输入：本计划域清单行 + 统一机械规则 + `_contract.js` + layer 试点样例 + contract 基线表 + golden C 中本域快照。并行 agent 只创建/修改本域 `src/tools/<domain>/` 文件和本域 `index.js`；不直接改全局 `src/tools/index.js`。全局聚合由主控 agent 在每批域完成后按域清单顺序串行接入，避免并行冲突。

域内动作：

- [ ] 按职责拆模块并 tool-module 化本域全部工具（含 internal）。
- [ ] `book` / `presentation`：把 `hidden_handler_schemas.py` 中 21 个 Python schema 翻译为 JS `inputSchema`，语义保真（字段、required、描述、默认值）。
- [ ] `document`：为 9 个无 schema 工具从 handler 参数用法反推补写 `inputSchema`，每个附一行来源注释指向 handler 参数证据；标记待人工 review。
- [ ] `help`：help 工具输出改为从 registry 生成；不保留手写目录。
- [ ] `template`：6 个工具 `profiles: ['advanced']`。
- [ ] 每域完成后由主控 agent 串行接入 `src/tools/index.js` 聚合，并记录接入顺序和数量增量。
- [ ] 每域跑域级双轨对比：本域工具的新链路 schema + 生成脚本 vs golden 快照，diff 为空（白名单：本域补写 schema、help 输出）。

**Verify（每域）:**

- [ ] 本域新增文件逐个 `node --check`
- [ ] `node tests/architecture/registry.test.mjs`（数量随聚合递增）
- [ ] 域-E2E 对应 phase：pageItem/group → `--phase destructive_scratch`；template → `--phase template_flow`；page/masterSpread/spread → `--phase main_deck_setup`；text/style/graphics → `--phase content_text_table`；document/export → `--phase export_package`；book → `--phase book_hidden`；presentation → `--phase presentation_hidden`；均 `--offline`。此阶段 E2E 仍走旧链路，用于确认旧行为未被误改。

**Complete when:**

- [ ] `src/tools/` 聚合出 150 个工具，registry 断言 114 / 30 / 6。
- [ ] 9 个补写 schema 经人工 review 签字（记录在迁移目录）。
- [ ] 全部域的双轨 diff 报告归档，白名单外差异为零。

## Task 3: 原子切换与物理删除

**Files:**
- Modify: `src/index.js`（→ `createMcpServer({ profile: 'classic' })`）
- Modify: `src/advanced/index.js`（→ `createMcpServer({ profile: 'advanced' })`，删除 `TOOL_MAP`）
- Delete: `src/core/InDesignMCPServer.js`
- Delete: `src/handlers/`（全部 17 个文件，含 `index.js` facade）
- Delete: `src/types/`（全部 13 个文件）
- Modify: `tests/index.js`、`tests/test-handler-contracts.js`（改为从 `src/tools/index.js` registry 消费）
- Modify: `scripts/validate_schemas.js`、`scripts/check_duplicates.mjs`、`scripts/quick_check.mjs`（命令入口保留，内部改为消费 registry）
- Create: `scripts/check_architecture.mjs`（registry 加载校验 + artifact `--check` + 文件大小 guardrail warning；六方对账逻辑不存在因为对账对象已删除）

- [ ] 切换两个入口壳，共享 `mcpServer.js`。
- [ ] 删除旧结构前 `rg` 列出全部引用，逐个改到 registry；删除后 `rg -n "InDesignMCPServer|from '.*handlers/|from '.*types/" src tests scripts` 零命中。
- [ ] `registry.test.mjs` 升级为 114 / 30 / 6 全量基线断言。
- [ ] 切换后立即回放 golden A / B / C：白名单外 diff 为零。

**Verify:**

- [ ] `node --check src/index.js && node --check src/advanced/index.js`
- [ ] 变更 JS 文件逐个 `node --check`（`git diff --name-only -- '*.js' '*.mjs'` 驱动）
- [ ] `node scripts/validate_schemas.js && node scripts/check_duplicates.mjs && node scripts/quick_check.mjs`
- [ ] `node scripts/check_architecture.mjs`
- [ ] `node tests/index.js --required`
- [ ] `node tests/real-e2e/run-architecture-presentation.mjs --inventory --offline`
- [ ] golden A / C 回放 diff 报告归档

**Complete when:**

- [ ] 两个 MCP 入口走同一工厂，手写 switch 和 `TOOL_MAP` 物理不存在。
- [ ] `src/handlers/`、`src/types/` 目录不存在。
- [ ] classic / advanced ListTools 与 golden A 逐字节一致（白名单除外）。

## Task 4: CLI artifact-only 终态

**Files:**
- Modify: `agent-harness/cli_anything/indesign/core/catalog.py`（三源合并收口：artifact + `CLI_PRIMITIVES` + plugin overlay；删除 hidden handler scan）
- Delete: `agent-harness/cli_anything/indesign/core/domains.py`
- Delete: `agent-harness/cli_anything/indesign/core/hidden_handler_schemas.py`
- Create: `agent-harness/cli_anything/indesign/node/internal_tool_bridge.mjs`（按 artifact/registry 调用终态 internal tool，不 import 旧 `src/handlers/`）
- Modify/Rename: `agent-harness/cli_anything/indesign/core/hidden_backend.py` → `internal_backend.py`（schema 从 artifact 读，call 走 `internal_tool_bridge.mjs`；保留 `source: hidden_handler` 的外部 CLI 兼容口径）
- Delete: `agent-harness/cli_anything/indesign/node/hidden_handler_bridge.mjs`
- Modify: `agent-harness/cli_anything/indesign/core/router.py`（`hidden_handler` source 改为 artifact-backed internal backend；不得再 import `hidden_handler_schemas.py` 或旧 handler bridge）
- Modify: `agent-harness/cli_anything/indesign/tests/test_core.py`（更新 catalog 契约测试）
- Modify: `MANIFEST.in`、`pyproject.toml`（artifact 随 server assets 进 sdist / wheel）
- Create: packaging smoke test（wheel / sdist 内 artifact 存在且 `registry_hash` 与当前 registry 一致）

- [ ] artifact 读取顺序：active server root → wheel server assets；缺失或 hash 不符 = 硬错误，错误信息含修复命令。**不实现第三级 fallback**。
- [ ] `--source` 过滤从 artifact `source` 字段驱动（由 profiles 投影），CLI 外部行为不变。
- [ ] contract 对账：artifact contract vs Task 0 基线表逐工具 diff，差异逐项人工确认并记录在迁移目录；确认完成后才允许删除 `domains.py`。
- [ ] internal/hidden 调用链对齐终态：`tool schema book.create_book`、`tool schema presentation.add_cover_page` 从 artifact 返回；`tool call book.create_book` 缺少 required args 时由 artifact schema 拦截为参数错误，不启动旧 bridge；需要真实 InDesign 的 internal 调用通过 `internal_tool_bridge.mjs` → `src/core/toolRouter.js` → tool-module handler。
- [ ] `export.verify`、`server.*`、`session.*`、`script.run`、`tool.batch` 保持 Python primitive 定义；plugin runtime overlay 与 id 冲突规则不变。
- [ ] 删除后 `rg -n "domains|hidden_handler_schemas|infer_domain|hidden_handler_bridge" agent-harness` 除测试历史断言外零命中。

**Verify:**

- [ ] `indesign-cli tool domains`
- [ ] `indesign-cli tool list --source classic --callable-only`
- [ ] `indesign-cli tool list --source advanced --callable-only`
- [ ] `indesign-cli tool list --source hidden_handler`
- [ ] `indesign-cli tool schema book.create_book && indesign-cli tool schema presentation.add_cover_page`
- [ ] `indesign-cli tool call book.create_book`（无 args，预期稳定返回缺参错误，且不触发旧 `hidden_handler_bridge`）
- [ ] `indesign-cli tool schema export.verify && indesign-cli tool schema script.run`
- [ ] `python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q`
- [ ] packaging smoke（wheel / sdist artifact hash 一致）
- [ ] golden B 回放：白名单外 diff 为零

**Complete when:**

- [ ] CLI Node-backed 目录唯一来源是 artifact，推断代码物理不存在。
- [ ] contract 对账差异清单已人工确认归档。
- [ ] primitives 与 plugin overlay 行为不变。

## Task 5: 测试架构终态

**Files:**
- Create: `tests/real-e2e/scenarios/bootstrap_contract.mjs`、`main_deck_setup.mjs`、`content_text_table.mjs`、`template_flow.mjs`、`destructive_scratch.mjs`、`presentation_hidden.mjs`、`book_hidden.mjs`、`export_package.mjs`
- Delete: `tests/real-e2e/lib/scenarios.mjs`（拆分完成后删除，runner 改为直接消费 scenarios 目录）
- Create: `agent-harness/cli_anything/indesign/tests/test_cli_entrypoint.py`、`test_package_metadata.py`、`test_catalog_router.py`、`test_plugins.py`、`test_health_runtime.py`、`test_paths_envelope.py`、`test_bootstrapper.py`
- Delete: `agent-harness/cli_anything/indesign/tests/test_core.py`（103 个 test 按职责迁完后删除，不留兼容入口）
- Keep gated: `agent-harness/cli_anything/indesign/tests/test_full_e2e.py`
- Modify: `tests/tool-suite/run-all-tools.js`（消费 artifact）
- Delete: `tests/unified-test-runner.js`（`rg` 确认无引用后删除）
- Modify: `tests/index.js`

- [ ] 场景与 Python 测试迁移是搬运不是重写：断言逐条对应，迁移前后测试数量对账（103 个 Python test 迁移后总数 ≥ 103）。
- [ ] runner（`run-architecture-presentation.mjs` 等）改为消费 `scenarios/` 目录后，旧聚合文件删除。
- [ ] `tests/index.js --required` 描述口径：基础门禁，不是全覆盖。

**Verify:**

- [ ] `node tests/index.js --required`
- [ ] `node tests/tool-suite/run-all-tools.js`
- [ ] `node tests/real-e2e/run-agent-ux-hardening.mjs --offline`
- [ ] `node tests/real-e2e/run-architecture-presentation.mjs --full --offline`
- [ ] `python -m pytest agent-harness\cli_anything\indesign\tests -q`
- [ ] `rg -n "scenarios\.mjs|unified-test-runner|test_core" tests agent-harness scripts docs/README.md` 零命中（历史文档除外）

**Complete when:**

- [ ] 大测试文件已拆分且旧文件已删除，测试数量无损失。
- [ ] tool-suite 由 artifact 驱动，registry / router / catalog 破坏无法被 `--required` 单独掩盖。

## Task 6: 终局验收（golden master 全量回放）

**Files:**
- Create: `docs/AI协作/本地Agent/进行中/2026-07-06_终态重构/验收报告.md`

- [ ] 回放 golden A / B / C / D 全量对比，白名单（9 个新 schema、help 派生输出、artifact 新字段）外 diff 为零。
- [ ] 全量验证矩阵（见下）通过。
- [ ] 真实 InDesign 门禁：`node tests/real-e2e/run-architecture-presentation.mjs --full`（非 offline）与 `INDESIGN_E2E=1 python -m pytest agent-harness\cli_anything\indesign\tests\test_full_e2e.py -q`；无法运行时在验收报告显式说明。
- [ ] 验收报告包含：数量对账（150 = 114 + 30 + 6）、contract diff 确认清单、补写 schema review 记录、golden diff 摘要、skip 清单处理结果。
- [ ] 不在本 Task 合并；验收报告完成后进入 Task 7，同步文档和治理口径后再执行最终合并。

**Complete when:**

- [ ] spec §16 完成标准逐条核查通过并记录在验收报告。

## Task 7: 文档与治理同步

**Files:**
- Modify: `AGENTS.md`（§2.3 代码边界改为 `src/tools/` 组织；§3 执行基线新增 artifact `--write/--check` 与 architecture 测试；§4 仓库地图更新；§6 注意事项更新 hidden handler 口径为 profiles/internal）
- Modify: `README.md`、`README.en.md`、`skills/indesign-cli/SKILL.md`、`docs/MCP_INSTRUCTIONS.md`、`docs/LLM_PROMPT.md`、`docs/README.md`
- Create: `docs/技术决策/` 终态架构决策文档（tool-module 共置、profiles 模型、artifact 单向投影、无 fallback 原则）
- Modify: `docs/superpowers/specs/2026-07-04-indesign-architecture-refactor-design.md`、`docs/superpowers/plans/2026-07-05-indesign-architecture-refactor-plan.md`（顶部标注已被取代，仅存档）
- Verify: `docs/superpowers/plans/2026-07-06-indesign-tool-semantics-plan.md`（已按终态口径重写；此处只需复核其文件路径、域名与基线数字和重构实际结果一致）

- [ ] 新增工具的标准动作写入 `AGENTS.md`：新增 tool-module 文件 + 域 `index.js` 一行 + `artifact --write` + 补测试。
- [ ] 保留 2026-07-04 审查目录与本轮迁移目录，不移动原始报告。
- [ ] Task 6 验收和本 Task 文档同步全部通过后，合并 `refactor/terminal-architecture` → `master`。

**Verify:**

- [ ] `git diff --check`
- [ ] `node scripts/check_architecture.mjs`
- [ ] `node tests/index.js --required`
- [ ] `python -m pytest agent-harness\cli_anything\indesign\tests -q`

**Complete when:**

- [ ] 文档、Skill、CLI help、AGENTS.md 与终态结构口径一致。
- [ ] 语义契约计划可直接执行。

---

## 执行顺序与并行组织

1. Task 0 → Task 1 串行（骨架 + 试点必须先打穿）。
2. Task 2 的 15 个域并行执行（每域一个 agent），全部完成并通过双轨 diff 后才进入 Task 3。
3. Task 3 → Task 4 串行（切换先于 CLI，CLI 依赖 artifact）。
4. Task 5 可与 Task 4 并行。
5. Task 6 是技术验收门禁；Task 7 在合并前完成文档同步，并在通过后执行唯一最终合并。

## 最小验证集合（每批次结束）

```powershell
git diff --check
node src\core\artifact.js --check
node scripts\check_architecture.mjs
node tests\architecture\registry.test.mjs
node tests\index.js --required
python -m pytest agent-harness\cli_anything\indesign\tests -q
```

## 发布前矩阵（Task 6）

```powershell
node scripts\validate_schemas.js
node scripts\check_duplicates.mjs
node scripts\quick_check.mjs
node tests\tool-suite\run-all-tools.js
node tests\real-e2e\run-agent-ux-hardening.mjs --offline
node tests\real-e2e\run-architecture-presentation.mjs --full --offline
node tests\real-e2e\run-architecture-presentation.mjs --full
INDESIGN_E2E=1 python -m pytest agent-harness\cli_anything\indesign\tests\test_full_e2e.py -q
```
