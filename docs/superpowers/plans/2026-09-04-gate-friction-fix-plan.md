# 门禁摩擦修复实施计划（FC-20260904-01..04）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> 🏁 **执行记录（2026-09-05）**：Task 0-17 全部完成。2026-09-05 13:15 经作者确认后发布：NAS runtime 0.5.12（`releases/0.5.12`，SHA-256 `91d93c8e…`，`verify.sha256_match: true`）、主页画廊 Skill v2.6（`--scope assistant`，`published_rows: 1`）、GitHub Release [v0.5.12](https://github.com/zhanglongxiao111/indesign-cli/releases/tag/v0.5.12) / [v0.2.11](https://github.com/zhanglongxiao111/html-indesign/releases/tag/v0.2.11)，两仓库分支已合回 `master` / `main`。PyPI 自 0.5.10 之后就没再上传（0.5.11 也没发），本轮沿用不发。发布前用解压出的 ZIP 直接跑 `cli\indesign-cli.exe` 验收：内置插件 0.2.11、`html.authoring_lint` schema 含母元素规则与 `edgeOffsets`。html-indesign 分支 `fix/gate-friction-0904` 31 个提交（e3d6e18…7b3dd37），无干扰全量 1307 绿（与 runtime 构建并发时 1 个与本次无关的 SVG 用例抖动过一次，单跑通过）；mcp-indesign 同名分支 5 个提交（5093609…3b60fe9），pytest 291 passed + 2 skipped。执行方式：每任务一个子代理（机械任务 Sonnet、其余 Opus），每任务规格审查 + 质量审查各一轮，审查提出的 Important 项均以跟进提交落地。**与计划的实质偏差**：
> - Task 6 的 mtime 过滤被审查否决（工位与 NAS 时钟可差数分钟），改为开工前给三个产物拍 `{mtimeMs,size}` 快照、收尾时自比（5784dfc）；成功路径也用同一判定，陈旧产物报 `BUILD_ARTIFACTS_MISSING` 并列 `details.stale`。
> - Task 5 的 `PREVIOUS_OUTPUT_CLOSED` 原本无人读取；补了宿主脚本警告全阶段收集，成功结果 `data.warnings`、失败结果 `error.details.hostWarnings` 都带（5b9b1a9、2389fa0、a32cbb7、c5056ef）。
> - Task 8 落地后发现"母元素负责对齐"只做了一半：无边框包裹块不是捕获对象，没人量它。补了捕获层给承担放置的祖先节点记 `rectPx/boundsMm`、校验器量块本身（`block: true`、`blockOf`）、八个网格计数区分"全部对齐"与"什么都没量"（2a4cff3、11d33c2、b7f7e0d、4f2aa7a）。真实 fixture：15 个块全部被量且在线上，0+75+19+0=94 账本闭合。
> - Task 1 的 `table.headerRowCount = n` 被真机 E2E 证明是**追加**空表头行而非原地转换，整表错一行；改为逐行 `rowType = RowTypes.HEADER_ROW`（9b8073e）。真机结果：8 页 2 表零差异。
> - Task 13 为满足既有契约测试做了两处附带改动：新页加页码母版覆盖；`data-table` 类名在**发行预设**里映射为 `数据表格`（否则落到英文 `default-table`）。随后把英文兜底名统一改为 `默认表格`（7b3dd37）。
> - Task 3 补了 hint 取"第一条带 hint 的差异"并带定位（3b9aaa8、ebcd5a9）；Task 4 补了 `finish()` 形状守卫与 vm 行为测试（85cebf4）。
> **未做/待办**：D-6 draft 文件名后缀、B2-3 CLI 通用层 `formatScriptResult`（设计 §9）；网格线区分列起/列止（审查发现整条 gutter 宽度的偏差会被放过）；`table-source-html.js` 反向路径的表头口径同步；`hi_reverse_tables.jsxinc` 的表头样式名启发式在 headerRowCount 已落地后是否保留；rowspan 跨表头边界目前跳过转换并告警，无 fixture 覆盖；`svg-vector-geometry.test.js` 偶发用例。

**Goal:** 落地 `docs/superpowers/specs/2026-09-04-gate-friction-fix-design.md`：表格保真门禁不再误判、目标 INDD 已打开时 1 秒内失败且文案可读、网格门禁按"母元素负责对齐"重定义并给出偏移量、五处文案/文档快通道。

**Architecture:** 改动横跨两个仓库。`D:\AI\html-indesign`（任务 1-15：JSX 执行库、保真比对、宿主模板、浏览器捕获层、作者校验器、lint 反馈、文档）与 `D:\AI\mcp-indesign`（任务 14 后半、16、17：Skill 文档、遥测聚合、runtime 发布）。捕获层代码运行在 Playwright 页面上下文里，通过 `renderSnapshot()` 端到端测试；其余模块都是纯 Node 单测。

**Tech Stack:** Node 22 + `node --test`（html-indesign，基线 1245 绿，全量 `npm test` 会拉起 Edge）；Python + pytest（mcp-indesign，基线 285 passed + 2 skipped）；ExtendScript（`_indesign_scripts/lib/*.jsxinc`，只能静态测试 + 真机 E2E）。

**已定决策（不要再讨论）：**
- 网格：母元素负责对齐，块内后代不检查（C3 推荐修订方案）；`GRID_ALIGNMENT_OFF` 在 strict 下继续阻断。
- 导出预检：目标 INDD 已打开且是本工具产物、未修改 → 自动关闭继续；否则 `OUTPUT_TARGET_OPEN` 立即失败。
- **不做**：draft 产物 `-draft` 后缀（D-6）、CLI 通用层 `formatScriptResult()` 改动（B2-3）。两者留在设计文档 §9 待决策。

**执行约定：**
- 两个仓库各建分支 `fix/gate-friction-0904`，每个任务独立提交，commit message 末尾带 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。
- html-indesign 单任务内只跑受影响的测试文件（`node --test <file>`），任务 15 再跑全量 `npm test`。
- 所有编辑用 Edit 工具做精确替换；下文"替换"块给出的 old/new 必须逐字匹配。
- 不得在文档或测试里写入客户项目名、文档正文；测试 fixture 用虚构内容。

---

## 涉及文件总览

| 仓库 | 文件 | 动作 | 任务 |
| --- | --- | --- | --- |
| html | `_indesign_scripts/lib/hi_tables.jsxinc` | 新增 `HI.leadingHeaderRowCount` / `HI.applyTableHeaderRows` | 1 |
| html | `_indesign_scripts/lib/hi_items.jsxinc:262` | `createTableFrame` 调用表头行设置 | 1 |
| html | `test/indesign-executor/executor-script-static.test.js` | API 清单 + 调用点断言 | 1 |
| html | `src/semantic-model/audit/forward-fidelity.js` | `tableFacts` 口径、`compareTable` 对齐与维度、`compareText` overset | 2, 3 |
| html | `test/semantic-model/forward-fidelity-audit.test.js` | 表格 3 例 + overset 1 例 | 2, 3 |
| html | `src/indesign-cli-plugin/tools/build-indesign.js` | 失败文案、`targetInddPath`、`runStartedAt`、mtime 过滤、`OUTPUT_TARGET_OPEN` 映射、metrics | 3, 5, 6, 9 |
| html | `src/indesign-cli-plugin/host-jsx.js` | `finish(result)` 上浮、预检块 | 4, 5 |
| html | `src/indesign-cli-plugin/lint-feedback.js` | `underlyingHostFailure` 兜底、修复示例句、豁免计数句 | 4, 10 |
| html | `test/indesign-cli-plugin/host-jsx.test.js` | **新建** 模板静态断言 | 4, 5 |
| html | `test/indesign-cli-plugin/authoring-lint-feedback.test.js` | 兜底/预检/mtime/修复示例测试 | 4, 5, 6, 10 |
| html | `src/adapters/html/reader/browser-element-capture.js` | `isGridPlaced`、祖先节点带 `gridPlaced` | 7 |
| html | `src/adapters/html/reader/browser-snapshot-capture.js:156` | item 带 `gridPlaced` | 7 |
| html | `src/adapters/html/reader/browser-snapshot.js:148` | 透传 `gridPlaced` | 7 |
| html | `test/html-to-indesign/browser-snapshot.test.js` | 捕获层测试 | 7 |
| html | `src/adapters/html/validators/authoring-validator.js` | 母元素规则、偏移量、计数、文案 | 8 |
| html | `test/html-to-indesign/authoring-validator.test.js` | 4 例 | 8 |
| html | `src/authoring/lint.js` | 计数透传 | 9 |
| html | `src/indesign-cli-plugin/tools/authoring-lint.js` | metrics | 9 |
| html | `test/authoring/lint-normalized-count.test.js` | 计数透传测试 | 9 |
| html | `src/indesign-cli-plugin/tool-catalog.js` | 示例与说明文案 | 10 |
| html | `src/semantic-preset/audit-authoring.js` | 已登记 token 提示 | 11 |
| html | `test/semantic-preset/audit-authoring.test.js` | **新建** | 11 |
| html | `src/authoring/source-package.js` | page section 细节、`strictBlocking` | 12 |
| html | `test/authoring/source-package-audit.test.js` | **新建** | 12 |
| html | `test/fixtures/e2e/architecture-report/pages/07-plain-table.html` | **新建** 无样式表格页 | 13 |
| html | `test/fixtures/e2e/architecture-report/deck.config.json` | 注册新页 | 13 |
| html | `docs/规范/AGENT_HTML_AUTHORING_GUIDE.md` | 网格段落改写 | 14 |
| mcp | `skills/indesign-cli/references/html-authoring.md` | 网格段落改写 | 14 |
| mcp | `skills/indesign-cli/references/failure-handling.md` | INDD 已打开 + feedback 入口 | 14 |
| mcp | `agent-harness/cli_anything/indesign/tests/test_health_runtime.py` | 文档断言 | 14 |
| html | `package.json` / `src/indesign-cli-plugin/manifest.json` / `test/indesign-cli-plugin/npm-package.test.js` | 0.2.11 | 15 |
| mcp | `scripts/feedback/aggregate.py` / `test_aggregate.py` / `fixtures/` | `plugin_metrics` 聚合 | 16 |
| mcp | `agent-harness/cli_anything/indesign/__init__.py` / `setup.py` / `pyproject.toml` / `package.json` / `tests/test_package_metadata.py` | 0.5.12 | 17 |

---

## 批 0 · 准备

### Task 0: 分支与基线

**Files:** 无代码改动。

- [ ] **Step 1: html-indesign 建分支并确认基线**

```bash
cd /d/AI/html-indesign && git status --short && git checkout -b fix/gate-friction-0904
```

预期：`git status --short` 无输出（工作树干净），分支创建成功。若工作树不干净，停下来报告，不要 stash。

- [ ] **Step 2: 跑本计划会碰到的测试文件，记录基线**

```bash
cd /d/AI/html-indesign && node --test test/indesign-executor/executor-script-static.test.js test/semantic-model/forward-fidelity-audit.test.js test/indesign-cli-plugin/authoring-lint-feedback.test.js test/html-to-indesign/authoring-validator.test.js test/authoring/lint-normalized-count.test.js test/indesign-cli-plugin/tool-catalog.test.js 2>&1 | tail -8
```

预期：全部 pass，末尾 `# fail 0`。记下 `# pass N` 的 N。

- [ ] **Step 3: mcp-indesign 建分支（当前 master 上有 5 个未跟踪的 docs 文件，属于本轮周报，一起带到分支）**

```bash
cd /d/AI/mcp-indesign && git checkout -b fix/gate-friction-0904 && git add docs/AI协作/反馈循环/周报_2026-09-04.md "docs/AI协作/反馈循环/摩擦簇_FC-20260904-01.md" "docs/AI协作/反馈循环/摩擦簇_FC-20260904-02.md" "docs/AI协作/反馈循环/摩擦簇_FC-20260904-03.md" "docs/AI协作/反馈循环/摩擦簇_FC-20260904-04.md" docs/superpowers/specs/2026-09-04-gate-friction-fix-design.md docs/superpowers/plans/2026-09-04-gate-friction-fix-plan.md && git commit -m "docs: 0904 遥测周报、摩擦簇与门禁修复设计/计划

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

预期：一次提交，7 个文件。

- [ ] **Step 4: mcp-indesign 基线**

```bash
cd /d/AI/mcp-indesign && python -m pytest agent-harness/cli_anything/indesign/tests scripts/feedback -q 2>&1 | tail -3
```

预期：`285 passed, 2 skipped`（若数字不同，记下实际值作为后续对照，不要去追）。

---

## 批 1 · 表格保真门禁（FC-01）

### Task 1: 构建脚本设置 InDesign 表头行

**Files:**
- Modify: `D:\AI\html-indesign\_indesign_scripts\lib\hi_tables.jsxinc`（在 `HI.cleanTableCellText` 之后插入）
- Modify: `D:\AI\html-indesign\_indesign_scripts\lib\hi_items.jsxinc:262`
- Test: `D:\AI\html-indesign\test\indesign-executor\executor-script-static.test.js`

背景：`hi_reverse_tables.jsxinc:60` 读回时只把 `rowIndex < table.headerRowCount` 的单元格标为表头，而构建侧从不设置 `headerRowCount`，所以 HTML `<th>` 行读回永远是 `header:false`，任何带表头的表都过不了保真门禁。只处理**前导**表头行：InDesign 没有"表中间的表头行"，任务 2 的比对口径与此对齐。

- [ ] **Step 1: 写失败测试**

在 `executor-script-static.test.js` 的 `expectations` 对象里，把

```js
    'hi_tables.jsxinc': ['HI.tableGridFromRows', 'HI.applyTableSpans', 'HI.applyTableCells'],
```

替换为

```js
    'hi_tables.jsxinc': ['HI.tableGridFromRows', 'HI.applyTableSpans', 'HI.applyTableCells', 'HI.leadingHeaderRowCount', 'HI.applyTableHeaderRows'],
```

并在该 `test('executor lib files expose expected HI APIs and stay focused', ...)` 之后追加：

```js
test('table frames set InDesign header rows from leading header rows before spans and cells', () => {
  const items = fs.readFileSync(path.join(libDir, 'hi_items.jsxinc'), 'utf8');
  const tables = fs.readFileSync(path.join(libDir, 'hi_tables.jsxinc'), 'utf8');

  const headerCall = items.indexOf('HI.applyTableHeaderRows(table, item.rows || [], report);');
  const spansCall = items.indexOf('HI.applyTableSpans(table, grid, report);');
  assert.ok(headerCall > 0, 'createTableFrame must apply header rows');
  assert.ok(headerCall < spansCall, 'header rows must be set before spans are merged');

  assert.match(tables, /table\.headerRowCount = count;/);
  assert.match(tables, /TABLE_HEADER_APPLY_FAILED/);
  // Only leading rows count: a header row in the middle of a table has no InDesign equivalent.
  assert.match(tables, /if \(!\(row\.header === true \|\| allHeader\)\) break;/);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /d/AI/html-indesign && node --test test/indesign-executor/executor-script-static.test.js 2>&1 | tail -6
```

预期：2 个 fail（API 清单缺 `HI.leadingHeaderRowCount`；新测试 `headerCall > 0` 失败）。

- [ ] **Step 3: 实现 hi_tables.jsxinc**

在 `HI.cleanTableCellText = function (value) {...};`（约 62-64 行）之后插入：

```js
// Leading rows whose author flagged them as header rows, or whose every cell
// came from <th>, become InDesign header rows. Only leading rows count:
// InDesign has no notion of a header row in the middle of a table, and the
// forward fidelity audit normalizes header facts with the same rule so the
// two sides agree by construction.
HI.leadingHeaderRowCount = function (rows) {
    var count = 0;
    for (var r = 0; r < (rows || []).length; r++) {
        var row = rows[r] || {};
        var cells = row.cells || [];
        var allHeader = cells.length > 0;
        for (var c = 0; c < cells.length; c++) {
            if (!cells[c] || !cells[c].header) { allHeader = false; break; }
        }
        if (!(row.header === true || allHeader)) break;
        count += 1;
    }
    return count;
};

HI.applyTableHeaderRows = function (table, rows, report) {
    var count = HI.leadingHeaderRowCount(rows);
    if (!count) return 0;
    try {
        table.headerRowCount = count;
    } catch (error) {
        HI.addMessage(report, "warning", "TABLE_HEADER_APPLY_FAILED", String(error), { headerRowCount: count });
        return 0;
    }
    return count;
};
```

- [ ] **Step 4: 实现 hi_items.jsxinc 调用点**

把 `createTableFrame` 里的

```js
    if (table) {
        HI.applyTableStyle(doc, table, item.tableStyle, report);
        HI.fitTableToFrame(table, item, context, report);
        HI.applyTableSpans(table, grid, report);
```

替换为

```js
    if (table) {
        HI.applyTableStyle(doc, table, item.tableStyle, report);
        HI.applyTableHeaderRows(table, item.rows || [], report);
        HI.fitTableToFrame(table, item, context, report);
        HI.applyTableSpans(table, grid, report);
```

- [ ] **Step 5: 跑测试确认通过**

```bash
cd /d/AI/html-indesign && node --test test/indesign-executor/executor-script-static.test.js 2>&1 | tail -4
```

预期：`# fail 0`。静态测试还断言每个 lib ≤ 340 行；`hi_tables.jsxinc` 现在 232 行，加 30 行仍在限内。

- [ ] **Step 6: 提交**

```bash
cd /d/AI/html-indesign && git add _indesign_scripts/lib/hi_tables.jsxinc _indesign_scripts/lib/hi_items.jsxinc test/indesign-executor/executor-script-static.test.js && git commit -m "fix(executor): 前导 th 行设置 InDesign headerRowCount

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: 表格保真比对口径（表头/内建样式/空白/差异维度）

**Files:**
- Modify: `D:\AI\html-indesign\src\semantic-model\audit\forward-fidelity.js:4`（import）、`:496-502`（`compareTable`）、`:884-913`（`tableFacts`、`isBuiltinNoneStyle`）
- Test: `D:\AI\html-indesign\test\semantic-model\forward-fidelity-audit.test.js`

背景：归档的失败报告显示单元格文本全部一致，只差三处：读回 `paragraphStyle` 是 `[基本段落]` 而 expected 缺省；`<th>` 行 `header` 读回 false；`<td>` 内容首字符换行 vs 读回空格。修法：expected 没声明的样式不比；方括号内建样式名视为未设置；单元格文本折叠空白；表头按"前导表头行数"在两侧统一归一；差异条目附 `dimensions`。

- [ ] **Step 1: 写失败测试**

在 `forward-fidelity-audit.test.js` 里紧接现有 `test('forward fidelity audit compares native table cells instead of InDesign table control text', ...)` 之后追加三个测试：

```js
function tableFixture(expectedRows, actualRows) {
  const fixture = matchingFixture();
  fixture.instructions.pages[0].items = [{
    id: 'table-1',
    role: 'table',
    type: 'TABLE',
    bounds: { x: 10, y: 40, width: 80, height: 30 },
    layer: '表格',
    labels: [itemLabel('table-1', 'table', { order: 2 })],
    rows: expectedRows,
  }];
  const actualTable = {
    id: '203',
    type: 'TextFrame',
    bounds: { x: 10, y: 40, width: 80, height: 30 },
    layerName: '表格',
    text: '\u0016',
    textRuns: [{ text: '\u0016', characterStyle: null }],
    table: { rows: actualRows },
    placedAsset: null,
    labels: [itemLabel('table-1', 'table', { order: 2 })],
  };
  fixture.actualSnapshot.pages[0].items = [actualTable];
  fixture.actualModel.pages[0].items = [{
    id: 'table-1',
    role: 'table',
    bounds: actualTable.bounds,
    content: { text: '', runs: [] },
    table: actualTable.table,
  }];
  return fixture;
}

function cell(index, text, extra = {}) {
  return { index, text, header: false, rowSpan: 1, colSpan: 1, ...extra };
}

test('forward fidelity audit accepts th header rows, built-in default cell styles and collapsed cell whitespace', () => {
  const fixture = tableFixture([
    { index: 0, header: true, cells: [cell(0, 'Area', { header: true }), cell(1, 'Ratio', { header: true })] },
    { index: 1, header: false, cells: [cell(0, '\nRink'), cell(1, '32%')] },
  ], [
    { index: 0, cells: [
      cell(0, 'Area', { header: true, paragraphStyle: '[基本段落]', cellStyle: '[无]' }),
      cell(1, 'Ratio', { header: true, paragraphStyle: '[基本段落]', cellStyle: '[无]' }),
    ] },
    { index: 1, cells: [
      cell(0, ' Rink', { paragraphStyle: '[基本段落]', cellStyle: '[无]' }),
      cell(1, '32%', { paragraphStyle: '[基本段落]', cellStyle: '[无]' }),
    ] },
  ]);

  const report = auditForwardFidelity(fixture);

  assert.equal(report.errors.filter((issue) => issue.code === 'FORWARD_TABLE_CHANGED').length, 0, JSON.stringify(report.errors));
  assert.equal(report.ok, true);
});

test('forward fidelity audit still fails when a declared cell paragraph style did not apply, and names the dimension', () => {
  const fixture = tableFixture([
    { index: 0, header: false, cells: [cell(0, 'Rink', { paragraphStyle: 'table-body' })] },
  ], [
    { index: 0, cells: [cell(0, 'Rink', { paragraphStyle: '[基本段落]' })] },
  ]);

  const report = auditForwardFidelity(fixture);

  const issue = report.errors.find((entry) => entry.code === 'FORWARD_TABLE_CHANGED');
  assert.ok(issue, 'declared style that did not apply must fail');
  assert.deepEqual(issue.dimensions, ['paragraphStyle']);
});

test('forward fidelity audit ignores th cells outside the leading header rows', () => {
  const fixture = tableFixture([
    { index: 0, header: false, cells: [cell(0, 'Zone', { header: true }), cell(1, '7,600')] },
    { index: 1, header: false, cells: [cell(0, 'Lobby', { header: true }), cell(1, '900')] },
  ], [
    { index: 0, cells: [cell(0, 'Zone'), cell(1, '7,600')] },
    { index: 1, cells: [cell(0, 'Lobby'), cell(1, '900')] },
  ]);

  const report = auditForwardFidelity(fixture);

  assert.equal(report.errors.some((issue) => issue.code === 'FORWARD_TABLE_CHANGED'), false, JSON.stringify(report.errors));
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /d/AI/html-indesign && node --test test/semantic-model/forward-fidelity-audit.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```

预期：第 1、3 个新测试 fail（`FORWARD_TABLE_CHANGED` 被报出），第 2 个 fail 在 `dimensions` 断言。

- [ ] **Step 3: 改 import**

把 `forward-fidelity.js:4`

```js
const { normalizeLineEndings } = require('../../shared/text');
```

替换为

```js
const { normalizeLineEndings, collapseWhitespace } = require('../../shared/text');
```

- [ ] **Step 4: 替换 compareTable**

把

```js
function compareTable(expectedRows, actualTable, identity, context) {
  const expected = tableFacts(expectedRows);
  const actual = tableFacts(actualTable && actualTable.rows);
  compareField(context, 'items[].table.rows', expected, actual, {
    code: 'FORWARD_TABLE_CHANGED', ...identity, field: 'table.rows', tolerance: context.opts.numberTolerance,
  });
}
```

替换为

```js
function compareTable(expectedRows, actualTable, identity, context) {
  const expected = tableFacts(expectedRows);
  const actual = alignActualTableFacts(expected, tableFacts(actualTable && actualTable.rows));
  const dimensions = tableDifferenceDimensions(expected, actual);
  compareField(context, 'items[].table.rows', expected, actual, {
    code: 'FORWARD_TABLE_CHANGED', ...identity, field: 'table.rows', tolerance: context.opts.numberTolerance,
    ...(dimensions.length ? { dimensions } : {}),
  });
}

// The author declares styles per cell; a cell without a declaration accepts
// whatever InDesign assigned (normally the built-in default), so the actual
// style is dropped wherever the expected side declared none. A declared style
// that did not apply still shows up as a difference.
function alignActualTableFacts(expected, actual) {
  return actual.map((row, rowIndex) => {
    const expectedRow = expected[rowIndex];
    return {
      ...row,
      cells: row.cells.map((cellFact, cellIndex) => {
        const expectedCell = expectedRow && expectedRow.cells[cellIndex];
        if (!expectedCell) return cellFact;
        const aligned = { ...cellFact };
        if (!expectedCell.paragraphStyle) delete aligned.paragraphStyle;
        if (!expectedCell.cellStyle) delete aligned.cellStyle;
        return aligned;
      }),
    };
  });
}

const TABLE_CELL_DIMENSIONS = ['text', 'header', 'paragraphStyle', 'cellStyle', 'rowSpan', 'colSpan'];

function tableDifferenceDimensions(expected, actual) {
  const dimensions = new Set();
  if (expected.length !== actual.length) dimensions.add('rowCount');
  expected.forEach((row, rowIndex) => {
    const actualRow = actual[rowIndex];
    if (!actualRow) return;
    if (row.cells.length !== actualRow.cells.length) dimensions.add('cellCount');
    row.cells.forEach((cellFact, cellIndex) => {
      const actualCell = actualRow.cells[cellIndex];
      if (!actualCell) return;
      for (const key of TABLE_CELL_DIMENSIONS) {
        const left = cellFact[key] === undefined ? null : cellFact[key];
        const right = actualCell[key] === undefined ? null : actualCell[key];
        if (left !== right) dimensions.add(key === 'rowSpan' || key === 'colSpan' ? 'span' : key);
      }
    });
  });
  return [...dimensions];
}
```

- [ ] **Step 5: 替换 tableFacts 与 isBuiltinNoneStyle**

把

```js
function tableFacts(rows) {
  return array(rows).map((row, rowIndex) => {
    const cells = array(row && row.cells).map((cell, cellIndex) => ({
      index: cell && cell.index != null ? cell.index : cellIndex,
      text: normalizeLineEndings(cell && cell.text || ''),
      header: Boolean(cell && cell.header),
      rowSpan: Number(cell && cell.rowSpan || 1),
      colSpan: Number(cell && cell.colSpan || 1),
      ...(cell && cell.paragraphStyle ? { paragraphStyle: cell.paragraphStyle } : {}),
      ...(cell && cell.cellStyle && !isBuiltinNoneStyle(cell.cellStyle) ? { cellStyle: cell.cellStyle } : {}),
    }));
    return {
      index: row && row.index != null ? row.index : rowIndex,
      header: Boolean(row && row.header) || (cells.length > 0 && cells.every((cell) => cell.header)),
      cells,
    };
  });
}
```

替换为

```js
function tableFacts(rows) {
  const facts = array(rows).map((row, rowIndex) => {
    const cells = array(row && row.cells).map((cell, cellIndex) => ({
      index: cell && cell.index != null ? cell.index : cellIndex,
      // The executor writes cell text through HI.cleanTableCellText (whitespace
      // collapsed to single spaces); mirror that before comparing.
      text: collapseWhitespace(normalizeLineEndings(cell && cell.text || '')),
      header: Boolean(cell && cell.header),
      rowSpan: Number(cell && cell.rowSpan || 1),
      colSpan: Number(cell && cell.colSpan || 1),
      ...(cell && cell.paragraphStyle && !isBuiltinIndesignStyle(cell.paragraphStyle) ? { paragraphStyle: cell.paragraphStyle } : {}),
      ...(cell && cell.cellStyle && !isBuiltinIndesignStyle(cell.cellStyle) ? { cellStyle: cell.cellStyle } : {}),
    }));
    return {
      index: row && row.index != null ? row.index : rowIndex,
      header: Boolean(row && row.header) || (cells.length > 0 && cells.every((cellFact) => cellFact.header)),
      cells,
    };
  });
  // InDesign only knows leading header rows (table.headerRowCount, set by
  // HI.applyTableHeaderRows). A <th> outside that band cannot survive the
  // round trip, so header facts on both sides are normalized to
  // "row index < leading header count".
  let leading = 0;
  while (leading < facts.length && facts[leading].header) leading += 1;
  return facts.map((row, rowIndex) => ({
    ...row,
    header: rowIndex < leading,
    cells: row.cells.map((cellFact) => ({ ...cellFact, header: rowIndex < leading })),
  }));
}
```

并把

```js
function isBuiltinNoneStyle(value) {
  return /^\[(?:无|none)\]$/i.test(String(value || ''));
}
```

替换为

```js
// InDesign built-in style names are bracketed: [基本段落] / [Basic Paragraph],
// [无段落样式] / [No Paragraph Style], [无] / [None]. Reading one back means
// "nothing was applied", never an authored choice.
function isBuiltinIndesignStyle(value) {
  return /^\[.+\]$/.test(String(value || '').trim());
}
```

然后确认没有其他调用点：

```bash
cd /d/AI/html-indesign && grep -n "isBuiltinNoneStyle" src/semantic-model/audit/forward-fidelity.js
```

预期：无输出。若有，把调用改为 `isBuiltinIndesignStyle`。

- [ ] **Step 6: 跑测试确认通过**

```bash
cd /d/AI/html-indesign && node --test test/semantic-model/forward-fidelity-audit.test.js 2>&1 | grep -E "^# (pass|fail)"
```

预期：`# fail 0`。现有 `compares native table cells` 测试仍应通过（其 fixture 两侧都是 header:true，前导归一后一致）。

- [ ] **Step 7: 提交**

```bash
cd /d/AI/html-indesign && git add src/semantic-model/audit/forward-fidelity.js test/semantic-model/forward-fidelity-audit.test.js && git commit -m "fix(fidelity): 表格比对按前导表头行、未声明样式与折叠空白归一，差异附 dimensions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: 文本溢出原因标记与保真失败文案

**Files:**
- Modify: `D:\AI\html-indesign\src\semantic-model\audit\forward-fidelity.js:477-495`（`compareText`）
- Modify: `D:\AI\html-indesign\src\indesign-cli-plugin\tools\build-indesign.js:542-550`（`fidelityFailureMessage`）、`:606-609`（exports）
- Test: `D:\AI\html-indesign\test\semantic-model\forward-fidelity-audit.test.js`、`D:\AI\html-indesign\test\indesign-cli-plugin\authoring-lint-feedback.test.js`

背景：读回文本是源文本的严格前缀，是 InDesign 文本框溢出（overset）的特征。现在只报 `content.text differs`，Agent 要自己猜是内容错还是框太小。错误码不变，只加 `reason`/`hint`，并让首条消息带上原因；表格差异同理带 `dimensions`。

- [ ] **Step 1: 写失败测试（fidelity）**

在 `forward-fidelity-audit.test.js` 末尾（helper 函数定义之前的最后一个 `test(` 之后）追加：

```js
test('forward fidelity audit flags a read-back prefix as overset with a hint', () => {
  const fixture = matchingFixture();
  fixture.instructions.pages[0].items[0].text = '项目策划/Project planning';
  fixture.actualSnapshot.pages[0].items[0].text = '项目策划/Project ';
  fixture.actualModel.pages[0].items[0].content.text = '项目策划/Project ';

  const report = auditForwardFidelity(fixture);

  const issue = report.errors.find((entry) => entry.code === 'FORWARD_TEXT_CHANGED' && entry.field === 'content.text');
  assert.ok(issue, 'truncated text must still fail');
  assert.equal(issue.reason, 'overset');
  assert.match(issue.hint, /文本框/);
});

test('forward fidelity audit does not call a genuinely different text overset', () => {
  const fixture = matchingFixture();
  fixture.instructions.pages[0].items[0].text = 'Alpha';
  fixture.actualSnapshot.pages[0].items[0].text = 'Beta';
  fixture.actualModel.pages[0].items[0].content.text = 'Beta';

  const report = auditForwardFidelity(fixture);

  const issue = report.errors.find((entry) => entry.code === 'FORWARD_TEXT_CHANGED' && entry.field === 'content.text');
  assert.ok(issue);
  assert.equal(issue.reason, undefined);
});
```

先确认 `matchingFixture()` 里第一个 item 是文本且 `actualModel.pages[0].items[0].content.text` 存在：

```bash
cd /d/AI/html-indesign && sed -n '426,470p' test/semantic-model/forward-fidelity-audit.test.js | grep -n "text\|content"
```

预期：能看到 instructions item `text: ...`、actualSnapshot item `text: ...` 与 actualModel `content: { text: ... }`。若 actualModel 用别的字段名，测试里对应改成同名字段。

- [ ] **Step 2: 写失败测试（message）**

在 `authoring-lint-feedback.test.js` 末尾追加：

```js
test('fidelityFailureMessage names overset and table dimensions so the agent knows what to change', () => {
  const { fidelityFailureMessage } = require('../../src/indesign-cli-plugin/tools/build-indesign');
  const overset = fidelityFailureMessage({ pageId: 'page-2', itemId: 'p2-el3', field: 'content.text', reason: 'overset' }, 3);
  assert.match(overset, /at page page-2, item p2-el3, field content\.text; 3 issue\(s\) found \(text overset: the InDesign frame is too small for its text\)\./);

  const table = fidelityFailureMessage({ pageId: 'page-7', itemId: 'p7-el4', field: 'table.rows', dimensions: ['header', 'paragraphStyle'] }, 8);
  assert.match(table, /8 issue\(s\) found \(table differs in: header, paragraphStyle\)\./);

  const plain = fidelityFailureMessage({ pageId: 'page-1', itemId: 'p1-el2', field: 'bounds' }, 1);
  assert.equal(plain, 'Built InDesign content differs from the HTML source at page page-1, item p1-el2, field bounds; 1 issue(s) found.');
});
```

- [ ] **Step 3: 跑测试确认失败**

```bash
cd /d/AI/html-indesign && node --test test/semantic-model/forward-fidelity-audit.test.js test/indesign-cli-plugin/authoring-lint-feedback.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```

预期：overset 测试 fail（`reason` 为 undefined）；message 测试 fail（`fidelityFailureMessage` 未导出）。

- [ ] **Step 4: 实现 compareText**

把 `forward-fidelity.js` 的

```js
function compareText(expected, actual, actualModelItem, identity, context) {
  const expectedText = normalizeLineEndings(expected.text || '');
  const actualText = normalizeLineEndings(
    actualModelItem && actualModelItem.content && actualModelItem.content.text != null
      ? actualModelItem.content.text
      : actual.text || '',
  );
  compareField(context, 'items[].content.text', expectedText, actualText, {
    code: 'FORWARD_TEXT_CHANGED', ...identity, field: 'content.text',
  });
```

替换为

```js
function compareText(expected, actual, actualModelItem, identity, context) {
  const expectedText = normalizeLineEndings(expected.text || '');
  const actualText = normalizeLineEndings(
    actualModelItem && actualModelItem.content && actualModelItem.content.text != null
      ? actualModelItem.content.text
      : actual.text || '',
  );
  const overset = isOversetTruncation(expectedText, actualText);
  compareField(context, 'items[].content.text', expectedText, actualText, {
    code: 'FORWARD_TEXT_CHANGED', ...identity, field: 'content.text',
    ...(overset ? {
      reason: 'overset',
      hint: 'InDesign 文本框容不下末尾内容（读回文本是源文本的前缀）：加大文本框、缩小字号或缩短文本，然后重新构建。',
    } : {}),
  });
```

并在 `compareText` 函数之后新增：

```js
// A read-back text that is a strict prefix of the source is the signature of
// an overset frame: InDesign composed what fit and dropped the rest.
function isOversetTruncation(expectedText, actualText) {
  const expectedTrim = String(expectedText || '').replace(/\s+$/, '');
  const actualTrim = String(actualText || '').replace(/\s+$/, '');
  if (!expectedTrim || actualTrim.length >= expectedTrim.length) return false;
  return expectedTrim.startsWith(actualTrim);
}
```

- [ ] **Step 5: 实现 fidelityFailureMessage 并导出**

把 `build-indesign.js` 的

```js
function fidelityFailureMessage(first, count) {
  const location = [
    first.pageId ? `page ${first.pageId}` : null,
    first.parentPageId ? `parent page ${first.parentPageId}` : null,
    first.itemId ? `item ${first.itemId}` : null,
    first.field ? `field ${first.field}` : null,
  ].filter(Boolean).join(', ');
  return `Built InDesign content differs from the HTML source${location ? ` at ${location}` : ''}; ${count} issue(s) found.`;
}
```

替换为

```js
function fidelityFailureMessage(first, count) {
  const location = [
    first.pageId ? `page ${first.pageId}` : null,
    first.parentPageId ? `parent page ${first.parentPageId}` : null,
    first.itemId ? `item ${first.itemId}` : null,
    first.field ? `field ${first.field}` : null,
  ].filter(Boolean).join(', ');
  // 首条差异的原因直接进 message：Agent 只读 message 就能决定是改框还是改内容。
  const detail = first.reason === 'overset'
    ? ' (text overset: the InDesign frame is too small for its text)'
    : Array.isArray(first.dimensions) && first.dimensions.length
      ? ` (table differs in: ${first.dimensions.join(', ')})`
      : '';
  return `Built InDesign content differs from the HTML source${location ? ` at ${location}` : ''}; ${count} issue(s) found${detail}.`;
}
```

把

```js
module.exports = {
  call,
  resume,
};
```

替换为

```js
module.exports = {
  call,
  resume,
  // 仅供测试断言文案；宿主只走 call/resume。
  fidelityFailureMessage,
};
```

同时在 `resumeAfterSnapshot` 的 `FIDELITY_GATE_FAILED` 返回里，把

```js
      hint: 'Read forward-fidelity-report.json, fix the named HTML page/object/field, then start a new build.',
```

替换为

```js
      hint: first.hint
        ? `${first.hint} Full list: forward-fidelity-report.json.`
        : 'Read forward-fidelity-report.json, fix the named HTML page/object/field, then start a new build.',
```

- [ ] **Step 6: 跑测试确认通过**

```bash
cd /d/AI/html-indesign && node --test test/semantic-model/forward-fidelity-audit.test.js test/indesign-cli-plugin/authoring-lint-feedback.test.js test/indesign-cli-plugin/tool-catalog.test.js 2>&1 | grep -E "^# (pass|fail)"
```

预期：`# fail 0`（tool-catalog 的 `failure_example` 正则 `field .+; \d+ issue\(s\) found` 仍匹配）。

- [ ] **Step 7: 提交**

```bash
cd /d/AI/html-indesign && git add src/semantic-model/audit/forward-fidelity.js src/indesign-cli-plugin/tools/build-indesign.js test/semantic-model/forward-fidelity-audit.test.js test/indesign-cli-plugin/authoring-lint-feedback.test.js && git commit -m "feat(fidelity): 前缀截断标记 overset 并给 hint，首条消息附原因/维度

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## 批 2 · 导出预检与失败文案（FC-03）

### Task 4: 宿主 JSX 结果把 errors[0] 上浮到顶层，插件侧解析兜底

**Files:**
- Modify: `D:\AI\html-indesign\src\indesign-cli-plugin\host-jsx.js`（四个模板）
- Modify: `D:\AI\html-indesign\src\indesign-cli-plugin\lint-feedback.js:124-132`
- Create: `D:\AI\html-indesign\test\indesign-cli-plugin\host-jsx.test.js`
- Test: `D:\AI\html-indesign\test\indesign-cli-plugin\authoring-lint-feedback.test.js`

背景：CLI 的 `formatScriptResult()` 对 `ok:false` 的脚本结果取 `message ?? error ?? result ?? 原文`；导出脚本只在 `errors[]` 里放原因，顶层没有 `message`，于是 Agent 看到的是整段 JSON。两层修：脚本返回前把 `errors[0]` 抬到顶层；插件 `underlyingHostFailure` 遇到 JSON 字符串 message 也能解出来。

- [ ] **Step 1: 新建 host-jsx.test.js（失败测试）**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildBuildJsx,
  buildCloseJsx,
  buildExportJsx,
  buildReverseSnapshotJsx,
} = require('../../src/indesign-cli-plugin/host-jsx');

function allTemplates() {
  return {
    build: buildBuildJsx({ repoRoot: 'D:/plugin', instructionsPath: 'D:/run/instructions.json', marker: 'run-1' }),
    export: buildExportJsx({ runDir: 'D:/run', outputBaseName: 'deck', expectedMarker: 'run-1' }),
    snapshot: buildReverseSnapshotJsx({ repoRoot: 'D:/plugin', outputPath: 'D:/run/snapshot.json', expectedMarker: 'run-1' }),
    close: buildCloseJsx({ expectedMarker: 'run-1' }),
  };
}

test('every host JSX template returns through finish(), which lifts errors[0] to a top-level code/message', () => {
  for (const [name, source] of Object.entries(allTemplates())) {
    assert.match(source, /function finish\(payload\) \{/, `${name} must define finish()`);
    assert.match(source, /payload\.code = payload\.errors\[0\]\.code;/, `${name} must lift code`);
    assert.match(source, /payload\.message = payload\.errors\[0\]\.message;/, `${name} must lift message`);
    assert.equal(source.includes('return JSON.stringify(result);'), false, `${name} must not bypass finish()`);
    assert.ok((source.match(/return finish\(result\);/g) || []).length >= 1, `${name} must return via finish()`);
  }
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /d/AI/html-indesign && node --test test/indesign-cli-plugin/host-jsx.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```

预期：fail（模板里没有 `function finish`）。

- [ ] **Step 3: 实现 host-jsx.js**

在文件顶部 `const path = require('node:path');` 之后加：

```js
// 每个宿主脚本都用它收尾：脚本失败时把 errors[0] 抬到顶层 code/message。
// CLI 的 script.run 只认顶层 message，没有就把整段 JSON 当文案给 Agent。
const FINISH_FUNCTION = `
    function finish(payload) {
        if (payload && payload.ok === false && payload.errors && payload.errors.length && !payload.message) {
            payload.code = payload.errors[0].code;
            payload.message = payload.errors[0].message;
        }
        return JSON.stringify(payload);
    }
`;
```

然后对四个模板做同样两件事：（a）在模板 `(function () {` 的下一行插入 `${FINISH_FUNCTION}`；（b）把模板里每一处 `return JSON.stringify(result);` 改为 `return finish(result);`。逐个模板：

`buildBuildJsx`：把

```js
  return `(function () {
    var base = ${JSON.stringify(base)};
```

替换为

```js
  return `(function () {${FINISH_FUNCTION}
    var base = ${JSON.stringify(base)};
```

并把该模板末尾的 `    return JSON.stringify(result);` 改为 `    return finish(result);`。

`buildExportJsx`：把

```js
  return `(function () {
    var runDir = ${JSON.stringify(outDir)};
```

替换为

```js
  return `(function () {${FINISH_FUNCTION}
    var runDir = ${JSON.stringify(outDir)};
```

该模板有三处 `return JSON.stringify(result);`（NO_ACTIVE_DOCUMENT、ACTIVE_DOCUMENT_MISMATCH、末尾），全部改为 `return finish(result);`。

`buildReverseSnapshotJsx`：把

```js
  return `(function () {
    var result = { ok: false, outputPath: ${JSON.stringify(output)}, errors: [], warnings: [] };
```

替换为

```js
  return `(function () {${FINISH_FUNCTION}
    var result = { ok: false, outputPath: ${JSON.stringify(output)}, errors: [], warnings: [] };
```

末尾 `return JSON.stringify(result);` 改为 `return finish(result);`。

`buildCloseJsx`：把

```js
  return `(function () {
    var result = { ok: false, closed: false, errors: [], warnings: [] };
```

替换为

```js
  return `(function () {${FINISH_FUNCTION}
    var result = { ok: false, closed: false, errors: [], warnings: [] };
```

该模板三处 `return JSON.stringify(result);` 全部改为 `return finish(result);`。

自检：

```bash
cd /d/AI/html-indesign && grep -c "return JSON.stringify(result);" src/indesign-cli-plugin/host-jsx.js; grep -c "return finish(result);" src/indesign-cli-plugin/host-jsx.js
```

预期：`0` 和 `8`。

- [ ] **Step 4: 写 underlyingHostFailure 失败测试**

在 `authoring-lint-feedback.test.js` 现有 `test('underlyingHostFailure 从共享模块导出，保留下层 code 与文本', ...)` 之后追加：

```js
test('underlyingHostFailure 把被 CLI 序列化成 JSON 文本的脚本结果解回首条结构化错误', () => {
  const blob = JSON.stringify({
    ok: false,
    outputs: { pdf: 'D:/run/deck.pdf' },
    errors: [{ code: 'INDD_SAVE_FAILED', message: '无法存储到文件“deck.indd”，因为该文件已打开。' }],
    audit: { panelNames: { layers: ['内容'] } },
  });
  const failure = underlyingHostFailure({ error: { code: 'INDESIGN_SCRIPT_FAILED', message: blob } });
  assert.equal(failure.code, 'INDD_SAVE_FAILED');
  assert.equal(failure.message, '无法存储到文件“deck.indd”，因为该文件已打开。');
  assert.equal(failure.hostResult.outputs.pdf, 'D:/run/deck.pdf');

  const plain = underlyingHostFailure({ error: { code: 'X', message: 'not json' } });
  assert.deepEqual(plain, { code: 'X', message: 'not json' });

  const lifted = underlyingHostFailure({ data: { ok: false, code: 'OUTPUT_TARGET_OPEN', message: 'busy' } });
  assert.deepEqual(lifted, { code: 'OUTPUT_TARGET_OPEN', message: 'busy' });
});
```

- [ ] **Step 5: 跑测试确认失败**

```bash
cd /d/AI/html-indesign && node --test test/indesign-cli-plugin/authoring-lint-feedback.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```

预期：新测试 fail（`failure.code` 仍是 `INDESIGN_SCRIPT_FAILED`）。

- [ ] **Step 6: 实现 underlyingHostFailure**

把 `lint-feedback.js` 的

```js
function underlyingHostFailure(result) {
  if (result && result.error) return result.error;
  const data = result && result.data;
  const errors = data && Array.isArray(data.errors) ? data.errors : [];
  if (errors[0]) return errors[0];
  if (data && data.error) return data.error;
  return { code: null, message: null };
}
```

替换为

```js
function underlyingHostFailure(result) {
  if (result && result.error) return unwrapSerializedHostError(result.error);
  const data = result && result.data;
  const errors = data && Array.isArray(data.errors) ? data.errors : [];
  if (errors[0]) return errors[0];
  if (data && data.error) return data.error;
  if (data && data.code && data.message) return { code: data.code, message: data.message };
  return { code: null, message: null };
}

// CLI 的 script.run 遇到 ok:false 且没有顶层 message 的脚本结果时，会把整段
// JSON 当作 error.message。这里把首条结构化错误解回来，原文放 hostResult。
function unwrapSerializedHostError(error) {
  const message = error && typeof error.message === 'string' ? error.message.trim() : '';
  if (!message.startsWith('{')) return error;
  let parsed;
  try {
    parsed = JSON.parse(message);
  } catch (_) {
    return error;
  }
  const first = parsed && Array.isArray(parsed.errors) ? parsed.errors[0] : null;
  if (!first || !first.message) return error;
  return { ...error, code: first.code || error.code, message: first.message, hostResult: parsed };
}
```

- [ ] **Step 7: 跑测试确认通过**

```bash
cd /d/AI/html-indesign && node --test test/indesign-cli-plugin/host-jsx.test.js test/indesign-cli-plugin/authoring-lint-feedback.test.js test/indesign-executor/executor-script-static.test.js 2>&1 | grep -E "^# (pass|fail)"
```

预期：`# fail 0`（executor 静态测试里的 `InDesign E2E build wrapper loads the same executor libs` 只看 includeLib 清单，不受影响）。

- [ ] **Step 8: 提交**

```bash
cd /d/AI/html-indesign && git add src/indesign-cli-plugin/host-jsx.js src/indesign-cli-plugin/lint-feedback.js test/indesign-cli-plugin/host-jsx.test.js test/indesign-cli-plugin/authoring-lint-feedback.test.js && git commit -m "fix(plugin): 宿主脚本失败把 errors[0] 抬到顶层，插件解回被序列化的原因

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: 构建前预检目标 INDD 是否已在 InDesign 中打开

**Files:**
- Modify: `D:\AI\html-indesign\src\indesign-cli-plugin\host-jsx.js`（`buildBuildJsx`）
- Modify: `D:\AI\html-indesign\src\indesign-cli-plugin\tools\build-indesign.js:146-150`（调用点）、`:403-435`（`hostFailureResponse`）
- Test: `D:\AI\html-indesign\test\indesign-cli-plugin\host-jsx.test.js`、`D:\AI\html-indesign\test\indesign-cli-plugin\authoring-lint-feedback.test.js`

背景：两次 `INDESIGN_EXPORT_FAILED` 的真因都是上一版成品 INDD 还开着，40-94 秒构建后才在 `doc.save` 失败。预检放在 `app.documents.add()` 之前：本工具产物且未修改就自动关掉；否则 `OUTPUT_TARGET_OPEN` 立即返回，`retryable: true`。

- [ ] **Step 1: 写失败测试（模板）**

在 `host-jsx.test.js` 追加：

```js
test('build template checks whether the target INDD is already open before creating a document', () => {
  const source = buildBuildJsx({
    repoRoot: 'D:/plugin',
    instructionsPath: 'D:/run/instructions.json',
    marker: 'run-1',
    targetInddPath: 'D:\\run\\deck.indd',
  });
  assert.match(source, /var targetIndd = "D:\/run\/deck\.indd";/);
  assert.match(source, /function findOpenDocumentAt\(fsPath\)/);
  assert.match(source, /OUTPUT_TARGET_OPEN/);
  assert.match(source, /PREVIOUS_OUTPUT_CLOSED/);
  assert.ok(source.indexOf('findOpenDocumentAt(targetIndd)') < source.indexOf('app.documents.add()'), 'pre-check must run before the document is created');

  const withoutTarget = buildBuildJsx({ repoRoot: 'D:/plugin', instructionsPath: 'D:/run/instructions.json', marker: 'run-1' });
  assert.match(withoutTarget, /var targetIndd = null;/);
});
```

- [ ] **Step 2: 写失败测试（插件映射）**

在 `authoring-lint-feedback.test.js` 末尾追加：

```js
test('OUTPUT_TARGET_OPEN from the build pre-check surfaces as its own retryable error with a close-it hint', () => {
  const outDir = path.join(repoRoot, 'test', 'workspace', 'lint-feedback-target-open');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'deck.indd'), 'stale', 'utf8');

  const response = callPlugin('tools/resume', {
    state: {
      tool_id: 'html.build_indesign',
      stage: 'build',
      mode: 'final',
      runDir: outDir,
      outputBaseName: 'deck',
      runStartedAt: Date.now() + 60000,
    },
    host_results: [{
      id: 'html-build-script',
      ok: true,
      data: {
        ok: false,
        code: 'OUTPUT_TARGET_OPEN',
        message: 'Target INDD is open in InDesign; close it (or choose another outputBaseName) before building: D:/run/deck.indd',
        errors: [{ code: 'OUTPUT_TARGET_OPEN', message: 'Target INDD is open in InDesign; close it (or choose another outputBaseName) before building: D:/run/deck.indd' }],
      },
    }],
  });

  assert.equal(response.status, 'error');
  assert.equal(response.error.code, 'OUTPUT_TARGET_OPEN');
  assert.equal(response.error.retryable, true);
  assert.match(response.error.message, /^Target INDD is open in InDesign/);
  assert.match(response.error.hint, /关闭/);
  assert.equal(response.error.details.artifactsExported, false);
  assert.deepEqual(response.error.details.partialArtifacts, []);
});
```

（`runStartedAt` 的 mtime 过滤在任务 6 实现；本任务先让 `code`/`retryable`/`hint` 断言通过，`partialArtifacts` 断言到任务 6 才会绿——任务 6 完成前允许该断言失败，但不要提交带失败测试的 commit：本任务 Step 6 提交前把最后两行断言先注释，任务 6 再放开。）

- [ ] **Step 3: 跑测试确认失败**

```bash
cd /d/AI/html-indesign && node --test test/indesign-cli-plugin/host-jsx.test.js test/indesign-cli-plugin/authoring-lint-feedback.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```

预期：模板测试 fail（无 `targetIndd`）；插件测试 fail（`error.code` 是 `INDESIGN_BUILD_FAILED`）。

- [ ] **Step 4: 实现模板**

`buildBuildJsx` 签名改为：

```js
function buildBuildJsx({ repoRoot, instructionsPath, marker = 'html-indesign-indesign-e2e', targetInddPath = null }) {
  const base = toJsxPath(repoRoot);
  const instructions = toJsxPath(instructionsPath);
  const targetIndd = targetInddPath ? JSON.stringify(toJsxPath(targetInddPath)) : 'null';
```

把模板中

```js
    var marker = ${JSON.stringify(String(marker))};
    var doc = null;
    var result = { ok: false, marker: marker, pageCount: 0, counts: {}, errors: [], warnings: [], closedOnFailure: false };
    try {
        doc = app.documents.add();
```

替换为

```js
    var marker = ${JSON.stringify(String(marker))};
    var targetIndd = ${targetIndd};
    var doc = null;
    var result = { ok: false, marker: marker, pageCount: 0, counts: {}, errors: [], warnings: [], closedOnFailure: false };

    // Saving over an INDD that is open in InDesign fails only at the very end
    // of the run. Look for it up front: our own unmodified previous output can
    // be closed; anything else is the user's and the build stops here.
    function findOpenDocumentAt(fsPath) {
        var wanted = String(File(fsPath).fsName).toLowerCase();
        for (var i = 0; i < app.documents.length; i++) {
            var candidate = app.documents[i];
            try {
                if (candidate.saved && String(candidate.fullName.fsName).toLowerCase() === wanted) return candidate;
            } catch (_) {}
        }
        return null;
    }

    var openTarget = targetIndd ? findOpenDocumentAt(targetIndd) : null;
    if (openTarget) {
        var ownOutput = false;
        try { ownOutput = !!openTarget.extractLabel("html_indesign_e2e_marker") && openTarget.modified === false; } catch (_) {}
        if (ownOutput) {
            try {
                openTarget.close(SaveOptions.NO);
                result.warnings.push({ code: "PREVIOUS_OUTPUT_CLOSED", message: "Closed the unmodified previous build output that was still open: " + targetIndd });
            } catch (closeError) {
                result.errors.push({ code: "OUTPUT_TARGET_OPEN", message: "Target INDD is open in InDesign and could not be closed: " + targetIndd + " (" + String(closeError) + ")" });
                return finish(result);
            }
        } else {
            result.errors.push({ code: "OUTPUT_TARGET_OPEN", message: "Target INDD is open in InDesign; close it (or choose another outputBaseName) before building: " + targetIndd });
            return finish(result);
        }
    }

    try {
        doc = app.documents.add();
```

- [ ] **Step 5: 实现调用点与错误映射**

`build-indesign.js` 把

```js
  fs.writeFileSync(buildScriptPath, buildBuildJsx({
    repoRoot: pluginRoot,
    instructionsPath: compile.instructionsPath,
    marker: runMarker,
  }), 'utf8');
```

替换为

```js
  fs.writeFileSync(buildScriptPath, buildBuildJsx({
    repoRoot: pluginRoot,
    instructionsPath: compile.instructionsPath,
    marker: runMarker,
    targetInddPath: path.join(compile.outDir, `${outputBaseName}.indd`),
  }), 'utf8');
```

把 `hostFailureResponse` 整个函数替换为

```js
// 导出阶段可能只失败一半：INDD 已经落盘、PDF 没有。把整次调用报成失败而不提已落盘产物，
// 调用方就无法判断重跑范围。cleanupThenError() 已是这个模式，这里对称应用。
// OUTPUT_TARGET_OPEN 是构建前预检：什么都没写，原因也不是作者源码，单独映射并标记可重试。
function hostFailureResponse(state, failed) {
  const detail = underlyingHostFailure(failed);
  const stage = state.stage || 'build';
  const finished = finishStageTiming(state);
  const targetOpen = detail.code === 'OUTPUT_TARGET_OPEN';
  const partialArtifacts = targetOpen ? [] : landedDeliverables(state);
  const baseMessage = detail.message || `Host action failed during ${stage}.`;
  const prefix = landedArtifactPrefix(partialArtifacts);
  const hint = targetOpen
    ? '目标 INDD 正在 InDesign 中打开：在 InDesign 里关闭它（或改用其他 outputBaseName），然后重跑同一命令。'
    : partialArtifacts.length
      ? '已落盘的产物见 error.details.partialArtifacts，重跑前先确认是否需要保留；'
        + 'Fix the reported cause before starting a new build; unchanged input must not be retried automatically.'
      : 'Fix the reported cause before starting a new build; unchanged input must not be retried automatically.';
  return {
    status: 'error',
    error: {
      code: targetOpen ? 'OUTPUT_TARGET_OPEN' : (STAGE_ERROR_CODES[stage] || 'HOST_ACTION_FAILED'),
      message: prefix ? `${prefix}${baseMessage}` : baseMessage,
      stage,
      retryable: targetOpen,
      hint,
      details: {
        causeCode: detail.code || null,
        hostResult: failed,
        stage,
        artifactsExported: partialArtifacts.length > 0,
        partialArtifacts,
        intermediateDir: state.runDir || null,
        metrics: collectMetrics(finished),
        compatibility: state.compatibility || auditHtmlCompatibility(null),
      },
    },
    ...(partialArtifacts.length ? { artifacts: partialArtifacts } : {}),
  };
}
```

- [ ] **Step 6: 跑测试确认通过并提交**

```bash
cd /d/AI/html-indesign && node --test test/indesign-cli-plugin/host-jsx.test.js test/indesign-cli-plugin/authoring-lint-feedback.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```

预期：`# fail 0`（`partialArtifacts` 因 targetOpen 直接为空，Step 2 的全部断言此时就能过，不需要注释）。

```bash
cd /d/AI/html-indesign && git add src/indesign-cli-plugin/host-jsx.js src/indesign-cli-plugin/tools/build-indesign.js test/indesign-cli-plugin/host-jsx.test.js test/indesign-cli-plugin/authoring-lint-feedback.test.js && git commit -m "feat(plugin): 构建前预检目标 INDD 是否已打开，OUTPUT_TARGET_OPEN 可重试

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 6: 已落盘产物只列本轮写出的文件

**Files:**
- Modify: `D:\AI\html-indesign\src\indesign-cli-plugin\tools\build-indesign.js`（`call()` 的 state、`landedDeliverables`）
- Test: `D:\AI\html-indesign\test\indesign-cli-plugin\authoring-lint-feedback.test.js`

背景：`landedDeliverables()` 只查文件存在，把上一版残留的 INDD 报成"INDD 已保存于"，与 `INDD_SAVE_FAILED` 自相矛盾。用本轮开始时间过滤 mtime；state 里没有 `runStartedAt`（老测试）时保持原行为。

- [ ] **Step 1: 写失败测试**

在 `authoring-lint-feedback.test.js` 末尾追加：

```js
test('deliverables older than this run are not reported as saved after INDD_SAVE_FAILED', () => {
  const outDir = path.join(repoRoot, 'test', 'workspace', 'lint-feedback-stale-artifacts');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'deck.indd'), 'stale', 'utf8');
  fs.writeFileSync(path.join(outDir, 'deck.pdf'), 'stale', 'utf8');

  const response = callPlugin('tools/resume', {
    state: {
      tool_id: 'html.build_indesign',
      stage: 'export',
      mode: 'final',
      runDir: outDir,
      outputBaseName: 'deck',
      exportPdf: true,
      exportIdml: true,
      runStartedAt: Date.now() + 60000,
    },
    host_results: [{
      id: 'html-export-script',
      ok: true,
      data: { ok: false, errors: [{ code: 'INDD_SAVE_FAILED', message: '无法存储到文件“deck.indd”，因为该文件已打开。' }] },
    }],
  });

  assert.equal(response.status, 'error');
  assert.equal(response.error.code, 'INDESIGN_EXPORT_FAILED');
  assert.equal(response.error.message, '无法存储到文件“deck.indd”，因为该文件已打开。');
  assert.equal(response.error.details.artifactsExported, false);
  assert.deepEqual(response.error.details.partialArtifacts, []);
  assert.equal(response.artifacts, undefined);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /d/AI/html-indesign && node --test test/indesign-cli-plugin/authoring-lint-feedback.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```

预期：新测试 fail（message 以 `INDD 已保存于` 开头）。

- [ ] **Step 3: 实现**

`call()` 里 state 对象的 `stageStartedAt: Date.now(),` 之前插入一行：

```js
    runStartedAt: Date.now(),
```

把 `landedDeliverables` 替换为：

```js
function landedDeliverables(state) {
  if (!state || !state.runDir) return [];
  const baseName = state.outputBaseName || 'html-indesign-output';
  const since = Number(state.runStartedAt);
  const landed = [];
  for (const deliverable of DELIVERABLE_KINDS) {
    const file = path.join(state.runDir, `${baseName}${deliverable.extension}`);
    if (!fs.existsSync(file)) continue;
    // Files older than this run are leftovers from a previous build; reporting
    // them as "saved" right after INDD_SAVE_FAILED would contradict the failure.
    if (Number.isFinite(since) && fs.statSync(file).mtimeMs < since - 1000) continue;
    landed.push(artifact(deliverable.kind, file, deliverable.label));
  }
  return landed;
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd /d/AI/html-indesign && node --test test/indesign-cli-plugin/authoring-lint-feedback.test.js 2>&1 | grep -E "^# (pass|fail)"
```

预期：`# fail 0`（现有 `导出后宿主失败必须报出已落盘的 INDD/PDF/IDML` 测试没有 `runStartedAt`，行为不变）。

- [ ] **Step 5: 提交**

```bash
cd /d/AI/html-indesign && git add src/indesign-cli-plugin/tools/build-indesign.js test/indesign-cli-plugin/authoring-lint-feedback.test.js && git commit -m "fix(plugin): 宿主失败只把本轮写出的 INDD/PDF/IDML 报成已落盘

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## 批 3 · 网格门禁（FC-02）

### Task 7: 捕获层记录"元素是否承担网格放置"

**Files:**
- Modify: `D:\AI\html-indesign\src\adapters\html\reader\browser-element-capture.js`（`sourceNodeFor`、新增 `isGridPlaced`、导出表）
- Modify: `D:\AI\html-indesign\src\adapters\html\reader\browser-snapshot-capture.js:156`
- Modify: `D:\AI\html-indesign\src\adapters\html\reader\browser-snapshot.js:148`
- Test: `D:\AI\html-indesign\test\html-to-indesign\browser-snapshot.test.js`

背景：校验器要知道某个祖先是不是"站在网格上的块"。`sourceAncestorNodes` 现在只带 `tagName/id/classList/attributes/sourcePath`，看不到 CSS 变量或计算样式。在浏览器上下文里判定一次并写成布尔 `gridPlaced`，item 与祖先节点都带。判定：自有 `--grid-col`/`--grid-row`、`grid-item` 类名、或计算样式 `grid-column-start`/`grid-row-start` 不是 `auto`。

- [ ] **Step 1: 写失败测试**

在 `browser-snapshot.test.js` 末尾追加（`renderSnapshot` 已在文件顶部引入）：

```js
test('renderSnapshot marks grid-placed blocks and their ancestors with gridPlaced', async () => {
  const outDir = path.resolve(__dirname, '../workspace/browser-snapshot-grid-placed');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'deck.html');
  fs.writeFileSync(htmlPath, `<!doctype html>
<style>
  .page { width: 800px; height: 450px; position: relative; box-sizing: border-box; padding: 40px;
    display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-template-rows: repeat(8, minmax(0, 1fr)); gap: 16px; }
  .grid-item { grid-column: var(--grid-col) / span var(--grid-span); grid-row: var(--grid-row) / span var(--grid-row-span); }
  .card { padding: 24px; }
  .loose { position: absolute; left: 520px; top: 300px; }
</style>
<section class="page" id="page-1">
  <div class="grid-item card" id="card" style="--grid-col:1;--grid-span:6;--grid-row:1;--grid-row-span:3">
    <p id="card-copy">卡片正文</p>
  </div>
  <p class="loose" id="loose-copy">自由文本</p>
</section>`, 'utf8');

  const snapshot = await renderSnapshot({ htmlPath });
  const page = snapshot.pages[0];

  const copy = page.items.find((item) => item.id === 'card-copy');
  assert.ok(copy, 'card paragraph should be captured');
  assert.equal(copy.gridPlaced, false);
  const cardAncestor = copy.sourceAncestorNodes.find((node) => node.id === 'card');
  assert.ok(cardAncestor, 'the card must be recorded as a source ancestor');
  assert.equal(cardAncestor.gridPlaced, true);

  const loose = page.items.find((item) => item.id === 'loose-copy');
  assert.ok(loose, 'loose paragraph should be captured');
  assert.equal(loose.gridPlaced, false);
  assert.equal(loose.sourceAncestorNodes.some((node) => node.gridPlaced === true), false);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /d/AI/html-indesign && node --test test/html-to-indesign/browser-snapshot.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```

预期：新测试 fail（`cardAncestor.gridPlaced` 为 undefined）。这个文件会拉起 Edge，约 1-2 分钟。

- [ ] **Step 3: 实现 browser-element-capture.js**

在 `function cssVarsFor(el) {...}` 之后（`isFlexFlowChild` 之前）插入：

```js
  // An element "carries grid placement" when the author pinned it to the page
  // grid: its own --grid-col/--grid-row custom properties, the grid-item
  // class, or an explicit CSS grid-column/grid-row start. Its descendants are
  // that block's content and are never measured against the page grid.
  function isGridPlaced(el) {
    if (!el || el.nodeType !== 1) return false;
    const own = cssVarsFor(el);
    if (own['--grid-col'] || own['--grid-row']) return true;
    if (classList(el).includes('grid-item')) return true;
    const style = getComputedStyle(el);
    return ['gridColumnStart', 'gridRowStart'].some((prop) => {
      const value = String(style[prop] || '').trim().toLowerCase();
      return value !== '' && value !== 'auto';
    });
  }
```

把 `sourceNodeFor` 里的

```js
    const node = {
      tagName: el.tagName.toLowerCase(),
      id: el.id || null,
      classList: classList(el),
      attributes: attrs(el),
      sourcePath: sourcePathFor(el, pageEl),
    };
```

替换为

```js
    const node = {
      tagName: el.tagName.toLowerCase(),
      id: el.id || null,
      classList: classList(el),
      attributes: attrs(el),
      sourcePath: sourcePathFor(el, pageEl),
      gridPlaced: isGridPlaced(el),
    };
```

在导出表 `const api = {` 里 `isFlexFlowChild,` 之后加一行 `isGridPlaced,`。

- [ ] **Step 4: 实现 item 字段与透传**

`browser-snapshot-capture.js` 把

```js
      inFlexFlow: elements.isFlexFlowChild(el),
```

替换为

```js
      inFlexFlow: elements.isFlexFlowChild(el),
      gridPlaced: elements.isGridPlaced(el),
```

`browser-snapshot.js` 把

```js
    inFlexFlow: item.inFlexFlow === true,
```

替换为

```js
    inFlexFlow: item.inFlexFlow === true,
    gridPlaced: item.gridPlaced === true,
```

- [ ] **Step 5: 跑测试确认通过**

```bash
cd /d/AI/html-indesign && node --test test/html-to-indesign/browser-snapshot.test.js 2>&1 | grep -E "^# (pass|fail)"
```

预期：`# fail 0`。

- [ ] **Step 6: 提交**

```bash
cd /d/AI/html-indesign && git add src/adapters/html/reader/browser-element-capture.js src/adapters/html/reader/browser-snapshot-capture.js src/adapters/html/reader/browser-snapshot.js test/html-to-indesign/browser-snapshot.test.js && git commit -m "feat(capture): item 与祖先节点记录 gridPlaced

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 8: 校验器：母元素负责对齐、条目带偏移量、统计豁免与偏差

**Files:**
- Modify: `D:\AI\html-indesign\src\adapters\html\validators\authoring-validator.js`（`validateAuthoringRules` 网格循环与返回、`shouldCheckGrid`、`offGridEdges`、新增 helper）
- Test: `D:\AI\html-indesign\test\html-to-indesign\authoring-validator.test.js`

背景：规则改为"承担网格放置的块负责对齐，块内后代不检查"；`offGridEdges` 算出的距离不再丢掉；条目附 `edgeOffsets` 与 `suggestedFix`；结果顶层带 `gridIgnoredCount`（带豁免标签的可映射元素数）和 `gridOffCount`（被报出的元素数）。祖先节点老快照没有 `gridPlaced` 时退回看 `grid-item` 类名或 `style` 属性里的 `--grid-col/--grid-row`。

测试用的页面（`snapshotWithPage`，120×80mm，边距 10mm，`4x2` 网格，gutter 2mm）的网格线：竖线 0/10/33.5/35.5/59/61/84.5/86.5/110/120，横线 0/10/39/41/70/80。

- [ ] **Step 1: 写失败测试**

在 `authoring-validator.test.js` 里现有 `test('validateAuthoringRules inherits grid-ignore from a non-mappable authoring container', ...)` 之后追加四个测试：

```js
test('content inside a grid-placed block is not measured against the page grid', () => {
  const snapshot = snapshotWithPage({
    attributes: { 'data-id-margin': '10mm', 'data-id-grid': '4x2', 'data-id-column-gutter': '2mm', 'data-id-row-gutter': '2mm' },
    items: [{
      id: 'card-copy',
      role: 'text',
      tagName: 'p',
      classList: ['card-copy'],
      attributes: { 'data-id-paragraph-style': 'body-copy' },
      sourceAncestorNodes: [{
        tagName: 'div',
        id: 'card',
        classList: ['grid-item', 'card'],
        attributes: { style: '--grid-col:1;--grid-span:2;--grid-row:1;--grid-row-span:1' },
        gridPlaced: true,
      }],
      boundsMm: { x: 16.35, y: 16.35, width: 20, height: 6 },
    }],
  });

  const result = validateAuthoringRules(snapshot, { strict: true, gridTolerance: 1 });

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.errors.some((entry) => entry.code === 'GRID_ALIGNMENT_OFF'), false);
  assert.equal(result.gridIgnoredCount, 0);
  assert.equal(result.gridOffCount, 0);
});

test('an ancestor without gridPlaced is still recognised by its grid-item class or --grid-col style', () => {
  const base = {
    id: 'card-copy',
    role: 'text',
    tagName: 'p',
    classList: ['card-copy'],
    attributes: { 'data-id-paragraph-style': 'body-copy' },
    boundsMm: { x: 16.35, y: 16.35, width: 20, height: 6 },
  };
  const byClass = validateAuthoringRules(snapshotWithPage({
    attributes: { 'data-id-margin': '10mm', 'data-id-grid': '4x2' },
    items: [{ ...base, sourceAncestorNodes: [{ tagName: 'div', classList: ['grid-item'], attributes: {} }] }],
  }), { strict: true, gridTolerance: 1 });
  assert.equal(byClass.errors.some((entry) => entry.code === 'GRID_ALIGNMENT_OFF'), false);

  const byStyle = validateAuthoringRules(snapshotWithPage({
    attributes: { 'data-id-margin': '10mm', 'data-id-grid': '4x2' },
    items: [{ ...base, sourceAncestorNodes: [{ tagName: 'div', classList: ['band'], attributes: { style: '--grid-row: 2; --grid-row-span: 1' } }] }],
  }), { strict: true, gridTolerance: 1 });
  assert.equal(byStyle.errors.some((entry) => entry.code === 'GRID_ALIGNMENT_OFF'), false);

  const plainWrapper = validateAuthoringRules(snapshotWithPage({
    attributes: { 'data-id-margin': '10mm', 'data-id-grid': '4x2' },
    items: [{ ...base, sourceAncestorNodes: [{ tagName: 'div', classList: ['wrapper'], attributes: {} }] }],
  }), { strict: true, gridTolerance: 1 });
  assert.equal(plainWrapper.errors.some((entry) => entry.code === 'GRID_ALIGNMENT_OFF'), true, 'a wrapper that is not on the grid does not shield its content');
});

test('GRID_ALIGNMENT_OFF entries carry per-edge offsets, the nearest line and a concrete fix', () => {
  const snapshot = snapshotWithPage({
    attributes: { 'data-id-margin': '10mm', 'data-id-grid': '4x2', 'data-id-column-gutter': '2mm', 'data-id-row-gutter': '2mm' },
    items: [{
      id: 'title',
      role: 'text',
      tagName: 'h2',
      classList: ['page-title'],
      attributes: { 'data-id-paragraph-style': 'page-title' },
      boundsMm: { x: 13, y: 14, width: 20, height: 6 },
    }],
  });

  const result = validateAuthoringRules(snapshot, { strict: true, gridTolerance: 1 });

  const entry = result.errors.find((issue) => issue.code === 'GRID_ALIGNMENT_OFF' && issue.itemId === 'title');
  assert.ok(entry);
  assert.deepEqual(entry.edges, ['left', 'top']);
  assert.deepEqual(entry.edgeOffsets, [
    { edge: 'left', valueMm: 13, nearestLineMm: 10, offsetMm: 3 },
    { edge: 'top', valueMm: 14, nearestLineMm: 10, offsetMm: 4 },
  ]);
  assert.match(entry.message, /left at 13mm is 3mm right of the column line at 10mm/);
  assert.match(entry.message, /top at 14mm is 4mm below the row line at 10mm/);
  assert.match(entry.suggestedFix, /Move #title left edge to 10mm \(-3mm\), top edge to 10mm \(-4mm\)/);
  assert.match(entry.suggestedFix, /content inside a placed block is not checked/);
  assert.equal(result.gridOffCount, 1);
});

test('gridIgnoredCount counts mappable items exempted by data-id-grid-ignore, own or inherited', () => {
  const snapshot = snapshotWithPage({
    attributes: { 'data-id-margin': '10mm', 'data-id-grid': '4x2' },
    items: [{
      id: 'bleed',
      role: 'graphic',
      tagName: 'img',
      classList: ['hero'],
      attributes: { src: 'hero.png', 'data-id-grid-ignore': '' },
      boundsMm: { x: 3, y: 3, width: 50, height: 30 },
    }, {
      id: 'caption',
      role: 'text',
      tagName: 'p',
      classList: ['caption'],
      attributes: { 'data-id-paragraph-style': 'caption' },
      sourceAncestorNodes: [{ tagName: 'figure', classList: ['figure'], attributes: { 'data-id-grid-ignore': '' } }],
      boundsMm: { x: 3, y: 36, width: 20, height: 5 },
    }, {
      id: 'aligned',
      role: 'text',
      tagName: 'p',
      classList: ['body-copy'],
      attributes: { 'data-id-paragraph-style': 'body-copy' },
      boundsMm: { x: 10, y: 10, width: 20, height: 5 },
    }],
  });

  const result = validateAuthoringRules(snapshot, { strict: true, gridTolerance: 1 });

  assert.equal(result.gridIgnoredCount, 2);
  assert.equal(result.gridOffCount, 0);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /d/AI/html-indesign && node --test test/html-to-indesign/authoring-validator.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```

预期：4 个新测试 fail。

- [ ] **Step 3: 实现 validateAuthoringRules 的网格循环与返回**

把

```js
function validateAuthoringRules(snapshot, options = {}) {
  const pages = Array.isArray(snapshot && snapshot.pages) ? snapshot.pages : [];
  const errors = [];
  const warnings = [];
  const gridTolerance = Number.isFinite(Number(options.gridTolerance)) ? Number(options.gridTolerance) : 1;
```

替换为

```js
function validateAuthoringRules(snapshot, options = {}) {
  const pages = Array.isArray(snapshot && snapshot.pages) ? snapshot.pages : [];
  const errors = [];
  const warnings = [];
  const gridTolerance = Number.isFinite(Number(options.gridTolerance)) ? Number(options.gridTolerance) : 1;
  // 豁免与偏差都计数：整包豁免不能静默通过，报告和遥测要看得见。
  let gridIgnoredCount = 0;
  let gridOffCount = 0;
```

把

```js
    if (grid.valid && grid.lines) {
      items.forEach((item, itemIndex) => {
        if (!shouldCheckGrid(item, page)) return;
        const edges = offGridEdges(item.boundsMm, grid.lines, gridTolerance, item);
        if (!edges.length) return;
        warnings.push({
          ...message('warning', GRID_ALIGNMENT_OFF, pageId, itemIdFor(item, itemIndex), 'Item edges do not align to the declared authoring grid.'),
          edges,
        });
      });
    }
```

替换为

```js
    if (grid.valid && grid.lines) {
      items.forEach((item, itemIndex) => {
        if (isGridIgnored(item)) {
          gridIgnoredCount += 1;
          return;
        }
        if (!shouldCheckGrid(item, page)) return;
        const edges = offGridEdges(item.boundsMm, grid.lines, gridTolerance, item);
        if (!edges.length) return;
        gridOffCount += 1;
        const itemId = itemIdFor(item, itemIndex);
        warnings.push({
          ...message('warning', GRID_ALIGNMENT_OFF, pageId, itemId, gridOffMessage(edges)),
          edges: edges.map((entry) => entry.edge),
          edgeOffsets: edges,
          suggestedFix: gridSuggestedFix(itemId, edges),
        });
      });
    }
```

把函数末尾的

```js
  return {
    valid: resultErrors.length === 0,
    errors: resultErrors,
    warnings: resultWarnings,
    messages: resultErrors.concat(resultWarnings),
  };
}
```

替换为

```js
  return {
    valid: resultErrors.length === 0,
    errors: resultErrors,
    warnings: resultWarnings,
    messages: resultErrors.concat(resultWarnings),
    gridIgnoredCount,
    gridOffCount,
  };
}
```

- [ ] **Step 4: 实现 shouldCheckGrid 与新增 helper**

把

```js
function shouldCheckGrid(item, page) {
  if (!isMappableItem(item)) return false;
  const attrs = attributesFor(item);
  if (attributeValue(attrs, HTML_DATA_ID_ATTRIBUTES.GRID_IGNORE) != null) return false;
  if (hasInheritedGridIgnore(item)) return false;
  if (attributeValue(attrs, HTML_DATA_ID_ATTRIBUTES.ROLE) === ITEM_ROLE.ANNOTATION) return false;
```

替换为

```js
function shouldCheckGrid(item, page) {
  if (!isMappableItem(item)) return false;
  const attrs = attributesFor(item);
  if (isGridIgnored(item)) return false;
  if (isPlacedBlockContent(item)) return false;
  if (attributeValue(attrs, HTML_DATA_ID_ATTRIBUTES.ROLE) === ITEM_ROLE.ANNOTATION) return false;
```

在 `function hasInheritedGridIgnore(item) {...}` 之后插入：

```js
function isGridIgnored(item) {
  if (!isMappableItem(item)) return false;
  return attributeValue(attributesFor(item), HTML_DATA_ID_ATTRIBUTES.GRID_IGNORE) != null
    || hasInheritedGridIgnore(item);
}

// Grid alignment is the placed block's responsibility: an element inside an
// ancestor that carries grid placement (a card, a column, a header band) is
// that block's content, and its own edges sit wherever the block's padding
// puts them. Mappable ancestors are already excluded via ancestorCandidateIndexes;
// this covers the borderless wrappers that only exist for positioning.
function isPlacedBlockContent(item) {
  return Array.isArray(item && item.sourceAncestorNodes)
    && item.sourceAncestorNodes.some(isGridPlacedNode);
}

function isGridPlacedNode(node) {
  if (!node) return false;
  if (node.gridPlaced === true) return true;
  if (Array.isArray(node.classList) && node.classList.includes('grid-item')) return true;
  const style = String(attributeValue(attributesFor(node), 'style') || '');
  return /--grid-(?:col|row)\s*:/.test(style);
}
```

- [ ] **Step 5: 实现 offGridEdges 与文案 helper**

把

```js
function offGridEdges(bounds, lines, tolerance, item) {
  const vertical = lines && Array.isArray(lines.vertical) ? lines.vertical : [];
  const horizontal = lines && Array.isArray(lines.horizontal) ? lines.horizontal : [];
  const edges = gridEdgesForItem(bounds, vertical, horizontal, item);
  return edges
    .filter(([, value, candidates]) => !nearAnyLine(value, candidates, tolerance))
    .map(([name]) => name);
}
```

替换为

```js
function offGridEdges(bounds, lines, tolerance, item) {
  const vertical = lines && Array.isArray(lines.vertical) ? lines.vertical : [];
  const horizontal = lines && Array.isArray(lines.horizontal) ? lines.horizontal : [];
  return gridEdgesForItem(bounds, vertical, horizontal, item)
    .map(([edge, value, candidates]) => {
      const nearest = nearestLine(value, candidates);
      return {
        edge,
        valueMm: round(Number(value), 2),
        nearestLineMm: nearest,
        offsetMm: nearest == null ? null : round(Number(value) - nearest, 2),
      };
    })
    .filter((entry) => entry.nearestLineMm == null || Math.abs(entry.offsetMm) > tolerance);
}

function nearestLine(value, lines) {
  let best = null;
  for (const line of lines || []) {
    const candidate = Number(line);
    if (!Number.isFinite(candidate)) continue;
    if (best == null || Math.abs(Number(value) - candidate) < Math.abs(Number(value) - best)) best = candidate;
  }
  return best;
}

function gridOffMessage(edges) {
  return `Item edges do not align to the declared authoring grid: ${edges.map(describeEdgeOffset).join('; ')}.`;
}

function describeEdgeOffset(entry) {
  if (entry.nearestLineMm == null) return `${entry.edge} at ${entry.valueMm}mm has no grid line to align to`;
  const axis = entry.edge === 'left' || entry.edge === 'right' ? 'column' : 'row';
  const direction = entry.offsetMm > 0
    ? (axis === 'column' ? 'right of' : 'below')
    : (axis === 'column' ? 'left of' : 'above');
  return `${entry.edge} at ${entry.valueMm}mm is ${Math.abs(entry.offsetMm)}mm ${direction} the ${axis} line at ${entry.nearestLineMm}mm`;
}

function gridSuggestedFix(itemId, edges) {
  const moves = edges
    .filter((entry) => entry.nearestLineMm != null)
    .map((entry) => `${entry.edge} edge to ${entry.nearestLineMm}mm (${entry.offsetMm > 0 ? '-' : '+'}${Math.abs(entry.offsetMm)}mm)`);
  if (!moves.length) {
    return `Give #${itemId} a grid placement (--grid-col/--grid-row) or mark it data-id-grid-ignore if it is meant to leave the grid.`;
  }
  return `Move #${itemId} ${moves.join(', ')}, or place it with --grid-col/--grid-row so the block itself sits on the grid; `
    + 'content inside a placed block is not checked.';
}
```

`nearAnyLine` 不再被引用，删除该函数：

```bash
cd /d/AI/html-indesign && grep -n "nearAnyLine" src/adapters/html/validators/authoring-validator.js
```

预期：只剩定义处一条；删掉 `function nearAnyLine(...) {...}` 三行后再 grep 应无输出。

- [ ] **Step 6: 跑测试确认通过**

```bash
cd /d/AI/html-indesign && node --test test/html-to-indesign/authoring-validator.test.js test/indesign-cli-plugin/authoring-lint-feedback.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```

预期：`# fail 0`。注意 `authoring-lint-feedback.test.js` 用真实作者包 fixture（`test/fixtures/authoring-lint/grid-alignment-package`）断言 `56 errors` 与 `left 52、top 50、right 3`——母元素规则可能让这个基准数变化。若变化：读新数字，确认减少的条目全是"位于 grid-item 祖先内部"的元素（用 `node -e` 打印 `response.error.details.errors` 里每条的 `itemId` 与 fixture HTML 对照），然后把该测试文件头部注释和 `CONCENTRATION_SENTENCE`、正则里的数字改成新基准，并在注释里加一行"2026-09-04 起：母元素规则让块内元素不再计入"。不得为了保住旧数字改规则。

- [ ] **Step 7: 提交**

```bash
cd /d/AI/html-indesign && git add src/adapters/html/validators/authoring-validator.js test/html-to-indesign/authoring-validator.test.js test/indesign-cli-plugin/authoring-lint-feedback.test.js && git commit -m "feat(lint): 网格对齐由承担放置的母元素负责，条目带偏移量与修法，统计豁免/偏差

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 9: 计数进 lint 载荷、插件 metrics

**Files:**
- Modify: `D:\AI\html-indesign\src\authoring\lint.js`（`lintAuthoringPackage` 载荷、`normalizeLintPayload`）
- Modify: `D:\AI\html-indesign\src\indesign-cli-plugin\tools\authoring-lint.js:17-24`
- Modify: `D:\AI\html-indesign\src\indesign-cli-plugin\tools\build-indesign.js`（`lintCounts`、两处 `buildMetrics`、`collectMetrics`）
- Test: `D:\AI\html-indesign\test\authoring\lint-normalized-count.test.js`

背景：`validateAuthoringRules` 的结果经 `withDataIdAudit`/`withCompatibility`/`withRuntimeAudit` 都用 `...result` 展开，`lintAuthoringHtml` 的载荷天然带上两个计数；`lintAuthoringPackage` 自己拼对象，要显式透传；`normalizeLintPayload` 统一归成数字。遥测键名 `grid_ignored_count`、`grid_off_count`（CLI 侧 `router.py:46` 对 metrics 字典整体透传，无需改 CLI；按 AGENTS.md 2.5 记入白名单 review）。

- [ ] **Step 1: 写失败测试**

在 `lint-normalized-count.test.js` 末尾追加：

```js
test('grid exemption and offset counts pass through normalizeLintPayload as numbers', () => {
  const payload = normalizeLintPayload({
    errors: [],
    warnings: [],
    gridIgnoredCount: 1147,
    gridOffCount: '3',
  });
  assert.equal(payload.gridIgnoredCount, 1147);
  assert.equal(payload.gridOffCount, 3);

  const missing = normalizeLintPayload({ errors: [], warnings: [] });
  assert.equal(missing.gridIgnoredCount, 0);
  assert.equal(missing.gridOffCount, 0);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /d/AI/html-indesign && node --test test/authoring/lint-normalized-count.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```

预期：fail（`payload.gridOffCount` 是字符串 `'3'`，`missing.gridIgnoredCount` 是 undefined）。

- [ ] **Step 3: 实现 lint.js**

`normalizeLintPayload` 里把

```js
    normalizedCount: normalized.length,
    compatibility: payload.compatibility || emptyCompatibility(),
  };
}
```

替换为

```js
    normalizedCount: normalized.length,
    gridIgnoredCount: Number(payload.gridIgnoredCount) || 0,
    gridOffCount: Number(payload.gridOffCount) || 0,
    compatibility: payload.compatibility || emptyCompatibility(),
  };
}
```

`lintAuthoringPackage` 的最终载荷里，把

```js
    compatibility: htmlResult.compatibility,
    errors,
    warnings,
    messages: errors.concat(warnings),
    ...(options.includeSnapshot ? { snapshot: htmlResult.snapshot } : {}),
```

替换为

```js
    compatibility: htmlResult.compatibility,
    gridIgnoredCount: htmlResult.gridIgnoredCount || 0,
    gridOffCount: htmlResult.gridOffCount || 0,
    errors,
    warnings,
    messages: errors.concat(warnings),
    ...(options.includeSnapshot ? { snapshot: htmlResult.snapshot } : {}),
```

- [ ] **Step 4: 实现 metrics**

`authoring-lint.js` 把

```js
    normalized_count: (result && result.normalizedCount) || 0,
    compatibility_normalized: result && result.compatibility && result.compatibility.summary.normalized,
```

替换为

```js
    normalized_count: (result && result.normalizedCount) || 0,
    grid_ignored_count: (result && result.gridIgnoredCount) || 0,
    grid_off_count: (result && result.gridOffCount) || 0,
    compatibility_normalized: result && result.compatibility && result.compatibility.summary.normalized,
```

`build-indesign.js` 把

```js
  const lintCounts = {
    errorCount: lint.errorCount,
    warningCount: lint.warningCount,
    normalizedCount: lint.normalizedCount || 0,
  };
```

替换为

```js
  const lintCounts = {
    errorCount: lint.errorCount,
    warningCount: lint.warningCount,
    normalizedCount: lint.normalizedCount || 0,
    gridIgnoredCount: lint.gridIgnoredCount || 0,
    gridOffCount: lint.gridOffCount || 0,
  };
```

lint 失败分支的 `buildMetrics({...})` 里，在 `normalized_count: lintCounts.normalizedCount ?? 0,` 之后加：

```js
        grid_ignored_count: lintCounts.gridIgnoredCount,
        grid_off_count: lintCounts.gridOffCount,
```

`collectMetrics` 里，在 `normalized_count: lintCounts.normalizedCount ?? 0,` 之后加：

```js
    grid_ignored_count: lintCounts.gridIgnoredCount,
    grid_off_count: lintCounts.gridOffCount,
```

- [ ] **Step 5: 跑测试确认通过**

```bash
cd /d/AI/html-indesign && node --test test/authoring/lint-normalized-count.test.js test/indesign-cli-plugin/authoring-lint-feedback.test.js 2>&1 | grep -E "^# (pass|fail)"
```

预期：`# fail 0`。再用真实 fixture 看一眼 metrics 键真的出现：

```bash
cd /d/AI/html-indesign && node -e "const {callPlugin,repoRoot}=require('./test/indesign-cli-plugin/plugin-test-helper');const path=require('path');const r=callPlugin('tools/call',{id:'html.authoring_lint',args:{package:path.join(repoRoot,'test/fixtures/authoring-lint/grid-alignment-package/deck.config.json'),strict:true}});console.log(JSON.stringify(r.error.details.metrics))"
```

预期：输出含 `"grid_ignored_count":` 与 `"grid_off_count":`（数值不限）。

- [ ] **Step 6: 提交**

```bash
cd /d/AI/html-indesign && git add src/authoring/lint.js src/indesign-cli-plugin/tools/authoring-lint.js src/indesign-cli-plugin/tools/build-indesign.js test/authoring/lint-normalized-count.test.js && git commit -m "feat(lint): gridIgnoredCount/gridOffCount 进载荷与 plugin metrics

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 10: lint 失败首条消息带修复示例与豁免计数，目录文案同步

**Files:**
- Modify: `D:\AI\html-indesign\src\indesign-cli-plugin\lint-feedback.js`（`lintFailureMessage`、新增两个句子函数）
- Modify: `D:\AI\html-indesign\src\indesign-cli-plugin\tool-catalog.js:28-42`（`common_next_steps`、`failure_example`）、`:170`、`:228`（`gridTolerance` 描述）
- Test: `D:\AI\html-indesign\test\indesign-cli-plugin\authoring-lint-feedback.test.js`、`D:\AI\html-indesign\test\indesign-cli-plugin\tool-catalog.test.js`

背景：用户原话——"报错不能简单一句系统性错误就给它，让 AI 不知道怎么改"。凡是条目带 `suggestedFix`（任务 8 的 `GRID_ALIGNMENT_OFF`、既有的 `TEXT_CONTAINER_HAS_CHILD_OBJECTS`、`TEXT_FIRST_LINE_CANNOT_FIT`）都在首条消息里给出前三条具体修法；包里有豁免时点明数量。目录里的示例与"调 gridTolerance"建议同步改掉。

- [ ] **Step 1: 写失败测试**

在 `authoring-lint-feedback.test.js` 末尾追加：

```js
test('lintFailureMessage 把前三条 suggestedFix 与豁免计数写进首条消息', () => {
  const errors = [
    { level: 'error', code: 'GRID_ALIGNMENT_OFF', pageId: 'page-2', itemId: 'p2-el4', message: 'Item edges do not align to the declared authoring grid: left at 13mm is 3mm right of the column line at 10mm.', edges: ['left'], suggestedFix: 'Move #p2-el4 left edge to 10mm (-3mm), or place it with --grid-col/--grid-row so the block itself sits on the grid; content inside a placed block is not checked.' },
    { level: 'error', code: 'GRID_ALIGNMENT_OFF', pageId: 'page-2', itemId: 'p2-el5', message: 'x', edges: ['top'], suggestedFix: 'Move #p2-el5 top edge to 41mm (+2mm), or place it with --grid-col/--grid-row so the block itself sits on the grid; content inside a placed block is not checked.' },
    { level: 'error', code: 'GRID_ALIGNMENT_OFF', pageId: 'page-3', itemId: 'p3-el1', message: 'x', edges: ['left'], suggestedFix: 'Move #p3-el1 left edge to 10mm (-1.5mm), or place it with --grid-col/--grid-row so the block itself sits on the grid; content inside a placed block is not checked.' },
    { level: 'error', code: 'GRID_ALIGNMENT_OFF', pageId: 'page-3', itemId: 'p3-el2', message: 'x', edges: ['left'], suggestedFix: 'Move #p3-el2 left edge to 10mm (-1mm), or place it with --grid-col/--grid-row so the block itself sits on the grid; content inside a placed block is not checked.' },
  ];
  const message = lintFailureMessage({ errors, errorCount: 4, gridIgnoredCount: 12 }, { strict: true });

  assert.match(message, /Fix examples: page-2 \/ p2-el4: Move #p2-el4 left edge to 10mm \(-3mm\)/);
  assert.match(message, /\| page-2 \/ p2-el5: Move #p2-el5 top edge/);
  assert.match(message, /\| page-3 \/ p3-el1: Move #p3-el1/);
  assert.equal(message.includes('p3-el2: Move'), false, 'only the first three fixes are inlined');
  assert.match(message, /\(\+1 more in error\.details\.errors\[\]\.suggestedFix\)/);
  assert.match(message, /Grid exemptions already in this package: 12 item\(s\) carry data-id-grid-ignore\./);

  const withoutFixes = lintFailureMessage({ errors: [{ level: 'error', code: 'HTML_TEXT_NOT_CONVERTIBLE', pageId: 'page-1', itemId: 'p1-el1', message: 'x' }], errorCount: 1 }, { strict: true });
  assert.equal(withoutFixes.includes('Fix examples'), false);
  assert.equal(withoutFixes.includes('Grid exemptions'), false);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /d/AI/html-indesign && node --test test/indesign-cli-plugin/authoring-lint-feedback.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```

预期：新测试 fail（无 `Fix examples`）。

- [ ] **Step 3: 实现 lint-feedback.js**

把

```js
  const firstIssue = firstIssueSentence(lint);
  if (firstIssue) lines.push(firstIssue);
  if (options.reportPath) lines.push(`Full report: ${options.reportPath}`);

  return lines.join('\n');
}
```

替换为

```js
  const firstIssue = firstIssueSentence(lint);
  if (firstIssue) lines.push(firstIssue);
  const fixes = fixExamplesSentence(lint);
  if (fixes) lines.push(fixes);
  const exemptions = gridExemptionSentence(lint);
  if (exemptions) lines.push(exemptions);
  if (options.reportPath) lines.push(`Full report: ${options.reportPath}`);

  return lines.join('\n');
}

const MAX_FIX_EXAMPLES = 3;

// "系统性成因"只回答"是不是一处改法"，不回答"怎么改"。带 suggestedFix 的条目
// 直接给前三条，Agent 不用先去翻完整报告才能动手。
function fixExamplesSentence(lint) {
  const carriers = lintErrors(lint).filter((entry) => typeof entry.suggestedFix === 'string' && entry.suggestedFix.trim());
  if (!carriers.length) return '';
  const examples = carriers.slice(0, MAX_FIX_EXAMPLES).map((entry) => {
    const location = [entry.pageId, entry.itemId].filter(Boolean).join(' / ');
    return `${location ? `${location}: ` : ''}${entry.suggestedFix.trim()}`;
  });
  const rest = carriers.length - MAX_FIX_EXAMPLES;
  const more = rest > 0 ? ` (+${rest} more in error.details.errors[].suggestedFix)` : '';
  return `Fix examples: ${examples.join(' | ')}${more}`;
}

// 整包豁免不能静默：Agent 和人都要看见这个包已经豁免了多少元素。
function gridExemptionSentence(lint) {
  const count = Number(lint && lint.gridIgnoredCount) || 0;
  if (!count) return '';
  return `Grid exemptions already in this package: ${count} item(s) carry data-id-grid-ignore.`;
}
```

- [ ] **Step 4: 改目录文案**

`tool-catalog.js` 把 `html.authoring_lint` 的

```js
    common_next_steps: [
      '失败时先读 error.details.errors，按 code 分类看分布，不要逐条改。',
      '同一 code 高度集中时是单一系统性成因：改网格声明、调 gridTolerance，或对个别元素声明网格豁免属性（见 Skill 的 HTML 创作章节）。',
      '通过后再调用 html.build_indesign；本工具默认 strict:false，而 build 内部固定 strict:true。',
    ],
```

替换为

```js
    common_next_steps: [
      '失败时先读 error.details.errors，按 code 分类看分布，不要逐条改。',
      '同一 code 高度集中时是单一系统性成因：先看首条消息里的 Fix examples 与每条的 edgeOffsets/suggestedFix；'
        + 'GRID_ALIGNMENT_OFF 只量承担网格放置的块（grid-item / --grid-col 的元素），块内内容不检查，'
        + '所以通常是块本身没坐在网格上或网格声明与 CSS 不符。gridTolerance 只用于确认版式正确后的取整误差。',
      '通过后再调用 html.build_indesign；本工具默认 strict:false，而 build 内部固定 strict:true。',
    ],
```

把 `failure_example.message`

```js
      message: 'Strict authoring checks found 73 errors (GRID_ALIGNMENT_OFF: 73). '
        + 'All errors share code GRID_ALIGNMENT_OFF — this is one systemic cause, not 73 independent fixes. '
        + 'Affected: page-2 (27), page-3 (15), page-4 (31); edges top/left/right. '
        + 'First issue at page-2 / p2-el1: Item edges do not align to the declared authoring grid. '
        + 'Full report: <outDir>\\authoring-lint-report.json',
```

替换为

```js
      message: 'Strict authoring checks found 12 errors (GRID_ALIGNMENT_OFF: 12). '
        + 'All 12 errors share code GRID_ALIGNMENT_OFF — this is one systemic cause, not 12 independent fixes. '
        + 'Affected: page-2 (7), page-3 (5); edges left/top. '
        + 'First issue at page-2 / p2-el1: Item edges do not align to the declared authoring grid: left at 13mm is 3mm right of the column line at 10mm. '
        + 'Fix examples: page-2 / p2-el1: Move #p2-el1 left edge to 10mm (-3mm), or place it with --grid-col/--grid-row so the block itself sits on the grid; content inside a placed block is not checked. '
        + '(+11 more in error.details.errors[].suggestedFix) '
        + 'Full report: <outDir>\\authoring-lint-report.json',
```

两处 `gridTolerance` 的 description（`:170` 与 `:228`）都替换为：

```js
        description: '网格对齐容差，单位 mm，默认 1mm。GRID_ALIGNMENT_OFF 只量承担网格放置的块（grid-item / --grid-col 元素），'
          + '块内内容不检查；条目自带 edgeOffsets 与 suggestedFix。放宽容差只用于确认版式正确后的取整误差，不要用它盖住真实偏差。',
```

- [ ] **Step 5: 跑测试确认通过**

```bash
cd /d/AI/html-indesign && node --test test/indesign-cli-plugin/authoring-lint-feedback.test.js test/indesign-cli-plugin/tool-catalog.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```

预期：`# fail 0`。`tool-catalog.test.js` 里若有针对 `gridTolerance` 描述或 `common_next_steps` 原文的断言失败，把断言改成匹配新文案中的关键词（`edgeOffsets`、`块内内容不检查`），不要改回旧文案。

- [ ] **Step 6: 提交**

```bash
cd /d/AI/html-indesign && git add src/indesign-cli-plugin/lint-feedback.js src/indesign-cli-plugin/tool-catalog.js test/indesign-cli-plugin/authoring-lint-feedback.test.js test/indesign-cli-plugin/tool-catalog.test.js && git commit -m "feat(lint): 失败首条消息附前三条 suggestedFix 与豁免计数，目录文案改为母元素规则

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## 批 4 · 文案快通道（FC-04）

### Task 11: `SEMANTIC_TOKEN_UNKNOWN` 列出已登记 token

**Files:**
- Modify: `D:\AI\html-indesign\src\semantic-preset\audit-authoring.js`
- Create: `D:\AI\html-indesign\test\semantic-preset\audit-authoring.test.js`

背景：两台工位的 Agent 都编造了 token（`body-text`、`content`），报错只说 unknown。`collectKnownSemanticTokens(preset)` 返回 `{ [kind]: Set }`，现成可列。≤20 个全列；更多时按编辑距离给最近 5 个。

- [ ] **Step 1: 新建失败测试**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { auditAuthoringSemanticTokens } = require('../../src/semantic-preset/audit-authoring');

function pageFile(html) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-audit-authoring-'));
  const filePath = path.join(dir, 'pages', '01-page.html');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, html, 'utf8');
  return { filePath, relativePath: 'pages/01-page.html' };
}

test('SEMANTIC_TOKEN_UNKNOWN lists the registered tokens of that kind when there are few', () => {
  const preset = { styleNameMap: { paragraphStyles: { 'body-copy': '正文', 'table-body': '表格正文', 'page-title': '页面标题' } } };
  const result = auditAuthoringSemanticTokens({
    preset,
    pageFiles: [pageFile('<section class="page"><p data-id-paragraph-style="body-text">x</p></section>')],
    strict: true,
  });

  assert.equal(result.valid, false);
  const issue = result.errors[0];
  assert.equal(issue.code, 'SEMANTIC_TOKEN_UNKNOWN');
  assert.equal(issue.token, 'body-text');
  assert.equal(issue.message, 'Unknown semantic token "body-text" in data-id-paragraph-style. Known paragraphStyles: body-copy, page-title, table-body.');
  assert.deepEqual(issue.knownTokens, ['body-copy', 'page-title', 'table-body']);
});

test('SEMANTIC_TOKEN_UNKNOWN suggests the closest tokens when many are registered', () => {
  const names = {};
  for (let index = 0; index < 30; index += 1) names[`style-${String(index).padStart(2, '0')}`] = `样式${index}`;
  names['body-copy'] = '正文';
  const result = auditAuthoringSemanticTokens({
    preset: { styleNameMap: { paragraphStyles: names } },
    pageFiles: [pageFile('<section class="page"><p data-id-paragraph-style="body-text">x</p></section>')],
    strict: true,
  });

  const issue = result.errors[0];
  assert.match(issue.message, /^Unknown semantic token "body-text" in data-id-paragraph-style\. 31 paragraphStyles tokens are registered; closest: body-copy, /);
  assert.equal(issue.knownTokens.length, 5);
  assert.equal(issue.knownTokens[0], 'body-copy');
});

test('SEMANTIC_TOKEN_UNKNOWN says so when nothing of that kind is registered', () => {
  const result = auditAuthoringSemanticTokens({
    preset: {},
    pageFiles: [pageFile('<section class="page"><div data-id-layer="decor">x</div></section>')],
    strict: true,
  });

  const issue = result.errors.find((entry) => entry.token === 'decor');
  assert.ok(issue);
  assert.equal(issue.message, 'Unknown semantic token "decor" in data-id-layer. No layers tokens are registered in the semantic preset; add it to the preset before using it.');
  assert.deepEqual(issue.knownTokens, []);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /d/AI/html-indesign && node --test test/semantic-preset/audit-authoring.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```

预期：3 个 fail（message 没有 Known/closest 部分）。

- [ ] **Step 3: 实现**

`audit-authoring.js` 把

```js
          messages.push({
            level,
            code,
            message: `Unknown semantic token "${token}" in ${attrName}.`,
            file,
            attr: attrName,
            token,
            kind,
          });
```

替换为

```js
          const knownTokens = suggestedTokens(token, known[kind]);
          messages.push({
            level,
            code,
            message: unknownTokenMessage(token, attrName, kind, known[kind], knownTokens),
            file,
            attr: attrName,
            token,
            kind,
            knownTokens,
          });
```

在 `function splitTokens(value) {` 之前插入：

```js
const MAX_LISTED_TOKENS = 20;
const MAX_SUGGESTED_TOKENS = 5;

// 只说 unknown 等于让 Agent 再猜一次；把本 kind 已登记的词表给出来，
// 词表太长时按编辑距离给最近的几个。
function suggestedTokens(token, knownSet) {
  const known = [...(knownSet || [])].sort();
  if (known.length <= MAX_LISTED_TOKENS) return known;
  return known
    .map((name) => [levenshtein(token, name), name])
    .sort((left, right) => left[0] - right[0] || left[1].localeCompare(right[1]))
    .slice(0, MAX_SUGGESTED_TOKENS)
    .map(([, name]) => name);
}

function unknownTokenMessage(token, attrName, kind, knownSet, suggested) {
  const base = `Unknown semantic token "${token}" in ${attrName}.`;
  const total = knownSet ? knownSet.size : 0;
  if (!total) return `${base} No ${kind} tokens are registered in the semantic preset; add it to the preset before using it.`;
  if (total <= MAX_LISTED_TOKENS) return `${base} Known ${kind}: ${suggested.join(', ')}.`;
  return `${base} ${total} ${kind} tokens are registered; closest: ${suggested.join(', ')}.`;
}

function levenshtein(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_value, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd /d/AI/html-indesign && node --test test/semantic-preset/audit-authoring.test.js test/authoring/lint-authoring-package-cli.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```

预期：`# fail 0`（`lint-authoring-package-cli.test.js:121` 只断言 `code` 与 `token`，不受 message 变化影响）。

- [ ] **Step 5: 提交**

```bash
cd /d/AI/html-indesign && git add src/semantic-preset/audit-authoring.js test/semantic-preset/audit-authoring.test.js && git commit -m "feat(preset): SEMANTIC_TOKEN_UNKNOWN 列出已登记 token 或最近候选

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 12: `AUTHOR_PAGE_SECTION_INVALID` 说清找到几个，`AUTHOR_STYLE_BUCKET_MISSING` 不在 strict 下阻断

**Files:**
- Modify: `D:\AI\html-indesign\src\authoring\source-package.js:196-235`、`:280-291`
- Create: `D:\AI\html-indesign\test\authoring\source-package-audit.test.js`

背景：13 个页面文件同时报"must contain exactly one page section"，不说找到几个、要哪个选择器；"Recommended … missing"在 strict 下却是 error。`formatAuditResult` 现在把所有 warning 提升，改成尊重 `strictBlocking: false`（与 `authoring-validator.js:123` 同一机制）。

- [ ] **Step 1: 新建失败测试**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { auditAuthorPackageSourceFormat } = require('../../src/authoring/source-package');

const SECTION = '<section class="page" data-page="cover" data-id-layout="cover" data-id-margin="10mm" data-id-grid="12x8">';

function makePackage({ styles, pageHtml }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-source-package-'));
  fs.mkdirSync(path.join(root, 'styles'), { recursive: true });
  fs.mkdirSync(path.join(root, 'pages'), { recursive: true });
  for (const file of styles) fs.writeFileSync(path.join(root, file), '/* css */\n', 'utf8');
  fs.writeFileSync(path.join(root, 'pages', '00-cover.html'), pageHtml, 'utf8');
  fs.writeFileSync(path.join(root, 'deck.html'), '<!doctype html><html><body></body></html>', 'utf8');
  const configPath = path.join(root, 'deck.config.json');
  fs.writeFileSync(configPath, JSON.stringify({
    schemaVersion: 1,
    id: 'source-package-fixture',
    title: 'Source Package Fixture',
    entry: 'deck.html',
    styles,
    pages: [{ id: 'cover', file: 'pages/00-cover.html' }],
  }, null, 2), 'utf8');
  return configPath;
}

const ALL_STYLES = ['styles/tokens.css', 'styles/layout.css', 'styles/components.css', 'styles/pages.css'];

test('AUTHOR_PAGE_SECTION_INVALID reports how many page sections were found and what the root must be', () => {
  const configPath = makePackage({
    styles: ALL_STYLES,
    pageHtml: `<div class="page-wrapper">${SECTION}<h1>A</h1></section>${SECTION}<h1>B</h1></section></div>`,
  });

  const result = auditAuthorPackageSourceFormat(configPath, { strict: true });

  const issue = result.errors.find((entry) => entry.code === 'AUTHOR_PAGE_SECTION_INVALID');
  assert.ok(issue);
  assert.equal(issue.found, 2);
  assert.equal(issue.file, 'pages/00-cover.html');
  assert.equal(issue.message, 'Found 2 page section(s) in pages/00-cover.html; each page source file must contain exactly one <section class="page" data-page="..."> as its root, with all page content inside it.');
});

test('AUTHOR_PAGE_SECTION_INVALID with zero sections says so', () => {
  const configPath = makePackage({ styles: ALL_STYLES, pageHtml: '<div class="page"><h1>A</h1></div>' });

  const result = auditAuthorPackageSourceFormat(configPath, { strict: true });

  const issue = result.errors.find((entry) => entry.code === 'AUTHOR_PAGE_SECTION_INVALID');
  assert.ok(issue);
  assert.equal(issue.found, 0);
  assert.match(issue.message, /^Found 0 page section\(s\) in pages\/00-cover\.html;/);
});

test('AUTHOR_STYLE_BUCKET_MISSING stays a warning under strict while other warnings are promoted', () => {
  const configPath = makePackage({
    styles: ['styles/layout.css', 'styles/components.css', 'styles/pages.css'],
    pageHtml: `${SECTION}<h1>A</h1></section>`,
  });

  const result = auditAuthorPackageSourceFormat(configPath, { strict: true });

  assert.equal(result.errors.some((entry) => entry.code === 'AUTHOR_STYLE_BUCKET_MISSING'), false, JSON.stringify(result.errors));
  const warning = result.warnings.find((entry) => entry.code === 'AUTHOR_STYLE_BUCKET_MISSING');
  assert.ok(warning, 'the recommendation must still be visible');
  assert.equal(warning.strictBlocking, false);
  assert.equal(warning.file, 'styles/tokens.css');
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /d/AI/html-indesign && node --test test/authoring/source-package-audit.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```

预期：3 个 fail。

- [ ] **Step 3: 实现**

把

```js
  for (const file of RECOMMENDED_STYLE_FILES) {
    if (!styleSet.has(file)) {
      warnings.push(sourceIssue('warning', 'AUTHOR_STYLE_BUCKET_MISSING', `Recommended authoring style file is missing: ${file}`, file));
    }
  }
```

替换为

```js
  for (const file of RECOMMENDED_STYLE_FILES) {
    if (!styleSet.has(file)) {
      // 推荐项不是硬要求：strict 下也只提醒，不拦构建。
      warnings.push(sourceIssue('warning', 'AUTHOR_STYLE_BUCKET_MISSING', `Recommended authoring style file is missing: ${file}`, file, { strictBlocking: false }));
    }
  }
```

把

```js
  const pageSections = $('section.page, section[data-page]');
  if (pageSections.length !== 1) {
    errors.push(sourceIssue(
      'error',
      'AUTHOR_PAGE_SECTION_INVALID',
      'Each page source file must contain exactly one page section.',
      page.relativePath
    ));
    return;
  }
```

替换为

```js
  const pageSections = $('section.page, section[data-page]');
  if (pageSections.length !== 1) {
    errors.push(sourceIssue(
      'error',
      'AUTHOR_PAGE_SECTION_INVALID',
      `Found ${pageSections.length} page section(s) in ${page.relativePath}; each page source file must contain exactly one `
        + '<section class="page" data-page="..."> as its root, with all page content inside it.',
      page.relativePath,
      { found: pageSections.length }
    ));
    return;
  }
```

把

```js
function formatAuditResult(errors, warnings, options = {}) {
  const strict = !!options.strict;
  const promoted = strict ? warnings.map((entry) => ({ ...entry, level: 'error' })) : [];
  const resultErrors = errors.concat(promoted);
  const resultWarnings = strict ? [] : warnings;
```

替换为

```js
function formatAuditResult(errors, warnings, options = {}) {
  const strict = !!options.strict;
  // 与 authoring-validator.js 同一机制：strictBlocking:false 的 warning 不因 strict 升级。
  const promoted = strict
    ? warnings.filter((entry) => entry.strictBlocking !== false).map((entry) => ({ ...entry, level: 'error' }))
    : [];
  const resultErrors = errors.concat(promoted);
  const resultWarnings = strict ? warnings.filter((entry) => entry.strictBlocking === false) : warnings;
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd /d/AI/html-indesign && node --test test/authoring/source-package-audit.test.js test/authoring/source-package.test.js test/authoring/lint-authoring-package-cli.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```

预期：`# fail 0`。若 `source-package.test.js` 或 CLI 测试断言了旧 message 原文 `Each page source file must contain exactly one page section.`，把断言改为 `/^Found \d+ page section\(s\)/`。

- [ ] **Step 5: 提交**

```bash
cd /d/AI/html-indesign && git add src/authoring/source-package.js test/authoring/source-package-audit.test.js test/authoring/source-package.test.js test/authoring/lint-authoring-package-cli.test.js && git commit -m "feat(authoring): page section 错误报数量与根元素写法，推荐样式文件缺失不再被 strict 拦截

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## 批 5 · 真机验证与文档

### Task 13: E2E fixture 增加"无样式表头表格"页并真机验证

**Files:**
- Create: `D:\AI\html-indesign\test\fixtures\e2e\architecture-report\pages\07-plain-table.html`
- Modify: `D:\AI\html-indesign\test\fixtures\e2e\architecture-report\deck.config.json:23`
- Regenerate: `D:\AI\html-indesign\test\fixtures\e2e\architecture-report\deck.html`（组装脚本产出）
- Modify: `D:\AI\html-indesign\test\e2e-fixtures\architecture-report-fixture.test.js:100-108`

背景：现有 E2E 表格页每个单元格都写了 `data-id-paragraph-style`（`table-heading`/`table-body`），正好绕开了同事踩的坑。新增一页只用 `<thead><th>` + 裸 `<td>`，并让一个 `<td>` 内容以换行开头，作为 FC-01 的真机回归基准。这是唯一需要真实 InDesign 的任务，放在批 5 的第一位，失败时先修代码再继续。

- [ ] **Step 1: 新建页面文件**

`pages/07-plain-table.html`（与 `06-metrics-table.html` 同一套页面契约；`data-id-layout` 是本页独有 token）：

```html
<section class="page" data-page="plain-table" id="plain-table-page" data-id-parent-page="report-parent" data-id-parent-page-name="汇报母版" data-id-layout="plain-table-verification" data-id-margin="14mm 16mm 10mm 18mm" data-id-grid="12x8" data-id-column-gutter="6mm" data-id-row-gutter="5mm" data-id-baseline="4mm">
  <p id="plain-table-eyebrow" class="eyebrow grid-item" style="--grid-col:1;--grid-span:3;--grid-row:1;--grid-row-span:1" data-id-paragraph-style="deck-eyebrow">Verification</p>
  <h2 id="plain-table-title" class="page-title grid-item" style="--grid-col:1;--grid-span:6;--grid-row:2;--grid-row-span:1" data-id-paragraph-style="page-title">无单元格样式的表头表格</h2>
  <table id="plain-table" class="data-table grid-item" style="--grid-col:1;--grid-span:12;--grid-row:3;--grid-row-span:4" data-id-object data-id-layer="tables">
    <thead id="plain-table-head">
      <tr id="plain-table-heading-row">
        <th id="plain-table-heading-zone">Zone</th>
        <th id="plain-table-heading-area">Area</th>
        <th id="plain-table-heading-share">Share</th>
      </tr>
    </thead>
    <tbody id="plain-table-body">
      <tr id="plain-table-row-hall">
        <td id="plain-table-hall-zone">
          Main hall</td>
        <td id="plain-table-hall-area">4,200 sqm</td>
        <td id="plain-table-hall-share">41%</td>
      </tr>
      <tr id="plain-table-row-foyer">
        <td id="plain-table-foyer-zone">Foyer</td>
        <td id="plain-table-foyer-area">1,150 sqm</td>
        <td id="plain-table-foyer-share">11%</td>
      </tr>
    </tbody>
  </table>
  <p id="plain-table-note" class="body-copy grid-item" style="--grid-col:1;--grid-span:6;--grid-row:8;--grid-row-span:1" data-id-paragraph-style="body-copy">本页只用 th/td 语义，不给单元格声明段落样式，用来回归表头行与默认样式的保真比对。</p>
</section>
```

- [ ] **Step 2: 注册页面并重新组装入口**

`deck.config.json` 把

```json
    { "id": "metrics-table", "file": "pages/06-metrics-table.html" }
```

替换为

```json
    { "id": "metrics-table", "file": "pages/06-metrics-table.html" },
    { "id": "plain-table", "file": "pages/07-plain-table.html" }
```

然后重新生成 `deck.html`：

```bash
cd /d/AI/html-indesign && node scripts/assemble-authoring.js --package test/fixtures/e2e/architecture-report/deck.config.json && grep -c 'data-page="plain-table"' test/fixtures/e2e/architecture-report/deck.html
```

预期：输出 `1`。

- [ ] **Step 3: 更新 fixture 契约测试**

`architecture-report-fixture.test.js` 把

```js
    'asset-grid-notes',
    'metrics-table-summary',
  ];
```

替换为

```js
    'asset-grid-notes',
    'metrics-table-summary',
    'plain-table-verification',
  ];
```

- [ ] **Step 4: 跑所有引用该 fixture 的测试**

```bash
cd /d/AI/html-indesign && node --test test/e2e-fixtures/architecture-report-fixture.test.js test/architecture/semantic-model-contract.test.js test/authoring/source-package.test.js test/html-to-indesign/authoring-lint-cli.test.js test/html-to-indesign/browser-snapshot.test.js test/html-to-indesign/instructions-compiler.test.js test/html-to-indesign/parent-page-furniture-overrides.test.js test/indesign-e2e-runner.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```

预期：`# fail 0`。若某测试用 `items.find((item) => item.role === 'table')` 取到了新表：改成按 `id === 'metrics-area-table'` 取。若 `authoring-lint-cli.test.js` 对整个 deck 跑 strict lint 后报 `GRID_ALIGNMENT_OFF`：说明新页的块没坐在网格上，调整新页元素的 `--grid-*` 值，不要加 `data-id-grid-ignore`。

- [ ] **Step 5: 真机 E2E（需要本机 InDesign 已启动）**

```bash
cd /d/AI/html-indesign && npm run e2e:indesign 2>&1 | tail -15
```

预期：末尾打印运行目录 `test/workspace/indesign-e2e-<时间戳>/`，且没有 `FIDELITY_GATE_FAILED`。然后核对表头行真的写进了 InDesign：

```bash
cd /d/AI/html-indesign && RUN=$(ls -d test/workspace/indesign-e2e-* | tail -1) && node -e "
const fs=require('fs');const run=process.argv[1];
const report=JSON.parse(fs.readFileSync(run+'/forward-fidelity-report.json','utf8'));
console.log('fidelity ok:',report.ok,'errors:',report.summary.errors);
const snap=JSON.parse(fs.readFileSync(run+'/fidelity-snapshot.json','utf8'));
const tables=[];for(const p of snap.pages){for(const it of p.items||[]){if(it.table&&it.table.rows)tables.push({page:p.id||p.index,rows:it.table.rows.map(r=>r.cells.map(c=>[c.text,c.header,c.paragraphStyle]))});}}
console.log(JSON.stringify(tables,null,1));
" "$RUN"
```

预期：`fidelity ok: true errors: 0`；输出里能看到 `Zone/Area/Share` 一行 `header` 为 `true`，`Main hall` 单元格文本没有前导换行，`paragraphStyle` 为 `[基本段落]`（或同义内建名）。若 `fidelity ok` 为 false：读 `forward-fidelity-report.failed-*.json` 的 `errors[0]`，回到任务 1/2 修，不要改 fixture 去迁就。

- [ ] **Step 6: 提交**

```bash
cd /d/AI/html-indesign && git add test/fixtures/e2e/architecture-report/pages/07-plain-table.html test/fixtures/e2e/architecture-report/deck.config.json test/fixtures/e2e/architecture-report/deck.html test/e2e-fixtures/architecture-report-fixture.test.js && git commit -m "test(e2e): 增加无单元格样式的表头表格页，回归表格保真门禁

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 14: 文档：作者指南、Skill 网格段落、失败处理（INDD 已打开 + feedback 入口）

**Files:**
- Modify: `D:\AI\html-indesign\docs\规范\AGENT_HTML_AUTHORING_GUIDE.md:180`、`:318`
- Modify: `D:\AI\mcp-indesign\skills\indesign-cli\references\html-authoring.md:116-117`
- Modify: `D:\AI\mcp-indesign\skills\indesign-cli\references\failure-handling.md`（末尾追加两节）
- Test: `D:\AI\mcp-indesign\agent-harness\cli_anything\indesign\tests\test_health_runtime.py`

背景：Skill 只说"落网格线，故意偏离用豁免"，没说卡片内部会被量、也没说 feedback 命令存在。三份文档口径统一为"母元素负责对齐"。`html-indesign` 的指南是权威源，Skill 是精简版（0819 计划同一约定）。

- [ ] **Step 1: 写失败测试（mcp-indesign）**

在 `test_health_runtime.py` 的 `test_published_skill_is_standard_unified_html_first_skill` 函数之后追加：

```python
def test_published_skill_explains_parent_grid_rule_and_feedback_channel():
    skill_root = REPO_ROOT / "skills" / "indesign-cli"
    html_reference = (skill_root / "references" / "html-authoring.md").read_text(encoding="utf-8")
    failure_reference = (skill_root / "references" / "failure-handling.md").read_text(encoding="utf-8")

    assert "承担网格放置的块负责对齐" in html_reference
    assert "块内的内容不参与网格校验" in html_reference
    assert "edgeOffsets" in html_reference
    assert "gridIgnoredCount" in html_reference

    assert "OUTPUT_TARGET_OPEN" in failure_reference
    assert "indesign-cli feedback report --code" in failure_reference
    assert "ERROR_MESSAGE_USELESS" in failure_reference
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /d/AI/mcp-indesign && python -m pytest agent-harness/cli_anything/indesign/tests/test_health_runtime.py -k "parent_grid_rule" -q 2>&1 | tail -3
```

预期：1 failed。

- [ ] **Step 3: 改 Skill `html-authoring.md`**

把第 116 行（以 ``- `.grid-item` 声明 `--grid-col`、`--grid-span`、`--grid-row` 和 `--grid-row-span` 让元素在页面 CSS Grid 里就位；`` 开头的整条要点）整条替换为：

```markdown
- `.grid-item` 声明 `--grid-col`、`--grid-span`、`--grid-row` 和 `--grid-row-span` 让元素在页面 CSS Grid 里就位。网格对齐校验（`GRID_ALIGNMENT_OFF`，`strict:true` 下升级为 error）只量**承担网格放置的块**——带 `--grid-col`/`--grid-row`、`grid-item` 类名或显式 `grid-column` 的元素，以及直接放在页面上的元素；**承担网格放置的块负责对齐，块内的内容不参与网格校验**。所以卡片、面板、页眉条带该有内边距就有内边距，里面的段落、小标题、条形图不会因为离格线一个 padding 而报错；要对齐的是卡片本身的四条边（文字、表格和 `data-id-role="container"` 的元素只核对 left/top/right，不核对 bottom；自动宽度文字连 right 也不核对）。容差默认 1mm，`gridTolerance` 只用于确认版式正确后的取整误差，不要用它盖住真实偏差。每条 `GRID_ALIGNMENT_OFF` 都带 `edgeOffsets`（每条边偏了多少毫米、最近的格线在哪）和 `suggestedFix`（该往哪挪多少），首条消息会列出前三条；按数字改块的位置或 `--grid-*` 声明，不要逐个改块内元素。正常写法很容易因为子像素取整偏出 1mm，写完就跑一次 strict lint 核实。
```

把第 117 行（以 ``- 元素确实需要故意偏离网格`` 开头的整条要点）整条替换为：

```markdown
- 元素确实需要故意偏离网格（出血图、贴边色块、跨格大标题）时，在该元素或其祖先上加 `data-id-grid-ignore`，跳过它的对齐校验。它不影响后面的保真门禁，但**不是给卡片内容用的**——块内内容本来就不校验，整包给段落贴豁免只会让 lint 结果里的 `gridIgnoredCount`（被豁免的元素数，遥测同名上报）变得难看，人会据此要求返工。报 `GRID_ALIGNMENT_OFF` 时先分清三种情况：网格声明本身（`data-id-grid`、gutter）跟 CSS 布局对不上——改声明；块没坐在格线上——按 `edgeOffsets` 挪块；块本来就该越线——豁免。
```

- [ ] **Step 4: 改 Skill `failure-handling.md`**

在文件末尾追加：

```markdown

## 目标 INDD 正在 InDesign 中打开

`html.build_indesign` 会在建文档前检查 `<outDir>/<outputBaseName>.indd` 是否已在 InDesign 里打开。是本工具上一轮产物且未被修改，会自动关闭并继续（结果 `warnings` 里有 `PREVIOUS_OUTPUT_CLOSED`）；否则立即返回 `OUTPUT_TARGET_OPEN`（`retryable: true`）。处理：让用户在 InDesign 里关闭该文档，或改用别的 `outputBaseName`，然后重跑同一命令。不要删文件、不要改 outDir 绕过。

## 上报工具本身的问题

遇到下面任一情况，用 `feedback report` 把摩擦记进共享遥测，不要只在对话里抱怨：`error.category` 为 `runtime_error` 且 `details` 看不出原因；文档说不清某个参数或错误码；明显缺一个本该有的工具或参数。

```powershell
indesign-cli feedback report --code <TOOL_GAP|DOC_UNCLEAR|ERROR_MESSAGE_USELESS|SCHEMA_CONFUSING|UNEXPECTED_BEHAVIOR> --note "<一句话摩擦摘要>" --tool <相关工具 id，可省略>
```

`--note` 最多 500 字，不得包含客户名称、文档内容或文件路径。上报不会改变当前任务的结果，只是让维护者下次能修。
```

- [ ] **Step 5: 改 html-indesign 权威指南**

`AGENT_HTML_AUTHORING_GUIDE.md` 把第 180 行整段（以 ``网格对齐校验（`GRID_ALIGNMENT_OFF`）逐边核对`` 开头）替换为：

```markdown
网格对齐校验（`GRID_ALIGNMENT_OFF`）只量承担网格放置的块：带 `--grid-col`/`--grid-row`、`grid-item` 类名或显式 `grid-column`/`grid-row` 的元素，以及直接放在页面上的元素。**承担网格放置的块负责对齐，块内的内容不参与网格校验**——卡片有内边距是设计本意，里面的段落不必压线。逐边核对时，文本元素未声明宽度（`width`/`min-width`/`grid-column`/`flex-basis`）也未声明网格跨度（`--grid-col`/`--grid-span`）时宽度由内容撑开，右边缘不参与校验；这与文本按内容增高、底边不参与校验是同一档豁免。每条 `GRID_ALIGNMENT_OFF` 带 `edgeOffsets`（每条边的偏移量与最近格线）和 `suggestedFix`；lint 结果顶层的 `gridIgnoredCount` / `gridOffCount` 记录豁免数与偏差数，同名进入遥测。
```

把第 318 行

```markdown
- `data-id-grid-ignore` 只能用于明确不参与主网格的对象，并且必须同时说明对象角色和定位契约。
```

替换为

```markdown
- `data-id-grid-ignore` 只能用于明确不参与主网格的对象（出血图、贴边色块、跨格标题），并且必须同时说明对象角色和定位契约。块内内容本来就不校验，不要给卡片里的段落贴豁免；`gridIgnoredCount` 会把整包豁免暴露出来。
```

- [ ] **Step 6: 跑测试确认通过**

```bash
cd /d/AI/mcp-indesign && python -m pytest agent-harness/cli_anything/indesign/tests/test_health_runtime.py -q 2>&1 | tail -3
```

```bash
cd /d/AI/html-indesign && node --test test/skills/html-indesign-authoring-skill.test.js test/indesign-cli-plugin/npm-package.test.js 2>&1 | grep -E "^# (pass|fail)"
```

预期：两边都 `fail 0`。

- [ ] **Step 7: 提交（两个仓库各一次）**

```bash
cd /d/AI/html-indesign && git add docs/规范/AGENT_HTML_AUTHORING_GUIDE.md && git commit -m "docs: 网格校验改为母元素负责对齐，说明 edgeOffsets 与豁免计数

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

```bash
cd /d/AI/mcp-indesign && git add skills/indesign-cli/references/html-authoring.md skills/indesign-cli/references/failure-handling.md agent-harness/cli_anything/indesign/tests/test_health_runtime.py && git commit -m "docs(skills): 网格母元素规则、OUTPUT_TARGET_OPEN 处置与 feedback report 入口

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## 批 6 · 收尾与发布

### Task 15: html-indesign 全量测试、版本 0.2.11、打包

**Files:**
- Modify: `D:\AI\html-indesign\package.json:3`、`D:\AI\html-indesign\src\indesign-cli-plugin\manifest.json:6`、`D:\AI\html-indesign\test\indesign-cli-plugin\npm-package.test.js:17`

- [ ] **Step 1: 全量测试（拉起 Edge，约 10-15 分钟）**

```bash
cd /d/AI/html-indesign && npm test 2>&1 | grep -E "^# (tests|pass|fail|skipped)"
```

预期：`# fail 0`，`# pass` 比任务 0 记下的基线多（本计划新增约 20 个测试）。有失败先修，不得跳过。

- [ ] **Step 2: 升版本**

三处 `0.2.10` 改成 `0.2.11`：

```bash
cd /d/AI/html-indesign && sed -i 's/"version": "0.2.10"/"version": "0.2.11"/' package.json src/indesign-cli-plugin/manifest.json && sed -i "s/assert.equal(pkg.version, '0.2.10');/assert.equal(pkg.version, '0.2.11');/" test/indesign-cli-plugin/npm-package.test.js && grep -rn "0\.2\.1[01]" package.json src/indesign-cli-plugin/manifest.json test/indesign-cli-plugin/npm-package.test.js
```

预期：三行都显示 `0.2.11`，没有 `0.2.10` 残留。（这三个文件是纯 ASCII JSON/JS，用 sed 安全；其余文档改动仍走 Edit 工具。）

```bash
cd /d/AI/html-indesign && node --test test/indesign-cli-plugin/npm-package.test.js 2>&1 | grep -E "^# (pass|fail)"
```

预期：`# fail 0`。

- [ ] **Step 3: 提交并打包**

```bash
cd /d/AI/html-indesign && git add package.json src/indesign-cli-plugin/manifest.json test/indesign-cli-plugin/npm-package.test.js && git commit -m "chore: bump html-indesign to 0.2.11

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && npm pack 2>&1 | tail -3 && ls -la sa-html-indesign-0.2.11.tgz
```

预期：仓库根目录出现 `sa-html-indesign-0.2.11.tgz`（与既有 0.2.4-0.2.8 的 tgz 并列，不提交进 git）。

### Task 16: 遥测聚合加 `plugin_metrics` 视角

**Files:**
- Modify: `D:\AI\mcp-indesign\scripts\feedback\aggregate.py`
- Create: `D:\AI\mcp-indesign\scripts\feedback\fixtures\sample\sessions\2026-07-07\origin-d__session-gated.jsonl`
- Regenerate: `D:\AI\mcp-indesign\scripts\feedback\fixtures\expected.json`
- Test: `D:\AI\mcp-indesign\scripts\feedback\test_aggregate.py`
- Modify: `D:\AI\mcp-indesign\docs\AI协作\反馈循环\README.md`（口径切换点）

背景：本期周报里"首轮保真失败率""draft 构建数""豁免数"全是手工算的；`plugin_metrics` 在 `ALLOWED_FIELDS` 里但聚合脚本完全没碰。draft 构建的遥测特征是只有 `verify_ms`、没有 `fidelity_gate_ms`。

- [ ] **Step 1: 写失败单测**

在 `test_aggregate.py` 末尾追加：

```python
def _build(*, metrics: dict[str, object], ok: bool = True) -> dict[str, object]:
    event = _call("html.build_indesign", ok=ok, error_code=None if ok else "FIDELITY_GATE_FAILED")
    event["plugin_metrics"] = metrics
    return event


def test_plugin_metrics_summary_separates_gated_and_draft_builds_and_totals_grid_counts() -> None:
    calls = [
        _build(metrics={"fidelity_gate_ms": 20, "fidelity_error_count": 2, "grid_ignored_count": 40, "grid_off_count": 3}, ok=False),
        _build(metrics={"fidelity_gate_ms": 18, "fidelity_error_count": 0, "grid_ignored_count": 40, "grid_off_count": 0}),
        _build(metrics={"verify_ms": 300, "grid_ignored_count": 7}),
        _call("html.authoring_lint", ok=False, error_code="AUTHORING_LINT_FAILED"),
    ]
    calls[-1]["plugin_metrics"] = {"grid_ignored_count": 5, "grid_off_count": 12}

    result = aggregate_module.plugin_metrics_summary(calls)

    assert result == {
        "build_calls": 3,
        "gated_builds": 2,
        "gated_builds_fidelity_failed": 1,
        "gated_fidelity_failure_rate": 0.5,
        "draft_builds": 1,
        "grid_ignored_count": {"calls": 4, "sum": 92, "max": 40},
        "grid_off_count": {"calls": 3, "sum": 15, "max": 12},
    }


def test_plugin_metrics_summary_is_all_zero_without_metrics() -> None:
    result = aggregate_module.plugin_metrics_summary([_call("export.verify")])

    assert result["build_calls"] == 0
    assert result["gated_fidelity_failure_rate"] == 0.0
    assert result["grid_ignored_count"] == {"calls": 0, "sum": 0, "max": 0}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /d/AI/mcp-indesign && python -m pytest scripts/feedback/test_aggregate.py -q 2>&1 | tail -3
```

预期：2 failed（`AttributeError: plugin_metrics_summary`）。

- [ ] **Step 3: 实现 aggregate.py**

在 `def feedback_by_code(...)` 之前插入：

```python
def _plugin_metrics(call: dict[str, Any]) -> dict[str, Any]:
    metrics = call.get("plugin_metrics")
    return metrics if isinstance(metrics, dict) else {}


def _metric_stat(calls: list[dict[str, Any]], key: str) -> dict[str, int]:
    values = [int(_plugin_metrics(call)[key]) for call in calls if isinstance(_plugin_metrics(call).get(key), (int, float))]
    return {"calls": len(values), "sum": sum(values), "max": max(values) if values else 0}


def plugin_metrics_summary(calls: list[dict[str, Any]]) -> dict[str, Any]:
    """插件自报的 metrics 视角：保真门禁是否运行、首轮是否被拦、网格豁免/偏差规模。

    draft 构建的特征是只有 verify_ms、没有 fidelity_gate_ms；没有 plugin_metrics 的事件不计入。
    """
    builds = [call for call in calls if call.get("tool_id") == "html.build_indesign"]
    gated = [call for call in builds if "fidelity_gate_ms" in _plugin_metrics(call)]
    draft = [call for call in builds if "fidelity_gate_ms" not in _plugin_metrics(call) and "verify_ms" in _plugin_metrics(call)]
    fidelity_failed = [call for call in gated if int(_plugin_metrics(call).get("fidelity_error_count") or 0) > 0]
    return {
        "build_calls": len(builds),
        "gated_builds": len(gated),
        "gated_builds_fidelity_failed": len(fidelity_failed),
        "gated_fidelity_failure_rate": rate(len(fidelity_failed), len(gated)),
        "draft_builds": len(draft),
        "grid_ignored_count": _metric_stat(calls, "grid_ignored_count"),
        "grid_off_count": _metric_stat(calls, "grid_off_count"),
    }
```

在 `aggregate()` 的 `"friction": {` 字典里，`"feedback_by_code": feedback_by_code(events),` 之后加一行：

```python
            "plugin_metrics": plugin_metrics_summary(calls),
```

- [ ] **Step 4: 新增 fixture 并重生成 golden**

新建 `scripts/feedback/fixtures/sample/sessions/2026-07-07/origin-d__session-gated.jsonl`（三行，每行一个事件）：

```json
{"ts":"2026-07-07T03:00:01+00:00","session_id":"session-gated","origin_key":"origin-d","cwd_hash":"cwd-d","cli_version":"0.5.11","event":"tool_call","tool_id":"html.authoring_lint","source":"plugin","ok":true,"duration_ms":4100,"arg_keys":["package","strict"],"plugin_metrics":{"lint_ms":2300,"error_count":0,"warning_count":0,"normalized_count":9,"grid_ignored_count":12,"grid_off_count":0}}
{"ts":"2026-07-07T03:01:10+00:00","session_id":"session-gated","origin_key":"origin-d","cwd_hash":"cwd-d","cli_version":"0.5.11","event":"tool_call","tool_id":"html.build_indesign","source":"plugin","ok":false,"error_code":"FIDELITY_GATE_FAILED","duration_ms":38000,"arg_keys":["mode","outDir","package"],"plugin_metrics":{"lint_ms":2400,"compile_ms":300,"indesign_build_ms":11000,"readback_ms":6000,"fidelity_gate_ms":20,"fidelity_error_count":2,"fidelity_warning_count":0,"grid_ignored_count":12,"grid_off_count":0}}
{"ts":"2026-07-07T03:03:00+00:00","session_id":"session-gated","origin_key":"origin-d","cwd_hash":"cwd-d","cli_version":"0.5.11","event":"tool_call","tool_id":"html.build_indesign","source":"plugin","ok":true,"duration_ms":41000,"arg_keys":["mode","outDir","package"],"plugin_metrics":{"lint_ms":2400,"compile_ms":300,"indesign_build_ms":11400,"readback_ms":6100,"fidelity_gate_ms":19,"fidelity_error_count":0,"fidelity_warning_count":1,"export_ms":3600,"grid_ignored_count":12,"grid_off_count":0,"artifacts":9}}
```

重生成 golden 并核对 diff 只多了 `plugin_metrics` 与新 session 带来的计数变化：

```bash
cd /d/AI/mcp-indesign && python scripts/feedback/aggregate.py --input scripts/feedback/fixtures/sample --output scripts/feedback/fixtures/expected.json && git diff --stat scripts/feedback/fixtures/expected.json && git diff scripts/feedback/fixtures/expected.json | grep "^[-+]" | grep -v "^[-+][-+]" | head -40
```

预期：diff 里新增 `"plugin_metrics": {...}` 块（`build_calls: 2, gated_builds: 2, gated_builds_fidelity_failed: 1, gated_fidelity_failure_rate: 0.5, draft_builds: 0, grid_ignored_count: {calls: 3, sum: 36, max: 12}, grid_off_count: {calls: 3, sum: 0, max: 0}`），以及 totals/by_cli_version/origin_distribution/cwd_distribution/error_code_by_tool/retry_rate_by_tool 因新 session 增加的计数（sessions +1、tool_calls +3、errors +1、`0.5.11` 版本新增、origin-d/cwd-d 新增、`FIDELITY_GATE_FAILED × html.build_indesign` +1、`html.build_indesign` 的 failures/retries 各 +1）。没有其他变化。

```bash
cd /d/AI/mcp-indesign && python scripts/feedback/aggregate.py --input scripts/feedback/fixtures/sample --check-golden scripts/feedback/fixtures/expected.json
```

预期：`golden ok`。

- [ ] **Step 5: 跑测试确认通过**

```bash
cd /d/AI/mcp-indesign && python -m pytest scripts/feedback/test_aggregate.py -q 2>&1 | tail -3
```

预期：全部 passed。

- [ ] **Step 6: 记录口径**

`docs/AI协作/反馈循环/README.md` 的"## 指标口径切换点"一节末尾追加一条：

```markdown
- 2026-09（indesign-cli 0.5.12 / html-indesign 0.2.11 起）：lint 与 build 的 `plugin_metrics` 新增 `grid_ignored_count`（带 `data-id-grid-ignore` 的可映射元素数）与 `grid_off_count`（被报出的偏差元素数）；`GRID_ALIGNMENT_OFF` 改为只量承担网格放置的块，块内内容不计，跨版本比较该错误数时注意。聚合结果 `friction.plugin_metrics` 从本期起给出 gated/draft 构建数与首轮保真失败率。
```

- [ ] **Step 7: 提交**

```bash
cd /d/AI/mcp-indesign && git add scripts/feedback/aggregate.py scripts/feedback/test_aggregate.py scripts/feedback/fixtures/expected.json "scripts/feedback/fixtures/sample/sessions/2026-07-07/origin-d__session-gated.jsonl" "docs/AI协作/反馈循环/README.md" && git commit -m "feat(feedback): 聚合 plugin_metrics——gated/draft 构建、首轮保真失败率、网格豁免与偏差

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 17: runtime 0.5.12 版本、构建、发布（发布步骤需作者确认）

**Files:**
- Modify: `D:\AI\mcp-indesign\agent-harness\cli_anything\indesign\__init__.py:1`、`agent-harness\setup.py:6`、`pyproject.toml:7`、`package.json:3`、`package-lock.json`、`agent-harness\cli_anything\indesign\tests\test_package_metadata.py:30`

背景：同事工位的 launcher 只认 NAS 上的 `runtime-latest.json`；只发 Skill 文档不会更新 `html.authoring_lint` 等工具。发布链路四个目标各自独立（NAS、PyPI、GitHub Release、Skill 池）。**Step 4 起是对外发布，每一步的正式命令都要先给作者看空跑结果、得到确认再执行。**

- [ ] **Step 1: 升版本并跑全量单测**

```bash
cd /d/AI/mcp-indesign && npm version 0.5.12 --no-git-tag-version && sed -i 's/__version__ = "0.5.11"/__version__ = "0.5.12"/' agent-harness/cli_anything/indesign/__init__.py && sed -i 's/version="0.5.11"/version="0.5.12"/' agent-harness/setup.py && sed -i 's/^version = "0.5.11"/version = "0.5.12"/' pyproject.toml && sed -i 's/assert __version__ == "0.5.11"/assert __version__ == "0.5.12"/' agent-harness/cli_anything/indesign/tests/test_package_metadata.py && grep -rn "0\.5\.1[12]" agent-harness/cli_anything/indesign/__init__.py agent-harness/setup.py pyproject.toml package.json agent-harness/cli_anything/indesign/tests/test_package_metadata.py
```

预期：五个文件都显示 `0.5.12`，没有 `0.5.11` 残留。

```bash
cd /d/AI/mcp-indesign && python -m pytest agent-harness/cli_anything/indesign/tests scripts/feedback -q 2>&1 | tail -3
```

预期：全部 passed（skipped 数与基线一致）。

```bash
cd /d/AI/mcp-indesign && git add package.json package-lock.json pyproject.toml agent-harness/setup.py agent-harness/cli_anything/indesign/__init__.py agent-harness/cli_anything/indesign/tests/test_package_metadata.py && git commit -m "chore: bump indesign-cli to 0.5.12

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 2: 准备构建输入（PowerShell 工具，不用 git-bash）**

便携 node 与含 winax 的 node_modules 只在上一次构建的 stage 目录里，builder 会先删掉自己的 stage，所以必须先复制出来（见记忆 `runtime-build-inputs`）：

```powershell
Set-Location D:\AI\mcp-indesign
$prev = Get-ChildItem .build -Directory | Where-Object { $_.Name -like 'agent-runtime-0.5.*' } | Sort-Object Name | Select-Object -Last 1
"上次 stage: $($prev.FullName)"
Test-Path (Join-Path $prev.FullName 'runtime\node\node.exe')
Test-Path (Join-Path $prev.FullName 'runtime\server\node_modules\winax')
New-Item -ItemType Directory -Force .build\release-inputs | Out-Null
Remove-Item -Recurse -Force .build\release-inputs\node, .build\release-inputs\node_modules -ErrorAction SilentlyContinue
Copy-Item -Recurse (Join-Path $prev.FullName 'runtime\node') .build\release-inputs\node
Copy-Item -Recurse (Join-Path $prev.FullName 'runtime\server\node_modules') .build\release-inputs\node_modules
Test-Path .build\release-inputs\node\node.exe; Test-Path .build\release-inputs\node_modules\winax
```

预期：四个 `Test-Path` 都是 `True`。若 `.build` 下没有任何 `agent-runtime-0.5.*`，停下来报告（需要从 NAS `releases/0.5.11/` 的 ZIP 解压取输入，那是另一条路，不在本计划里猜）。

- [ ] **Step 3: 构建（PowerShell；先 dry-run 再正式）**

```powershell
Set-Location D:\AI\mcp-indesign
python scripts\build_agent_bootstrapper.py `
  --node-root .build\release-inputs\node `
  --node-modules .build\release-inputs\node_modules `
  --html-plugin-tgz D:\AI\html-indesign\sa-html-indesign-0.2.11.tgz `
  --version 0.5.12 `
  --nas-url "\\daga-nas5\sa-ai-app\tools\indesign-cli\runtime-windows-x64-0.5.12.zip" `
  --github-url "https://github.com/zhanglongxiao111/indesign-cli/releases/download/v0.5.12/runtime-windows-x64-0.5.12.zip" `
  --stage .build\agent-runtime-0.5.12 `
  --output-dir dist-agent `
  --dry-run
```

预期：打印三段 PyInstaller 命令、无报错。去掉 `--dry-run` 再跑一次正式构建（约 10 分钟）。构建后核对 manifest 里的 UNC 没被吃掉反斜杠：

```powershell
python -c "import json;d=json.load(open(r'dist-agent\runtime-latest.json',encoding='utf-8'));print(repr(d['artifact']['url']));print(d['components'])"
```

预期：`'\\\\daga-nas5\\sa-ai-app\\tools\\indesign-cli\\runtime-windows-x64-0.5.12.zip'`，`components` 里 `html_indesign` 为 `0.2.11`、`indesign_cli` 为 `0.5.12`。

- [ ] **Step 4: 本机验收新 runtime（发布前）**

```powershell
Set-Location D:\AI\mcp-indesign
& .\dist-agent\indesign-cli-agent.exe --version
```

若 Setup/launcher 的本机安装验证流程在 `README.md`"发行构建"一节有更具体的命令，以 README 为准。至少确认 `indesign-cli plugin list --json` 显示 `html-indesign 0.2.11`、`indesign-cli tool schema html.authoring_lint --json` 的 `gridTolerance` 描述含"块内内容不检查"。

- [ ] **Step 5: 发布 NAS（先空跑，把结果给作者确认后再正式）**

```powershell
Set-Location D:\AI\mcp-indesign
python scripts\publish_agent_runtime.py --release-dir .\dist-agent --dry-run
```

**停：把空跑输出（版本、组件、SHA-256、归档路径）交给作者确认。** 确认后：

```powershell
python scripts\publish_agent_runtime.py --release-dir .\dist-agent
```

预期：`ok: true`、`verify.sha256_match: true`、`verify.archive_exists: true`。

- [ ] **Step 6: 发布 Skill（先空跑，确认后正式）**

```powershell
python "$env:USERPROFILE\.codex\skills\sa-aiapp-publish-skill\scripts\publish_gallery_skill.py" --source D:\AI\mcp-indesign\skills\indesign-cli --dry-run
```

**停：交给作者确认。** 确认后去掉 `--dry-run`。预期：`ok: true`、`verify.published_rows: 1`、`verify.skill_md_match: true`。

- [ ] **Step 7: GitHub Release 与 PyPI**

这两项由作者按既有习惯执行（`gh release create v0.5.12 ...` 上传 `dist-agent` 里的 ZIP/Setup；`twine upload`），不在本计划自动化。完成后把两个仓库的分支合回 `main`/`master`。

- [ ] **Step 8: 发布后复核入口**

下期周报按 `cli_version=0.5.12` 切片：`FORWARD_TABLE_CHANGED` 归零、`INDESIGN_EXPORT_FAILED` 全部带可读 cause 或被 `OUTPUT_TARGET_OPEN` 替代、`friction.plugin_metrics.grid_ignored_count` 分布、首轮 `gated_fidelity_failure_rate` 对比本期 5/11。簇状态写回 `docs/AI协作/反馈循环/摩擦簇_FC-20260904-0N.md`。

---

## 自检：设计文档覆盖

| 设计条目 | 任务 |
| --- | --- |
| A1 构建设置表头行 | 1 |
| A2 内建样式与零散 th 比对口径 | 2 |
| A3 单元格空白折叠 | 2 |
| A4 表格差异维度进文案 | 2, 3 |
| B1 构建前预检目标 INDD | 5 |
| B2-1 JSX 顶层 code/message；B2-2 插件解析兜底 | 4 |
| B2-3 CLI 通用层 | 不做（待决策） |
| B3 只列本轮产物 | 6 |
| C1 条目带偏移量与 suggestedFix | 8 |
| C2 豁免/偏差计数进结果与 metrics | 8, 9, 16 |
| C3 母元素负责对齐（推荐修订） | 7, 8 |
| C4 Skill 网格文档 | 14 |
| D-1 SEMANTIC_TOKEN_UNKNOWN 候选 | 11 |
| D-2 AUTHOR_PAGE_SECTION_INVALID 细节 | 12 |
| D-3 AUTHOR_STYLE_BUCKET_MISSING 不阻断 | 12 |
| D-4 overset reason/hint | 3 |
| D-5 failure-handling 加 feedback 入口 | 14 |
| D-6 draft 文件名后缀 | 不做（待决策） |
| §8 发布顺序 | 15, 17 |
| 聚合脚本 plugin_metrics | 16 |
| 首条 lint 消息给具体修法（用户补充要求） | 10 |

## 风险与回退

- 任务 8 会改变 `test/fixtures/authoring-lint/grid-alignment-package` 的基准数字；只允许在核实"减少的都是块内元素"后更新基准。
- 任务 13 是唯一依赖真实 InDesign 的任务；真机失败时优先怀疑任务 1/2，不改 fixture 迁就。
- 任务 17 Step 5 之后不可回退：launcher 会自动升级并删旧 runtime。发布前必须完成 Step 4 的本机验收。

