# 审查结论
- Ready to merge: No
- 总体判断：CLI 基础 envelope、`--args-file`、`session doctor`、`tool batch`、`tool explain`、JPEG-only `export_images` 等主路径已有实现和测试，但本轮还没有收住计划里的文档安全、插件超时/allowlist 贯通和真实 E2E 断言。当前直接合并会让“Agent UX hardening 已完成”的结论过早。

# Findings

## 1. close_document 仍会在多文档场景无目标关闭 active document
- Severity: Critical
- File: `src/handlers/documentHandlers.js:243`
- 问题：`closeDocument()` 不接收显式目标，也没有检查 `app.documents.length > 1`；只要存在文档，就取 `app.activeDocument` 并在 `src/handlers/documentHandlers.js:260` 执行 `doc.close(SaveOptions.NO)`。这与计划文档中“多文档打开且未显式目标时关闭/覆盖类操作返回 `DOCUMENT_TARGET_AMBIGUOUS`”的要求不一致。
- 影响：Agent 在用户已有多个 InDesign 文档打开时可能关闭错误文档，并且 `SaveOptions.NO` 有丢弃未保存修改的风险。`session doctor` 和 catalog 元数据无法弥补这个执行路径风险。
- 建议修复：为 close/save/overwrite 类工具增加显式目标参数或明确的 force-active 选项；当 `app.documents.length > 1` 且无显式目标时返回结构化失败 `code:"DOCUMENT_TARGET_AMBIGUOUS"`，并带 `documentState`。同时把多文档安全场景加入真实 E2E。

## 2. `--timeout-ms` 没有贯通到插件调用
- Severity: Important
- File: `agent-harness/cli_anything/indesign/core/router.py:158`
- 问题：`Router._plugin_backend()` 始终返回 `PluginBackend(self.catalog.plugin_record(plugin_id))`，没有传入 `self.backend_timeout_seconds`；`PluginBackend` 虽然在 `agent-harness/cli_anything/indesign/core/plugins/backend.py:14` 支持 timeout 参数，但默认值固定为 30 秒，manifest 的 `timeout_default_ms` 也没有被使用。
- 影响：`indesign-cli tool call <plugin-tool> --timeout-ms ...` 对插件无效。插件卡住或长时间执行时，不会按调用方要求返回 `TIMEOUT` / `state_uncertain:true`，计划中的插件超时语义没有真正落到 router 路径。
- 建议修复：`Router._plugin_backend()` 传入 CLI 归一化后的 timeout；没有 CLI override 时使用 manifest `timeout_default_ms`。新增 router 级测试，覆盖 `Router(..., backend_timeout_seconds=...)` 到 `PluginBackend.timeout` 的贯通，而不是只测低层 `PluginBackend(record, timeout=...)`。

## 3. `plugin validate` 未校验 host action allowlist
- Severity: Important
- File: `agent-harness/cli_anything/indesign/core/plugins/manifest.py:225`
- 问题：manifest 校验只确认 `host_actions` 是字符串数组，没有检查每个 action 是否在宿主 allowlist 内；运行时 `HostActionExecutor` 在 `agent-harness/cli_anything/indesign/core/plugins/host_actions.py:55` 才拒绝不允许的 tool id。
- 影响：声明了不支持 host action 的插件可以通过 `plugin validate` / `plugin install`，之后到真实调用时才失败。这样验证路径不能提前证明插件符合宿主安全边界，也与 hardening design 里 `plugin validate` 校验 host action allowlist 的目标不一致。
- 建议修复：在 manifest 或 validate 层校验 `host_actions ⊆ {"script.run","export.verify","session.show"}`，错误码与现有协议统一为 `PLUGIN_HOST_ACTION_DENIED` 或同步文档后使用新的稳定码。补一个 manifest `host_actions:["server.setup"]` 应验证失败的测试。

## 4. 真实 E2E runner 对预期失败只检查“失败了”，不检查失败语义
- Severity: Important
- File: `tests/real-e2e/run-agent-ux-hardening.mjs:65`
- 问题：`step()` 对 `expectedOk=false` 只做 `!call.ok` 判断。`export_png_rejected`、`wrapper_failure`、`batch_failed_step` 分别在 `tests/real-e2e/run-agent-ux-hardening.mjs:117`、`:123`、`:131` 只要求命令失败，没有断言 `ARTIFACT_FORMAT_UNSUPPORTED`、`INDESIGN_SCRIPT_FAILED`、`BATCH_STEP_FAILED`、`failed_step` 或 wrapper step 细节。
- 影响：这些场景即使因为无活动文档、MCP 启动失败、脚本路径错误或其他无关原因失败，runner 也会计为通过。用户提供的“真实 E2E 曾通过”因此不能证明关键错误语义正确。
- 建议修复：扩展 `step()` 支持 `expectedCode` 和自定义断言；PNG 断言 `payload.error.code === "ARTIFACT_FORMAT_UNSUPPORTED"`，wrapper 断言 `INDESIGN_SCRIPT_FAILED` 和 step，batch 断言 `data.failed_step === "bad-step"`。同时补上计划要求的多文档 `DOCUMENT_TARGET_AMBIGUOUS` 场景。

## 5. 新增参数没有完整进入 catalog `arg_names`
- Severity: Minor
- File: `agent-harness/cli_anything/indesign/core/catalog.py:35`
- 问题：`server.health` 的 catalog `arg_names` 仍只有 `["deep"]`，缺少 `connect_indesign`；`script.run` 在 `agent-harness/cli_anything/indesign/core/catalog.py:149` 的 `arg_names` 缺少 `timeout_ms`。但对应 schema 和 CLI parser 已有这些参数。
- 影响：`tool explain` 使用 `tool["arg_names"]` 输出参数，因此 Agent 发现路径会漏掉本轮新增的关键 flag，文档与 schema 虽然存在，但 catalog 说明不完整。
- 建议修复：同步更新 `CLI_PRIMITIVES` 的 `arg_names`，并增加测试确保新增 CLI/schema 参数至少出现在 `tool explain` 的参数列表中。

## 6. 结构化失败会丢掉 message，CLI 外层错误信息变泛化
- Severity: Minor
- File: `src/utils/stringUtils.js:38`
- 问题：`formatScriptResult()` 处理 `{success:false, code, message}` 时返回对象里保留 `code` 和 `result`，但不保留 `message`。随后 `McpBackend._parse_tool_response()` 在 `agent-harness/cli_anything/indesign/core/mcp_backend.py:191` 找不到 `message/error`，外层 failure envelope 的 `error.message` 会退化为 `"MCP tool failed"`。
- 影响：例如 `export_images` 的 `ARTIFACT_FORMAT_UNSUPPORTED` 能保留错误码，但人类和 Agent 看到的顶层 message 不够具体，需要到 details/result 里再找原因。
- 建议修复：`formatScriptResult()` 对失败对象保留 `message` 和 `error` 字段，或让 `McpBackend` 在缺少 message 时回退到 `parsed.result`。补测 `ARTIFACT_FORMAT_UNSUPPORTED` 的外层 `error.message`。

# Test Gaps / Residual Risks
- 未发现 `git diff --check master` 空白错误；命令只输出 LF/CRLF 工作区提示。
- 本次审查按只读要求未重跑用户列出的完整验证命令，也未启动真实 InDesign；真实 COM/E2E 状态以用户提供的历史结果为背景，未在本轮重新确认。
- `tests/test-handler-contracts.js` 主要做源码字符串检查，不能证明 ExtendScript 在真实 InDesign 中的行为正确。
- `tests/real-e2e/run-agent-ux-hardening.mjs` 尚未覆盖多文档目标歧义保护。
- 非 CLI MCP 客户端仍收到普通 text content，需要自己解析 JSON 中的 `success:false`；MCP 层没有设置 `isError`，这是兼容风险。
- `formatResponse()` 现在会解析 JSON 字符串；对依赖旧 `result` 字符串形态的 MCP 客户端，可能出现嵌套 `result` 类型从 string 变 object 的兼容变化。
- 插件 required manifest 字段会破坏旧插件，这是本轮设计意图的一部分；仍需要在 README/Skill 中明确迁移要求，并用真实外部插件验证。

# Reviewed Evidence
- `git rev-parse --show-toplevel`：确认仓库根目录是 `D:/AI/mcp-indesign`。
- `git status --short --branch`：当前分支 `codex/indesign-cli-agent-ux-hardening`；工作区有 27 个 tracked 修改，untracked 包括 `agent-harness/cli_anything/indesign/core/batch.py`、`tests/real-e2e/run-agent-ux-hardening.mjs`、`tests/real-e2e/validators/agent-ux-hardening.jsx`、`tests/test-handler-contracts.js`、`tests/test-response-semantics.js`。
- `git diff --stat master`：相对 `master` 共有 27 个 tracked 文件变更，约 `1076 insertions(+), 96 deletions(-)`，另有上述 untracked 文件。
- 已查看 `git diff master` 涉及的 CLI、plugin、Node handler、测试和文档关键文件：`indesign_cli.py`、`core/envelope.py`、`core/errors.py`、`core/router.py`、`core/batch.py`、`core/mcp_backend.py`、`core/session.py`、`core/health.py`、`core/plugins/*.py`、`core/catalog.py`、`src/utils/stringUtils.js`、`src/handlers/exportHandlers.js`、`src/handlers/graphicsHandlers.js`、`src/types/toolDefinitionsExport.js`、`tests/index.js`、`tests/real-e2e/run-agent-ux-hardening.mjs`、`tests/test-response-semantics.js`、`tests/test-handler-contracts.js`。
- 已查看计划文档 `docs/superpowers/plans/2026-07-01-indesign-cli-agent-ux-hardening-plan.md`，重点核对了 plugin timeout、host action allowlist、documentState、`DOCUMENT_TARGET_AMBIGUOUS`、JPEG-only export、真实 E2E runner 期望。
- `git diff --check master`：退出码 0；只有工作区 LF/CRLF 提示，没有 whitespace error。
