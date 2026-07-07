# InDesign 工具语义契约实施计划（终态口径）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/superpowers/specs/2026-07-03-indesign-tool-semantics-design.md` 的领域设计落地 InDesign 语义契约：native identity / semantic role / affordance 三层返回、结构化语义 warning、selector resolve + revalidate、窄语义工具域。落点全部基于 `docs/superpowers/specs/2026-07-06-indesign-terminal-architecture-design.md` 的终态结构。

**Architecture:** per-tool 语义 = `defineTool` 的可选 `semantics` 字段，与 schema / contract / handler 共置在 tool-module 内；`src/semantics/` 只放跨工具共享知识（类型-角色映射、warning 枚举、normalizer、JSX runtime snippet、target resolver）；artifact 单向投影语义字段给 Python CLI；新工具 = 新 tool-module + 域 `index.js` 一行 + `artifact --write` + 基线数字更新。

**Tech Stack:** Node.js ESM、ExtendScript/JSX、Windows COM/winax、Python CLI harness、终态测试结构（`tests/architecture/`、`tests/real-e2e/scenarios/`、拆分后的 Python 测试）。

---

## 计划口径

- 本计划取代 `docs/superpowers/plans/2026-07-04-indesign-tool-semantics-plan.md`（该版写在已被取代的渐进架构上）。
- **前置条件：`docs/superpowers/plans/2026-07-06-indesign-terminal-architecture-plan.md` 全部完成并合并 `master`。** 本计划假定 `src/tools/`、`src/core/artifact.js`、`tests/architecture/`、拆分后测试已存在，`src/handlers/`、`src/types/`、`domains.py`、`hidden_handler_schemas.py`、`test_core.py`、`scenarios.mjs` 已不存在。
- 语义 spec（2026-07-03）的领域内容（角色表、warning 语义、selector 设计、coverage matrix、输出体量控制）仍然有效；其"语义层模块架构"一节中 `toolSemantics.js` 中心字典的落点已由本计划取代。
- 重构期间的行为冻结已解除：本计划允许增强既有工具的 schema 和返回（保持旧输入兼容），每次变更同步 `artifact --write`。
- 不写伪代码。每个任务只描述文件范围、机械动作、验证命令和完成条件。

## 执行前必读

- `docs/superpowers/specs/2026-07-03-indesign-tool-semantics-design.md`：领域设计（角色表、warning 结构、selector 两阶段、coverage matrix）。
- `docs/superpowers/specs/2026-07-06-indesign-terminal-architecture-design.md`：终态结构、tool-module 契约、artifact 规则（§5、§8、§14）。
- `AGENTS.md`：沟通、文档、测试规则。

## 落点规则（对全部任务生效）

1. **per-tool 语义共置**：`roles`、`affordances`、`warnings`（该工具可能发出的 code 清单）、`docsKey` 写在 tool-module 的 `semantics` 字段里。禁止建立任何按 tool name 索引的中心语义字典。
2. **`src/semantics/` 只放共享知识**：InDesign 类型-角色映射、warning code 枚举、payload/selector schema、normalizer、JSX runtime snippet、target resolver。这些是跨工具事实，集中是正确归属。
3. **防循环依赖**：`src/tools/_contract.js` 可以 import `src/semantics/`（用枚举校验 `semantics` 字段）；`src/semantics/` 任何文件不得 import `src/tools/`。需要 registry 的函数（如 `toolDescriptions.js`）以参数接收 registry。
4. **新增工具的标准动作**：新 tool-module 文件 + 域 `index.js` 聚合 + （新域时）`src/tools/index.js` 一行 import + `node src/core/artifact.js --write` + 更新 `tests/architecture/registry.test.mjs` 基线数字 + 补测试。禁止其他注册路径。
5. **`cli.id` 前缀必须等于所在域目录名**。spec 中建议的展示 id（如 `master.override_item`）与实际域名不一致时，以域名规则为准（落为 `masterSpread.override_item`），并在文档和 Skill 中使用实际 id。
6. **artifact 规则沿用终态**：缺失或 `registry_hash` 不符 = 硬错误；无 fallback、无降级路径。语义字段进入 artifact 后参与 hash。
7. **envelope 不变**：CLI 保持 `schema_version: 2`，顶层 `warnings` 仍是 transport/runtime 字符串数组；结构化语义 warning 只在工具 payload（`data` 内）承载。`semanticContractVersion` 与 CLI envelope 版本分别演进。
8. **修改既有工具时保持旧输入兼容**：旧参数作为 alias 由 normalizer 归一，不强制调用方迁移。

## 新增工具与基线变化

| 任务 | 新域 / 工具（MCP name → cli.id） | classic exposed 基线 |
| ---- | ------------------------------- | -------------------- |
| 起点 | — | 114 |
| Task 4 | `selector/`：`selector_query_items` → `selector.query_items` | 115 |
| Task 6 | `frame/`：`frame_move`、`frame_resize`、`frame_fit_content`；`image/`：`image_pan_content`、`image_scale_content`；`link/`：`link_list`、`link_relink` | 122 |
| Task 7 | `story/`：`story_replace_text`；`style/` 增补：`style_apply`；`masterSpread/` 增补：`masterspread_override_item` → `masterSpread.override_item` | 125 |

全部完成后：classic 125 / internal 30 / advanced 6，合计 161。每个引入工具的任务必须在同一任务内更新基线断言，不允许留到最后。

`item.inspect` 不新增独立工具：其语义由 Task 3 增强后的 `get_page_item_info` 承担，避免重复工具。

## 显式 deferred 清单

以下 spec 推荐工具本轮不实现，落点已定，后续按需在对应域内新增 tool-module：

| 工具 | 落点域 | 缓期理由 |
| ---- | ------ | -------- |
| `document.inspect` | `document/` | 现有 document 检查工具已覆盖大部分字段，待语义化需求明确后增强 |
| `style.inspect`、`swatch.inspect`、`font.inspect` | `style/` | Task 7 先给写路径（`style_apply`）；资源检查器待 Agent 实际需求驱动 |
| `story.inspect`、`text_range.apply_style`、`table.inspect` | `story/` / `text/` | Task 7 先落 `story_replace_text` 和文本 inspector 字段 |
| `frame.place_content`、`frame.replace_content`、`link.update` | `frame/` / `link/` | 与现有置入/更新能力重叠，需先梳理现有工具语义 |
| `master.detach_item`、`item.preflight_editability`、z-order 工具 | `masterSpread/` / `pageItem/` | coverage matrix core v1 之外 |

coverage matrix 中 `known-deferred` 对象域（XML、超链接、脚注、条件文本、TOC 等）维持 spec 原状：本轮只保留枚举占位，不实现。

---

## Task 1: 语义共享层与 defineTool 扩展

**Files:**
- Create: `src/semantics/contract.js`
- Create: `src/semantics/nativeTypes.js`
- Create: `src/semantics/warnings.js`
- Create: `src/semantics/schemas.js`
- Create: `src/semantics/normalizers.js`
- Create: `src/semantics/index.js`
- Modify: `src/tools/_contract.js`
- Create: `tests/fixtures/semantics/`
- Create: `tests/test-semantics-contract.js`
- Create: `tests/test-semantics-normalizers.js`
- Modify: `tests/index.js`

- [ ] `contract.js` 定义 `semanticContractVersion = "indesign-semantics/v1"`、payload 分类常量、字段命名规则（`semantic.role` / `semantic.roleReasonCode` / `semantic.confidence`）。
- [ ] `nativeTypes.js` 定义核心 role：`graphic_frame`、`placed_graphic_content`、`shape_frame`、`text_frame`、`story`、`table`、`table_cell`、`group`、`line`、`guide`、`anchored_object`、`link`、`paragraph_style`、`character_style`、`object_style`、`swatch`、`font`、`master_page_item`、`selector`，以及 InDesign 原生类型到 role 的判定表（按 spec §PageItem/Frame/Content 角色表）。
- [ ] `warnings.js` 定义 17 个 v1 warning code：`TARGET_IMPLICIT_ACTIVE_CONTEXT`、`TARGET_INDEX_IS_VOLATILE`、`TARGET_REVALIDATION_FAILED`、`MULTIPLE_TARGETS_MATCHED`、`TARGET_LOCKED`、`TARGET_ON_LOCKED_LAYER`、`TARGET_ON_HIDDEN_LAYER`、`MASTER_ITEM_NOT_OVERRIDDEN`、`THREAD_SHARED_STORY`、`STYLE_RESOURCE_CHANGE_GLOBAL_EFFECT`、`LOCAL_FORMAT_OVERRIDE_CREATED`、`BOUNDS_UNIT_AMBIGUOUS`、`MOVING_PLACED_CONTENT_NOT_FRAME`、`LINK_MISSING`、`LINK_MODIFIED`、`BOOK_SYNC_GLOBAL_EFFECT`、`PREFLIGHT_FAILED`；每个 code 带 severity（`critical` / `important` / `minor`）与 `recommendedAction` 生成器。deferred 域的 code 在对应域落地时再加入枚举。
- [ ] `schemas.js` 定义语义 payload、结构化 warning、统一 `target` union（session target `objectId + scope`；persistent selector `slotKey` / `label` / `displayPageLabel` / `semantic.role` / style / layer / link / bounds proximity）、`verbosity` / `include` / `maxItems` / `maxDepth` / `pageSize` / `cursor` 参数 schema。
- [ ] `normalizers.js`：清洗 JSX 返回、补默认字段、`semanticRole` alias 归一到 `semantic.role`、旧 `pageIndex + itemIndex` 输入归一为 target alias、语义 warning 去重（key = `code + target.native.objectId + operation`）。
- [ ] `src/tools/_contract.js` 扩展：`defineTool` 接受可选 `semantics` 字段（`roles` / `affordances` / `warnings` / `docsKey`），校验 `roles` 来自 `nativeTypes.js` 枚举、`warnings` 来自 `warnings.js` 枚举；缺省合法（未语义化工具不受影响）。
- [ ] fixtures 覆盖：图框含置入内容、置入内容本体、文本框/story 串联、锁定图层对象、多候选 selector。
- [ ] 新增两个 JS 测试接入 `tests/index.js` required suite。

**Verify:**

- [ ] 新增 JS 文件逐个 `node --check`
- [ ] `node tests/test-semantics-contract.js`
- [ ] `node tests/test-semantics-normalizers.js`
- [ ] `node tests/architecture/registry.test.mjs`（`semantics` 字段扩展不改变 150 基线）
- [ ] `node tests/index.js --required`

**Complete when:**

- [ ] 语义枚举、schema、normalizer 有单一共享来源，`defineTool` 能拒绝非法 `semantics` 字段。
- [ ] 既有 150 个工具不受影响（registry 加载和基线不变）。

## Task 2: artifact 语义投影与 Python CLI

**Files:**
- Modify: `src/core/artifact.js`
- Generate: `src/core/indesign-tool-registry.json`
- Create: `agent-harness/cli_anything/indesign/core/semantics.py`
- Modify: `agent-harness/cli_anything/indesign/core/catalog.py`
- Modify: `agent-harness/cli_anything/indesign/indesign_cli.py`
- Modify: `agent-harness/cli_anything/indesign/tests/test_catalog_router.py`

- [ ] artifact 顶层新增 `semanticContractVersion`；每个工具投影 `semantics` 字段（无该字段的工具输出省略，不补空对象）；语义字段参与 `registry_hash`。
- [ ] `semantics.py` 读取 artifact 语义字段并做 CLI 展示归一；Python 侧不复制 role / affordance / warning 枚举。
- [ ] `tool list` 紧凑输出对已语义化工具追加 role 摘要；`tool explain` 展示 roles、recommended affordances、可能的 warning code 与 alias。
- [ ] `envelope.py` 不修改；顶层 `warnings` 保持 v2 字符串数组（用测试断言，防止执行 agent 顺手改掉）。
- [ ] packaging smoke 复跑：wheel / sdist 内 artifact `registry_hash` 与当前 registry 一致。

**Verify:**

- [ ] `node src/core/artifact.js --write && node src/core/artifact.js --check`
- [ ] `node scripts/check_architecture.mjs`
- [ ] `python -m pytest agent-harness\cli_anything\indesign\tests -q`
- [ ] `indesign-cli tool explain pageitem.get_page_item_info`（id 以 artifact 现值为准）
- [ ] `indesign-cli tool list --source classic --callable-only`

**Complete when:**

- [ ] CLI 语义展示全部来自 artifact；Python 无平行语义枚举。
- [ ] envelope v2 契约有回归测试保护。

## Task 3: JSX runtime、target resolver 与 pageItem inspector 增强

**Files:**
- Create: `src/semantics/jsxRuntime.js`
- Create: `src/semantics/targetResolver.js`
- Modify: `src/tools/pageItem/`（含 `get_page_item_info`、`list_page_items` 的模块，按 registry 定位）
- Generate: `src/core/indesign-tool-registry.json`
- Modify: `tests/test-semantics-contract.js`
- Modify: `tests/real-e2e/scenarios/destructive_scratch.mjs`

- [ ] `jsxRuntime.js` 集中实现 ExtendScript 侧：native identity、semantic role 判定（`Rectangle/Oval/Polygon` 含 graphics → `graphic_frame`，子级 `Image/PDF/EPS` → `placed_graphic_content`，`TextFrame` → `text_frame` + story 关系）、scope、hierarchy、geometry（`coordinateSpace` / `unit: "pt"` / 命名 bounds 字段）、state（item/layer 锁定可见与 `effectiveEditable`）、affordances 序列化。
- [ ] `targetResolver.js` 只提供纯函数：`buildResolveScript(target)`、`buildRevalidateSnippet(carrier)`、`parseResolveResult(raw)`、`assertRevalidated(parsed)`。不执行脚本、不读写 `sessionManager`；执行仍由 handler 经 `core/runtime.js` 完成。
- [ ] 增强 `get_page_item_info`：返回完整语义 payload（spec 推荐结构），承担 `item.inspect` 语义；旧输入参数保持可用。
- [ ] 增强 `list_page_items`：支持 `verbosity` / `include` / `maxItems` / `maxDepth` / `pageSize` / `cursor`，超限返回 `truncated: true`；`summary` 档只返回选择对象必需字段。
- [ ] 两个工具的 tool-module 补 `semantics` 字段；schema 变更后 `artifact --write`。
- [ ] `destructive_scratch` 场景补：图框返回 `graphic_frame` + 子级 `placed_graphic_content`、串联文本框返回共享 story、锁定图层对象返回有效可编辑性。

**Verify:**

- [ ] 变更 JS 文件逐个 `node --check`
- [ ] `node tests/test-semantics-contract.js`
- [ ] `node src/core/artifact.js --write && node src/core/artifact.js --check`
- [ ] `node tests/index.js --required`
- [ ] `node tests/real-e2e/run-architecture-presentation.mjs --phase destructive_scratch --offline`（真实 InDesign；跑不了必须显式说明）

**Complete when:**

- [ ] 语义推断集中在 `jsxRuntime.js`，两个 inspector 不各写一套 DOM 判定。
- [ ] `get_page_item_info` / `list_page_items` 返回结构化语义 payload，旧调用不破坏。

## Task 4: selector 域（resolve + revalidate）

**Files:**
- Create: `src/tools/selector/query.js`
- Create: `src/tools/selector/index.js`
- Modify: `src/tools/index.js`
- Generate: `src/core/indesign-tool-registry.json`
- Modify: `tests/architecture/registry.test.mjs`（classic 114 → 115）
- Modify: `tests/test-semantics-contract.js`
- Create: `tests/real-e2e/scenarios/semantics_inspection.mjs`
- Modify: `tests/real-e2e/lib/coverage.mjs`

- [ ] 新增 `selector_query_items`（cli `selector.query_items`，`profiles: ['classic']`），schema 使用 Task 1 的统一 `target` union 与输出控制参数。
- [ ] resolve 返回 `candidateCount`、`confidence`、`matchReasons`、`labelCollisionCount`、`boundsTolerance`、`roleConfidence`；多候选时只返回候选列表，不执行任何修改。
- [ ] resolve 结果返回可回传 target carrier：`documentFingerprint`、`scopeFingerprint`、`specifier`、`objectId`、`roleConfidence`、`resolvedAt`。
- [ ] revalidate 走 `targetResolver.js`；失败返回 `TARGET_REVALIDATION_FAILED` 并停止。
- [ ] `semantics_inspection.mjs` 场景覆盖：按 role 查询、按 label 查询、多候选不执行、revalidate 失败路径。

**Verify:**

- [ ] `node --check src/tools/selector/query.js && node --check src/tools/selector/index.js`
- [ ] `node tests/architecture/registry.test.mjs`（115 / 30 / 6）
- [ ] `node src/core/artifact.js --write && node src/core/artifact.js --check`
- [ ] `node tests/index.js --required`
- [ ] `python -m pytest agent-harness\cli_anything\indesign\tests -q`
- [ ] `indesign-cli tool schema selector.query_items`

**Complete when:**

- [ ] `selector.query_items` 可通过 CLI 发现和调用，resolve / revalidate 两阶段契约可测试。

## Task 5: 旧写工具 target union、warning 与 before/after diff

**Files:**
- Modify: `src/tools/pageItem/`（含 `move_page_item`、`resize_page_item` 的模块）
- Generate: `src/core/indesign-tool-registry.json`
- Modify: `tests/test-semantics-normalizers.js`
- Modify: `tests/real-e2e/scenarios/destructive_scratch.mjs`

- [ ] `move_page_item` / `resize_page_item` schema 接受统一 `target` union；旧 `pageIndex + itemIndex` 保持可用，由 normalizer 转为 target alias 并附 `TARGET_INDEX_IS_VOLATILE`。
- [ ] 写前 revalidate 统一走 `targetResolver.js`，不在 tool-module 内复制目标解析。
- [ ] 返回 `target`、`before`、`after`、`changedFields`、`targetWasExplicit`、结构化 `warnings`；不返回整页语义树。
- [ ] 目标是 `placed_graphic_content` 时返回 `MOVING_PLACED_CONTENT_NOT_FRAME`，`recommendedAction` 指向父级 frame 的 `objectId`。
- [ ] 锁定对象 / 锁定图层 / 隐藏图层分别返回 `TARGET_LOCKED` / `TARGET_ON_LOCKED_LAYER` / `TARGET_ON_HIDDEN_LAYER`。
- [ ] `move` 区分 `to` / `by`（绝对与相对不混用），schema description 写明坐标空间与单位。

**Verify:**

- [ ] 变更 JS 文件逐个 `node --check`
- [ ] `node tests/test-semantics-normalizers.js`
- [ ] `node src/core/artifact.js --write && node src/core/artifact.js --check`
- [ ] `node tests/index.js --required`
- [ ] `node tests/real-e2e/run-architecture-presentation.mjs --phase destructive_scratch --offline`

**Complete when:**

- [ ] 旧写工具兼容旧输入、发出语义 warning、返回 before/after diff，且与 selector 共用同一 revalidate。

## Task 6: frame / image / link 窄语义工具域

**Files:**
- Create: `src/tools/frame/`（`move.js`、`resize.js`、`fitContent.js`、`index.js`、`_shared.js` 按需）
- Create: `src/tools/image/`（`panContent.js`、`scaleContent.js`、`index.js`）
- Create: `src/tools/link/`（`list.js`、`relink.js`、`index.js`）
- Modify: `src/tools/index.js`
- Generate: `src/core/indesign-tool-registry.json`
- Modify: `tests/architecture/registry.test.mjs`（classic 115 → 122）
- Modify: `tests/real-e2e/scenarios/destructive_scratch.mjs`、`tests/real-e2e/scenarios/semantics_inspection.mjs`
- Modify: `tests/real-e2e/lib/coverage.mjs`

- [ ] `frame_move` / `frame_resize` / `frame_fit_content`：只接受 role 为 `graphic_frame` / `shape_frame` / `text_frame` / `group` 的目标；目标为 `placed_graphic_content` 时拒绝执行并推荐父级 frame。`frame_fit_content` 的 `fitMode` 映射 InDesign `FitOptions` 原名。
- [ ] `image_pan_content` / `image_scale_content`：只接受 `placed_graphic_content`；返回裁切/取景语义说明。
- [ ] `link_list` / `link_relink`：`linkStatus` 结构化区分 `missing` / `modified` / `embedded`；relink 返回受影响 frame。
- [ ] 7 个新工具只接受统一 `target` carrier，不提供 `pageIndex + itemIndex` alias。
- [ ] 每个工具带 `semantics` 字段、独立 schema、结构化 warning 与 E2E 覆盖。

**Verify:**

- [ ] 新增 JS 文件逐个 `node --check`
- [ ] `node tests/architecture/registry.test.mjs`（122 / 30 / 6）
- [ ] `node src/core/artifact.js --write && node src/core/artifact.js --check`
- [ ] `node tests/index.js --required`
- [ ] `python -m pytest agent-harness\cli_anything\indesign\tests -q`
- [ ] `node tests/real-e2e/run-architecture-presentation.mjs --phase destructive_scratch --offline`

**Complete when:**

- [ ] 移动版面图片（frame）与裁切取景（image content）在工具层被结构性区分。
- [ ] 三个新域可通过 CLI `domain.name` 发现和调用。

## Task 7: story / style / masterSpread 窄写工具与语义字段覆盖

**Files:**
- Create: `src/tools/story/`（`replaceText.js`、`index.js`）
- Modify: `src/tools/style/`（新增 `apply.js`；既有样式工具补语义字段）
- Modify: `src/tools/masterSpread/`（新增 `overrideItem.js`；既有工具补继承/覆盖/分离状态）
- Modify: `src/tools/text/`（inspector 字段：`text_frame`、`story`、thread、`overset`、tables、anchoredObjects）
- Modify: `src/tools/book/`、`src/tools/export/`（返回 `book` / `book_content` / `artifact` / `verifyResult` 语义字段）
- Modify: `src/tools/index.js`
- Generate: `src/core/indesign-tool-registry.json`
- Modify: `tests/architecture/registry.test.mjs`（classic 122 → 125）
- Modify: `tests/real-e2e/scenarios/content_text_table.mjs`、`book_hidden.mjs`、`export_package.mjs`
- Modify: `tests/real-e2e/lib/coverage.mjs`

- [ ] `story_replace_text`：接受 story 或明确 text range 的 target carrier；串联文本框写前返回 `THREAD_SHARED_STORY`。
- [ ] `style_apply`：统一应用段落/字符/对象/表格/单元格样式；输出区分 `appliedStyle` 与 `localOverrides`；改样式资源返回 `STYLE_RESOURCE_CHANGE_GLOBAL_EFFECT`，直接改局部格式返回 `LOCAL_FORMAT_OVERRIDE_CREATED`。
- [ ] `masterspread_override_item`（cli `masterSpread.override_item`）：覆盖母版对象到文档页；母版项未覆盖时写工具返回 `MASTER_ITEM_NOT_OVERRIDDEN`。
- [ ] Book 同步类工具返回 `BOOK_SYNC_GLOBAL_EFFECT`；preflight 类工具结构化返回 `PREFLIGHT_FAILED` 与 issue 摘要。
- [ ] 导出工具返回 artifact 列表与验证状态，可被 `export.verify` 串接。

**Verify:**

- [ ] 变更 JS 文件逐个 `node --check`
- [ ] `node tests/architecture/registry.test.mjs`（125 / 30 / 6）
- [ ] `node src/core/artifact.js --write && node src/core/artifact.js --check`
- [ ] `node tests/index.js --required`
- [ ] `python -m pytest agent-harness\cli_anything\indesign\tests -q`
- [ ] `node tests/real-e2e/run-architecture-presentation.mjs --phase content_text_table --offline`
- [ ] `node tests/real-e2e/run-architecture-presentation.mjs --phase book_hidden --offline`
- [ ] `node tests/real-e2e/run-architecture-presentation.mjs --phase export_package --offline`

**Complete when:**

- [ ] 文本、样式、母版的高频写路径有窄语义工具；book / export 输出语义化。
- [ ] 全部新增工具基线 125 / 30 / 6 生效。

## Task 8: 文档、Skill 与 deferred 沉淀

**Files:**
- Modify: `README.md`、`README.en.md`
- Modify: `skills/indesign-cli/SKILL.md`
- Modify: `docs/MCP_INSTRUCTIONS.md`、`docs/LLM_PROMPT.md`、`docs/README.md`
- Modify: `docs/技术决策/`（语义契约决策：共置落点、warning 契约、selector 优先级）

- [ ] README 说明 `semanticContractVersion` 与 CLI `schema_version` 分别演进。
- [ ] Skill 明确操作规则：移动版面图片用 `graphic_frame` / `frame.move`，裁切取景才用 `placed_graphic_content` / `image.pan_content`；文本内容先查 story 与串联关系；样式区分资源修改与局部覆盖；写工具优先稳定 selector，不优先 `itemIndex`。
- [ ] MCP 文档列出新工具域、target carrier 用法和旧工具兼容策略。
- [ ] 本计划的显式 deferred 清单沉淀到技术决策文档，作为后续扩展入口。
- [ ] 确认 `skills/indesign-cli/preview.png` 是否仍匹配更新后的 Skill 说明。

**Verify:**

- [ ] `rg -n "semanticContractVersion|frame.move|selector.query_items|story.replace_text" README.md README.en.md skills/indesign-cli/SKILL.md docs/MCP_INSTRUCTIONS.md docs/LLM_PROMPT.md`
- [ ] `git diff --check`

**Complete when:**

- [ ] 文档、Skill 与 registry / artifact 口径一致；deferred 边界有据可查。

---

## 执行顺序

1. Task 1 → 2 → 3 → 4 串行（共享层 → 投影 → runtime/inspector → selector，依赖链固定）。
2. Task 5 在 Task 4 后执行（依赖统一 revalidate）。
3. Task 6 与 Task 7 在 Task 4 后可按域并行（frame/image/link 与 story/style/masterSpread 无相互依赖），各自任务内完成基线数字更新时需协调最终数值。
4. Task 8 最后执行。

## 最小验证集合（每批次结束）

```powershell
git diff --check
node src\core\artifact.js --check
node scripts\check_architecture.mjs
node tests\architecture\registry.test.mjs
node tests\test-semantics-contract.js
node tests\test-semantics-normalizers.js
node tests\index.js --required
python -m pytest agent-harness\cli_anything\indesign\tests -q
```

## Final Verification

- [ ] 最小验证集合全部通过
- [ ] `node tests/tool-suite/run-all-tools.js`
- [ ] `node tests/real-e2e/run-agent-ux-hardening.mjs --offline`
- [ ] `node tests/real-e2e/run-architecture-presentation.mjs --full --offline`（真实 InDesign；跑不了必须显式说明）
- [ ] 如生成 coverage report：`node tests/real-e2e/validators/validate-coverage.mjs <coverage-report.json>`

## Completion Criteria

- `get_page_item_info` / `list_page_items` 返回结构化语义 payload，支持输出体量控制。
- per-tool 语义全部共置在 tool-module `semantics` 字段；全仓无按 tool name 索引的中心语义字典。
- `selector.query_items` 支持 resolve + revalidate；旧写工具与新窄工具共用 `targetResolver.js`。
- 旧写工具兼容旧输入并在高风险目标上返回结构化语义 warning；CLI v2 envelope 顶层 `warnings` 未破坏。
- 新工具基线 125 / 30 / 6 生效，artifact 与 CLI 展示一致，`tool explain` 展示语义信息。
- 常见排版任务（移动图框、裁切取景、替换文本、应用样式、覆盖母版项、重链资产）可用窄语义工具完成。
- deferred 清单沉淀到技术决策文档。
