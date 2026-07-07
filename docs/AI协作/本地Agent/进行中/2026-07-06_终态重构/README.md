# 终态架构重构迁移目录

本目录保存 2026-07-06 InDesign 终态架构一次性重构的迁移过程材料。

## 目录

- `golden/`：Task 0 录制的 A/B/C/D golden master、contract baseline、skip 清单和 schema 净新增白名单。

## 生成入口

```powershell
node scripts/migration/record_golden.mjs
python scripts/migration/contract_baseline.py
```

`record_golden.mjs` 只录制当前 classic/advanced MCP、CLI 目录、handler JSX 快照和 offline runner 输出；不改变运行时事实源。

`contract_baseline.py` 按当前 CLI 真实目录构建 baseline：`McpBackend(repo_root, 'src/index.js')`、`McpBackend(repo_root, 'src/advanced/index.js')`、hidden handler scan，并补入当前 CLI 不可发现的 9 个 switch-only 工具。
