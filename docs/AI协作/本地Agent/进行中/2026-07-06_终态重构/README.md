# 终态架构重构迁移目录

本目录保存 2026-07-06 InDesign 终态架构一次性重构的迁移过程材料。

## Baseline stabilization record

Task 0 的冻结点在 baseline blocker fixes 完成后、Task 1 启动前。代码和 golden 的 stabilized baseline 锚点不是单个 `adc13f2`，而是以下真实提交集合完成后的状态：

- `adc13f2`：首次落盘 Task 0 baseline，同时包含 D blocker 修复、exposed schema 漏项修复和 E2E 关闭目标修复。
- `4fe0c03`：修复 C 快照覆盖缺口和 D stale failure artifact。
- `ed59ed7`：把 contract baseline 推断收回到 CLI 当前口径。
- `881ed01`：抽出 `catalog.py` canonical `_destructive()` helper，并把 D inventory 纳入 `cli.primitive/feedback.report`。
- `5c3f7bc`：为 D runner 增加 fresh raw catalog evidence 校验和 golden evidence 文件。

后续文档提交只说明边界，不移动 stabilized baseline 的代码/golden 事实。

冻结前仅允许下列最小稳定化修复：

- `src/handlers/groupHandlers.js`：修正 `page.add_item_to_group` 调用不存在的 `group.add(item)`，否则 D runner 无法通过。
- `tests/test-handler-contracts.js`：为 `page.add_item_to_group` 的 group API 修复增加轻量回归断言，防止恢复为不存在的 `group.add(item)`。
- `src/types/toolDefinitionsContent.js`、`src/types/toolDefinitionsMasterSpread.js`、`src/types/toolDefinitionsPage.js`：补齐 3 个 exposed schema 漏项，否则 C=150 构造和 CLI catalog/schema 输出不稳定。
- `tests/real-e2e/lib/scenarios.mjs`：`close_document` 显式指定目标文档和 discard 策略，避免 D offline runner 多文档状态下目标不明确。
- `scripts/migration/record_golden.mjs`：补齐 C 参数构造覆盖、清理 stale D failure、使用稳定 D run-id 投影，并在 D runner 后读取 raw `reports/tool-catalog-summary.json` / `tool-catalog.json` 做硬校验。
- `scripts/migration/contract_baseline.py`：按当前 CLI 真实目录导出 150 个 Node-backed 工具 contract baseline，switch-only 工具通过 CLI canonical helper/contract path 推断字段。
- `agent-harness/cli_anything/indesign/core/catalog.py` 与 `agent-harness/cli_anything/indesign/tests/test_core.py`：最小抽取 `_destructive()` canonical helper，并覆盖 `feedback.report` / `cli.primitive` catalog 口径。
- `tests/real-e2e/lib/catalog.mjs`：把 `cli.primitive` 纳入 D inventory，使 feedback 域进入 raw D evidence。
- `tests/migration/record-golden-d-evidence.test.mjs`：验证 D raw evidence golden 文件包含 `total=150`、`cli.primitive=1` 和 `feedback.report`。
- `golden/`：保存 A/B/C/D 快照、contract baseline、schema net-new whitelist、skip 清单和 D raw evidence 文件。

这些修复只服务于冻结前稳定基线，不属于终态架构迁移。后续任务不得用这条记录扩大 Task 0 范围；冻结后仍不新增工具、不改工具行为，Task 1+ 的 golden diff 以该 stabilized baseline 为准。

## 目录

- `golden/`：Task 0 录制的 A/B/C/D golden master、contract baseline、skip 清单和 schema 净新增白名单。

## 生成入口

```powershell
node scripts/migration/record_golden.mjs
python scripts/migration/contract_baseline.py
```

`record_golden.mjs` 只录制当前 classic/advanced MCP、CLI 目录、handler JSX 快照和 offline runner 输出；不改变运行时事实源。

`contract_baseline.py` 按当前 CLI 真实目录构建 baseline：`McpBackend(repo_root, 'src/index.js')`、`McpBackend(repo_root, 'src/advanced/index.js')`、hidden handler scan，并补入当前 CLI 不可发现的 9 个 switch-only 工具。
