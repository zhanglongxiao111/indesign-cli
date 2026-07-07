# MCP / registry / router 审查报告

结论：当前没有看到 handler 级别的丢失，`switch` 也没有落到不存在的方法上；真正分裂的是 `ListTools`、classic `switch`、CLI catalog、help 这几套真相源。按现状，`src/types/index.js` 只会给出 114 个工具，但 classic server 能调度 144 个 case；其中 30 个是“switch 有、definitions 没有”的能力，book/presentation 还额外依赖 CLI 的 `hidden_handler` 扫描兜底。`src/advanced/index.js` 应保持独立 runtime 入口，但 registry/schema/validator 可以共用。

## 证据表

| 文件 | 片段 | 观察 |
| --- | --- | --- |
| `src/core/InDesignMCPServer.js:45` / `src/types/index.js:92` | `ListTools` / `allToolDefinitions` | `ListTools` 直接回 `allToolDefinitions`；导入后实际只有 114 项，而 classic `switch` 有 144 项。差异按域看是 document 8、spread 1、book 15、presentation 6。 |
| `src/types/toolDefinitionsBook.js:6` / `src/types/toolDefinitionsPresentation.js:6` / `agent-harness/cli_anything/indesign/core/catalog.py:390` | `bookToolDefinitions` / `presentationToolDefinitions` / `hidden_handler` | 这两个数组都被注释块包住了，但 CLI 仍会从 `bookHandlers.js`、`presentationHandlers.js` 扫出 `hidden_handler` 条目；`list_tools` 还按 `source` 和 `callable_only` 过滤。 |
| `src/types/toolDefinitionsDocument.js:71` / `src/core/InDesignMCPServer.js:71` | `preflight_document` 等注释块 | `preflight_document`、`data_merge`、`get_document_xml_structure`、`export_document_xml`、`save_document_to_cloud`、`open_cloud_document`、`validate_document`、`cleanup_document` 都在 definitions 里被注释掉，但 classic server 仍然在 dispatch。 |
| `src/types/toolDefinitionsSpread.js:118` / `src/core/InDesignMCPServer.js:196` | `place_xml_on_spread` | `place_xml_on_spread` 在 definitions 里被注释掉，但 server 仍可调用。 |
| `src/advanced/index.js:8` / `src/handlers/index.js:8` / `agent-harness/cli_anything/indesign/core/router.py:17` | `TOOL_MAP` / `BACKENDS` | advanced template server 是独立 MCP runtime；Python router 也已经把 `advanced` 和 `classic` 当成两个后端。 |
| `src/handlers/helpHandlers.js:10` | `toolCategories` / `toolDefinitions` | help 仍是手写 catalog，已经引用了不存在的 `get_text_info`，说明它也是一份会漂的真相源。 |
| `src/handlers/documentHandlers.js:13` / `src/handlers/pageHandlers.js:192` | `ensureActiveDocument` / `getAllPages` | 这是内部 helper，不是 MCP tool；registry 重构时不要把它们当成可删的“孤儿方法”。 |

## 风险

- P0：未见立即阻断项。
- P1：如果 registry 只吃 `allToolDefinitions`，会直接丢掉 30 个 classic 可调用工具；如果再不保留 `hidden_handler`，还会再丢 21 个 book/presentation 工具。
- P1：spec 的 batch 1 / batch 2 现在没有把 `classic.exposed`、`classic.hidden_handler`、`advanced.exposed`、`plugin.exposed` 这几层分源写死，第一版 registry 很容易冻住一个不完整视图。
- P2：`helpHandlers.js` 仍然是手写目录，`get_text_info` 这类漂移会继续出现，registry 落地后应改成派生或至少做校验。
- P2：`src/advanced/index.js` 不建议并进 classic runtime；应该共享 registry schema 和校验，但保留独立入口。

## 对 spec 的修改建议

- 把 registry entry 明确拆成 `source` 和 `availability/visibility`，至少支持 `classic.exposed`、`classic.hidden_handler`、`advanced.exposed`、`plugin.exposed`。
- 把 CLI 需要的字段写完整，至少要能生成 `id`、`domain`、`name`、`one_line_purpose`、`arg_names`、`schema_size`、`rank`、`callable`、`requires`、`side_effects`、`artifact_kinds`、`target_scope`、`needs_indesign`、`produces_artifacts`、`destructive`。
- 明确 `src/advanced/index.js` 维持独立 runtime 入口，只共享 registry/schema/validator/artifact 生成，不要把它并成 classic server 的一个分支。
- 在 batch 1 前加一条硬校验：`allToolDefinitions`、classic switch、hidden_handler 扫描、help categories 四者必须对账，batch 2 只能在这层对账通过后再冻结 CLI artifact。

## 建议的验证命令

```powershell
node --check src\core\InDesignMCPServer.js
node --check src\advanced\index.js
node scripts\validate_schemas.js
node scripts\check_duplicates.mjs
node scripts\quick_check.mjs
node tests\index.js --required
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
indesign-cli tool domains
indesign-cli tool list --source classic --callable-only
indesign-cli tool list --source advanced --callable-only
node tests\real-e2e\run-architecture-presentation.mjs --full --offline
```

