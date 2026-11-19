# InDesign 写入链路提速实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一次性落地 [2026-11-19-indesign-write-speedup-design.md](../specs/2026-11-19-indesign-write-speedup-design.md) 中的全部低风险高收益优化，显著缩短 InDesign 写入与刷新耗时，同时严格保持无常驻进程、排版保真零降级与两仓边界清晰。

**Architecture:** 改动覆盖 `D:\AI\html-indesign`（Task 1–4：无窗口禁重绘写入、回读快照改 `textStyleRanges` 单遍缓存、溢出二分与样式缓存、Playwright `load` 等待与组装去重）与 `d:\AI\mcp-indesign`（Task 5–8：`scriptExecutor.js` 禁重绘/ProgID 缓存、CLI 砍冗余 Node 冷启动、batch 复用 MCP 子进程、NAS 清单 TTL / 非阻塞遥测 / UNC 会话直写），全部为各自模块内的局部优化，不改对外 CLI/MCP 契约。

**Tech Stack:** Node.js 22 + `node --test`（`html-indesign`）；Node.js + Python 3.10 + `pytest`（`mcp-indesign`）；Adobe InDesign ExtendScript（ES3 `.jsxinc`）。

---

## 涉及文件总览

| 仓库 | 文件 | 核心改动 | 任务 |
| --- | --- | --- | --- |
| html | `src/indesign-cli-plugin/host-jsx.js`、`_indesign_scripts/lib/hi_document.jsxinc`、`_indesign_scripts/lib/hi_executor.jsxinc` | `documents.add(false)` 无窗口、`enableRedraw=false` + `preflightOff` + `FAST_ENTIRE_SCRIPT`、`marker` 定位文档 | Task 1 |
| html | `_indesign_scripts/lib/hi_reverse.jsxinc`、`hi_reverse_text.jsxinc`、`hi_reverse_tables.jsxinc`、`hi_reverse_styles.jsxinc` | `textStyleRanges` 替代逐字符、`reversePage` 按 `item.id` 单遍缓存、`skipPreviews: true` | Task 2 |
| html | `_indesign_scripts/lib/hi_text_fit.jsxinc`、`hi_items.jsxinc`、`hi_tables.jsxinc`、`hi_styles.jsxinc`、`hi_core.jsxinc`、`hi_parent_pages.jsxinc`、`hi_composite_fonts.jsxinc`、`tools/build-indesign.js` | 二分溢出试探、跳过冗余 `applyZIndex`、样式/色板/母版缓存、合并 `build+snapshot` 与 `.jsxinc` 预打包 | Task 3 |
| html | `src/adapters/html/reader/browser-snapshot.js`、`browser-snapshot-capture.js`、`browser-style-capture.js`、`browser-element-capture.js`、`scan-data-id-fields.js`、`src/authoring/entry-writer.js`、`reveal-presentation.js` | 本地 `load` 替代 `networkidle`、脚本合并注入、DOM 采集去重、复用内存与跳过未变 Reveal 拷贝 | Task 4 |
| mcp | `src/core/scriptExecutor.js`、`src/tools/text/tables.js`、`src/tools/template/population.js`、`src/tools/presentation/slides.js` | `disableRedraw`/`fastUndo` 选项、单正则 JSON 转义、ProgID 本地记忆、`populate_table` 批量写 | Task 5 |
| mcp | `agent-harness/cli_anything/indesign/indesign_cli.py`、`core/router.py`、`core/plugins/discovery.py` | `router.schema()` 走内存缓存、`script run`/内置工具跳过插件握手、插件目录元数据缓存 | Task 6 |
| mcp | `agent-harness/cli_anything/indesign/core/mcp_backend.py`、`core/batch.py`、`core/plugins/host_actions.py` | `McpBackend` 上下文管理器，在 `run_batch` 与多条 `script.run` 内复用同一 Node 进程 | Task 7 |
| mcp | `agent-harness/cli_anything/indesign/core/runtime_install.py`、`core/telemetry.py`、`core/session.py`、`core/paths.py`、`skills/indesign-cli/scripts/prepare-author-package.ps1` | Bootstrapper 4h TTL、遥测去重+本地 spool 非阻塞、UNC 跳过 170ms 退避、`allow_roots` 缓存、PS1 直读 `current-runtime.json` | Task 8 |

---

### Task 0: 双仓建分支并确认测试基线

**Files:** 无代码改动。

- [ ] **Step 1: 在两个仓库切出同名优化分支**

```powershell
git -C D:\AI\html-indesign status --short; git -C D:\AI\html-indesign checkout -b perf/indesign-write-speedup
git -C d:\AI\mcp-indesign status --short; git -C d:\AI\mcp-indesign checkout -b perf/indesign-write-speedup
```
Expected: 两仓均干净切换至 `perf/indesign-write-speedup`。

- [ ] **Step 2: 跑基线测试确认绿灯**

```powershell
node -C D:\AI\html-indesign --test test/indesign-executor/executor-script-static.test.js test/indesign-cli-plugin/host-jsx.test.js test/authoring/entry-writer.test.js
python -m pytest agent-harness\cli_anything\indesign\tests\test_catalog_router.py agent-harness\cli_anything\indesign\tests\test_health_runtime.py -q
```
Expected: 全部通过，记录基线用例数。

---

### Task 1 (`html-indesign`): 无窗口后台构建 + 禁重绘 + 合并撤销栈

**Files:**
- Modify: `D:\AI\html-indesign\src\indesign-cli-plugin\host-jsx.js`
- Modify: `D:\AI\html-indesign\_indesign_scripts\lib\hi_document.jsxinc`
- Modify: `D:\AI\html-indesign\_indesign_scripts\lib\hi_executor.jsxinc`
- Test: `D:\AI\html-indesign\test\indesign-cli-plugin\host-jsx.test.js`、`D:\AI\html-indesign\test\indesign-executor\executor-script-static.test.js`

- [ ] **Step 1: 先补静态契约测试**
在 `host-jsx.test.js` 和 `executor-script-static.test.js` 断言：
- 生成的 build 脚本使用 `app.documents.add(false)`；
- `hi_executor.jsxinc` 保存并设置 `app.scriptPreferences.enableRedraw = false`、`doc.preflightOptions.preflightOff = true`、`doc.textPreferences.smartTextReflow = false`，且在 `finally` 恢复；
- `hi_executor.jsxinc` 使用 `UndoModes.FAST_ENTIRE_SCRIPT`；
- 后续 `snapshot` / `export` / `cleanup` 脚本通过 `html_indesign_e2e_marker` 查找目标文档而非假设 `activeDocument`。

- [ ] **Step 2: 跑定向测试确认失败**
Run: `pwsh -NoProfile -Command "cd D:\AI\html-indesign; node --test test/indesign-cli-plugin/host-jsx.test.js test/indesign-executor/executor-script-static.test.js"`
Expected: 新断言 FAIL。

- [ ] **Step 3: 实现无窗口构建与 `try/finally` 状态保护**
1. `hi_document.jsxinc`：`app.documents.add()` → `app.documents.add(false)`；
2. `hi_executor.jsxinc`：`HI.runBuildInstructions` 外层包裹：
```javascript
var __prevRedraw = app.scriptPreferences.enableRedraw;
var __prevPreflight = doc.preflightOptions.preflightOff;
var __prevReflow = doc.textPreferences.smartTextReflow;
try {
  app.scriptPreferences.enableRedraw = false;
  doc.preflightOptions.preflightOff = true;
  doc.textPreferences.smartTextReflow = false;
  app.doScript(function () {
    /* 原建页主体 */
  }, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.FAST_ENTIRE_SCRIPT, "html-indesign build");
} finally {
  try { doc.preflightOptions.preflightOff = __prevPreflight; } catch (_) {}
  try { doc.textPreferences.smartTextReflow = __prevReflow; } catch (_) {}
  try { app.scriptPreferences.enableRedraw = __prevRedraw; } catch (_) {}
}
```
3. `host-jsx.js`：`findMarkedDocument(marker)` 遍历 `app.documents` 匹配 `extractLabel('html_indesign_e2e_marker')`，确保无窗口文档在后续阶段可精确定位并在失败时可靠清理。

- [ ] **Step 4: 跑定向测试并提交**
Run: `pwsh -NoProfile -Command "cd D:\AI\html-indesign; node --test test/indesign-cli-plugin/host-jsx.test.js test/indesign-executor/executor-script-static.test.js"`
Expected: PASS。提交 `perf(jsx): 后台无窗口构建并禁用写入期重绘/预检与合并撤销栈`。

---

### Task 2 (`html-indesign`): 回读快照改 `textStyleRanges` + 单遍缓存 + 跳过无用 PNG

**Files:**
- Modify: `D:\AI\html-indesign\_indesign_scripts\lib\hi_reverse.jsxinc`
- Modify: `D:\AI\html-indesign\_indesign_scripts\lib\hi_reverse_text.jsxinc`
- Modify: `D:\AI\html-indesign\_indesign_scripts\lib\hi_reverse_tables.jsxinc`
- Modify: `D:\AI\html-indesign\_indesign_scripts\lib\hi_reverse_styles.jsxinc`
- Modify: `D:\AI\html-indesign\src\indesign-cli-plugin\host-jsx.js`
- Test: `D:\AI\html-indesign\test\indesign-executor\reverse-styles-node.test.js`、`D:\AI\html-indesign\test\indesign-to-html\reverse-snapshot-structure.test.js`

- [ ] **Step 1: 补充节点沙盒等价性测试**
在 `reverse-styles-node.test.js` 新增 mock DOM 用例：
- 同一故事含 3 段不同样式 `textStyleRanges`（对应多字符）时，`reverseTextRuns` / `reverseTableCellRuns` 输出与逐字符口径完全一致；
- `reversePage` 仅对每个 `item.id` 序列化 1 次（校验计数），`items` 与 `auditItems` 结果不变；
- `options.skipPreviews = true` 时不调用 `exportFile`。

- [ ] **Step 2: 跑定向测试确认失败**
Run: `pwsh -NoProfile -Command "cd D:\AI\html-indesign; node --test test/indesign-executor/reverse-styles-node.test.js test/indesign-to-html/reverse-snapshot-structure.test.js"`
Expected: 新断言 FAIL。

- [ ] **Step 3: 改造回读引擎**
1. `hi_reverse_text.jsxinc` / `hi_reverse_tables.jsxinc`：遍历 `textStyleRanges`（带不可用时回退 `characters` 的防线），保留相同属性签名与相邻合并逻辑；
2. `hi_reverse.jsxinc`：`reversePage` 先扫描 `page.allPageItems` 建立 `cache[item.id]`，再组装顶层 `items` 与展平 `auditItems`；将已读 `textStyle`/`frameStyle` 透传给 `reverseInlineStyle` 避免二次读；支持 `options.skipPreviews === true` 跳过 `exportPlacedAssetPreview`；
3. `host-jsx.js`：正向 `buildSnapshotJsx` 固定传入 `skipPreviews: true`（反向导出工具保持默认 `false`）。

- [ ] **Step 4: 跑测试并提交**
Run: `pwsh -NoProfile -Command "cd D:\AI\html-indesign; node --test test/indesign-executor/reverse-styles-node.test.js test/indesign-to-html/reverse-snapshot-structure.test.js test/indesign-cli-plugin/host-jsx.test.js"`
Expected: PASS。提交 `perf(reverse): 回读改用 textStyleRanges 与单遍缓存并跳过正向 PNG 预览`。

---

### Task 3 (`html-indesign`): 写入期算法优化 + 合并 `build+snapshot` 与 `.jsxinc` 预打包

**Files:**
- Modify: `D:\AI\html-indesign\_indesign_scripts\lib\hi_text_fit.jsxinc`
- Modify: `D:\AI\html-indesign\_indesign_scripts\lib\hi_items.jsxinc`
- Modify: `D:\AI\html-indesign\_indesign_scripts\lib\hi_tables.jsxinc`、`hi_styles.jsxinc`、`hi_core.jsxinc`、`hi_parent_pages.jsxinc`、`hi_composite_fonts.jsxinc`
- Modify: `D:\AI\html-indesign\src\indesign-cli-plugin\tools\build-indesign.js`、`src\indesign-cli-plugin\host-jsx.js`
- Test: `D:\AI\html-indesign\test\indesign-executor\executor-script-static.test.js`、`D:\AI\html-indesign\test\indesign-cli-plugin\host-jsx.test.js`

- [ ] **Step 1: 写行为与静态测试**
- 沙盒测试 `applyTextFitWidthFirst` / `applyTextFitNudge`：在最大扩展 8mm 场景下，迭代次数 ≤ 8 次（替代原 272 次）且仍收敛到最小无溢出 `0.5mm` 步长；
- 断言 `build-indesign.js` 在 `final` 模式合并 `build + snapshot` 为 1 次 `script.run`（`draft` 合并 `build + export`）。

- [ ] **Step 2: 实施优化**
1. `hi_text_fit.jsxinc`：将线性双重循环改为「先检最大上界 → 二分搜索最小可行增量（0.5mm 精度）」；
2. `hi_items.jsxinc`：同层已按 `zIndex` 升序创建时跳过冗余 `HI.applyZIndex`（仅在存在跨层/母版穿插项时触发）；移除 `createGraphicFrame` 在 `place` 前重复的第一次 `applyStyleOverride`；
3. `hi_core.jsxinc` / `hi_styles.jsxinc` / `hi_tables.jsxinc` / `hi_parent_pages.jsxinc`：在 `context.styleContext` 中缓存色板/段落样式/字符样式/对象样式与 `noneSwatch`，构建母版 `labelId -> item` 索引，合并单元格多属性为 `cell.properties = { ... }`；
4. `hi_composite_fonts.jsxinc`：复用 `HI.installedFontIndex` 消除二次枚举系统字体；
5. `build-indesign.js` & `host-jsx.js`：合并 `build + fidelity-snapshot` 到单次 `script.run`（同进程写完即采快照），并将 `.jsxinc` 库拼为单次加载脚本消除 25 次磁盘 `$.evalFile`。

- [ ] **Step 3: 跑测试并提交**
Run: `pwsh -NoProfile -Command "cd D:\AI\html-indesign; node --test test/indesign-executor/executor-script-static.test.js test/indesign-cli-plugin/host-jsx.test.js"`
Expected: PASS。提交 `perf(build): 二分溢出试探、缓存样式查表并合并构建与快照脚本`。

---

### Task 4 (`html-indesign`): Playwright 采集与入口组装瘦身

**Files:**
- Modify: `D:\AI\html-indesign\src\adapters\html\reader\browser-snapshot.js`
- Modify: `D:\AI\html-indesign\src\adapters\html\reader\browser-snapshot-capture.js`、`browser-style-capture.js`、`browser-element-capture.js`
- Modify: `D:\AI\html-indesign\src\protocol\scanners\scan-data-id-fields.js`
- Modify: `D:\AI\html-indesign\src\authoring\entry-writer.js`、`reveal-presentation.js`
- Test: `D:\AI\html-indesign\test\html-to-indesign\browser-snapshot.test.js`、`D:\AI\html-indesign\test\authoring\entry-writer.test.js`

- [ ] **Step 1: 补充单测断言**
- `entry-writer.test.js`：二次组装无内容变更时跳过重写 `deck.html` 且不重拷未变更的 `vendor/reveal/*`；
- `browser-snapshot.test.js`：本地 `file://` 页面采集结果与之前完全一致。

- [ ] **Step 2: 实施瘦身**
1. `browser-snapshot.js`：本地 `file://` 改为 `waitUntil: 'load'`（配合 `document.fonts.ready` + `waitForPageAssets`）；将 4 次 `page.addScriptTag` 合并为单次脚本注入；
2. `browser-snapshot-capture.js` / `browser-style-capture.js` / `browser-element-capture.js`：复用 `ruleStyle`，`frameEl === el` 跳过重复 `authoredStyleObject`，预构建属性名映射与 `styleRules` 分桶索引，`candidates` 查重改 `Set`/`Map`；
3. `scan-data-id-fields.js`：`lowerHtml = html.toLowerCase()` 提到函数顶部只算 1 次；
4. `entry-writer.js` / `reveal-presentation.js`：`writeRevealPresentation` 复用内存中的 `sourcePackage`；目标 Reveal 静态文件存在且字节数一致时跳过拷贝；目标入口 HTML 字节完全一致时跳过落盘。

- [ ] **Step 3: 跑测试并提交**
Run: `pwsh -NoProfile -Command "cd D:\AI\html-indesign; node --test test/html-to-indesign/browser-snapshot.test.js test/authoring/entry-writer.test.js"`
Expected: PASS。提交 `perf(authoring): 取消本地 file:// networkidle 等待并去重 DOM 采集与入口组装`。

---

### Task 5 (`mcp-indesign`): `scriptExecutor.js` 禁重绘选项 + ProgID 记忆 + `populate_table` 批量写

**Files:**
- Modify: `d:\AI\mcp-indesign\src\core\scriptExecutor.js`
- Modify: `d:\AI\mcp-indesign\src\core\runtime.js`
- Modify: `d:\AI\mcp-indesign\src\tools\text\tables.js`、`src\tools\template\population.js`、`src\tools\presentation\slides.js`
- Test: `d:\AI\mcp-indesign\tests\test-handler-contracts.js`、`d:\AI\mcp-indesign\tests\test-response-semantics.js`

- [ ] **Step 1: 补单测**
在 `tests/test-handler-contracts.js` 覆盖：
- `executeInDesignScript(script, { disableRedraw: true, fastUndo: true })` 生成的包装代码在 `try/finally` 中保存与恢复 `enableRedraw` 并包裹 `UndoModes.FAST_ENTIRE_SCRIPT`；
- `__mcpJsonEscapeString` 单正则实现与旧版对引号、反斜杠、控制字符、`\u2028`/`\u2029` 转义完全一致；
- `ProgID` 候选列表优先尊重 `INDESIGN_CLI_COM_PROGID` 与本地缓存的 `com-progid.json`，失败自动回退完整 14 项列表；
- `populate_table` 优先用 `table.contents` 批量赋值。

- [ ] **Step 2: 实现并跑测试**
Run: `node --check src/core/scriptExecutor.js; node tests/test-response-semantics.js; node tests/test-handler-contracts.js; node tests/architecture/registry.test.mjs`
Expected: 全部 PASS。提交 `perf(core): 支持脚本禁重绘与撤销合并、缓存 COM ProgID 并优化表格批量写入`。

---

### Task 6 (`mcp-indesign`): 砍掉 CLI 冗余 Node 进程冷启动

**Files:**
- Modify: `d:\AI\mcp-indesign\agent-harness\cli_anything\indesign\core\router.py`
- Modify: `d:\AI\mcp-indesign\agent-harness\cli_anything\indesign\indesign_cli.py`
- Modify: `d:\AI\mcp-indesign\agent-harness\cli_anything\indesign\core\plugins\discovery.py`
- Test: `d:\AI\mcp-indesign\agent-harness\cli_anything\indesign\tests\test_catalog_router.py`、`test_plugins.py`

- [ ] **Step 1: 写进程计数回归测试**
在 `test_catalog_router.py` 断言：
- `router.schema("document.open_document")` 直接命中 `Catalog` 内存缓存，**0 次**启动 `McpBackend`；
- `indesign-cli tool call document.get_document_info` 与 `indesign-cli script run a.jsx` **0 次**调用 `PluginBackend`（跳过插件 `handshake`/`list_tools`）；
- 连续两次调用插件工具 `html.authoring_lint` 时，第二次命中 `plugin-catalog-cache.json`（按 `manifest_mtime_ns` + `entry_mtime_ns` + `manifest_version` + `host_version` 失效），不再重跑 `handshake`/`list_tools`/`tools/schema`。

- [ ] **Step 2: 实施改动**
1. `router.py`：`Router.schema(tool_id)` 对 `classic`/`advanced` 直接读 `self.catalog.schema(tool_id)`；
2. `indesign_cli.py`：`script run` 不再调 `build_catalog_with_backends()`；`tool call`/`schema`/`explain` 先查内置 `Catalog`，未命中再按需加载插件；
3. 插件目录缓存落盘 `%LOCALAPPDATA%\indesign-cli\state\plugin-catalog-cache.json`；`plugin validate/doctor` 与 `server health` 显式绕过缓存。

- [ ] **Step 3: 跑测试并提交**
Run: `python -m pytest agent-harness\cli_anything\indesign\tests\test_catalog_router.py agent-harness\cli_anything\indesign\tests\test_plugins.py -q`
Expected: PASS。提交 `perf(cli): 复用内存 schema、按需加载插件并缓存插件目录元数据`。

---

### Task 7 (`mcp-indesign`): `run_batch` 与多条 `script.run` 内复用同一 MCP Node 子进程

**Files:**
- Modify: `d:\AI\mcp-indesign\agent-harness\cli_anything\indesign\core\mcp_backend.py`
- Modify: `d:\AI\mcp-indesign\agent-harness\cli_anything\indesign\core\router.py`
- Modify: `d:\AI\mcp-indesign\agent-harness\cli_anything\indesign\core\batch.py`
- Modify: `d:\AI\mcp-indesign\agent-harness\cli_anything\indesign\core\plugins\host_actions.py`
- Test: `d:\AI\mcp-indesign\agent-harness\cli_anything\indesign\tests\test_catalog_router.py`

- [ ] **Step 1: 写复用与异常回收单测**
- 3 步同源（`classic`）`run_batch` 仅调用 **1 次** `subprocess.Popen` 完成全部 3 步并在结束时终止子进程；
- 第 2 步超时或子进程意外退出时，立即回收进程并返回 `BATCH_STEP_FAILED` + `state_uncertain: true`，绝不自动重试；
- `HostActionExecutor` 连续执行 2 条 `script.run` 共用 1 个 `advanced` MCP 子进程，结束立即回收。

- [ ] **Step 2: 实现进程复用上下文**
1. `McpBackend` 增加 `open()` / `close()` 与 `__enter__` / `__exit__`：持久模式下只跑 1 次 `Popen` + `initialize` + `notifications/initialized`，后续 `call_tool` 直接复用该 stdio 管道；
2. `Router` 提供 `session()` 上下文按 `source` 懒缓存并管理 `McpBackend` 生命周期，`finally` 中统一 `close()`；
3. `run_batch()` 与 `HostActionExecutor.complete()` 外层套 `with router.session():`。

- [ ] **Step 3: 跑测试并提交**
Run: `python -m pytest agent-harness\cli_anything\indesign\tests\test_catalog_router.py agent-harness\cli_anything\indesign\tests\test_error_feedback_chain.py -q`
Expected: PASS。提交 `perf(cli): 在 batch 与插件宿主动作生命周期内复用 MCP 子进程`。

---

### Task 8 (`mcp-indesign`): 消除 NAS 同步阻塞与 `prepare-author-package.ps1` 冷启动

**Files:**
- Modify: `d:\AI\mcp-indesign\agent-harness\cli_anything\indesign\core\runtime_install.py`
- Modify: `d:\AI\mcp-indesign\agent-harness\cli_anything\indesign\core\telemetry.py`
- Modify: `d:\AI\mcp-indesign\agent-harness\cli_anything\indesign\core\batch.py`
- Modify: `d:\AI\mcp-indesign\agent-harness\cli_anything\indesign\core\session.py`
- Modify: `d:\AI\mcp-indesign\agent-harness\cli_anything\indesign\core\paths.py`
- Modify: `d:\AI\mcp-indesign\skills\indesign-cli\scripts\prepare-author-package.ps1`（同步外置真源 `D:\AI\SA_skillhub\操作InDesign\skill\indesign-cli\scripts\prepare-author-package.ps1` 时保持纯 ASCII）
- Test: `d:\AI\mcp-indesign\agent-harness\cli_anything\indesign\tests\test_runtime_install.py`、`test_catalog_router.py`、`test_paths_envelope.py`、`test_health_runtime.py`

- [ ] **Step 1: 补单测**
- `ensure_runtime_ready()` 在 4h TTL 内命中本地 `update-check.json` 时跳过拉取 `runtime-latest.json`（`INDESIGN_CLI_UPDATE_CHECK_TTL_SECONDS=0` 时实时拉取）；
- `record_event()` 不再二次调用 `_read_state()`；NAS 写入模拟挂起/异常时事件落入本地 `telemetry-spool.jsonl`（带 5MB 上限）且主调用 <100ms 返回；`run_batch()` 汇总刷盘而非每步同步直写 NAS；
- UNC 已有 `session.json` 直接走 `_session_lock` + `_overwrite_in_place`，不进入 170ms `time.sleep` 退避；
- `prepare-author-package.ps1` 保持纯 ASCII 且优先读 `current-runtime.json`。

- [ ] **Step 2: 实施改动并跑全套测试**
Run: `python -m pytest agent-harness\cli_anything\indesign\tests -q`
Expected: 全部 PASS（无新增失败或跳过异常）。提交 `perf(cli): 为更新检查加 TTL、遥测非阻塞化并跳过 UNC 会话退避休眠`。

---

### Task 9: 全量回归、真机基准对比与发版准备

**Files:** 无功能代码改动（按需更新版本号与测试基准）。

- [ ] **Step 1: 双仓全量自动化验证**
```powershell
pwsh -NoProfile -Command "cd D:\AI\html-indesign; npm test"
node src/core/artifact.js --check; node scripts/check_architecture.mjs; node tests/architecture/registry.test.mjs; node tests/test-handler-contracts.js
python -m pytest agent-harness\cli_anything\indesign\tests -q
```
Expected: 两仓自动化测试全绿。

- [ ] **Step 2: 真机 InDesign 前后对比验收**
选一份 10–20 页含文字、表格与图片的真实测试包，记录优化前（`main`/`master`）与优化后（`perf/indesign-write-speedup`）两轮数据：
1. `html.build_indesign` 分阶段耗时（`lint` / `compile` / `build+snapshot` / `export` / 总耗时）；
2. 20 步 `tool batch` 写入总耗时；
3. 核对生成的 PDF 与 `forward-fidelity-report.json` 结果与优化前 100% 一致，且 InDesign 无残留后台文档、重绘开关正常恢复。

- [ ] **Step 3: 提交 PR 与走内网发布（用户确认后执行）**
先合并 `@sa/html-indesign` 并升版打包，再合并 `mcp-indesign` 升版构建联合 runtime 并运行 `python scripts\publish_agent_runtime.py --release-dir <release-dir> --dry-run` 核验后发布。
