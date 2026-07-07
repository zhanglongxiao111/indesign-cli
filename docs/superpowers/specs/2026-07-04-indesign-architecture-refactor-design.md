# InDesign MCP / CLI 架构全面重构设计

日期：2026-07-04

状态：已被 `docs/superpowers/specs/2026-07-06-indesign-terminal-architecture-design.md` 取代（2026-07-06 用户决策：放弃渐进兼容，一次性重构到终态）。本文档仅存档，其现状调研数据仍有效。

审查材料：`docs/AI协作/本地Agent/进行中/2026-07-04_架构全面重构审查/`

## 1. 背景

本项目已经从单一 MCP server 演进成 MCP server、Python CLI、插件宿主、Agent Skill、真实 E2E、语义契约设计并存的工具链。当前问题不是“文件超过一千行”本身，而是关键事实分散在多处：

- MCP exposed tools 来自 `src/types/index.js`。
- classic server 调度来自 `src/core/InDesignMCPServer.js` 的手写 `switch`。
- advanced template server 有独立 `src/advanced/index.js` 和 `TOOL_MAP`。
- CLI catalog 在 `agent-harness/cli_anything/indesign/core/catalog.py`，并通过 `domains.py` 推断 domain / id / side effects。
- hidden handler、plugin host、help 文本、真实 E2E、README 和 Agent Skill 又各自维护部分能力说明。

这违反了 `AGENTS.md` 中的 `SSOT / SRP / DRY / YAGNI / KISS`。如果直接叠加语义契约，会继续扩大重复映射和历史包袱。

## 2. 当前观测

2026-07-04 审查基线：

- `src/types/index.js` 当前 exposed tool definitions：114。
- `src/core/InDesignMCPServer.js` 当前 classic switch cases：144。
- `switch` 中有 30 个 case 不在 `allToolDefinitions` 中，其中包括 document 高级能力、`place_xml_on_spread`、Book、Presentation。
- `src/advanced/index.js` 另有 6 个 advanced template tools。
- `src/handlers` 中约 152 个 `static async` 方法。
- `src/handlers/documentHandlers.js` 约 1388 行。
- `src/handlers/advancedTemplateHandlers.js` 约 1008 行。
- `src/handlers/pageItemHandlers.js` 约 667 行。
- `src/handlers/pageHandlers.js` 约 635 行。
- `src/handlers/graphicsHandlers.js` 约 569 行。
- `agent-harness/cli_anything/indesign/core/catalog.py` 约 490 行。
- `agent-harness/cli_anything/indesign/indesign_cli.py` 约 502 行。
- `tests/real-e2e/lib/scenarios.mjs` 已超过 1300 行。
- `agent-harness/cli_anything/indesign/tests/test_core.py` 已超过 1900 行。

关键结论：

- 当前不是“没有 registry”，而是有多份隐式 registry：`types`、classic `switch`、advanced `TOOL_MAP`、CLI catalog、hidden handler scan、help catalog。
- Book / Presentation 等 hidden handler 不能按死代码删除。
- advanced server 是独立 runtime 入口，不应强行并入 classic server。
- help catalog 也是漂移源，应由 canonical registry 派生或至少被检查。

## 3. 重构目标

最终目标：

1. 内置工具事实有一个 canonical source map。
2. MCP server 只负责协议接入和调用分发。
3. handler 只负责 InDesign 能力适配，不承担工具目录、CLI 展示或语义推断。
4. JSX 执行、JSON 返回解析、错误包装有薄共享入口。
5. CLI 对 Node-backed 工具消费 canonical artifact，不再靠 Python 猜 domain / id。
6. CLI 原语和插件工具保持 overlay，不被 Node artifact 覆盖。
7. 大 handler 和大测试文件按职责拆分，后续新功能不能继续塞回巨型文件。
8. 语义契约只扩展 canonical registry，不另起一套 registry artifact。

## 4. 非目标

- 不重写 InDesign 自动化底座。
- 不改变现有工具的外部行为。
- 不把 `D:\AI\html-indesign` 的 HTML 转换逻辑搬进本仓库。
- 不在本轮实现语义契约工具。
- 不为了消除少量重复引入难懂抽象。
- 不删除暂时隐藏但尚未完成 source 判定的 handler。
- 不把 advanced template server 强行并进 classic server。

## 5. 目标架构

### 5.1 分层

目标结构：

```text
src/
  core/
    InDesignMCPServer.js        # classic MCP 协议入口
    toolRouter.js               # 薄 dispatch：按 registry 找 handler
    toolRegistry.js             # canonical built-in source map
    toolRegistryArtifact.js     # 生成 CLI / docs 可消费 JSON artifact
    scriptExecutor.js           # 原始 COM / AppleScript 执行
    sessionManager.js           # 会话状态
  advanced/
    index.js                    # advanced MCP 独立入口，复用 registry 校验/投影
  handlers/
    runtime.js                  # 薄执行助手
    document/
      lifecycle.js
      inspection.js
      preferences.js
      structure.js
      cloud.js
      layout.js
      validation.js
    page/
      lifecycle.js
      properties.js
      layout.js
      placement.js
      snapshot.js
      guides.js
      background.js
    pageItem/
      basic.js
      scriptLabels.js
      listing.js
    graphics/
      shapes.js
      images.js
      objectStyles.js
      inspection.js
    template/
      fileRunner.js
      inspection.js
      composition.js
      population.js
  types/
    ...                         # schema 定义仍留在 types
  semantics/
    ...                         # 语义 schema/warning/jsxRuntime；不另建工具 registry
```

`src/core/toolRegistry.js` 是薄 source map，不是新业务框架。它组合现有 `src/types/` 和 `src/handlers/`，解决“工具名、definition、handler、CLI 投影”分散的问题。

### 5.2 Source 和 visibility

registry entry 必须显式区分 source 和 visibility：

| source | 含义 |
| ------ | ---- |
| `classic.exposed` | classic MCP 当前对外 exposed tool |
| `classic.hidden_handler` | 有 handler，但当前不在 MCP exposed definitions 中；先进入 registry/source map 保护，再逐项判定 CLI 暴露、测试覆盖和保留方式 |
| `advanced.exposed` | advanced template MCP runtime exposed tool |
| `cli.primitive` | Python CLI 原语，如 `export.verify`、`server.*`、`session.*`、`script.run`、`tool.batch` |
| `plugin.exposed` | 工作区插件 manifest/runtime 动态工具 |

canonical Node registry 负责 `classic.exposed`、`classic.hidden_handler`、`advanced.exposed`。`cli.primitive` 继续由 Python CLI 定义，`plugin.exposed` 继续由插件 manifest 动态提供，但它们必须遵守同一 catalog 字段契约。

### 5.3 调用链路

classic MCP：

```text
MCP request
  -> InDesignMCPServer
  -> toolRouter.call(name, args)
  -> toolRegistry entry
  -> handler method
  -> optional handler runtime helper
  -> ScriptExecutor
  -> format response
```

advanced MCP：

```text
MCP request
  -> src/advanced/index.js
  -> advanced registry entries
  -> AdvancedTemplateHandlers / split template handlers
```

advanced 仍是独立 runtime 入口，只共享 registry schema、artifact 投影和校验。

### 5.4 Registry entry

内置 Node-backed entry 至少包含：

```js
{
  name: "create_document",
  source: "classic.exposed",
  visibility: "exposed",
  domain: "document",
  definition,
  handler: DocumentHandlers.createDocument,
  cli: {
    id: "document.create_document",
    aliases: [],
    rank: 20
  },
  contract: {
    needs_indesign: true,
    requires_active_document: false,
    mutates_document: true,
    writes_filesystem: false,
    produces_artifacts: false,
    destructive: false,
    target_scope: "indesign"
  }
}
```

规则：

- `name` 等于 MCP tool name。
- exposed entry 的 `definition.name` 等于 `name`。
- `handler` 必须是函数。
- `cli.id`、domain、alias、source 显式声明，不由 Python 推断。
- hidden handler 必须带 `visibility: "hidden_handler"`，不能被 cleanup 当死代码删除。
- plugin 工具不写入 Node source map，但 catalog 合并时字段形状一致。

### 5.5 CLI catalog artifact

Node 侧生成：

```text
src/core/indesign-tool-registry.json
```

artifact 包含：

- `schema_version`
- `generated_at`
- `tool_count`
- `registry_hash`
- source 分组
- 每个 Node-backed 工具的 `name / source / visibility / domain / cli.id / aliases / contract / arg_names / schema_size`
- exposed 工具可包含完整 `inputSchema` 或 `schema_ref`，由实现阶段决定；如果 `tool schema` 要离线化，必须提供完整 schema。

Python CLI 读取顺序：

1. `INDESIGN_CLI_SERVER_ROOT` active server root 下的 artifact。
2. Python wheel 内复制的 server root artifact。
3. 兼容 fallback：旧 `infer_domain()` / live backend 推断，但必须 warning，不再静默当 truth。

注意：

- `export.verify`、`script.run`、`tool.batch`、`session.*`、`server.*` 是 CLI primitive overlay，不由 Node artifact 覆盖。
- 插件工具是 runtime overlay，不写进静态 artifact。
- hidden handler 在迁移完成前保留 Python `hidden_handler_schemas.py`；迁移完成后它只能是生成或兼容层。
- `setup.py` 当前会把 `src/` 复制到 wheel 的 `cli_anything/indesign/server/src`。artifact 放在 `src/core/` 时应随 server assets 进入 wheel；仍需增加 smoke test 确认。

### 5.6 Help 和文档投影

`HelpHandlers` 不应继续维护独立手写 catalog。过渡方案：

1. 先用 architecture check 校验 help catalog 与 registry 不冲突。
2. 再让 help 输出从 registry 派生。
3. README、README.en、`skills/indesign-cli/SKILL.md`、`docs/MCP_INSTRUCTIONS.md`、`docs/LLM_PROMPT.md` 的工具说明从 registry / artifact 复用或被校验。

### 5.7 Handler 拆分

拆分标准是职责，不是行数。

必须保留兼容 facade：

```js
// src/handlers/documentHandlers.js
export const DocumentHandlers = {
  ...DocumentLifecycleHandlers,
  ...DocumentInspectionHandlers,
  ...DocumentPreferenceHandlers,
  ...DocumentStructureHandlers,
  ...DocumentCloudHandlers,
  ...DocumentLayoutHandlers,
  ...DocumentValidationHandlers
};
```

拆分建议：

| 文件 | 建议拆分 |
| ---- | -------- |
| `documentHandlers.js` | `document/lifecycle.js`、`inspection.js`、`preferences.js`、`structure.js`、`cloud.js`、`layout.js`、`validation.js` |
| `pageHandlers.js` | `page/lifecycle.js`、`properties.js`、`layout.js`、`placement.js`、`snapshot.js`、`guides.js`、`background.js` |
| `graphicsHandlers.js` | `graphics/shapes.js`、`images.js`、`objectStyles.js`、`inspection.js` |
| `pageItemHandlers.js` | `pageItem/basic.js`、`scriptLabels.js`、`listing.js` |
| `advancedTemplateHandlers.js` | `template/fileRunner.js`、`inspection.js`、`composition.js`、`population.js` |
| `bookHandlers.js` | `book/lifecycle.js`、`maintenance.js`、`output.js`、`inspection.js`、`properties.js` |
| `spreadHandlers.js` | `spread/lifecycle.js`、`inspection.js`、`placement.js`、`guides.js`、`properties.js` |
| `exportHandlers.js` | 可按 `pdf.js`、`images.js`、`package.js`、`epub.js` 拆，优先级低 |
| `utilityHandlers.js` | `utility/execution.js`、`inspection.js`、`session.js` |

### 5.8 Handler runtime

`src/handlers/runtime.js` 只能是薄层：

- `runScript(operation, script)`
- `runJsonScript(operation, script, opts)`
- `runScriptFile(operation, filePath)`
- `parseJsonResult(raw, operation, opts)`

允许：

- 调用 `ScriptExecutor`。
- 复用 `formatResponse` / `formatErrorResponse`。
- 收口 JSON parse fallback。
- 允许不同失败策略，例如 `strict` 或 structured error。

禁止：

- 写入或读取 `sessionManager`。
- 承担 target resolution。
- 承担 slot、label、template、documentState 等业务语义。
- 把 JSX snippet 生成器塞进 runtime。

### 5.9 测试架构

新增测试方向：

```text
tests/
  architecture/
    registry.test.mjs
    file-size-guard.test.mjs
  unit/
    toolRouter.test.mjs
    handlerRuntime.test.mjs
  real-e2e/
    scenarios/
      bootstrap_contract.mjs
      main_deck_setup.mjs
      content_text_table.mjs
      template_flow.mjs
      destructive_scratch.mjs
      presentation_hidden.mjs
      book_hidden.mjs
      export_package.mjs
```

Python CLI 测试拆为：

```text
agent-harness/cli_anything/indesign/tests/
  test_cli_entrypoint.py
  test_package_metadata.py
  test_catalog_router.py
  test_plugins.py
  test_health_runtime.py
  test_paths_envelope.py
  test_bootstrapper.py
  test_full_e2e.py
```

`test_core.py` 先保留兼容入口，但不继续承接新场景。

## 6. 分批执行

### 批次 0：审查冻结和护栏

目标：

- 保留本地 Agent 审查目录。
- 修订本 spec 和语义 spec 的 registry 口径。
- 新增或规划 `scripts/check_architecture.mjs`，初期只 warning，不硬失败。

验收：

- 审查报告落盘。
- spec 不再出现双 registry。
- 当前大文件和映射差异可追溯。

### 批次 1：canonical registry/source map

目标：

- 新增 `src/core/toolRegistry.js`。
- 表达 `classic.exposed`、`classic.hidden_handler`、`advanced.exposed` 三类 Node-backed 工具。
- 增加校验：`allToolDefinitions`、classic switch、advanced `TOOL_MAP`、hidden handler scan、help catalog 对账。
- 不改变 runtime 行为。

验收：

- registry 能列出 114 个 classic exposed、30 个 classic hidden/switch-only、6 个 advanced exposed。
- help catalog 漂移被检测。
- `node scripts/validate_schemas.js`
- `node scripts/check_duplicates.mjs`
- `node scripts/quick_check.mjs`
- `node tests/index.js --required`

### 批次 2：thin router 和 help 派生

目标：

- 新增 `src/core/toolRouter.js`。
- `InDesignMCPServer` 从手写 switch 改为 registry dispatch。
- `src/advanced/index.js` 保持独立，但接入 shared validation / projection。
- `HelpHandlers` 改成 registry 派生或被 registry 校验。

验收：

- classic exposed 工具行为不变。
- switch-only / hidden handler 不误删。
- `node --check src\core\InDesignMCPServer.js`
- `node --check src\advanced\index.js`
- `node tests\index.js --required`
- targeted suite 按变更域补跑。

### 批次 3：CLI catalog artifact 和 overlay

目标：

- 生成 `src/core/indesign-tool-registry.json`。
- Python CLI 优先读取 active server root artifact，再读 wheel 内 server root artifact。
- `domains.py` 退为 warning fallback。
- CLI primitive overlay 保留在 Python。
- plugin runtime overlay 保留。
- hidden handler schema 迁移前继续兼容。
- 增加 packaging smoke test。

验收：

- `indesign-cli tool domains`
- `indesign-cli tool list --source classic --callable-only`
- `indesign-cli tool list --source advanced --callable-only`
- `indesign-cli tool schema export.verify`
- `indesign-cli tool schema script.run`
- `python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q`
- wheel / sdist smoke 确认 artifact 存在。

### 批次 4：handler runtime 薄收口

目标：

- 新增 `src/handlers/runtime.js`。
- 只收口执行、JSON parse、返回包装。
- 不迁移 session、target、slot、label、documentState 业务逻辑。

建议顺序：

1. `layerHandlers.js`
2. `utilityHandlers.js`
3. `exportHandlers.js`
4. `spreadHandlers.js`
5. `bookHandlers.js`
6. `pageItemHandlers.js` 的 JSON parse
7. `advancedTemplateHandlers.js` 的 JSON parse

验收：

- 单文件 `node --check`。
- Schema / duplicates / quick check。
- 受影响工具 targeted tests。

### 批次 5：大 handler 按职责拆分

目标：

- 保留旧 facade 和类名。
- registry 可逐步指向细模块。
- 每次只拆一个 domain。

建议顺序：

1. `pageItemHandlers.js`
2. `advancedTemplateHandlers.js`
3. `pageHandlers.js`
4. `graphicsHandlers.js`
5. `documentHandlers.js`

`documentHandlers.js` 放后面，不是因为怕行数，而是因为它混合 lifecycle、session、preferences、XML、cloud、layout、validation，回归面最大。

验收：

- 原工具名保持不变。
- 旧 import 兼容。
- facade 文件不继续承接新功能。
- 对应 Node suite 和 real E2E phase 通过。

### 批次 6：测试拆分

目标：

- 拆 `tests/real-e2e/lib/scenarios.mjs`。
- 拆 Python `test_core.py`。
- `tests/tool-suite/run-all-tools.js` 改为消费 registry artifact 或 CLI catalog。
- `tests/unified-test-runner.js` 标记 legacy；确认无消费者后再迁走或删除。

验收：

- 原测试入口仍可运行。
- 新测试按职责归档。
- `tests/index.js --required` 保留为顶层门禁，但不再被误认为全覆盖。

### 批次 7：清理旧路径

目标：

- 删除已经无引用的 fallback。
- 删除不再需要的 domain 推断规则。
- 清理过时 docs / README / Skill 说法。

验收：

- `rg` 确认旧路径无引用。
- 轻量检查和 CLI 单元测试通过。
- 若影响真实 InDesign 行为，跑对应真实 E2E。

## 7. 与语义契约的关系

语义契约不再建立独立工具 registry。它只扩展 canonical registry：

- tool domain、CLI id、source、alias 来自 `src/core/toolRegistry.js` / artifact。
- 语义层只提供 payload schema、warning code、target carrier、selector semantics、JSX runtime snippet。
- 语义扩展可以作为 registry entry 的 `semantics` 字段，或由 `src/semantics/toolSemantics.js` 按 tool name 追加。
- Python CLI 不再读取单独的 semantics registry artifact；它读取 canonical artifact，其中可包含 `semanticContractVersion` 和 semantic extension fields。

## 8. 风险和控制

### 风险：双 registry

控制：

- canonical registry 只保留一套：`src/core/toolRegistry.js`。
- `src/semantics/` 不再定义工具注册表，只定义语义扩展。
- artifact 只有一条 canonical 输出链。

### 风险：registry 变成大框架

控制：

- `toolRegistry.js` 只做 source map。
- `toolRouter.js` 只做 dispatch。
- `toolRegistryArtifact.js` 只做投影。
- 复杂语义和 JSX 业务逻辑不进入 registry。

### 风险：CLI catalog 丢原语或插件

控制：

- CLI primitive overlay 保留 Python source。
- plugin runtime overlay 保留 manifest source。
- Node artifact 只接管 Node-backed built-ins。
- 合并顺序和冲突规则写进测试。

### 风险：hidden handler 被误删

控制：

- source 明确为 `classic.hidden_handler`。
- cleanup 前必须跑 `tool list --source hidden_handler` 或等价 registry 检查。
- `hidden_handler_schemas.py` 迁移前保留。

### 风险：handler runtime 过度抽象

控制：

- runtime 只收口执行、解析、错误包装。
- session、target、slot、label、documentState 不进入 runtime。

### 风险：测试 false green

控制：

- `tests/index.js --required` 只是基础门禁。
- registry / router / catalog 变更必须加 tool-suite、agent UX hardening、inventory / phase smoke。
- 真实 InDesign 行为要跑 gated E2E 或明确说明未跑。

## 9. 验证基线

纯文档：

```powershell
git diff --check
```

架构入口：

```powershell
node --check src\core\InDesignMCPServer.js
node --check src\advanced\index.js
node --check tests\index.js
node --check tests\real-e2e\run-architecture-presentation.mjs
node --check tests\real-e2e\run-agent-ux-hardening.mjs
node --check tests\tool-suite\run-all-tools.js
node scripts\validate_schemas.js
node scripts\check_duplicates.mjs
node scripts\quick_check.mjs
node tests\index.js --required
node tests\test-master-runner-cli.js
```

registry / router / catalog：

```powershell
node tests\real-e2e\run-architecture-presentation.mjs --inventory --offline
node tests\tool-suite\run-all-tools.js
indesign-cli tool domains
indesign-cli tool list --source classic --callable-only
indesign-cli tool list --source advanced --callable-only
indesign-cli tool schema export.verify
indesign-cli tool schema script.run
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
```

real E2E phase smoke：

```powershell
node tests\real-e2e\run-agent-ux-hardening.mjs --offline
node tests\real-e2e\run-architecture-presentation.mjs --phase main_deck_setup --offline
node tests\real-e2e\run-architecture-presentation.mjs --phase content_text_table --offline
node tests\real-e2e\run-architecture-presentation.mjs --phase template_flow --offline
node tests\real-e2e\run-architecture-presentation.mjs --phase destructive_scratch --offline
node tests\real-e2e\run-architecture-presentation.mjs --phase presentation_hidden --offline
node tests\real-e2e\run-architecture-presentation.mjs --phase book_hidden --offline
node tests\real-e2e\run-architecture-presentation.mjs --phase export_package --offline
```

真实 InDesign gated：

```powershell
node tests\real-e2e\run-architecture-presentation.mjs --full --offline
INDESIGN_E2E=1 python -m pytest agent-harness\cli_anything\indesign\tests\test_full_e2e.py -q
```

`scripts/check_architecture.mjs` 是本重构要新增的检查，不应在实现前写入必跑命令。

## 10. 完成标准

全面重构完成时，应满足：

- `InDesignMCPServer.js` 不再手写工具 switch。
- classic exposed、classic hidden handler、advanced exposed 三类 Node-backed 工具有 canonical source map。
- CLI Node-backed 工具目录来自 canonical artifact。
- CLI primitive 和 plugin overlay 明确保留，且不被 Node artifact 覆盖。
- `domains.py` 不再承担 Node-backed 工具 domain 推断。
- `HelpHandlers` 不再维护漂移的手写目录。
- 大 handler 已按职责拆分，并保留兼容 facade。
- handler runtime 只承担通用执行、JSON parse 和返回包装。
- 大测试文件已拆出职责清晰的新文件。
- 架构检查脚本能阻止新增重复映射和巨型文件继续增长。
- 语义契约基于 canonical registry extension 扩展，而不是另起字典。
