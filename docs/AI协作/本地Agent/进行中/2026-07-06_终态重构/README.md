# 终态架构重构迁移目录

本目录保存 2026-07-06 InDesign 终态架构一次性重构的迁移过程材料。

## Baseline stabilization record

Task 0 的冻结点在 baseline blocker fixes 完成后、正式 golden master 录制前。`adc13f2` 记录的 golden 是 stabilized baseline，不是原始未修复快照。

冻结前仅允许下列最小稳定化修复：

- `src/handlers/groupHandlers.js`：修正 `page.add_item_to_group` 调用不存在的 `group.add(item)`，否则 D runner 无法通过。
- `src/types/toolDefinitionsContent.js`、`src/types/toolDefinitionsMasterSpread.js`、`src/types/toolDefinitionsPage.js`：补齐 3 个 exposed schema 漏项，否则 C=150 构造和 CLI catalog/schema 输出不稳定。
- `tests/real-e2e/lib/scenarios.mjs`：`close_document` 显式指定目标文档和 discard 策略，避免 D offline runner 多文档状态下目标不明确。
- `scripts/migration/record_golden.mjs` 与 `golden/D_runner_outputs.json`：保存 D runner raw evidence，便于 review 判断 full offline 通过证据。

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
