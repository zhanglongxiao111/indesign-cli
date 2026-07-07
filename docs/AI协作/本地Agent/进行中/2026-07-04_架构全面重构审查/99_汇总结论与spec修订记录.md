# 汇总结论与 spec 修订记录

日期：2026-07-04

状态：已汇总并修订正式 spec

## 输入

| 输入 | 状态 |
| ---- | ---- |
| `01_结构图与指标.md` | 已采纳 |
| `报告_MCP_registry_router_Agent.md` | 已采纳 |
| `报告_handler拆分_Agent.md` | 已采纳 |
| `报告_CLI_catalog_packaging_Agent.md` | 已采纳 |
| `报告_tests_e2e_Agent.md` | 已采纳 |
| `报告_对抗式架构审查_Agent.md` | 已采纳 |

## 总体结论

全面重构方向成立，但原始 spec 需要先修订再执行。核心问题不是代码行数，而是多套真相源并存：

- `src/types/index.js` exposed tools：114。
- `src/core/InDesignMCPServer.js` classic switch cases：144。
- 30 个 classic switch case 不在 exposed definitions 中。
- advanced template server 另有 6 个独立工具。
- CLI catalog 还叠加 `CLI_PRIMITIVES`、hidden handler scan、plugin runtime overlay 和 `domains.py` 推断。
- `HelpHandlers` 也维护了一套会漂移的手写目录。

因此，第一步不是拆 handler，而是冻结 canonical registry / source map，把 exposed、hidden、advanced、CLI primitive、plugin overlay 的边界说清楚。

## 已采纳的关键意见

### 1. 取消双 registry

来源：`报告_对抗式架构审查_Agent.md`

采纳：

- 正式架构 spec 不再使用 `src/tools/registry.js`。
- canonical registry 改为 `src/core/toolRegistry.js` 薄 source map。
- 语义 spec 不再把 `src/semantics/registry.js` 作为独立工具 registry。
- 语义层改为 canonical registry 的 semantic extension。

修改：

- `docs/superpowers/specs/2026-07-04-indesign-architecture-refactor-design.md`
- `docs/superpowers/specs/2026-07-03-indesign-tool-semantics-design.md`

### 2. source / visibility 必须显式建模

来源：`报告_MCP_registry_router_Agent.md`、`报告_CLI_catalog_packaging_Agent.md`

采纳：

- registry entry 必须区分 `classic.exposed`、`classic.hidden_handler`、`advanced.exposed`、`cli.primitive`、`plugin.exposed`。
- Node-backed canonical registry 负责 classic exposed、classic hidden、advanced exposed。
- CLI primitive 和 plugin 作为 overlay，不被 Node artifact 覆盖。

修改：

- 架构 spec 新增 `Source 和 visibility`。
- CLI catalog artifact 章节明确 overlay 规则。

### 3. advanced server 保持独立入口

来源：`报告_MCP_registry_router_Agent.md`、`报告_对抗式架构审查_Agent.md`

采纳：

- `src/advanced/index.js` 不并进 classic runtime。
- 它只共享 registry schema、validator 和 artifact projection。
- 迁移面补入 `src/types/toolDefinitionsAdvancedTemplates.js` 和 real E2E catalog / coverage。

修改：

- 架构 spec 调用链路和批次 2 已更新。

### 4. handler runtime 只能是薄层

来源：`报告_handler拆分_Agent.md`

采纳：

- `src/handlers/runtime.js` 只负责执行、JSON parse、返回包装。
- 明确禁止吞入 `sessionManager`、target resolution、slot、label、documentState、JSX snippet 业务生成。
- handler 拆分顺序按耦合风险，不按行数。

修改：

- 架构 spec `Handler runtime` 和批次 4 / 5 已更新。

### 5. CLI artifact 不能覆盖 CLI 原语和插件

来源：`报告_CLI_catalog_packaging_Agent.md`

采纳：

- Node artifact 只负责 Node-backed built-ins。
- `export.verify`、`server.*`、`session.*`、`script.run`、`tool.batch` 继续由 Python CLI 定义。
- 插件工具仍是 runtime overlay。
- hidden handler schema 迁移前保留 Python 兼容。

修改：

- 架构 spec `CLI catalog artifact` 和批次 3 已更新。

### 6. 验证基线必须扩展

来源：`报告_tests_e2e_Agent.md`

采纳：

- `tests/index.js --required` 仅作为基础门禁，不再被描述成全覆盖。
- 增加 JS runner `node --check`。
- 增加 `run-agent-ux-hardening`、`run-architecture-presentation --inventory/phase`、`tool-suite`、`test_full_e2e.py` 的分批门禁。
- `scripts/check_architecture.mjs` 标为待实现，不再出现在实现前必跑命令中。

修改：

- 架构 spec `验证基线` 已更新。

## 不采纳或降级的意见

| 意见 | 处理 |
| ---- | ---- |
| 一开始就让文件大小阈值硬失败 | 降级为 warning，等架构检查脚本稳定后再决定是否硬失败 |
| 把 advanced server 并入 classic runtime | 不采纳，当前代码和 CLI 已把它作为独立 source |
| 立刻删除 `hidden_handler_schemas.py` | 不采纳，Book / Presentation 仍依赖 hidden handler 过渡 |
| handler runtime 统一所有 JSON 失败策略 | 不采纳，`advancedTemplateHandlers` 和 `pageItemHandlers` 当前失败语义不同 |

## 正式 spec 修订清单

已修订：

- `docs/superpowers/specs/2026-07-04-indesign-architecture-refactor-design.md`
  - 更新现状指标为 114 exposed / 144 switch / 30 switch-only / 6 advanced。
  - 取消 `src/tools/` 分层。
  - 新增 `src/core/toolRegistry.js`、`toolRouter.js`、`toolRegistryArtifact.js` 薄层设计。
  - 新增 source / visibility 模型。
  - 新增 CLI primitive / plugin overlay 规则。
  - 新增 HelpHandlers 派生/校验要求。
  - 更新 handler runtime 限界。
  - 更新分批执行顺序。
  - 更新验证基线。

- `docs/superpowers/specs/2026-07-03-indesign-tool-semantics-design.md`
  - 取消独立 `src/semantics/registry.js` 工具 registry。
  - 新增 `nativeTypes.js`、`toolSemantics.js` 语义扩展口径。
  - 明确 Python CLI 读取 canonical registry artifact，而不是单独语义 artifact。
  - 更新实施顺序中 registry artifact 的说法。

## 下一步

下一步应写实施计划：

```text
docs/superpowers/plans/2026-07-04-indesign-architecture-refactor-plan.md
```

计划应按修订后的批次写，不要再按旧的 `src/tools/` 方案执行。

