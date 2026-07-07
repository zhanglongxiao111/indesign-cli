# 报告：plan 审核 Agent

日期：2026-07-05

审查范围：只读审核 `AGENTS.md`、任务书列出的调研文档、正式 spec、两个 plan 和指定代码锚点。除本报告外未修改其他文件。

## 总体结论

`先修订`

未发现 P0。两个 plan 的主方向已经正确：架构 plan 把 canonical registry/source map 放到第一优先级，语义 plan 已取消独立 `src/semantics/registry.js` / `semantics-registry.json` 口径，hidden handler、CLI primitive、plugin overlay、advanced server 和薄 runtime 边界也基本吸收了调研结论。

但仍有 3 个执行前应修订的问题：语义 plan 仍残留旧 `InDesignMCPServer.js` 手写分发口径；registry artifact 生成链路缺少明确命令和漂移门禁；最小验证集合仍可能让 registry/router/catalog 漂移被 `tests/index.js --required` 掩盖。

## P0 findings

未发现 P0。

## P1 findings

### P1-1 语义 plan 仍要求修改 `InDesignMCPServer.js` 分发新工具，会回流到旧 switch 口径

证据：

- `docs/superpowers/plans/2026-07-04-indesign-tool-semantics-plan.md:17` 写明语义计划必须先完成架构 plan 的 canonical registry / artifact。
- `docs/superpowers/plans/2026-07-04-indesign-tool-semantics-plan.md:44` 仍写 `src/core/InDesignMCPServer.js`：分发新 MCP tool name。
- `docs/superpowers/plans/2026-07-04-indesign-tool-semantics-plan.md:156`、`:212` 在新增 selector、frame/image/link 工具时仍列 `Modify: src/core/InDesignMCPServer.js`。
- `docs/superpowers/plans/2026-07-05-indesign-architecture-refactor-plan.md:100-121` 要求 `InDesignMCPServer.js` 的手写 switch 改为 registry dispatch，完成后不再维护完整工具 switch。
- 当前代码仍是旧状态：`src/core/InDesignMCPServer.js:61-64` 进入 `switch (name)`，`:261-263` 走 default error。

影响：

执行顺序上，语义 plan 在架构 plan 之后运行。如果语义执行 agent 按当前 plan 修改 `InDesignMCPServer.js` 分发新工具，就可能重新添加手写 case，破坏 canonical registry/router 的唯一分发路径，形成半迁移状态。

建议改法：

- 从语义 plan 的文件边界和 Task 4 / Task 6 中删除 `src/core/InDesignMCPServer.js`。
- 改成：新增工具只修改 `src/types/*`、`src/handlers/index.js`、`src/core/toolRegistry.js`、`src/core/toolRegistryArtifact.js` 和对应测试。
- 在架构 plan Task 2 完成条件或 `scripts/check_architecture.mjs` 中加一条：Task 2 后 `InDesignMCPServer.js` 不允许新增工具 `case`。

### P1-2 canonical artifact 被称为“生成”，但缺少确定的生成命令和 stale artifact 门禁

证据：

- `docs/superpowers/plans/2026-07-05-indesign-architecture-refactor-plan.md:55-56` 同时创建 `toolRegistryArtifact.js` 和 `src/core/indesign-tool-registry.json`。
- `docs/superpowers/plans/2026-07-05-indesign-architecture-refactor-plan.md:74-82` 的 Task 1 验证只检查 JS 语法、registry test、architecture check 和现有测试，没有明确运行 artifact 生成命令。
- `docs/superpowers/plans/2026-07-05-indesign-architecture-refactor-plan.md:126-127` Task 3 仍把 `toolRegistryArtifact.js` 和生成 JSON 都列为 Modify，容易被理解为手工编辑 JSON。
- `docs/superpowers/specs/2026-07-04-indesign-architecture-refactor-design.md:207-221` 明确 artifact 是 Node 侧生成，且包含 `generated_at`、`registry_hash` 等字段。
- `setup.py:23-27` 会把当前 repo 的 `src` 复制进 wheel server assets；如果 JSON stale，stale artifact 会被一起打进包。

影响：

artifact 是 CLI 后续读取的事实源。如果没有 `--write` / `--check` 一类确定命令，执行 agent 可能手改 JSON，或忘记刷新 JSON，导致 `toolRegistry.js` 与 `indesign-tool-registry.json` 漂移；打包后 CLI 会消费错误 artifact。

建议改法：

- 在 Task 1 明确一个生成入口，例如 `node src/core/toolRegistryArtifact.js --write` 或 `node scripts/generate_tool_registry_artifact.mjs --write`。
- 增加只读校验命令，例如 `node src/core/toolRegistryArtifact.js --check`，比较当前 JSON 与 registry 投影是否一致。
- `tests/architecture/registry.test.mjs` 或 `scripts/check_architecture.mjs` 必须检测 artifact stale。
- Task 3 的 packaging smoke 不只检查文件存在，还要检查 wheel/sdist 内 artifact 的 `registry_hash` 与当前 source map 一致。

### P1-3 最小验证集合仍可能出现 `tests/index.js --required` false green

证据：

- 当前 `tests/index.js:515-517` 的 `--required` 只过滤 `suite.required`。
- 当前 `tests/index.js:627-629` 在 optional suite 失败时仍 `process.exit(0)`。
- 当前 `tests/index.js:117-123` 的 `Advanced Features` 是 optional；这类区域包含 master/spread/layer/export/utility 风险，不会被 `--required` 阻断。
- 架构 plan 只在 `docs/superpowers/plans/2026-07-05-indesign-architecture-refactor-plan.md:70` 写“`tests/index.js` 接入 registry architecture test”，没有明确该 suite 必须 `required: true`。
- 架构 plan 的最小验证集合 `docs/superpowers/plans/2026-07-05-indesign-architecture-refactor-plan.md:327-338` 不包含 `node scripts/check_architecture.mjs`，也不包含 `node tests/architecture/registry.test.mjs`。
- Task 6 完成条件 `docs/superpowers/plans/2026-07-05-indesign-architecture-refactor-plan.md:286` 说 registry/router/catalog 改坏时不会被 `--required` 单独掩盖，但 Task 6 Verify `:275-281` 没有 `check_architecture`。

影响：

Task 1 当场直接跑 `registry.test.mjs` 可以抓住第一批问题，但后续批次和最小验证集合仍可能只跑 `--required`。如果新 architecture test 没被设成 required，registry/router/catalog 漂移仍可能被 false green 掩盖。

建议改法：

- 明确新增 `Architecture Registry` suite，`required: true`，包含 `tests/architecture/registry.test.mjs` 和必要的 router/architecture meta test。
- Task 1 后，把 `node scripts/check_architecture.mjs` 加入“每个批次结束至少运行”的最小验证集合。
- `scripts/check_architecture.mjs` 对 registry/source/switch/help/catalog 漂移应 hard fail；只有文件大小 guardrail 保持 warning。
- 增加一个 runner meta test，断言 architecture suite 在 `--required` 选择结果中。

## P2 findings

### P2-1 `test_full_e2e.py` 被误标为 Create

证据：

- 架构 plan `docs/superpowers/plans/2026-07-05-indesign-architecture-refactor-plan.md:263` 写 `Create: agent-harness/cli_anything/indesign/tests/test_full_e2e.py`。
- 当前文件已存在：`agent-harness/cli_anything/indesign/tests/test_full_e2e.py:31-35` 已有 `INDESIGN_E2E=1` gated 真实 InDesign 测试。
- 只读命令证据：`Test-Path agent-harness\cli_anything\indesign\tests\test_full_e2e.py` 返回 `True`；`test_core.py` 当前有 103 个 `test_`。

影响：

执行 agent 可能误以为需要新建文件，造成重复文件、覆盖现有 gated 测试，或把真实 E2E 错并进 `test_core.py`。

建议改法：

- 将该行改为 `Modify / Keep gated: agent-harness/cli_anything/indesign/tests/test_full_e2e.py`。
- 若要新增测试，应明确新增哪些 test function，而不是新增同名文件。

### P2-2 仍有少量占位命令，降低机械执行性

证据：

- `docs/superpowers/plans/2026-07-05-indesign-architecture-refactor-plan.md:234` 使用 `node --check <changed files>`。
- `docs/superpowers/plans/2026-07-05-indesign-architecture-refactor-plan.md:343` 使用 `--phase <phase>`。

影响：

这些占位不会阻断方向，但对“独立执行 agent”不够机械。不同 agent 可能选择不同 phase，导致 handler 拆分后的回归覆盖不一致。

建议改法：

- 在 Task 5 按 domain 写固定映射，例如 pageItem -> `destructive_scratch`，advancedTemplate -> `template_flow`，page/graphics/document -> 对应 phase。
- 对 `node --check` 列出每个 domain 预期新增/修改文件，或要求 `git diff --name-only -- '*.js' '*.mjs' | ...` 对变更 JS 文件逐个 `node --check`。

## 确认无问题的关键点

- canonical registry/source map 已经放在架构 plan 第一优先级：`docs/superpowers/plans/2026-07-05-indesign-architecture-refactor-plan.md:51-70` 是 Task 1，且 `:15` 明确语义计划必须等架构 Task 1-4。
- 数量基线与代码一致：只读命令确认 `allToolDefinitions = 114`、`advancedTemplateToolDefinitions = 6`；PowerShell case 对账确认 classic switch `144`、definitions `114`、extra switch-only `30`。
- 语义 plan 没有继续建立独立 `src/semantics/registry.js` / `semantics-registry.json`：当前正向口径是 `toolSemantics.js` 按 canonical tool name 追加语义扩展，见 `docs/superpowers/plans/2026-07-04-indesign-tool-semantics-plan.md:25`、`:80`、`:111-112`。
- `classic.hidden_handler` 被保护为待归类对象：架构 plan `:62`、`:66`、`:103`、`:142` 都明确不能删除；当前代码也显示 CLI 仍从 `HIDDEN_HANDLER_FILES` 和 `hidden_handler_schemas.py` 生成 hidden entries，见 `agent-harness/cli_anything/indesign/core/catalog.py:170-176`、`:486-524`。
- CLI primitive 和 plugin overlay 没有被 Node artifact 覆盖：架构 plan `:67`、`:140-141` 明确保留；当前代码 `catalog.py:14-167` 定义 `CLI_PRIMITIVES`，`:403-413` 先合并 CLI/Node/hidden，再校验 plugin id 冲突后追加 plugin。
- advanced server 保持独立入口：架构 plan `:104` 明确不并入 classic server；当前 `src/advanced/index.js:8-15` 有独立 `TOOL_MAP`，`:31-49` 有独立 ListTools/CallTool 处理。
- handler runtime 边界足够薄：架构 plan `:172-174` 明确只做执行、JSON parse、响应包装，并禁止 `sessionManager`、target、slot、label、template、documentState。
- 执行顺序主体合理：架构 plan `:321-325` 要求 Task 1-3 连续完成，Task 7 最后执行；需要修订的主要是 P1-1 里的语义 plan 旧分发残留。

## 只读命令摘要

```powershell
git status --short --branch
# ## master...origin/master
#  M AGENTS.md
#  M docs/README.md
#  M docs/superpowers/specs/2026-07-03-indesign-tool-semantics-design.md
# ?? docs/AI协作/本地Agent/进行中/2026-07-04_架构全面重构审查/
# ?? docs/superpowers/plans/2026-07-04-indesign-tool-semantics-plan.md
# ?? docs/superpowers/plans/2026-07-05-indesign-architecture-refactor-plan.md
# ?? docs/superpowers/specs/2026-07-04-indesign-architecture-refactor-design.md
```

```powershell
node --input-type=module -e "import { allToolDefinitions } from './src/types/index.js'; import { advancedTemplateToolDefinitions } from './src/types/toolDefinitionsAdvancedTemplates.js'; console.log(JSON.stringify({allToolDefinitions: allToolDefinitions.length, advancedTemplateToolDefinitions: advancedTemplateToolDefinitions.length}, null, 2));"
# { "allToolDefinitions": 114, "advancedTemplateToolDefinitions": 6 }
```

```powershell
# classic switch vs definitions
# {"cases":144,"definitions":114,"extraCases":30,"extraCasesList":"preflight_document, data_merge, get_document_xml_structure, export_document_xml, save_document_to_cloud, open_cloud_document, validate_document, cleanup_document, place_xml_on_spread, create_book, open_book, list_books, add_document_to_book, synchronize_book, repaginate_book, update_all_cross_references, update_all_numbers, update_chapter_and_paragraph_numbers, export_book, package_book, preflight_book, print_book, get_book_info, set_book_properties, create_presentation_document, add_cover_page, add_section_page, add_full_bleed_image, add_image_grid, export_presentation_pdf"}
```

```powershell
rg -n "src/semantics/registry|semantics-registry|export_semantics_registry" docs src agent-harness tests README.md README.en.md skills AGENTS.md
# 只命中任务书、旧报告、汇总结论、语义 spec 的否定表述，以及架构 plan 的清理检查命令；未发现语义 plan 正向要求创建独立 semantics registry。
```
