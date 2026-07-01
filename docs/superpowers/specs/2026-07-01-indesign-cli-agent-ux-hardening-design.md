# indesign-cli Agent 体验与可靠性整改方案

日期：2026-07-01

依据报告：`//daga-nas5/daga-2025-project/D0474_大兴城建/00_agent/test/workspace/20260701_2145_indesigncli_review/report.md`

## 1. 目标

本方案目标是在一次完整整改中解决试用报告暴露的全部问题，使 `indesign-cli` 从“Beta 可用、需受控使用”提升为 Agent 可以可靠编排的 InDesign 自动化底座。

本方案不拆分“先做一部分、以后再说”的阶段。所有下列问题都属于完成定义：

- 外层成功掩盖内层失败。
- 无活动文档被当作成功。
- `tool call` 空参数工具必须传 `--args`。
- 模板工具活动文档状态不显性。
- `export.export_images` 参数与实际格式不一致。
- classic 工具返回自然语言，缺少后续编排所需对象定位信息。
- Skill 缺少 PowerShell 5.1 / PowerShell 7 约束。
- Skill 缺少 JSX 结构化诊断 wrapper 硬规则。
- `duration_ms` 大量为 0。
- `server health --deep` 不做真实 InDesign COM 探针且说明不足。
- session 诊断信息不足。
- schema 缺少返回结构示例和 active document 依赖。
- JSX 原始异常信息不足。
- active document、多文档、关闭/保存/导出目标不显性，存在误操作用户文档风险。
- 长脚本和插件 host action 缺少超时、中断和状态不确定语义。
- 插件工具可能绕过 CLI 主契约，形成第二套不一致体验。
- 工具目录偏“能力列表”，缺少 Agent 任务级发现信息。
- PowerShell / Windows 路径 / JSON 参数摩擦仍主要靠提示词规避。
- 缺少可复盘的批处理入口，Agent 多步操作容易丢上下文或污染文档状态。

## 2. 总体策略

本次整改的核心不是增加更多命令，而是把已有命令变成 Agent 可相信、可编排、可复盘的接口。

采用一个完整整改包，按问题域并行推进：

| 问题域 | 目标 |
| ------ | ---- |
| 成功语义 | CLI 外层 `ok/tool_success/exit_code` 必须反映真实工具结果 |
| 结构化返回 | classic 工具返回机器可读 payload，保留自然语言作为摘要而不是唯一结果 |
| 调用体验 | 空参数工具、超时、shell、COM 探针等高频使用摩擦全部收口 |
| 状态显性 | active document、opened/closed、created item、artifact 都进入返回值或 session |
| 文档保护 | 保存、关闭、导出、覆盖类操作必须显式绑定目标文档，不能误伤用户已打开文件 |
| 插件一致性 | 插件工具复用同一 envelope、错误码、schema 元数据、超时和 session 诊断 |
| 任务发现 | schema/catalog 提供前置条件、副作用、返回示例、失败示例和下一步建议 |
| 批处理 | 提供轻量 batch runner，减少多次 CLI 调用导致的状态竞争 |
| Skill guardrail | 把报告里的 Agent 使用纪律写成硬约束 |
| 测试闭环 | 用红测覆盖报告证据，再用真实 InDesign smoke 验收 |

## 3. 成功语义统一

### 3.1 问题

当前 classic handler 经常把失败写成普通字符串，例如：

- `No document open`
- `No document to close`
- `Error creating rectangle: ...`
- `ERROR: Failed to place image: ...`

这些字符串进入 `formatResponse()` 后被包装成 `success: true`，再被 CLI 包成 `ok: true`、`tool_success: true`、`exit_code: 0`。

### 3.2 方案

新增统一结果判定层，位置建议：

- `src/utils/responseUtils.js`：Node handler 侧统一格式化。
- `agent-harness/cli_anything/indesign/core/mcp_backend.py`：CLI 侧二次防线。

Node handler 侧：

- `formatResponse()` 不再无条件成功。
- 新增 `formatScriptResult(result, operation, options)`，集中识别 legacy 字符串。
- 识别失败模式：
  - 以 `Error `、`ERROR:`、`Failed ` 开头。
  - 包含 `No document open`、`No document to close`、`not found`、`index out of range` 等明确失败语义。
  - 解析到 `{ success: false }` 或 `{ ok: false }`。
- 失败返回统一结构：

```json
{
  "success": false,
  "operation": "Create Rectangle",
  "code": "INDESIGN_SCRIPT_FAILED",
  "result": "Error creating rectangle: ...",
  "timestamp": "..."
}
```

CLI 侧：

- `_parse_tool_response()` 遇到 `parsed.success === false`、`parsed.ok === false`、legacy 失败字符串时抛 `CliError`。
- legacy 字符串识别只作为旧 handler 兼容层，不能作为新工具的主要错误协议。
- 新增或改造 handler 必须显式返回 `{ success:false, code, message, details }`，或抛可被统一响应层转换的结构化错误。
- 外层 failure envelope 使用明确错误码：
  - `NO_ACTIVE_DOCUMENT`
  - `INDESIGN_SCRIPT_FAILED`
  - `MCP_TOOL_FAILED`
  - `ARTIFACT_FORMAT_UNSUPPORTED`

外层 failure envelope 必须稳定包含：

```json
{
  "ok": false,
  "code": "NO_ACTIVE_DOCUMENT",
  "message": "No active document",
  "details": {},
  "request_id": "cli-...",
  "duration_ms": 123,
  "state_uncertain": false,
  "next_action": "Open a document or pass an explicit document target."
}
```

### 3.3 验收

必须新增测试证明：

- `graphics.create_rectangle` 内部返回 `Error creating rectangle...` 时，CLI 外层为 `ok:false`。
- `document.get_document_info` 无活动文档时，CLI 外层为 `ok:false`，错误码为 `NO_ACTIVE_DOCUMENT`。
- `script.run` 返回 JSON `{ ok:false }` 时，CLI 外层为 `ok:false`。
- `script.run` 返回普通成功字符串时仍为成功。
- `script.run` 返回 JSON `{ ok:true }` 时仍提供 `data.result_json`。

## 4. classic 工具结构化返回

### 4.1 问题

classic 工具大量返回自然语言，Agent 不能可靠继续编排。例如：

- `text.create_text_frame` 不返回对象 id、page index、bounds、label。
- `graphics.create_rectangle` 不返回 item id，且错误可能藏在 result 里。
- `document.get_document_info` 返回文本块，后续解析脆弱。

### 4.2 方案

逐步但一次性覆盖本报告涉及和常用编排所需工具，不接受只改一个示例工具。

最低覆盖范围：

| domain | 工具 |
| ------ | ---- |
| document | `create_document`、`open_document`、`get_document_info`、`save_document`、`close_document` |
| graphics | `create_rectangle`、`create_ellipse`、`create_polygon`、`place_image`、`get_image_info` |
| text | `create_text_frame`、`edit_text_frame`、`create_table`、`populate_table` |
| export | `export_pdf`、`export_images`、`export_epub`、`package_document` |
| template | `inspect_template_blueprint`、`create_page_with_template`、`populate_template_slots` |

返回结构统一为：

```json
{
  "success": true,
  "operation": "Create Rectangle",
  "summary": "Rectangle created",
  "data": {
    "itemId": 123,
    "constructorName": "Rectangle",
    "pageIndex": 0,
    "bounds": [20, 20, 80, 120],
    "label": "..."
  },
  "warnings": [],
  "timestamp": "..."
}
```

保留 `result` 兼容旧调用，但新代码和 Skill 必须要求优先读取 `data`。

### 4.3 对象定位规则

创建类工具必须至少返回：

- `itemId`
- `constructorName`
- `pageIndex`
- `bounds`
- `label`，如果调用参数提供或工具自动生成

修改类工具必须支持至少一种稳定定位：

- `itemId`
- `label`
- 明确的 `pageIndex + itemIndex`

### 4.4 验收

真实 InDesign E2E 必须证明：

- 创建文本框后可用返回的 `itemId` 或 `label` 再次修改。
- 创建矩形后返回对象定位信息。
- 置入图片后返回 frame 与 graphic 的定位信息。
- `document.get_document_info` 返回结构化页数、尺寸、路径状态，而不是只能解析文本。

## 5. `create_rectangle` 修复

### 5.1 问题

报告显示 `cornerRadius` 导致 InDesign 报：

```text
Object does not support the property or method 'cornerRadius'
```

当前实现设置了 `rectangle.cornerRadius`，这不是 InDesign 2025 COM 下可用属性。

### 5.2 方案

改为使用 InDesign 支持的角选项和角半径属性：

- `topLeftCornerOption`
- `topRightCornerOption`
- `bottomLeftCornerOption`
- `bottomRightCornerOption`
- `topLeftCornerRadius`
- `topRightCornerRadius`
- `bottomLeftCornerRadius`
- `bottomRightCornerRadius`

如果某个版本不支持某个属性：

- 记录 warning。
- 不把对象创建整体判为失败，除非矩形本身创建失败。

### 5.3 验收

- `cornerRadius > 0` 创建矩形成功。
- 返回 `warnings` 中没有 `cornerRadius` 失败。
- InDesign 文件中实际矩形存在。
- 旧的 `rectangle.cornerRadius` 不再出现。

## 6. `export.export_images` 格式一致性

### 6.1 问题

传 `format: PNG`，结果说导出 JPEG，实际文件也是 `.jpg`。

### 6.2 方案

二选一，但实现必须明确：

1. 如果 InDesign 当前通道只稳定支持 JPEG，则 schema 只允许 `JPEG`，传 `PNG` 直接失败，错误码 `ARTIFACT_FORMAT_UNSUPPORTED`。
2. 如果要支持 PNG，则实现真实 PNG 导出，产物扩展名、返回格式和验证逻辑必须一致。

推荐先做真实语义最稳的方案：只声明 `JPEG`，拒绝 `PNG`，避免假支持。

返回结构：

```json
{
  "format": "JPEG",
  "files": [
    {"path": "outputs/native_images/page_1.jpg", "page": 1, "kind": "image/jpeg"}
  ]
}
```

### 6.3 验收

- `format: JPEG` 返回 `.jpg` 文件清单。
- `format: PNG` 返回失败，不生成误导产物。
- README / Skill 不暗示支持 PNG。

## 7. 空参数工具调用体验

### 7.1 问题

schema 是空对象的工具仍强制 `--args`，例如 `document.get_document_info`。

### 7.2 方案

CLI 层调整：

- `tool call <tool_id>` 的 `--args` 改为可选。
- 同时支持 `--args-file <path>`，作为 Windows / PowerShell 下的首选 JSON 参数入口。
- 支持从 stdin 读取 JSON 参数，避免中文、UNC、反斜杠和引号在 shell 中反复转义。
- 如果 schema 没有 required 参数且未传 `--args`，自动使用 `{}`。
- 如果 schema 有 required 参数且未传 `--args`，仍返回 JSON failure，不让 argparse 输出非 JSON。
- 参数缺失错误统一为 `ARGS_REQUIRED` 或 `MISSING_ARGUMENT`。
- JSON 解析和路径错误必须区分：
  - `ARGS_JSON_INVALID`
  - `ARGS_FILE_NOT_FOUND`
  - `PATH_NOT_FOUND`
  - `PATH_NOT_ACCESSIBLE`
- `tool schema` 的示例优先展示 `--args-file`，内联 JSON 只作为简单 ASCII 参数示例。

### 7.3 验收

- `indesign-cli tool call document.get_document_info` 可运行。
- `indesign-cli tool call export.verify` 未传 `--args` 返回 JSON failure。
- 缺参数不再输出 argparse usage 文本到 stdout。
- `--args-file` 可读取包含中文路径和 UNC 路径的 JSON。
- 错误 JSON 文件返回 `ARGS_JSON_INVALID`，不退化成 Python traceback。

## 8. 文档状态保护

### 8.1 问题

报告暴露出 active document 依赖不显性、模板 inspect 后活动文档变化、多文档时关闭和导出目标不清晰等问题。对 Agent 来说，这不是体验小问题，而是可能误关、误保存、误导出用户自己打开的 InDesign 文件。

### 8.2 方案

所有会读取或改变当前文档状态的工具必须返回 `documentState`：

```json
{
  "documentState": {
    "documentsCount": 2,
    "activeDocumentName": "review.indd",
    "activeDocumentRef": "doc:review.indd:...",
    "activeDocumentPathKnown": true,
    "activeDocumentPath": null,
    "modified": true,
    "targetDocumentRef": "doc:review.indd:...",
    "targetWasExplicit": true,
    "state_uncertain": false
  }
}
```

强制规则：

- `save`、`close`、`export`、`package`、`overwrite` 类工具必须支持显式目标文档参数，或在返回中证明目标就是当前 active document。
- 多文档打开且未显式传目标时，危险操作默认返回 warning；涉及关闭、覆盖、保存到原路径时应拒绝，错误码 `DOCUMENT_TARGET_AMBIGUOUS`。
- 工具不得关闭用户已有文档，除非该文档由本次工具调用打开，或用户/Agent 显式传入了目标路径和关闭意图。
- 模板 inspect、PDF/图片置入、插件 host action 等会临时打开文档或资源的能力，必须报告 `openedDocument`、`closedAfterUse`、`activeDocumentBefore`、`activeDocumentAfter`。
- session 记录最近一次 active document 摘要，但不记录客户文档内容和私有完整路径。

### 8.3 验收

- 多文档打开时调用 `close_document` 且未显式目标，返回 `DOCUMENT_TARGET_AMBIGUOUS`。
- `export_pdf` 返回 `targetDocumentRef`、`activeDocumentName`、`artifacts[]`。
- 模板 inspect 后返回 `activeDocumentBefore/After`，并明确是否关闭了临时打开文档。
- Skill 明确要求危险操作前先确认文档状态，多文档时不得依赖隐式 active document。

## 9. 模板工具状态显性

### 9.1 问题

`inspect_template_blueprint` 传 `templatePath` 会打开并关闭文档，后续 `create_page_with_template` 又依赖 active document。行为合理，但返回值和 schema 不够显性。

### 9.2 方案

模板相关工具返回状态元数据：

```json
{
  "documentState": {
    "openedDocument": true,
    "closedAfterInspect": true,
    "activeDocumentRequiredForNextStep": true,
    "activeDocumentName": null
  }
}
```

schema 增加机器可读字段：

- `requires_active_document`
- `opens_document`
- `may_close_document`
- `next_step_hint`

如果当前 catalog 不适合直接扩展 JSON Schema，则先在 tool metadata 中增加这些字段，由 `tool list/schema` 返回。

### 9.3 验收

- `tool schema template.inspect_template_blueprint` 能看到文档状态说明。
- 实际调用返回 `documentState`。
- Skill 明确模板 inspect 后不能假设模板仍是 active document。

## 10. PowerShell 与编码约束

### 10.1 问题

报告证明 `powershell.exe` 5.1 会让 UTF-8 无 BOM 中文 `.ps1` 出现解析风险；`pwsh.exe` 7 正常。

### 10.2 方案

更新 `skills/indesign-cli/SKILL.md`：

- Windows 上运行 `.ps1` 测试脚本优先使用：

```powershell
pwsh.exe -NoProfile -ExecutionPolicy Bypass -File .\run_review.ps1
```

- 不要写 `powershell -File ...`，除非用户明确要求兼容 Windows PowerShell 5.1。
- 从当前 shell 可以直接执行的命令，不要强行再套 `powershell.exe`。
- 涉及中文、UNC、JSON、here-string 的脚本，必须用 UTF-8 并优先 PowerShell 7。
- 工具调用参数优先写入 JSON 文件，再用 `--args-file` 传递；避免在 PowerShell 中内联复杂 JSON。

README 可以保留通用安装命令，不需要承载 Agent 执行纪律。

### 10.3 验收

- Skill 中出现 `pwsh.exe -NoProfile -ExecutionPolicy Bypass -File`。
- Skill 中明确 `powershell.exe` 通常是 Windows PowerShell 5.1，可能带来编码问题。
- Skill 不再给出会诱导 Agent 使用 `powershell -File` 的示例。
- CLI schema 示例包含 `--args-file` 路径。

## 11. JSX 结构化诊断 wrapper

### 11.1 问题

复杂 JSX 报错只靠 ExtendScript 原始异常，不足以定位业务步骤。

### 11.2 方案

Skill 增加强制约定：所有可复跑 JSX 文件必须使用诊断 wrapper。

推荐模板：

```javascript
var __step = "init";
function __result(ok, data, error) {
  return JSON.stringify({
    ok: ok,
    step: __step,
    data: data || null,
    error: error ? String(error.message || error) : null,
    errorName: error && error.name ? String(error.name) : null,
    errorNumber: error && error.number !== undefined ? error.number : null,
    line: error && error.line !== undefined ? error.line : null,
    fileName: error && error.fileName ? String(error.fileName) : null
  });
}

try {
  __step = "create document";
  // work...
  __step = "export";
  // work...
  __result(true, { exported: true }, null);
} catch (e) {
  __result(false, null, e);
}
```

CLI 层同步：

- 如果 `data.result_json.ok === false`，外层必须失败。
- 失败 details 带 `step`、`errorName`、`errorNumber`、`line`、`fileName`。

### 11.3 验收

- `script.run` 执行 wrapper 返回 `{ ok:false }` 时退出码为 1。
- failure envelope 中包含 `step`。
- Skill 包含完整 wrapper 示例。

## 12. 超时与长任务语义

### 12.1 问题

长 JSX、批量导出、插件 host action 可能超过默认等待时间。当前缺少统一超时参数和中断语义，Agent 超时后无法判断 InDesign 是否仍在执行、是否可以重试、文档状态是否已经被改变。

### 12.2 方案

CLI 增加统一超时能力：

- `tool call`、`script run`、`plugin call`、`tool batch` 支持 `--timeout-ms`。
- 默认超时写入 CLI help 和 Skill；不得在不同通道里各自暗藏默认值。
- 超时返回错误码 `TIMEOUT`，并设置 `state_uncertain:true`。
- 如果 JSX wrapper 提供 `step`，超时或失败时 session 记录最后已知 step。
- 长 JSX 推荐定期更新 `__step`，并在返回 JSON 中写 `progress` 或 `artifacts`。
- 超时后 CLI 不承诺自动回滚 InDesign 状态，只提供下一步诊断建议：检查 active document、检查 artifacts、必要时由用户确认文档状态。

超时 failure 示例：

```json
{
  "ok": false,
  "code": "TIMEOUT",
  "message": "Command exceeded timeout_ms",
  "state_uncertain": true,
  "details": {
    "timeout_ms": 30000,
    "last_step": "export pages"
  },
  "next_action": "Run session show and inspect the active InDesign document before retrying."
}
```

### 12.3 验收

- `script run --timeout-ms 1` 执行长脚本时返回 `TIMEOUT`。
- failure envelope 中 `state_uncertain:true`。
- session 记录 `timeout_ms`、`last_step`、`command`。
- Skill 明确超时后不能盲目重试会写文件或改文档的命令。

## 13. duration 与 session 诊断

### 13.1 问题

大量真实操作 `duration_ms` 为 0，session 只有基础字段，难以回溯。

### 13.2 方案

CLI 命令执行统一计时：

- `tool domains/list/search/schema`
- `tool call`
- `script run`
- `export verify`
- `plugin validate/doctor`
- `server health/setup`
- `session show/clear`

session 记录增加：

- `request_id`
- `command`
- `error_code`
- `error_summary`
- `duration_ms`
- `warnings_count`
- `artifacts`
- `documentState`
- `state_uncertain`
- `next_action`

新增面向 Agent 的诊断视图：

```powershell
indesign-cli session doctor
```

输出最近失败、当前 COM 可用性、活动文档摘要、打开文档数、最近 artifacts、建议下一条验证命令。`session doctor` 只读，不打开、不关闭、不保存文档。

保持隐私要求：不记录客户内容、客户名称或外部私有完整路径。

### 13.3 验收

- 真实 `tool call document.get_document_info` 的 `duration_ms > 0`。
- `session show` 最近记录包含 `request_id` 和 `command`。
- 失败调用 session 包含 `error_code`。
- `session doctor` 在没有活动文档时给出 `NO_ACTIVE_DOCUMENT` 级别的诊断建议。
- session 中 artifacts 只保留必要路径和类型，不记录客户内容。

## 14. COM 健康检查

### 14.1 问题

`server health --deep` 检查 `winax`，但明确不连接 InDesign COM。Agent 容易误以为真实 InDesign 链路已验证。

### 14.2 方案

增加显式开关：

```powershell
indesign-cli server health --deep --connect-indesign
```

行为：

- 默认 `--deep` 仍不主动连接 COM。
- `--connect-indesign` 才执行只读 COM 探针。
- 探针只读取 `app.name`、`app.version`、`documents.length`。
- 不打开、保存、关闭任何用户文档。

返回结构：

```json
{
  "indesign_com": {
    "checked": true,
    "available": true,
    "appName": "Adobe InDesign",
    "version": "20.0.1.32",
    "documentsCount": 0
  }
}
```

### 14.3 验收

- 不传 `--connect-indesign` 时不会启动或连接 InDesign。
- 传 `--connect-indesign` 时返回真实 COM 探针结果。
- 失败时错误码清晰，不吞成 health 成功。
- Skill 明确区分依赖检查和真实 COM 检查。

## 15. schema、工具目录与任务级发现

### 15.1 问题

Agent 需要知道工具是否依赖 active document、会不会打开/关闭文档、返回什么结构。仅有 domain/list/search/schema 仍偏“工具目录”，不能充分回答“当前任务下一步该用哪个命令”。

### 15.2 方案

工具 catalog 增加字段：

- `requires_active_document`
- `requires_active_page`
- `uses_selection`
- `opens_document`
- `closes_document`
- `may_close_document`
- `mutates_document`
- `writes_filesystem`
- `returns_artifacts`
- `return_shape`
- `return_example`
- `failure_example`
- `preconditions`
- `side_effects`
- `safe_usage_notes`
- `common_next_steps`

这些字段先在 CLI catalog 层维护，不要求马上重写全部 MCP schema。

新增轻量任务级发现入口：

```powershell
indesign-cli tool explain <tool_id>
indesign-cli agent quickstart
```

约束：

- `tool explain` 只输出单个工具的用法、前置条件、副作用、返回示例、失败示例、下一步建议。
- `agent quickstart` 只输出最短工作流：健康检查、发现工具、查看 schema、用 args file 调用、复杂任务走 JSX、导出后 verify。
- 两者内容必须来自同一份 catalog/metadata，不能手写成第三套文档。
- README 面向人类，Skill 面向 Agent 策略，CLI catalog 面向事实和机器可读契约。

### 15.3 验收

- `tool list --domain document` 能看到 active document 依赖摘要。
- `tool schema document.get_document_info` 包含返回结构示例。
- Skill 要求 Agent 以 schema/catalog 的状态字段为准。
- `tool explain graphics.create_rectangle` 包含 preconditions、side effects、return_example、failure_example。
- `agent quickstart` 输出少量高价值命令，不超过一个屏幕。

## 16. 插件工具契约

### 16.1 问题

HTML to InDesign 等外部插件会接入 `indesign-cli`。如果插件绕过宿主的成功语义、超时、session、schema 元数据和文档保护，本次整改会在插件层重新失效。

### 16.2 方案

插件工具必须遵守宿主同一套契约：

- 返回同一 envelope：`ok`、`code`、`message`、`details`、`request_id`、`duration_ms`、`state_uncertain`、`next_action`。
- 错误码必须有命名空间，例如 `PLUGIN_HTML_INVALID_SEMANTICS`，但外层类型仍能归入 `ARGS_JSON_INVALID`、`TIMEOUT`、`NO_ACTIVE_DOCUMENT` 等通用类别。
- plugin manifest / tool manifest 必须声明：
  - `requires_active_document`
  - `mutates_document`
  - `writes_filesystem`
  - `returns_artifacts`
  - `timeout_default_ms`
  - `host_actions`
  - `document_state_policy`
- 插件 host action 只能调用 allowlist 中的宿主能力，不能私自绕过 COM 执行链路。
- 插件执行必须进入 session，并记录 plugin id、tool id、artifacts、documentState、duration、error_code。
- 插件输出 artifacts 必须使用统一 `artifacts[]` 结构。

`plugin validate` / `plugin doctor` 增加检查：

- manifest 字段完整性。
- tool schema 是否带 preconditions / side effects / return examples。
- host action 是否在 allowlist 内。
- 是否支持 timeout。
- 是否返回宿主 envelope。

### 16.3 验收

- 一个缺少 `document_state_policy` 的插件无法通过 `plugin validate`。
- 插件工具超时返回 `TIMEOUT` 和 `state_uncertain:true`。
- 插件工具返回 artifacts 后可被 `export verify` 或对应验证器继续处理。
- HTML 插件不需要在本仓库实现，但必须能按本契约接入。

## 17. 批处理入口

### 17.1 问题

Agent 多步骤操作如果拆成多次 CLI 调用，会反复丢失隐式状态，增加 token、shell 转义、active document 竞争和中间失败不可复盘的问题。

### 17.2 方案

新增克制版 batch runner，不做完整事务回滚：

```powershell
indesign-cli tool batch --plan .\batch.json --on-error stop --timeout-ms 120000
```

计划文件示例：

```json
{
  "steps": [
    {
      "id": "doc-info",
      "type": "tool",
      "tool": "document.get_document_info",
      "args": {}
    },
    {
      "id": "make-rect",
      "type": "tool",
      "tool": "graphics.create_rectangle",
      "args": {"pageIndex": 0, "bounds": [20, 20, 80, 120]}
    }
  ]
}
```

返回值：

- 每一步 `id`、`ok`、`code`、`duration_ms`、`data`、`artifacts`。
- 顶层 `failed_step`。
- 顶层 `state_uncertain`。
- 顶层 `cleanup_suggestions`，只给建议，不自动删除或关闭用户文档。

边界：

- 不承诺任意 InDesign COM 事务回滚。
- 默认 `--on-error stop`。
- 允许只读步骤和写入步骤混排，但每步必须明确 side effects。

### 17.3 验收

- batch 中第二步失败时，返回 `failed_step`，后续步骤不执行。
- 每步 duration 和 error code 可见。
- session 记录 batch plan 摘要，但不记录客户内容。
- Skill 推荐多步骤低风险工具调用优先 batch；复杂排版仍优先单个 JSX。

## 18. 测试与验收闭环

### 18.1 单元测试

必须补充或修改：

- `agent-harness/cli_anything/indesign/tests/test_core.py`
  - failure string 映射为 CLI failure。
  - `{ ok:false }` 映射为 CLI failure。
  - 空 schema 工具允许省略 `--args`。
  - duration 非 0。
  - session 记录 request_id / command / error_code。
  - tool metadata 包含 active document 和 return shape 字段。
  - `--args-file` 支持中文路径 JSON。
  - `--timeout-ms` 返回 `TIMEOUT` 和 `state_uncertain:true`。
  - plugin validate 拒绝缺少契约字段的插件。
  - batch runner 返回 failed_step。

### 18.2 Node handler 测试

新增或扩展：

- `tests/test-response-semantics.js`
  - `formatScriptResult("No document open")` 返回 `success:false`。
  - `formatScriptResult("Error creating rectangle: x")` 返回 `success:false`。
  - `formatScriptResult(JSON.stringify({success:false,error:"x"}))` 返回 `success:false`。
  - 普通成功字符串仍成功。
  - 新 handler 返回结构化错误时，不走字符串猜测。

### 18.3 真实 InDesign smoke

新增或扩展真实 E2E：

- 创建文档。
- 无活动文档调用 `get_document_info`，必须失败。
- 创建带圆角矩形，必须成功并返回对象定位。
- 创建文本框，必须返回对象定位。
- 导出 JPEG，必须返回文件清单。
- 传 PNG，必须失败且不生成伪 PNG。
- 运行 wrapper JSX 返回 `{ ok:false }`，CLI 必须失败并带 step。
- `server health --deep --connect-indesign` 只读探针通过。
- 多文档打开时危险操作未显式目标必须失败或 warning。
- batch runner 能执行至少一个只读步骤和一个创建对象步骤。
- 超时脚本返回 `TIMEOUT` 且 session 记录 state uncertain。

### 18.4 报告复跑

整改完成后，必须能重新运行原评测目录中的 runner 或等价复刻测试，并生成新报告：

- P0 项全部关闭。
- P1 项全部关闭。
- P2 项全部关闭或有明确验收证据。

如果报告原 runner 依赖旧行为，应创建新的兼容 runner，但不能删除旧报告证据。

## 19. 文档与 Skill 同步

### 19.1 README

README 只写人类需要知道的能力和安装方式，不写详细 Agent 行为纪律。

需要同步：

- `server health --deep --connect-indesign` 的用途。
- `export_images` 真实支持格式。
- classic 工具结构化返回的说明。
- 插件必须通过宿主协议接入，不绕过 `indesign-cli` 契约。

### 19.2 Skill

Skill 是 Agent 行为 guardrail，必须同步：

- PowerShell 7 / `pwsh.exe` 规则。
- 不能只看外层 `ok/tool_success` 的历史兼容警告；等工具层修完后，改成“外层失败可信，但复杂 JSX 仍要看 `result_json.ok`”。
- JSX wrapper 模板。
- COM 探针规则。
- 模板 inspect 的 active document 状态说明。
- 插件使用仍通过宿主 `tool schema/call`，不要绕过宿主。
- 保存、关闭、覆盖、导出前必须确认目标文档；多文档时不得依赖隐式 active document。
- 复杂 JSON 参数优先 `--args-file`。
- 超时后不得盲目重试写操作。
- 多步骤普通工具调用优先 batch；复杂排版优先单个 JSX。

### 19.3 AGENTS

`AGENTS.md` 只保留开发者规则：

- 这些问题属于 CLI 可靠性边界。
- 不把使用教程写进 `AGENTS.md`。
- 修改 CLI contract 必须同步测试、README、Skill。

## 20. 完成定义

本整改只有一个完成定义，不设“以后再说”的尾巴：

- 报告中的 P0/P1/P2 问题都有对应代码、Skill 或文档改动。
- 新增红测先失败、修复后通过。
- CLI 单元测试通过。
- Node schema/重复工具检查通过。
- 真实 InDesign smoke 通过。
- 文档状态保护、超时、插件契约、任务级发现、`--args-file`、batch runner 均有测试覆盖。
- `python -m build` 通过。
- `rg` 搜不到旧的误导性说明：
  - `148`
  - `Skill 安装能力`
  - `powershell -File`
  - `PNG` 作为 `export_images` 已支持格式，除非真实实现 PNG
- 工作区不遗留测试产物。

建议验收命令：

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
node scripts\validate_schemas.js
node scripts\check_duplicates.mjs
node tests\index.js --required
node tests\real-e2e\run-agent-ux-hardening.mjs --offline
python -m build
git diff --check
```

涉及真实 InDesign 的命令必须在本机 InDesign 可用时运行；如果环境不可用，不允许声明完成。

## 21. 实施注意事项

- 当前工作区已有 `skills/indesign-cli/SKILL.md` 和 `skills/indesign-cli/preview.png` 改动，实施时必须先确认归属，不能覆盖用户改动。
- 先从测试锁定报告证据开始，避免只修文档。
- 不要用大范围字符串替换误伤 handler；优先建立统一响应工具，再迁移高频 handler。
- 保留旧 `result` 字段一段时间，避免破坏已有调用；但新返回必须以 `data` 为主。
- 所有新增错误码必须稳定、可搜索、可被 Agent 分支处理。
