# 门禁摩擦修复设计（表格保真 / 导出预检 / 网格门禁 / 文案包）

## 1. 目标

修掉 2026-09-04 遥测复核（`docs/AI协作/反馈循环/周报_2026-09-04.md`，簇 FC-20260904-01..04）定位的四类摩擦。原则沿用 0819 设计：

> **门禁只拦真实差异；能在 1 秒内查出的问题不要等 90 秒构建后再报；Agent 绕不过的门禁要给数字，绕得过的门禁要让绕过可见。**

保真门禁的判定时机不变（仍在真机读回后比对），只修比对口径本身的三处误判。

## 2. 背景摘要

| 簇 | 现象 | 根因位置 |
| --- | --- | --- |
| FC-01 | 每张 `<table>` 都报 `FORWARD_TABLE_CHANGED`，同事改为删表格 | `hi_tables.jsxinc` 不设表头行；`forward-fidelity.js` `tableFacts()` 不过滤内建段落样式、不折叠空白 |
| FC-03 | 目标 INDD 已在 InDesign 打开，构建 40-94 秒后 `INDESIGN_EXPORT_FAILED`，文案是原始 JSON | 导出 JSX 只在 `errors[]` 里放原因，顶层无 `code/message`，CLI `formatScriptResult` 把整段 JSON 当 message；无预检 |
| FC-02 | `GRID_ALIGNMENT_OFF` 单次 46-381 条，最终整包 `data-id-grid-ignore` | `offGridEdges()` 算出偏移却只返回边名；豁免数量无处可见；strict 下一律升级为 error |
| FC-04 | 五处文案/文档缺口 | 见 §6 |

## 3. A 组：表格保真门禁（FC-01，html-indesign）

### A1. 构建时设置表头行

**现状**：`_indesign_scripts/lib/hi_items.jsxinc:249-266` `createTableFrame()` 用 `convertToTable` 建表后只应用样式、跨行列和单元格属性；`item.rows[r].header` 从未被读。反向读取 `hi_reverse_tables.jsxinc:60` 只认 `table.headerRowCount` 或段落样式名含 header/heading/表头。

**改动**：`createTableFrame()` 在 `applyTableSpans` 之前统计前导表头行数——从第 0 行起连续满足 `rows[r].header === true` 或该行所有单元格 `header === true` 的行——并设置 `table.headerRowCount = n`（`try/catch`，失败记 `TABLE_HEADER_APPLY_FAILED` warning）。只处理前导行；HTML `<thead>` 之外的零散 `<th>` 不设表头行，交给 A2 的比对口径。

### A2. 比对口径：内建样式与零散 th

**现状**：`src/semantic-model/audit/forward-fidelity.js:884-901` `tableFacts()` 对 `cellStyle` 用 `isBuiltinNoneStyle`（只匹配 `[无]`/`[none]`）过滤，`paragraphStyle` 无任何过滤；expected 侧单元格没写 `data-id-paragraph-style` 时键缺省，actual 读回 `[基本段落]`，必然不等。

**改动**：
1. 新增 `isBuiltinIndesignStyle(value)`：匹配 `/^\[.+\]$/`（`[基本段落]`、`[Basic Paragraph]`、`[无段落样式]`、`[No Paragraph Style]`、`[无]`、`[None]` 等 InDesign 方括号内建名）。
2. `compareTable()` 改为先各自取 facts，再逐单元格对齐：expected 单元格**没有** `paragraphStyle` 且 actual 为内建样式 → 删掉 actual 的该键；expected 明确声明了样式而 actual 是内建 → 保留差异（这是"样式没应用上"的真错误）。`cellStyle` 同规则。
3. `header` 比对：行级 `header` 按 A1 后的真实表头行比；单元格级 `header` 在 expected 为 `<th>` 但所在行不是前导表头行时，不参与比对（InDesign 没有"零散表头单元格"这个概念，比了也只能失败）。

### A3. 单元格文本空白折叠

**现状**：JSX `HI.cleanTableCellText`（`hi_tables.jsxinc:62`）把 `[\t\r\n]+` 和 `\s+` 折叠成单空格写入 InDesign；expected 侧 `tableFacts()` 只做 `normalizeLineEndings`，`<td>` 首字符的换行原样保留，读回是空格。

**改动**：`tableFacts()` 的 `text` 改为 `collapseWhitespace(normalizeLineEndings(text)).trim()`，`collapseWhitespace` 与 JSX 同规则；actual 侧同样 trim。放进 `src/shared/text.js` 与 `normalizeLineEndings` 并列。

### A4. 失败文案

`build-indesign.js:542` `fidelityFailureMessage()` 对 `table.rows` 差异只说 "differs at field table.rows"。改为在 `compareTable()` 推错误时附 `dimensions: ['header' | 'paragraphStyle' | 'text' | 'span' | 'rowCount']`（取实际差异维度），message 追加 `(table differs in: header, paragraphStyle)`。

### 验收

- 单测：`test/html-to-indesign/` 新 fixture——`<thead><th>` 三列表、单元格无样式声明、`<td>` 内容带前导换行；`auditForwardFidelity` 期望 0 error。反向：expected 声明了 `data-id-paragraph-style="表格正文"` 而模拟 actual 为 `[基本段落]`，期望 1 error 且 `dimensions` 含 `paragraphStyle`。
- 真机 E2E：现有 real-deck 场景加一张带表头的表，首轮 `verified: true`；反向导出后 `<th>` 仍在。

## 4. B 组：导出预检与失败文案（FC-03，html-indesign 为主）

### B1. 构建前预检目标 INDD 是否已打开

**现状**：`host-jsx.js` `buildBuildJsx()` 直接 `app.documents.add()`；`buildExportJsx()` 在全部页面建完后 `doc.save(indd)`，此时才因"文件已打开"失败。

**改动**：`buildBuildJsx()` 增加参数 `targetInddPath`（由 `build-indesign.js` 按 `runDir + outputBaseName + '.indd'` 传入）。脚本在 `app.documents.add()` 之前遍历 `app.documents`：
- `fullName.fsName` 与目标路径大小写不敏感相等，且该文档带本工具 marker label（`html_indesign_e2e_marker`）且 `modified === false` → `close(SaveOptions.NO)`，记 `PREVIOUS_OUTPUT_CLOSED` warning，继续构建。
- 否则（人手改过、或不是本工具产物）→ 立即返回 `{ ok:false, code:'OUTPUT_TARGET_OPEN', message:'<路径> 正在 InDesign 中打开，无法覆盖', errors:[…] }`，不建文档。

`build-indesign.js` 的 `STAGE_ERROR_CODES` 之外单独映射：`causeCode === 'OUTPUT_TARGET_OPEN'` → `error.code = 'OUTPUT_TARGET_OPEN'`，`retryable: true`，hint 固定为"在 InDesign 中关闭该文档后重跑同一命令，或换一个 `outputBaseName`"。预检在真机上约 1 秒。

### B2. 脚本失败原因上浮到顶层

**现状**：CLI `src/utils/stringUtils.js:41-45` `formatScriptResult()` 对 `ok:false` 的脚本结果取 `parsed.message ?? parsed.error ?? parsed.result ?? result`，导出脚本三者皆无 → message 是整段 JSON；`code` 落回 `INDESIGN_SCRIPT_FAILED`。插件 `lint-feedback.js:125` `underlyingHostFailure()` 先取 `result.error`，于是把这段 JSON 当 message 原样输出。

**改动（两层，各自独立生效）**：
1. 插件侧：`buildBuildJsx` / `buildExportJsx` / snapshot / cleanup 四个模板在 `return JSON.stringify(result)` 之前统一补 `if (!result.ok && result.errors.length) { result.code = result.errors[0].code; result.message = result.errors[0].message; }`。这样 CLI 现有逻辑就能取到 `INDD_SAVE_FAILED: …`。
2. 插件侧防御：`underlyingHostFailure()` 若 `error.message` 以 `{` 开头且可解析出 `errors[0]`，改用 `errors[0]`，原文放 `details.hostResult`。
3. CLI 侧（可选，正常修复通道）：`formatScriptResult()` 在 message 回落到原文之前，先看 `parsed.errors?.[0]?.message`。这条改的是 mcp-indesign 通用脚本层，需同步 `src/utils` 单测。

### B3. 不再把上一版残留文件报成"已保存"

**现状**：`build-indesign.js:433-447` `landedDeliverables()` 只查文件存在。

**改动**：`state` 记录 `exportStartedAt`；只列 `mtime >= exportStartedAt` 的文件。`causeCode` 为 `INDD_SAVE_FAILED` / `OUTPUT_TARGET_OPEN` 时不加"INDD 已保存于"前缀。

### 验收

- 单测：`hostFailureResponse` 分别喂 `{error:{message:'<json>'}}`、`{data:{ok:false,errors:[…]}}`、`{data:{ok:false,code,message}}` 三种形状，断言 message 以 `INDD_SAVE_FAILED:` 开头且不含 `{"ok":false`。
- 单测：`landedDeliverables` 对旧 mtime 文件返回空。
- 真机 E2E：先用 `script.run` 打开上一轮成品，再构建——预期 `OUTPUT_TARGET_OPEN` 5 秒内返回；改为不修改地打开本工具产物再构建——预期自动关闭并成功。

## 5. C 组：网格门禁（FC-02，html-indesign + 文档）

### C1. 条目带数字

**现状**：`authoring-validator.js:552-559` `offGridEdges()` 的 `nearAnyLine` 判定后只 `map(([name]) => name)`。

**改动**：返回 `{ edge, valueMm, nearestLineMm, offsetMm }`；条目保留 `edges: [...]`（兼容现有消费者）并新增 `edgeOffsets: [...]` 与 `suggestedFix`（如 `move left edge −1.7mm to column line at 45.0mm`）。tool-catalog 的 lint/build description 同步说明。

### C2. 豁免与偏差计数

`validateAuthoringRules()` 在 `shouldCheckGrid()` 返回 false 的分支里区分"显式/继承 `data-id-grid-ignore`"与其他跳过原因，累计 `gridIgnoredCount`；同时累计 `gridOffCount`（被报出的 item 数）。两者进入 lint 结果顶层与 `html.authoring_lint` / `html.build_indesign` 的 `metrics`（键名 `grid_ignored_count`、`grid_off_count`）。CLI 侧 `router.py:46` `_extract_plugin_metrics()` 对 metrics 字典整体透传，无需改 CLI，但按 `AGENTS.md` 2.5 遥测白名单规则记入 review。

### C3. 决策项：检查粒度与是否阻断

**补充证据（2026-09-04 复看作者包）**：`skills/indesign-cli/assets/html-starter` 的页面是"一格一段文字"的扁平结构，每个 `grid-item` 本身就是文本叶子，所以能过检查。同事的 Agent 写的是真实版式——`div.grid-item.card-frame`（`padding: 24px`）里套 3-5 段文字、条形图由嵌套 `div` 拼成。`validateAuthoringRules()` 对**每个会成为 InDesign 对象的元素**逐一量边（`items.forEach → shouldCheckGrid`），卡片内的段落离格线正好一个内边距，必然报 `left/top` 偏差。这是设计本意，不是作者失误；Skill 只说"落网格线，故意偏离用豁免"，没说卡片内部也会被量，Agent 整包豁免是按文档做的。

现有机制已支持按条目 `strictBlocking: false` 不升级（`authoring-validator.js:123-131`，`SEMANTIC_TOKEN_MISSING` 已在用）。三个方案：

| 方案 | 做法 | 取舍 |
| --- | --- | --- |
| **推荐（修订，2026-09-04 与用户确认）** | 原则：**网格对齐的责任在母元素。** 承担网格放置的元素（带 `--grid-col`/`grid-item`，或页面根的直接子元素）是"块"，必须对齐；块内所有后代是块的内容，继承母元素的对齐状态，不单独检查；嵌套在块内的 `grid-item` 也视为内容。保持 strict 阻断 | 门禁保留真正价值——每个块要坐在列上；卡片内容不再误报；豁免标签退回"故意出血/跨格"的本意。现有 `shouldCheckGrid()` 已按 `ancestorCandidateIndexes` 跳过"有可绘制祖先"的元素，但无填充/边框的纯定位容器不算祖先候选，其子元素仍被量——改动就是把"祖先是否可绘制"换成"祖先是否承担网格放置"。需补单测："grid-item 内部后代不检查"、"无边框容器内的段落不检查"、"直接落在页面上的标题仍检查" |
| 降级 | `GRID_ALIGNMENT_OFF` 默认 `strictBlocking: false`；新增 `gridStrict: true` 恢复阻断 | 简单；但块级真偏差也只剩提醒 |
| 保守 | 保持阻断，只做 C1/C2 | 有数字后 Agent 也许会去对齐；但卡片内容的偏差本来就修不掉，空转继续 |

本设计按推荐（修订）方案写验收：C1 偏移量、C2 计数照做；`gridStrict` 参数不再需要。若推荐方案实测仍有大量块级误报，再退到降级方案。

### C4. Skill 文档

`skills/indesign-cli/references/html-authoring.md` 网格段落改写：先说明 `data-id-grid-ignore` 不参与保真门禁、可整页豁免；再说明报告里的 `edgeOffsets` 怎么用；`gridTolerance` 只用于确认版式正确后的取整误差。

### 验收

- 单测：`offGridEdges` 返回偏移量；`validateAuthoringRules` 对含 3 处 grid-ignore、2 处偏差的 snapshot 返回 `gridIgnoredCount: 3`、`gridOffCount: 2`；`strict:true` 默认不阻断，`gridStrict:true` 阻断。
- 契约：`tool schema html.authoring_lint` 含 `gridStrict`；`skills` 发布测试 grep `edgeOffsets`。
- 聚合：`scripts/feedback/aggregate.py` 新增 `plugin_metrics` 聚合（`grid_ignored_count` 均值、首轮 `fidelity_error_count > 0` 的构建占比），golden `fixtures/expected.json` 同步。

## 6. D 组：文案与文档快通道（FC-04）

| # | 文件 | 改动 |
| --- | --- | --- |
| 1 | `src/semantic-preset/audit-authoring.js:41-50` | `SEMANTIC_TOKEN_UNKNOWN` message 追加 `Known <kind>: a, b, c`（`collectKnownSemanticTokens` 现成；超过 20 个时列按编辑距离最近的 5 个 + 总数） |
| 2 | `src/authoring/source-package.js:219-231` | `AUTHOR_PAGE_SECTION_INVALID` message 改为 `Found N page sections in <file>; expected exactly one <section class="page"> (or section[data-page])` |
| 3 | `src/authoring/source-package.js:198` + `:280-291` | `AUTHOR_STYLE_BUCKET_MISSING` 条目加 `strictBlocking: false`，`formatAuditResult()` 按该标记决定是否提升（与 validator 同机制） |
| 4 | `forward-fidelity.js` `compareText()` | actual 去尾空白后是 expected 的真前缀且更短 → 条目加 `reason: 'overset'`、`hint: '文本框容不下末尾内容：加大框、缩字号或缩短文本'`；`fidelityFailureMessage()` 首条带 reason 时附上。错误码不变 |
| 5 | `skills/indesign-cli/references/failure-handling.md` | 末尾加"上报摩擦"一节：`indesign-cli feedback report --code <TOOL_GAP|DOC_UNCLEAR|ERROR_MESSAGE_USELESS|SCHEMA_CONFUSING> --note "<不含客户信息>"`，触发条件为 `runtime_error`、文档说不清、明显工具缺口 |
| 6 | `build-indesign.js` draft 分支（决策项，非快通道） | draft 模式 `outputBaseName` 自动追加 `-draft`；结果 `hint` 说明成品文件名带 draft 后缀。Skill `html-authoring.md` 同步一句 |

## 7. 明确不改

- 保真门禁的比对时机、`content.text` / `paragraphStyle` 类真实差异的判定。
- `OUTPUT_OUTSIDE_PROJECT` 围栏。
- `data-id-grid-ignore` 语义（继续不参与保真门禁）。

## 8. 发布顺序

1. html-indesign：A/B/C/D 各自独立提交，`npm test` 全绿后 bump `0.2.11`，`npm pack` 出 tgz。
2. mcp-indesign：若采纳 B2-3，改 `stringUtils.js` 并补单测；`aggregate.py` 加 metrics 聚合；bump runtime `0.5.12`，按 `runtime-build-inputs` 记忆的方式从 `.build/release-inputs/` 构建，`publish_agent_runtime.py --dry-run` 后发布 NAS。
3. Skill：`html-authoring.md`、`failure-handling.md` 改完单独走 `publish_gallery_skill.py`（Skill 不随 runtime 分发）。
4. 发布后复核：下期周报按 `cli_version=0.5.12` 切片，看 `FORWARD_TABLE_CHANGED` 是否归零、`INDESIGN_EXPORT_FAILED` 是否全部带可读 cause、`grid_ignored_count` 分布。

## 9. 待决策

1. C3：`GRID_ALIGNMENT_OFF` strict 下默认降为提示（推荐）还是保持阻断。
2. B1：本工具产物且未修改时自动关闭（推荐），还是一律要求人工关闭。
3. D-6：draft 产物是否加 `-draft` 文件名后缀。
4. B2-3：是否顺手改 CLI 通用脚本层 `formatScriptResult()`（影响所有 script.run 调用方，收益是其他插件也受益）。
