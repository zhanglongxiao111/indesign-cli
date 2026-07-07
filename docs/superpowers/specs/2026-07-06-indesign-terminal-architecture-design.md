# InDesign MCP / CLI 终态架构设计（一次性重构）

日期：2026-07-06

状态：正式方案。取代 `docs/superpowers/specs/2026-07-04-indesign-architecture-refactor-design.md`。

决策背景：用户于 2026-07-06 明确要求放弃渐进迁移和兼容垫片，一次性重构到彻底干净的终态。本方案继承 2026-07-04 审查的全部事实调研结论，但替换其架构组织方式。

## 1. 与前一版方案的关系

2026-07-04 方案（下称"映射表方案"）的核心是：新增 `src/core/toolRegistry.js` 作为映射表，引用现有 `src/types/`（schema）和 `src/handlers/`（实现），三处事实靠 `scripts/check_architecture.mjs` 对账；旧结构以 facade、fallback、兼容入口的形式长期保留。

映射表方案的问题：

- SSOT 是"检查器保证的多处一致"，不是"结构保证的单点"。一个工具的事实仍分散在 `types`、`handlers`、`toolRegistry` 三处，新增工具至少改 3 个文件。
- 兼容层（handler facade、`domains.py` fallback、`hidden_handler_schemas.py`、`test_core.py` 兼容入口）没有退役条件，会成为新的历史包袱。
- `contract` 元数据是手写声明，无校验机制，且与 `catalog.py` 现有 `_side_effects()` 推断存在交接一致性问题。

本方案的立场：**能用目录结构和 import 关系保证的一致性，不用对账脚本保证**。对账检查只保留在必须跨语言边界的地方（Node registry → JSON artifact → Python CLI）。

## 2. 第一性原理

1. **共置**：一个工具的全部事实（name、schema、contract、handler、CLI 投影）物理上在一个文件里。改一个工具 = 改一个文件。
2. **单向派生**：一切消费面（MCP ListTools、CLI catalog、help 输出、tool-suite 测试、文档工具清单）从 registry 单向派生。禁止任何消费面反向维护平行目录。
3. **结构保证优于检查器保证**：`defineTool()` 在模块加载时校验形状，坏 entry 直接 throw；registry 聚合时断言唯一性。不存在"schema 和 handler 对不上"的状态空间。
4. **没有中间态**：不存在"有 handler 无 schema""有 case 无 definition"的工具。每个工具要么完整存在，要么不存在。可见性是显式 `profiles` 字段，不是"缺失某处注册"的副作用。
5. **删除即终态**：重构完成 = 旧结构物理不存在。不留 facade、不留 fallback、不留"标记 deprecated 待删"。

## 3. 现状基线（2026-07-06 实测）

- `src/types/index.js` exposed definitions：114。
- `src/core/InDesignMCPServer.js` switch cases：144，其中 30 个 switch-only（document 高级能力 9 个 + Book 15 个 + Presentation 6 个）。
- `src/advanced/index.js` advanced tools：6。Node-backed 工具合计 **150**。
- handler 域 16 个，域间**零相互 import**；仅 5 个域（document、graphics、presentation、text、utility）import `sessionManager`。
- handler 外部消费方仅 3 处：`src/core/InDesignMCPServer.js`、`tests/index.js`、`tests/test-handler-contracts.js`。
- `src/index.js` 16 行、`src/advanced/index.js` 76 行，均为薄入口。
- 30 个 hidden 工具中 21 个（Book/Presentation）在 `hidden_handler_schemas.py` 有 Python schema，9 个 document 域工具无任何 schema。
- `catalog.py:196 _side_effects()` 以启发式推断 side effects，`catalog.py:232-241` 由此派生 `destructive` / `mutates_document` / `writes_filesystem`。

结论：域间零耦合 + 消费方极少，意味着一次性重构的切换面是小的、可并行的。

## 4. 终态结构

```text
src/
  index.js                      # classic MCP 入口壳：createMcpServer({ profile: 'classic' })
  advanced/
    index.js                    # advanced MCP 入口壳：createMcpServer({ profile: 'advanced' })
  core/
    mcpServer.js                # 唯一 MCP server 工厂：协议接入、ListTools（按 profile 过滤）、CallTool → router
    toolRouter.js               # 薄 dispatch：name → registry entry → handler
    runtime.js                  # runScript / runJsonScript / runScriptFile / parseJsonResult / 响应包装
    scriptExecutor.js           # 不变
    sessionManager.js           # 不变
    artifact.js                 # registry → JSON 投影，--write / --check
    indesign-tool-registry.json # 生成物，门禁防漂移
  tools/
    index.js                    # 聚合全部域 → registry；唯一性 / 完整性 / contract 不变量断言
    _contract.js                # defineTool() / buildRegistry()：tool-module 形状校验
    document/                   # 每域：职责模块 × N + index.js 聚合 + _shared.js（域内 JSX helper）
    page/
    text/
    graphics/
    style/
    masterSpread/
    spread/
    layer/
    pageItem/
    group/
    book/
    presentation/
    export/
    utility/
    help/                       # help 工具，输出从 registry 派生
    template/                   # advanced 6 工具，profiles: ['advanced']
  utils/                        # 跨域共享工具函数（现有）
  semantics/                    # 语义契约落点（后续计划；本轮不实现）
```

终态不存在的东西：`src/types/`（整目录）、`src/handlers/`（整目录）、`src/core/InDesignMCPServer.js`、advanced `TOOL_MAP`、`HelpHandlers` 手写目录、`agent-harness/.../core/domains.py`、`agent-harness/.../core/hidden_handler_schemas.py`、`tests/unified-test-runner.js`。

## 5. tool-module 契约

```js
// src/tools/document/lifecycle.js
import { defineTool } from '../_contract.js';
import { runJsonScript } from '../../core/runtime.js';

export const createDocument = defineTool({
  name: 'create_document',            // MCP tool name，全局唯一
  domain: 'document',                 // 必须等于所在目录名（buildRegistry 断言）
  profiles: ['classic'],              // ['classic'] | ['advanced'] | []（internal）
  cli: { id: 'document.create_document', aliases: [] },
  contract: {
    needsInDesign: true,
    requiresActiveDocument: false,
    mutatesDocument: true,
    writesFilesystem: false,
    producesArtifacts: false,
    destructive: false
  },
  inputSchema: { type: 'object', properties: { /* ... */ }, required: [/* ... */] },
  handler: async (args) => { /* 参数处理 → 拼 JSX → runtime 执行 → 响应包装 */ }
});

export const tools = [createDocument /*, ... */];
```

规则：

- `defineTool()` 加载时校验：必填字段齐全、`inputSchema` 为 object schema、`handler` 为函数、`contract` 字段为布尔全集、`profiles` 取值合法。坏 entry 直接 throw，最早失败。
- `buildRegistry()` 聚合时断言：`name` 全局唯一、`cli.id` 全局唯一、`domain` 与目录名一致、数量基线（见 §10）。
- handler 允许 import `sessionManager`、`utils`、域内 `_shared.js`（业务归属）；`runtime.js` 禁止（见 §7）。
- 域内共享的 JSX 生成 helper 放 `<domain>/_shared.js`；跨域共享提升到 `src/utils/`。禁止跨域相互 import tool-module。
- 语义契约（后续计划）作为 tool-module 的可选 `semantics` 字段共置，共享语义 runtime 放 `src/semantics/`。不另建字典。

### profiles 模型

`profiles` 替代映射表方案的 source / visibility 双字段：

| profiles | 含义 | 原口径 |
| -------- | ---- | ------ |
| `['classic']` | classic MCP 暴露 | `classic.exposed` |
| `['advanced']` | advanced MCP 暴露 | `advanced.exposed` |
| `[]` | internal：CLI / E2E 可调，MCP 不暴露 | `classic.hidden_handler` |

artifact 投影时从 `profiles` 派生 `source` 字符串（`classic` / `advanced` / `hidden_handler`），CLI 的 `--source` 过滤行为不变。30 个 internal 工具是否公开到 MCP，终态下是改一个字段的产品决策，不再是结构问题。

## 6. 调用链路

```text
MCP request
  -> src/index.js 或 src/advanced/index.js（入口壳，只差 profile 参数）
  -> core/mcpServer.js（协议接入；ListTools = registry.filter(profile)）
  -> core/toolRouter.js（name → entry → entry.handler(args)）
  -> tool-module handler
  -> core/runtime.js（执行 / JSON parse / 包装）
  -> core/scriptExecutor.js（COM）
```

关于 advanced server：2026-07-04 审查采纳的"advanced 不并入 classic"指**部署形态**——两个 MCP server 进程、两份 MCP 配置。终态保留两个入口壳（路径不变，部署配置不破坏），但协议接入、dispatch、registry 全部共享。原 `advanced/index.js` 的独立 `TOOL_MAP` 和独立协议处理消失。这与审查结论兼容，不是推翻。

unknown tool 错误信息保持现有 MCP 行为。

## 7. runtime 边界

继承映射表方案（该部分正确）：

- 只提供 `runScript` / `runJsonScript` / `runScriptFile` / `parseJsonResult` 和 `formatResponse` / `formatErrorResponse` 复用。
- 允许 strict / structured error / raw fallback 多种失败策略（`advancedTemplateHandlers` 与 `pageItemHandlers` 现有失败语义不同，不强行统一）。
- 禁止：读写 `sessionManager`、target resolution、slot / label / template / documentState 业务语义、JSX snippet 生成器。

## 8. artifact 与 CLI

### artifact

- `node src/core/artifact.js --write` 生成 `src/core/indesign-tool-registry.json`；`--check` 校验未漂移。
- 内容：`schema_version`、`generated_at`、`registry_hash`、`tool_count`、按 source 分组的每工具 `name / source / domain / cli.id / aliases / contract / inputSchema`。**包含完整 inputSchema**，`tool schema` 离线化。
- artifact 是投影不是真相；checked-in 的理由是 CLI dev 模式直接读文件、wheel 打包直接携带，漂移由 `--check` 进入 required 门禁阻断。

### CLI 终态

- `catalog.py` = 三源合并，归属清晰：artifact（Node-backed 150 个）+ `CLI_PRIMITIVES`（Python 原语：`server.*`、`session.*`、`script.run`、`export.verify`、`tool.batch`——实现在 Python，留在 Python 就是共置）+ plugin runtime overlay（manifest 动态）。合并顺序与 id 冲突规则不变，收口到单一合并函数。
- artifact 读取顺序：active server root → wheel 内 server assets。**没有第三级 fallback**。artifact 缺失或 `registry_hash` 不符 = 硬错误，报错信息指引 `indesign-cli server setup` 或 `node src/core/artifact.js --write`。CLI 离开 artifact 无法枚举 Node-backed 工具是正确的依赖关系；退化到猜测才是隐患。
- `domains.py` 删除（推断规则不再存在）。`hidden_handler_schemas.py` 删除（schema 进入 tool-module，经 artifact 输出）。
- 插件协议、host action、envelope、session 契约不变。

### 9 个无 schema 工具

`preflight_document`、`data_merge`、`get_document_xml_structure`、`export_document_xml`、`save_document_to_cloud`、`open_cloud_document`、`validate_document`、`cleanup_document`、`place_xml_on_spread`：从 handler 参数用法反推补写 `inputSchema`，逐个人工 review。这是彻底化的必要成本，schema 属净新增事实，在 golden master 对比中列入预期差异白名单。

## 9. contract 验证（三层）

映射表方案的 contract 是无校验手写声明。终态三层验证：

1. **静态不变量**（`buildRegistry()` 加载时断言）：`destructive ⇒ mutatesDocument`；`requiresActiveDocument ⇒ needsInDesign`；`export` 域工具 `writesFilesystem = true`；`producesArtifacts ⇒ writesFilesystem`。
2. **迁移交接对账**（一次性）：150 个工具的新 contract 与 `catalog.py._side_effects()` 现有推断值做 diff，差异逐项人工确认并记录在迁移报告中。确认完成前不得删除 `domains.py`。
3. **行为抽查**（E2E 增强）：offline runner 执行工具后按 document snapshot 变化核对 `mutatesDocument` 声明，不符输出 warning。此层作为后续增强，不阻塞本轮。

## 10. 数量基线与架构测试

`tests/architecture/registry.test.mjs` 断言：

- classic profile：114；internal：30；advanced：6；合计 150。
- 全部 entry 通过 `defineTool` 校验（加载即验证，测试只需 import 成功 + 数量断言）。
- artifact `--check` 通过。
- `Architecture Registry` suite 进入 `tests/index.js --required`，并有 meta test 断言其 `required: true`。

映射表方案的 `scripts/check_architecture.mjs`（switch / types / help / catalog 六方对账）**不再需要**——对账对象已物理消失。保留的检查只有：registry 加载校验（结构性）、artifact 漂移（跨语言边界）、文件大小 guardrail（防巨型文件回潮，warning）。三者合并进 `scripts/check_architecture.mjs`，职责大幅缩水。

现有 `scripts/validate_schemas.js`、`check_duplicates.mjs`、`quick_check.mjs` 命令入口保留（执行基线引用它们），内部改为消费 registry；其原有职责大部分被 `defineTool` / `buildRegistry` 结构性吸收。

## 11. help 与文档投影

- help 工具本身是 `src/tools/help/` 下的 tool-module，目录内容运行时从 registry 生成。手写目录不存在。
- README、README.en、`skills/indesign-cli/SKILL.md`、`docs/MCP_INSTRUCTIONS.md`、`docs/LLM_PROMPT.md` 的工具清单说明改为引用 artifact 生成的口径或说明生成方式。

## 12. 行为等价验证：golden master

一次性重构不做渐进兼容，行为等价靠录制回放保证：

- **A**：classic / advanced ListTools 全量 JSON（工具名 + schema）。
- **B**：CLI `tool list --json`（全 source）与全部工具 `tool schema` 输出。
- **C**：150 个工具 × 最小合法 args（从 schema required 自动构造占位值）→ mock `scriptExecutor` 捕获生成的 JSX 脚本文本与响应 envelope 形状。构造不出合法 args 或拼装前依赖外部状态的工具允许标记 skip 并记录原因。
- **D**：`run-architecture-presentation --full --offline` 与 `run-agent-ux-hardening --offline` 通过基线。

迁移前录制，切换后回放对比。预期差异白名单：9 个新 schema、help 工具输出（从 registry 派生后格式变化）、artifact 新增字段。白名单外的任何 diff = 阻断。快照与 diff 工具是迁移验收资产，验收后归档进迁移报告，不常驻测试。

真实 InDesign 门禁：合并前跑 `--full`（非 offline）真实 E2E 与 `INDESIGN_E2E=1 test_full_e2e.py`；跑不了必须显式说明。

## 13. 测试架构终态

```text
tests/
  architecture/
    registry.test.mjs             # 数量基线 + 加载校验 + artifact check
    required-runner.test.mjs      # 断言 architecture suite 在 --required 中
  unit/
    toolRouter.test.mjs
    handlerRuntime.test.mjs
  real-e2e/scenarios/             # scenarios.mjs 按 8 场景拆分，拆完删旧聚合
agent-harness/cli_anything/indesign/tests/
  test_catalog_router.py / test_plugins.py / test_health_runtime.py /
  test_paths_envelope.py / test_cli_entrypoint.py / test_package_metadata.py /
  test_bootstrapper.py            # test_core.py 按职责拆分，拆完删除，不留兼容入口
  test_full_e2e.py                # 保持 gated，不重建
```

`tests/index.js` 与 `tests/test-handler-contracts.js` 改为从 registry 消费；`tests/tool-suite/run-all-tools.js` 消费 artifact；`tests/unified-test-runner.js` 确认无引用后删除。

## 14. 与语义契约的衔接

- 语义扩展 = tool-module 可选 `semantics` 字段，与 schema / handler 共置；共享语义 runtime（warning codes、JSX runtime snippet、selector 语义）放 `src/semantics/`。
- artifact 投影携带 `semanticContractVersion` 与 semantic extension 字段，Python CLI 只读 canonical artifact。
- 语义 plan 已按此口径重写为 `docs/superpowers/plans/2026-07-06-indesign-tool-semantics-plan.md`：per-tool 语义字段共置，`src/semantics/` 只留跨工具共享知识；新增工具 = 新增 tool-module 文件 + 域 index 一行。

## 15. 风险与控制

| 风险 | 控制 |
| ---- | ---- |
| 一次性切换回归面大 | 全程在专用分支；golden master A–D 全绿 + 真实 E2E 通过才合并 master；回滚 = 放弃分支 |
| 150 个工具搬迁引入脚本拼装错误 | golden C 逐工具对比生成的 JSX 文本，白名单外 diff 阻断 |
| contract 声明与现有 CLI 推断不一致 | §9 第 2 层一次性 diff 对账，人工确认前不删 `domains.py` |
| 9 个补写 schema 与 handler 实际参数不符 | 逐个人工 review + 对应工具 targeted test |
| 并行迁移 agent 口径漂移 | `_contract.js` 先行 + layer 试点域打穿全链路后再放并行；每域验收有数量断言 |
| registry 变成新框架 | `defineTool` / `buildRegistry` 只做形状校验和聚合断言，禁止业务逻辑 |
| CLI 无 fallback 后可用性 | 硬错误信息给出确定修复命令；packaging smoke 校验 wheel 内 artifact hash |
| E2E false green | `--required` 只是基础门禁；发布矩阵含 tool-suite、UX hardening、full offline、gated 真实 E2E |

## 16. 完成标准（终态断言，全部可机械核查）

- `rg -n "InDesignMCPServer|src/handlers/|src/types/|hidden_handler_schemas|domains\.py|TOOL_MAP" src agent-harness tests scripts` 除历史文档外零命中。
- `src/tools/` 下 150 个 tool-module 通过 `defineTool` 校验；registry 断言 114 / 30 / 6。
- classic 与 advanced 两个 MCP 入口壳共享 `mcpServer.js`，无独立工具表。
- CLI Node-backed 目录只来自 artifact；无 fallback；primitives 与 plugin overlay 归属不变。
- golden master A–D 对比通过（白名单差异除外）。
- 大测试文件（`scenarios.mjs`、`test_core.py`）已拆分且旧聚合文件已删除。
- `AGENTS.md` 代码边界、执行基线与文档已按终态更新。
- 语义契约计划可直接在 tool-module `semantics` 字段上执行。
