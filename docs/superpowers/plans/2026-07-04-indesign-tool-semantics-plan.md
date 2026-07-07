# InDesign 工具语义契约实施计划

> **状态：已被 `docs/superpowers/plans/2026-07-06-indesign-tool-semantics-plan.md` 取代（本版写在已被取代的 2026-07-05 渐进架构上，文件落点已失效）。本文档仅存档，不要按此执行。**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/superpowers/specs/2026-07-03-indesign-tool-semantics-design.md` 落地 InDesign 语义契约，让 Agent 能区分原生对象、语义角色、作用域、可执行动作和语义 warning。

**Architecture:** 新增 `src/semantics/` 作为共享语义扩展层；handler 只负责选择目标、注入 JSX runtime、执行动作和包装响应。CLI v2 envelope 保持兼容，结构化语义 warning 放在工具 payload 内，Python CLI catalog 通过 `src/core/indesign-tool-registry.json` 复用 canonical registry artifact。

**Tech Stack:** Node.js ESM、ExtendScript/JSX、Windows COM/winax、Python CLI harness、现有 MCP handler/type/test 结构。

---

## 计划口径

这个计划不写伪代码。任务主要是机械改造：加共享模块、加 schema/fixture、改 handler 返回、补工具定义、同步 CLI catalog 和文档。每个阶段必须有可运行的检查命令。

范围按设计文档完整推进，但落地顺序必须先读后写：先完成 `docs/superpowers/plans/2026-07-05-indesign-architecture-refactor-plan.md` 的 canonical registry / artifact，再做 contract 和 inspector、selector、旧写工具 warning，最后新增窄语义工具。

## 文件边界

### 新增

- `src/semantics/contract.js`：`semanticContractVersion`、字段命名、payload 分类常量。
- `src/semantics/nativeTypes.js`：InDesign 原生类型、语义 role、affordance、warning 基础定义。
- `src/semantics/toolSemantics.js`：按 canonical tool name 追加语义扩展；不声明 CLI id、domain、alias 或 source。
- `src/semantics/schemas.js`：语义 payload、warning、selector、verbosity/include schema。
- `src/semantics/warnings.js`：稳定 warning code、severity、recommendedAction 生成。
- `src/semantics/normalizers.js`：清洗 JSX 返回、补默认字段、alias 归一、warning 去重。
- `src/semantics/jsxRuntime.js`：共享 ExtendScript helper 字符串。
- `src/semantics/toolDescriptions.js`：从 canonical registry artifact 和语义扩展生成工具说明片段。
- `src/semantics/index.js`：统一导出语义层。
- `agent-harness/cli_anything/indesign/core/semantics.py`：读取 canonical registry artifact 中的语义扩展字段，并做 CLI 展示归一。
- `tests/fixtures/semantics/`：语义 contract golden fixtures。
- `tests/test-semantics-contract.js`：contract/schema/registry/warning 单元测试。
- `tests/test-semantics-normalizers.js`：normalizer 和 warning 去重测试。
- `src/handlers/frameHandlers.js`、`src/handlers/imageHandlers.js`、`src/handlers/selectorHandlers.js`、`src/handlers/linkHandlers.js`：窄语义工具 handler。
- `src/types/toolDefinitionsFrame.js`、`src/types/toolDefinitionsImage.js`、`src/types/toolDefinitionsSelector.js`、`src/types/toolDefinitionsLink.js`：窄语义工具定义。

### 修改

- `src/handlers/pageItemHandlers.js`：增强 `getPageItemInfo`、`listPageItems`、`movePageItem`、`resizePageItem`。
- `src/handlers/styleHandlers.js`、`src/handlers/masterSpreadHandlers.js`、`src/handlers/exportHandlers.js`、`src/handlers/bookHandlers.js`：按 coverage matrix 补语义字段和 warning。
- `src/types/index.js`、`src/types/toolDefinitionsPageItemGroup.js`：注册新工具和 inspector 参数。
- `src/core/toolRegistry.js`：注册新增语义工具，分发仍由 `toolRouter` 处理；不修改 `InDesignMCPServer.js` 添加工具 `case`。
- `src/handlers/index.js`：导出新增 handler class。
- `src/core/toolRegistry.js`：在已有 entry 上挂接语义扩展字段。
- `src/core/toolRegistryArtifact.js`：把语义扩展字段投影进 canonical artifact。
- `src/core/indesign-tool-registry.json`：更新 canonical artifact。
- `agent-harness/cli_anything/indesign/core/catalog.py`：读取 canonical registry artifact，补 agent contract 字段。
- `agent-harness/cli_anything/indesign/core/domains.py`：不新增 Node-backed 工具域推断；只保留 legacy fallback warning。
- `agent-harness/cli_anything/indesign/core/envelope.py`：保持 v2 顶层 `warnings` 字符串数组，只在 `data` 内透传语义 warning。
- `agent-harness/cli_anything/indesign/indesign_cli.py`：确保 `tool list`、`tool explain` 输出语义字段。
- `agent-harness/cli_anything/indesign/tests/test_core.py`：补 canonical artifact 和 CLI catalog 契约测试。
- `pyproject.toml`：确认 canonical artifact 随 server assets 进入 package data。
- `MANIFEST.in`：确认 canonical artifact 随 server assets 进入 sdist。
- `tests/index.js`：接入新增 JS 单元测试。
- `tests/real-e2e/lib/scenarios.mjs`、`tests/real-e2e/lib/coverage.mjs`：补真实 InDesign 覆盖。
- `README.md`、`README.en.md`、`skills/indesign-cli/SKILL.md`、`docs/MCP_INSTRUCTIONS.md`、`docs/LLM_PROMPT.md`、`docs/README.md`：同步对外说明。

---

## Task 1: 语义契约骨架和单元测试

**Files:**
- Create: `src/semantics/contract.js`
- Create: `src/semantics/nativeTypes.js`
- Create: `src/semantics/toolSemantics.js`
- Create: `src/semantics/schemas.js`
- Create: `src/semantics/warnings.js`
- Create: `src/semantics/normalizers.js`
- Create: `src/semantics/index.js`
- Create: `tests/fixtures/semantics/`
- Create: `tests/test-semantics-contract.js`
- Create: `tests/test-semantics-normalizers.js`
- Modify: `tests/index.js`

- [ ] 定义 `semanticContractVersion = "indesign-semantics/v1"`。
- [ ] 定义核心 role：`graphic_frame`、`placed_graphic_content`、`shape_frame`、`text_frame`、`story`、`group`、`link`、`paragraph_style`、`object_style`、`selector`。
- [ ] 定义 warning code：`TARGET_IMPLICIT_ACTIVE_CONTEXT`、`TARGET_INDEX_IS_VOLATILE`、`MULTIPLE_TARGETS_MATCHED`、`TARGET_LOCKED`、`TARGET_ON_LOCKED_LAYER`、`TARGET_ON_HIDDEN_LAYER`、`MASTER_ITEM_NOT_OVERRIDDEN`、`THREAD_SHARED_STORY`、`STYLE_RESOURCE_CHANGE_GLOBAL_EFFECT`、`LOCAL_FORMAT_OVERRIDE_CREATED`、`BOUNDS_UNIT_AMBIGUOUS`、`MOVING_PLACED_CONTENT_NOT_FRAME`、`LINK_MISSING`、`LINK_MODIFIED`。
- [ ] `toolSemantics.js` entries 只按 canonical tool name 追加 `roles`、`affordances`、`warnings`、`docsKey`，不能声明 `cliId`、`cliDomain`、`aliases` 或 `source`。
- [ ] schema 定义统一 `target` carrier，支持 session target 和 persistent selector；旧 `pageIndex + itemIndex` 参数只作为 alias。
- [ ] 在 normalizer 中统一 `semanticRole` alias 到 `semantic.role`。
- [ ] 在 normalizer 中实现语义 warning 去重，key 为 `code + target.native.objectId + operation`。
- [ ] 增加 fixtures 覆盖图框、置入内容、文本框/story、锁定图层、多候选 selector。
- [ ] 把新增 JS 测试接入 `tests/index.js` 的 required validation suite。

**Verify:**

- [ ] `node --check src/semantics/contract.js`
- [ ] `node --check src/semantics/nativeTypes.js`
- [ ] `node --check src/semantics/toolSemantics.js`
- [ ] `node --check src/semantics/schemas.js`
- [ ] `node --check src/semantics/warnings.js`
- [ ] `node --check src/semantics/normalizers.js`
- [ ] `node tests/test-semantics-contract.js`
- [ ] `node tests/test-semantics-normalizers.js`

## Task 2: canonical artifact 和 Python CLI catalog 同步

**Files:**
- Create: `agent-harness/cli_anything/indesign/core/semantics.py`
- Modify: `src/core/toolRegistry.js`
- Modify: `src/core/toolRegistryArtifact.js`
- Modify: `src/core/indesign-tool-registry.json`
- Modify: `agent-harness/cli_anything/indesign/core/catalog.py`
- Modify: `agent-harness/cli_anything/indesign/indesign_cli.py`
- Modify: `agent-harness/cli_anything/indesign/tests/test_core.py`
- Modify: `pyproject.toml`
- Modify: `MANIFEST.in`

- [ ] `src/core/toolRegistryArtifact.js` 读取 `src/semantics/toolSemantics.js`，把 semantic extension fields 写进 `src/core/indesign-tool-registry.json`。
- [ ] canonical artifact 必须包含 `semanticContractVersion`、registry version/hash、生成来源、MCP name、CLI id、CLI domain、alias、source 和 semantic extension fields。
- [ ] Python CLI 优先读取当前 active server root 的 `src/core/indesign-tool-registry.json`，包内 server root artifact 只作为 fallback。
- [ ] active server root artifact 与包内 fallback 的 `semanticContractVersion` 或 hash 不一致时，CLI 返回 transport/runtime warning 或降级说明，不静默混用。
- [ ] Python CLI 读取 canonical artifact，不能在 Python 中复制 role、affordance、warning 或 CLI id/domain 映射。
- [ ] `tool explain` 和 `tool list` 对相关工具展示语义 role、recommended affordance、warning 摘要和 alias。
- [ ] 保持 CLI `schema_version: 2`，顶层 `warnings` 仍是 transport/runtime 字符串数组。
- [ ] `pyproject.toml` 和 `MANIFEST.in` 继续确保 server root 下的 `src/core/indesign-tool-registry.json` 进入 wheel / sdist。

**Verify:**

- [ ] `node scripts/check_architecture.mjs`
- [ ] `python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q`
- [ ] `python -m cli_anything.indesign tool explain page.list_page_items`
- [ ] `python -m cli_anything.indesign tool list --source classic --callable-only`

## Task 3: JSX runtime 和 page item inspector

**Files:**
- Create: `src/semantics/jsxRuntime.js`
- Modify: `src/handlers/pageItemHandlers.js`
- Modify: `src/types/toolDefinitionsPageItemGroup.js`
- Modify: `tests/test-semantics-contract.js`
- Modify: `tests/real-e2e/lib/scenarios.mjs`

- [ ] 在 JSX runtime 中集中实现 native identity、semantic role、scope、hierarchy、geometry、state、affordances 序列化。
- [ ] 增强 `getPageItemInfo`，返回结构化语义 payload，同时保留旧调用输入。
- [ ] 增强 `listPageItems`，支持 `verbosity`、`include`、`maxItems`、`maxDepth`、`pageSize`、`cursor`。
- [ ] `Rectangle/Oval/Polygon` 含 graphics 时返回 `graphic_frame`，子级 `Image/PDF/EPS` 返回 `placed_graphic_content`。
- [ ] `TextFrame` 返回 `text_frame` 和 `story` 关系摘要。
- [ ] group、layer、locked、visible、bounds 返回结构化字段。

**Verify:**

- [ ] `node --check src/semantics/jsxRuntime.js`
- [ ] `node --check src/handlers/pageItemHandlers.js`
- [ ] `node scripts/validate_schemas.js`
- [ ] `node scripts/check_duplicates.mjs`
- [ ] 有真实 InDesign 时运行：`node tests\real-e2e\run-architecture-presentation.mjs --phase destructive_scratch --offline`

## Task 4: Selector resolve/revalidate

**Files:**
- Create: `src/handlers/selectorHandlers.js`
- Create: `src/types/toolDefinitionsSelector.js`
- Modify: `src/handlers/index.js`
- Modify: `src/types/index.js`
- Modify: `src/core/toolRegistry.js`
- Modify: `src/core/toolRegistryArtifact.js`
- Modify: `tests/test-semantics-contract.js`
- Modify: `tests/real-e2e/lib/scenarios.mjs`

- [ ] 新增 MCP tool `selector_query_items`，CLI 展示为 `selector.query_items`，并通过 `src/core/toolRegistry.js` / `toolRegistryArtifact.js` 注册。
- [ ] 支持 session target：`objectId + scope`。
- [ ] 支持 persistent selector：`slotKey`、`label`、`displayPageLabel`、`semantic.role`、style/name/layer/link/bounds proximity。
- [ ] 返回 `candidateCount`、`confidence`、`matchReasons`、`labelCollisionCount`、`boundsTolerance`、`roleConfidence`。
- [ ] Resolve 结果返回可回传的 target carrier，包含 revalidate 所需的 `documentFingerprint`、`scopeFingerprint`、`specifier`、`objectId`、`roleConfidence`。
- [ ] 多候选时只返回候选，不执行修改。
- [ ] 写工具调用前可复用 selector revalidate；失败时返回 `TARGET_REVALIDATION_FAILED`。

**Verify:**

- [ ] `node --check src/handlers/selectorHandlers.js`
- [ ] `node --check src/types/toolDefinitionsSelector.js`
- [ ] `node scripts/check_duplicates.mjs`
- [ ] `node tests/test-semantics-contract.js`
- [ ] `python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q`

## Task 5: 旧写工具补语义 warning 和 before/after diff

**Files:**
- Modify: `src/handlers/pageItemHandlers.js`
- Modify: `src/types/toolDefinitionsPageItemGroup.js`
- Modify: `tests/test-semantics-normalizers.js`
- Modify: `tests/real-e2e/lib/scenarios.mjs`

- [ ] `move_page_item` 和 `resize_page_item` 返回 `target`、`before`、`after`、`changedFields`、`targetWasExplicit`、`warnings`。
- [ ] `move_page_item` 和 `resize_page_item` schema 接受统一 `target` union；旧 `pageIndex + itemIndex` 输入保持可用，并在 normalizer 内转换为 target alias。
- [ ] 写操作前使用同一套 selector revalidate，不在各 handler 内复制目标解析逻辑。
- [ ] 目标是 `placed_graphic_content` 时返回 `MOVING_PLACED_CONTENT_NOT_FRAME`，推荐操作指向父级 frame。
- [ ] 使用 `pageIndex + itemIndex` 时返回 `TARGET_INDEX_IS_VOLATILE`。
- [ ] 锁定对象、锁定图层、隐藏图层返回对应 warning。
- [ ] 旧输入参数保持可用，不强制用户一次性迁移。

**Verify:**

- [ ] `node --check src/handlers/pageItemHandlers.js`
- [ ] `node tests/test-semantics-normalizers.js`
- [ ] `node tests/index.js --required`
- [ ] 有真实 InDesign 时运行：`node tests\real-e2e\run-architecture-presentation.mjs --phase destructive_scratch --offline`

## Task 6: 新增窄语义工具域

**Files:**
- Create: `src/handlers/frameHandlers.js`
- Create: `src/handlers/imageHandlers.js`
- Create: `src/handlers/linkHandlers.js`
- Create: `src/types/toolDefinitionsFrame.js`
- Create: `src/types/toolDefinitionsImage.js`
- Create: `src/types/toolDefinitionsLink.js`
- Modify: `src/handlers/index.js`
- Modify: `src/types/index.js`
- Modify: `src/core/toolRegistry.js`
- Modify: `src/core/toolRegistryArtifact.js`
- Modify: `tests/real-e2e/lib/scenarios.mjs`
- Modify: `tests/real-e2e/lib/coverage.mjs`

- [ ] 新增 `frame_move` / `frame.move`。
- [ ] 新增 `frame_resize` / `frame.resize`。
- [ ] 新增 `frame_fit_content` / `frame.fit_content`。
- [ ] 新增 `image_pan_content` / `image.pan_content`。
- [ ] 新增 `image_scale_content` / `image.scale_content`。
- [ ] 新增 `link_list` / `link.list`。
- [ ] 新增 `link_relink` / `link.relink`。
- [ ] 新工具必须使用 selector target contract，不能只接受裸 `itemIndex`。
- [ ] 新工具 CLI id、domain 和 alias 必须来自 canonical artifact 的显式投影，不能通过 `domains.py` 推断。
- [ ] 新工具不得通过 `InDesignMCPServer.js` 新增 switch case；只能进入 `toolRegistry.js`、`types`、`handlers` 和 artifact。
- [ ] 新工具必须有独立 schema、description、warning 和 E2E 覆盖。

**Verify:**

- [ ] `node --check src/handlers/frameHandlers.js`
- [ ] `node --check src/handlers/imageHandlers.js`
- [ ] `node --check src/handlers/linkHandlers.js`
- [ ] `node scripts/validate_schemas.js`
- [ ] `node scripts/check_duplicates.mjs`
- [ ] `python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q`
- [ ] 有真实 InDesign 时运行：`node tests\real-e2e\run-architecture-presentation.mjs --full --offline`

## Task 7: Text、Style、Master、Book/Export 语义覆盖

**Files:**
- Modify: `src/handlers/textHandlers.js`
- Modify: `src/handlers/styleHandlers.js`
- Modify: `src/handlers/masterSpreadHandlers.js`
- Modify: `src/handlers/bookHandlers.js`
- Modify: `src/handlers/exportHandlers.js`
- Modify: corresponding files under `src/types/`
- Modify: `tests/real-e2e/lib/scenarios.mjs`
- Modify: `tests/real-e2e/lib/coverage.mjs`

- [ ] 文本 inspector 返回 `text_frame`、`story`、thread、overset、tables、anchoredObjects。
- [ ] story 写操作前识别 `THREAD_SHARED_STORY`。
- [ ] style 工具区分 `appliedStyle` 和 `localOverrides`。
- [ ] 修改样式资源时返回 `STYLE_RESOURCE_CHANGE_GLOBAL_EFFECT`。
- [ ] 母版项返回继承、覆盖、分离状态。
- [ ] Book/export 工具返回 `book`、`book_content`、`artifact`、`verifyResult` 语义字段。

**Verify:**

- [ ] `node --check src/handlers/textHandlers.js`
- [ ] `node --check src/handlers/styleHandlers.js`
- [ ] `node --check src/handlers/masterSpreadHandlers.js`
- [ ] `node --check src/handlers/bookHandlers.js`
- [ ] `node --check src/handlers/exportHandlers.js`
- [ ] 有真实 InDesign 时运行：`node tests\real-e2e\run-architecture-presentation.mjs --full --offline`

## Task 8: 文档和 Skill 同步

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `skills/indesign-cli/SKILL.md`
- Modify: `docs/MCP_INSTRUCTIONS.md`
- Modify: `docs/LLM_PROMPT.md`
- Modify: `docs/README.md`

- [ ] README 说明 `semanticContractVersion` 和 CLI `schema_version` 分别演进。
- [ ] Skill 明确：移动版面图片用 `graphic_frame` / `frame.move`，裁切取景才用 `placed_graphic_content` / `image.pan_content`。
- [ ] Skill 明确：文本内容先查 `Story` 和串联关系。
- [ ] MCP 文档列出新工具域和旧工具兼容策略。
- [ ] `docs/README.md` 当前专项加入本计划。

**Verify:**

- [ ] `rg -n "semanticContractVersion|frame.move|selector.query_items|schema_version" README.md README.en.md skills/indesign-cli/SKILL.md docs/MCP_INSTRUCTIONS.md docs/LLM_PROMPT.md docs/README.md`
- [ ] `git diff --check`

## Final Verification

- [ ] `node scripts/validate_schemas.js`
- [ ] `node scripts/check_duplicates.mjs`
- [ ] `node scripts/quick_check.mjs`
- [ ] `node tests/index.js --required`
- [ ] `python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q`
- [ ] 有真实 InDesign 时运行：`node tests\real-e2e\run-architecture-presentation.mjs --full --offline`
- [ ] 如生成 coverage report，运行：`node tests\real-e2e\validators\validate-coverage.mjs <coverage-report.json>`

## Completion Criteria

- `page.list_page_items` 和 `page.get_page_item_info` 返回结构化语义 payload。
- CLI v2 envelope 未破坏，顶层 `warnings` 仍是字符串数组。
- 工具 payload 内的语义 warning 是结构化对象数组。
- Python CLI catalog 从 canonical artifact 获取语义说明。
- CLI id、domain 和 alias 由 canonical artifact 显式投影，不由 Python 按 MCP name 猜。
- CLI 优先使用 active server root 的 canonical artifact，包内 artifact 只做 fallback，并能报告版本/hash 漂移。
- `selector.query_items` 支持 resolve 和 revalidate。
- 写工具通过统一 `target` carrier 复用 revalidate；旧 `pageIndex + itemIndex` 只是兼容 alias。
- 旧写工具保持兼容，并在高风险目标上给出语义 warning。
- 新窄语义工具可通过 CLI `domain.name` 发现和调用。
- README、Skill、MCP prompt 与实际工具目录一致。
