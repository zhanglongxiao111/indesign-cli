# 报告_CLI_catalog_packaging_Agent

## 结论摘要

- 当前 CLI catalog 不是单一 truth source，而是 `CLI_PRIMITIVES`、Node 后端 `tools/list/schema`、`hidden_handler_schemas.py`、插件运行时和 `domains.py` 的混合体。
- `Node registry artifact` 可落地，但它只能先接管“静态 Node-backed slice”；`cli`/`script` 原语、插件和 hidden handler 仍需要 Python overlay 或过渡兼容层。
- 现有 spec 方向对，但还缺三块：非 MCP 原语的分层、`aliases` 的正式契约、以及 `tool schema` 的来源边界。

## CLI 真相源和推断点

| 类别 | 当前真相源 |
|---|---|
| CLI 原语 | `agent-harness/cli_anything/indesign/core/catalog.py` 里的 `CLI_PRIMITIVES`，负责 `export.verify`、`server.*`、`session.*`、`tool.batch`、`script.run`。 |
| Node 工具 | `McpBackend.list_tools()` / `schema()`，来源是 `src/index.js` 和 `src/advanced/index.js` 的实际 `tools/list` 与 `tools/call`。 |
| Hidden handler | `hidden_handler_schemas.py` 的 `HIDDEN_HANDLER_SCHEMAS` / `HIDDEN_HANDLER_METADATA`，再加 `hidden_backend.py` 和 `src/handlers/bookHandlers.js`、`presentationHandlers.js`。 |
| 插件工具 | `PluginBackend` + 插件 manifest + 运行时发现结果，`build_catalog_with_backends()` 每次动态合并。 |
| 域摘要 | `domains.py` 里的 `DOMAINS`。 |

| 推断字段 | 当前规则 |
|---|---|
| `domain` | `infer_domain()` 对 classic/advanced 工具做名称/描述推断。 |
| `arg_names` | 从 `inputSchema.properties` 直接抽取。 |
| `schema_size` | 按 properties 数量分 `small/medium/large`。 |
| `side_effects` | 按工具名前缀和 `export/package` 关键字推断。 |
| `artifact_kinds` | 按工具名里的 `pdf/idml/image/epub` 等关键字推断。 |
| `target_scope` | 按 domain / name 推断为 `filesystem`、`active_document`、`workspace` 等。 |
| `_agent_contract` 字段 | `requires_active_document`、`mutates_document`、`writes_filesystem`、`returns_artifacts` 等都是二次派生，不是后端直接返回。 |
| `rank` / `availability` / `destructive` / `one_line_purpose` fallback | 都是展示层派生值。 |

## artifact 接入建议

- 静态 artifact 放在 `src/tools/indesign-tool-registry.json`，和 `server root` 同树。
- 读取顺序建议固定为：`INDESIGN_CLI_SERVER_ROOT` 的 active artifact -> 包内 bundled artifact -> 旧 `infer_domain()` fallback（只报警，不再默默当真相源）。
- 插件工具保持 runtime overlay，不写进静态 artifact；插件是工作区态，不是发行态。
- `tool schema` 现在仍然需要 live backend；如果要让它也脱离 live Node 进程，artifact 必须补全 `inputSchema` 或至少提供 `schema_ref`，现在只放 `arg_names/schema_size` 不够。
- hidden handler 迁移到 registry 后，`hidden_handler_schemas.py` 应该退成生成的兼容壳，不再手写真相源。
- 当前仓库里还没有 `src/tools/indesign-tool-registry.json`，说明这条链路还没落地。

## packaging 修改清单

- `setup.py` 里 `copytree(src)` 之前要确保 registry artifact 已生成；如果 artifact 直接提交到 `src/`，现有复制逻辑已经会带上它。
- `MANIFEST.in` 现有 `recursive-include src *` 已经覆盖 `src/tools/indesign-tool-registry.json`，所以只要 artifact 放在 `src/`，通常不需要额外 glob；如果你把文件挪出 `src/`，才需要显式 include。
- `pyproject.toml` 对位于 `src/` 的 registry artifact 不需要新增 `package-data`；只有迁进 Python 包自身目录时才要改这块。
- 建议补一个 wheel/sdist smoke test，确认安装后 `resolve_server_root()/src/tools/indesign-tool-registry.json` 真的存在。
- 如果 hidden handler 也迁移进 registry，就把对应 schema/metadata 一起做成同一套生成与校验，避免 Python JSON 和 Node artifact 再次分叉。

## 风险列表

**P0**

- 静态 artifact 覆盖或漏掉 Python 原语 / hidden handler，`tool domains`、`tool list`、`tool schema` 会直接丢核心命令。
- 轮子或源码包里缺 artifact，或者生成步骤没跑，已安装 CLI 会退化到 heuristics，甚至发现层失效。
- 过早删除 `hidden_handler_schemas.py`，Book / Presentation 隐藏能力会断流。

**P1**

- artifact 与 live backend 漂移，`tool list` 和 `tool schema` 会开始不一致。
- plugin overlay 顺序错误，工作区插件可能泄漏进静态 catalog，或者被静态 catalog 挡掉。
- `indesign-cli` / `cli-anything-indesign` 的 alias contract 不明确，外部自动化会漂。

**P2**

- `schema_size`、`rank`、`one_line_purpose` 这些展示字段过期，主要影响可读性。
- `infer_domain()` 作为 fallback 留得太久，只会让告警噪音变多。
- `side_effects` / `target_scope` 的启发式有小误判，影响建议文案，不影响实际执行。

## 对正式 spec 的修改建议

- 单独加一节 `CLI primitives overlay`，明确 `export.verify`、`script.run`、`tool.batch`、`session.*`、`server.*` 不是 Node 发现结果。
- 把 `aliases` 从示例字段升成正式 contract，说明 `cli-anything-indesign` 是稳定兼容别名还是仅过渡别名。
- 明确 plugin 只能做 runtime overlay，写清 merge 顺序和冲突规则。
- 明确 hidden handler 的迁移路径：registry 负责 schema / metadata，`hidden_handler_schemas.py` 只保留过渡兼容。
- 明确 `tool schema` 是继续 live backend，还是要被 artifact 离线化；如果要离线化，artifact 里必须有完整 schema 或 schema ref。

## 建议的验证命令

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
indesign-cli server health --deep --connect-indesign
indesign-cli tool domains
indesign-cli tool list --domain export --callable-only
indesign-cli tool schema export.verify
indesign-cli tool schema script.run
indesign-cli tool schema tool.batch
indesign-cli script run test\workspace\probe.jsx
indesign-cli export verify output\deck.pdf
python -c "from cli_anything.indesign.core.runtime import resolve_server_root; p = resolve_server_root() / 'src' / 'tools' / 'indesign-tool-registry.json'; print(p, p.exists())"
node scripts\validate_schemas.js
node scripts\check_duplicates.mjs
node scripts\quick_check.mjs
node tests\index.js --required
python -m build
twine check dist\*
```

