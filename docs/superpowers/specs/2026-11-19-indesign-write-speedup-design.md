# InDesign 写入链路提速设计（跨 `mcp-indesign` 与 `html-indesign`）

> 日期：2026-11-19  
> 状态：待用户复核（设计已口头对齐，尚未进入实施计划）  
> 负责范围：跨两仓统筹设计，各自严格守住仓库边界（`mcp-indesign` 只改宿主/CLI/COM/插件协议底座；`html-indesign` 只改作者包组装、Playwright 采集与 `_indesign_scripts/` 引擎）

---

## 1. 目标与成功标准

解决用户实际使用中的核心痛点：**文档资源并不大，但往 InDesign 写入页面与对象时非常慢，窗口肉眼逐框卡顿刷新。**

核心原则：

1. **先治最痛的慢，再清重复的杂活**：优先消除 InDesign 内部实时重绘、逐字符回读风暴与暴力重排，再砍 CLI 冗余进程冷启动，最后消除 NAS/SMB 同步等待与浏览器采集冗余。
2. **绝不引入常驻后台服务**：严守 `AGENTS.md` 第 2.5 节进程模型红线，不新增守护进程或长驻后台服务，只通过消除重复启动与单次命令/batch 内复用来提速。
3. **绝不降低排版保真度**：所有网格对齐、表格保真、文本溢出核对门禁口径保持 100% 不变；优化前后生成的 INDD/PDF 视觉结果与保真报告判定必须完全一致。
4. **后台静默建档，安全可靠收尾**：`html.build_indesign` 全程无窗口后台构建，不抢前台焦点；原生 CLI 写入工具保持当前文档窗口但在写入期间抑制重绘。任何中途失败都必须在 `finally` 中恢复 InDesign 全局状态并清理残留文档。

### 量化成功标准（前后同机同文档基准对照）

| 指标 | 基线问题 | 目标 |
| --- | --- | --- |
| `html.build_indesign`（10–20 页典型材料手册/演示稿）InDesign 构建 + 回读耗时 | 实时重绘 + 双遍逐字回读 + 暴力溢出试探，动辄数十秒至分钟级 | 写入与回读阶段合计提速 **3×–10×**，视觉与保真报告零差异 |
| 单次内置写入 `indesign-cli tool call <classic_tool>` 启动的 Node 进程数 | **4 个**（插件 handshake + list_tools + MCP schema + MCP call） | 降至 **1 个**（省 75% 冷启动） |
| `indesign-cli script run <file.jsx>` 启动的 Node 进程数 | **3 个**（插件 handshake + list_tools + MCP call） | 降至 **1 个** |
| 20 步 `indesign-cli tool batch` 的 Node 进程数与 NAS 遥测次数 | **20+ 个 Node 进程**、**~160 次同步 NAS I/O** | **1 个复用 MCP 进程**、**0 次阻塞主流程的同步 NAS 遥测** |
| NAS 任务目录执行单次写入 | 每次 `session.json` 撞 WinError 5 白睡 170ms + bootstrapper 无缓存查清单 + 遥测 ~8 次 SMB | 消除 170ms 固定休眠与每次重复拉清单，单次稳省 **1–3s+** |

---

## 2. 现状根因全景（2026-11-19 三路源码实测排查结论）

本设计基于三路并发源码排查与本机基准测量（单次 `McpBackend._with_process()` 空转耗时 **339–366ms**；`Catalog` 校验 195KB registry SHA-256 约 **47ms**；`require('winax')` 约 **13ms**）：

| 层级 | 所属仓 | 关键瓶颈 | 精确位置 |
| --- | --- | --- | --- |
| **L1：InDesign 内部写入与刷新** | `html-indesign` + `mcp-indesign` | 两仓零处关 `enableRedraw`、零处关 `preflightOff`、正向写入零处用 `UndoModes.FAST_ENTIRE_SCRIPT`；`build_indesign` 打开可见布局窗口 | `src/core/scriptExecutor.js:254-266`、`html-indesign/src/indesign-cli-plugin/host-jsx.js:86`、`_indesign_scripts/lib/hi_document.jsxinc:4`、`_indesign_scripts/lib/hi_executor.jsxinc:29-66` |
| **L1：InDesign 回读与排布算法** | `html-indesign` | `reversePage` 无缓存双遍扫描全页；`reverseTextRuns` / `reverseTableCellRuns` 逐字符读 ~15–20 个属性（5000 字×2 遍≈15–20 万 DOM 往返）；正向构建仍导出 2 遍无用 PNG 预览；`applyTextFitNudge` 0.5mm 暴力试探最多 272 次重排；`HI.applyZIndex` 在已排序创建后再做 `2N` 次图层重排；表格逐格重复 `itemByName` 查色板/样式 | `_indesign_scripts/lib/hi_reverse.jsxinc:127-128, 221-223, 668-708`、`hi_reverse_text.jsxinc:6-20`、`hi_reverse_tables.jsxinc:104-113`、`hi_text_fit.jsxinc:105-144`、`hi_items.jsxinc:4-6, 322-330`、`hi_tables.jsxinc:165-284` |
| **L2：CLI 进程冷启动与 COM 桥接** | `mcp-indesign` | `router.schema()` 无视 `Catalog` 内存缓存额外起 MCP 进程；每次 `tool *` 和 `script run` 强制跑插件 `handshake`+`list_tools`；`run_batch` 每步重起新 Node 进程使 `ScriptExecutor._winApp` 缓存命中率为 0%；14 个 ProgID 顺序盲试报错；`build_indesign` 拆 3 次独立 `script.run` + 25 次磁盘 `$.evalFile` | `indesign_cli.py:282-310, 451-470, 583`、`core/router.py:142-161, 212-218`、`core/mcp_backend.py:51-123`、`core/batch.py:73-93`、`src/core/scriptExecutor.js:115-171`、`html-indesign/src/indesign-cli-plugin/tools/build-indesign.js:239-341` |
| **L3：NAS/SMB 同步 I/O 与 Edge 采集** | `mcp-indesign` + `html-indesign` | Bootstrapper 每次无 TTL 同步读 NAS/GitHub 清单；遥测无超时同步多趟写 NAS（且 `record_event` 二次读盘、batch 每步均写）；NAS 上 `session.json` 每次触发 WinError 5 固定睡 170ms；Playwright 本地 `file://` 用 `networkidle` 白等 ≥500ms；元素样式采集每元素跑 3 遍全量规则匹配；入口组装重读两遍页面并无条件覆写 3 个 Reveal 静态文件 | `core/runtime_install.py:594-606`、`core/telemetry.py:149, 230-256`、`core/session.py:114-120`、`html-indesign/src/adapters/html/reader/browser-snapshot.js:14-53`、`browser-snapshot-capture.js:130-176`、`src/authoring/entry-writer.js:14-69`、`reveal-presentation.js:110-117` |

---

## 3. 非目标与架构红线

- **不引入常驻后台守护进程**：CLI 仍遵循按需执行、结束退出的单次命令生命周期。
- **不跨仓搬运代码**：`html-indesign` 的 JSX 引擎与 Playwright 采集改动只落在 `D:\AI\html-indesign`；`mcp-indesign` 只维护宿主执行底座、CLI 路由、COM 封装与插件协议。
- **不弱化任何质量门禁**：不默认把 `html.build_indesign` 的 `mode` 降级为 `draft`，不跳过正向保真核对或网格对齐检查；优化全部来自**等价算法升级与消除冗余重复工作**。
- **不改动现有对外 JSON envelope 契约与遥测白名单字段**：所有 CLI 输出结构、错误码语义、隐私脱敏和遥测字段白名单保持 100% 兼容。

---

## 4. 分期设计方案

整体拆分为 **3 个可独立规划、独立实施、独立验收的阶段**（Phase 1 → Phase 2 → Phase 3）。每个阶段对应各自仓库的独立实施计划与发版验证，互不强耦合阻塞。

---

### Phase 1（P0）：InDesign 写入引擎禁重绘 + 消除回读与排布风暴

> **主责仓**：`html-indesign`（主体），`mcp-indesign`（`scriptExecutor.js` 与 `populate_table` 配合）  
> **交付形态**：可独立完成并首先带来 **3×–10×** 体感提速。

#### 1.1 后台无窗口构建与统一刷新/撤销抑制

1. **`html-indesign` 无窗口构建（`host-jsx.js`、`hi_document.jsxinc`、`hi_executor.jsxinc`）**：
   - `buildBuildJsx` 与 `HI.createDocumentFromInstructions` 将 `app.documents.add()` 改为 `app.documents.add(false)`（无布局窗口后台建档），彻底消除视口绘制与抢焦点。
   - **文档定位契约**：后台无窗口文档不可依赖 `app.activeDocument`。同一轮后续阶段（`fidelity-snapshot`、`export`、`cleanup`）统一通过文档自定义标签 `html_indesign_e2e_marker` 遍历 `app.documents` 精确找回目标文档（该 marker 已存在，见 `host-jsx.js`），避免多文档环境下误操作用户正在编辑的前台文档。
   - **异常清理与状态恢复**：在 `HI.runBuildInstructions` 外层使用严格 `try / finally`：
     - 进入时记录并保存 `prevRedraw = app.scriptPreferences.enableRedraw`、`prevPreflight = doc.preflightOptions.preflightOff`、`prevReflow = doc.textPreferences.smartTextReflow`；
     - 设为 `enableRedraw = false`、`preflightOff = true`、`smartTextReflow = false`；
     - 用 `app.doScript(fn, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.FAST_ENTIRE_SCRIPT, "html-indesign build")` 包裹主体建页流程；
     - `finally` 中无条件恢复 `app.scriptPreferences.enableRedraw = prevRedraw`（以及在导出保存前按需恢复文档级 `preflightOff` / `smartTextReflow` 偏好，避免污染生成的 `.indd` 文件默认设置）。
   - **构建结束后行为**：导出 `.indd` / `.pdf` / `.idml` 后按现有 `closeDocument` 策略正常关闭后台文档（不主动弹出窗口抢焦点；用户或 Agent 需要查看时再用 `open_document` 打开成品）。

2. **`mcp-indesign` 通用脚本执行底座（`src/core/scriptExecutor.js`）与高频写入工具**：
   - 在 `ScriptExecutor.executeInDesignScript(script, options = {})` 新增可选配置 `{ disableRedraw = false, fastUndo = false, undoName = 'MCP Operation' }`：
     - `disableRedraw: true` 时在外层 `try/finally` 自动保存并恢复 `app.scriptPreferences.enableRedraw`；
     - `fastUndo: true` 时自动用 `UndoModes.FAST_ENTIRE_SCRIPT` 包裹执行（需注意：对 `open_document`、`close_document`、`create_document`、`export_*` 等非文档内容变更或文档生命周期操作不启用 `fastUndo`，仅对文档内批量写入工具启用）。
   - 对原生高频写入工具（如 `src/tools/template/population.js`、`src/tools/template/composition.js`、`src/tools/presentation/slides.js`、`src/tools/text/tables.js`）开启 `disableRedraw: true`；将 `src/tools/text/tables.js` 的 `populate_table` 从逐格写 `cell.contents` 改为按扁平数组一次性写入 `table.contents = [...]`（保留合并单元格兼容兜底）。
   - 顺手优化 `src/core/scriptExecutor.js:22-53` 的 ES3 `__mcpJsonEscapeString`：将逐字符拼接 `result += ch` 改为单正则 `.replace(/["\\\x00-\x1f\u2028\u2029]/g, ...)`，消除大 JSON 回传时的字符串拷贝开销。

#### 1.2 回读核对引擎瘦身（质量零降级，速度提 5×–10×）

针对 `html-indesign` `_indesign_scripts/lib/hi_reverse*.jsxinc`：

1. **逐字符 → 按样式段（`textStyleRanges`）读取**：
   - `reverseTextRuns`（`hi_reverse_text.jsxinc:6-20`）与 `reverseTableCellRuns`（`hi_reverse_tables.jsxinc:104-113`）改为遍历 `story.textStyleRanges` / `cell.textStyleRanges`。
   - **等价性保障**：在 InDesign DOM 中，同一 `textStyleRange` 内的所有字符共享完全一致的字符级格式属性（字体、字号、行距、填色、描边、字距、大小写、字符样式）。将相邻同样式 run 合并逻辑保留不变，单框读取次数从「字符数 N（数百次）」骤降为「样式切换段数 K（通常 1–5 次）」。
2. **全页双遍历 → 单遍按 `item.id` 缓存复用**：
   - `hi_reverse.jsxinc:127-128` 改造为先遍历 `page.allPageItems` 建立 `byId[item.id]` 序列化缓存，再分别组装顶层 `items` 与展平 `auditItems`，彻底消除每个顶层对象被完整回读 2 遍的浪费。
   - `hi_reverse.jsxinc:221-223` 将 `reverseTextStyle` / `reverseTextFrameStyle` 的结果传入 `reverseInlineStyle` 复用，不再重复读同一对象的样式属性。
3. **正向构建跳过无用 PNG 帧预览导出**：
   - `exportReverseSnapshot` 增加显式参数 `skipPreviews`（默认 `false` 保持反向导出原行为；正向 `html.build_indesign` 调用 `fidelity-snapshot.jsx` 时固定传 `skipPreviews: true`），跳过 `exportPlacedAssetPreview` 的双遍 144 DPI PNG 渲染。

#### 1.3 写入期算法与 DOM 查表优化

针对 `html-indesign` `_indesign_scripts/lib/`：

1. **文本溢出试探改二分搜索（`hi_text_fit.jsxinc:67-144`）**：
   - `applyTextFitWidthFirst` 与 `applyTextFitNudge` 取消 `0.5mm` 步长暴力双重循环（最多 272 次重排），改为先测上界是否可解，再在 `[0, maxDelta]` 上做二分搜索（精度 `0.5mm` 时最多仅需 **5–6 次** `geometricBounds` 调整与重排）。
2. **消除冗余 `2N` 次 Z-order 重排（`hi_items.jsxinc:4-6, 322-330`）**：
   - 同一图层内已按 `zIndex` 升序创建时，新创建对象天然位于顶层，默认跳过 `HI.applyZIndex` 的全页 `sendToBack()` + `bringToFront()`；仅当页面存在跨母版覆盖项或非递增插入时按需执行局部重排。
3. **样式/色板/母版对象缓存 + 批量属性赋值（`hi_tables.jsxinc`、`hi_styles.jsxinc`、`hi_core.jsxinc`、`hi_parent_pages.jsxinc`）**：
   - 在文档构建 `context.styleContext` 中缓存已解析的 `swatches`、`paragraphStyles`、`characterStyles`、`objectStyles` 与 `HI.noneSwatch(doc)`（缓存 `translateKeyString` 结果），避免表格每个单元格重复 `itemByName`；
   - 在页级构建前一次性建立母版 `labelId -> pageItem` 索引表，避免 `applyParentPageItemOverrides` 每次重扫全母版对象并反复 `JSON.parse(label)`；
   - 单元格与图形框多项独立赋值尽量合并为单次 `target.properties = { ... }` 提交，并去掉 `createGraphicFrame` 在 `place` 前多余的第一次 `applyStyleOverride`。

#### 1.4 合并 `build_indesign` 阶段脚本与预打包 `.jsxinc`（`html-indesign`）

- 将 `build.jsx` 与 `fidelity-snapshot.jsx` 合并为单次 `script.run`（同一次 COM `DoScript` 内直接建完后台文档并就地采集快照 JSON 落盘，随后在保真门禁通过后再跑 `export.jsx`；`draft` 模式下直接合并 `build + export` 为单次 `script.run`），减少 1–2 次完整 CLI → Node → COM 往返。
- 构建插件发布包时，将 `_indesign_scripts/lib/*.jsxinc` 预拼接为单份 bundle（源码仍保持模块化拆分，仅构建产物按序合并），把每次执行 25 次磁盘 `$.evalFile` 降为 1 次。
- 若存在自定义复合字体（`hi_composite_fonts.jsxinc:97-141`），复用已加载的 `HI.installedFontIndex` 消除第二次全量 `app.fonts.everyItem().name` 枚举。

---

### Phase 2（P1）：CLI 砍掉冗余进程冷启动 + 批处理复用 + COM ProgID 缓存

> **主责仓**：`mcp-indesign`（`agent-harness/` 与 `src/core/scriptExecutor.js`）  
> **进程模型**：严格遵守无常驻后台进程原则，仅优化单次 CLI 调用内的进程数与复用生命周期。

#### 2.1 `router.schema()` 走 `Catalog` 内存缓存（砍掉第 1 个冗余 MCP Node 进程）

- **现状**：`indesign_cli.py:453` 在每次 `tool call` 前调用 `router.schema(args.tool_id)` 校验参数；`core/router.py:156-160` 对 `classic`/`advanced` 工具无视 `Catalog` 已从 `indesign-tool-registry.json` 加载好的 `self._schemas`，强制冷启动一个完整的 MCP Node 进程调 `tools/list`。
- **改动**：
  - `Router.schema(tool_id)` 对 `classic` 与 `advanced` 工具优先调用 `self.catalog.schema(tool_id)`（由 checked-in artifact SHA-256 守卫，已是 SSOT 真相源），直接返回内存中的 `inputSchema`；仅当缓存缺失（异常场景）时才报 `SCHEMA_NOT_FOUND`。
  - **收益**：每次内置 `tool call` 立省 **1 个完整 Node 进程（~350ms）**。

#### 2.2 按需发现与握手插件（砍掉第 2、3 个冗余 Node 进程）

- **现状**：`indesign_cli.py:361, 583` 在**每一次** `tool *` 和 `script run` 入口都调用 `build_catalog_with_backends()`，串行启动插件 Node 进程跑 `plugin/handshake` + `tools/list`（2 个独立 Node 进程）。
- **改动**：
  - `script run` 命令完全不涉及插件工具目录，直接使用基础 `Catalog(repo_root=repo_root())`，**彻底跳过插件发现与握手**。
  - `tool call <tool_id>` / `tool schema <tool_id>` / `tool explain <tool_id>` 先查内置 `Catalog`：如果 `tool_id` 已在内置工具目录中命中（例如 `document.*`、`text.*`、`export.*`、`template.*` 等 140+ 内置工具），直接执行，**不启动任何插件 Node 进程**；仅当 `tool_id` 未命中内置目录（或执行 `tool domains` / `tool list` / `tool search` / `tool batch` 含插件步骤）时才按需加载插件。
  - **插件目录本地元数据缓存（针对真正调用插件工具的场景）**：在 `%LOCALAPPDATA%\indesign-cli\state\plugin-catalog-cache.json` 按 `(plugin_id, manifest_path, manifest_mtime_ns, manifest_version, entry_mtime_ns, host_version)` 缓存已验证通过的 `handshake`、`tools/list` 及各工具 `inputSchema`。缓存命中时，调用 `html.authoring_lint` / `html.build_indesign` 前无需再额外起 3 个 Node 进程查握手/列表/schema，直接进入 `tools/call`；`plugin validate`、`plugin doctor`、`server health` 始终绕过缓存做真实验证。

#### 2.3 单次 CLI 命令与 `tool batch` 内复用持久 stdio 通道

- **现状**：`McpBackend._with_process()` 每次调用启动进程、用完即 `terminate()`；`run_batch()` 跑 N 步重启 N 次 Node 进程；`PluginBackend.request()` 每轮 `tools/resume` 重启插件 Node 进程。
- **改动**：
  - 为 `McpBackend` 提供上下文管理器协议（`__enter__` / `__exit__` 或持久 session 模式）：在 `run_batch()` 执行期间，按 `source`（`classic` / `advanced`）按需懒启动最多 1 个 MCP Node 子进程，并在整个 batch 所有步骤间复用同一根 JSON-RPC stdio 管道；`batch` 结束（无论成功、失败或超时）在 `finally` 中立即优雅关闭并回收子进程。
  - 复用带来的连锁红利：Node 进程内的 `ScriptExecutor._winApp` COM 实例缓存命中率从 **0%** 提升至 **(N-1)/N**，且 83 个工具模块只需加载 1 次。
  - `HostActionExecutor` 在单次插件工具调用内如触发多条 `script.run` host action，同样通过同一个复用的 `advanced` MCP 子进程顺序执行，调用结束立即回收。
  - **容错兜底**：若复用子进程中途意外退出或超时被杀，清空句柄并按现有 `state_uncertain: true` 语义上报失败，不静默重试已可能修改文档的步骤。

#### 2.4 Windows COM ProgID 命中记忆（`src/core/scriptExecutor.js`）

- **现状**：`src/core/scriptExecutor.js:133-164` 每次新进程按 14 个 ProgID 从 `InDesign.Application.2026` 顺序盲试，装 2024/2023 的工位每次必触发 4–8 次 COM 激活失败异常。
- **改动**：
  - 读取环境变量 `INDESIGN_CLI_COM_PROGID`（若设置则排到候选列表第 1 位），其次优先尝试通用 ProgID `InDesign.Application`（在绝大多数单版本桌面工位上可直接指向本机注册版本）或读取 `%LOCALAPPDATA%\indesign-cli\state\com-progid.json` 中上次成功命中的 ProgID 作为首位候选；
  - 首次成功连接后将命中的 ProgID 写回本地状态文件（仅 1 行 JSON，忽略写入异常）；若该缓存 ProgID 失效（如升级了 InDesign），自动回落到完整 14 项列表并更新缓存。

---

### Phase 3（P2）：消除 NAS/SMB 同步阻塞与浏览器测量冗余

> **主责仓**：`mcp-indesign`（bootstrapper / telemetry / session）+ `html-indesign`（Playwright 采集与作者包入口组装）

#### 3.1 `mcp-indesign` 解除 NAS 同步阻塞

1. **Bootstrapper 更新清单检查加本地 TTL 缓存（`core/runtime_install.py`）**：
   - 在 `%LOCALAPPDATA%\indesign-cli\state\update-check.json` 记录上次检查时间戳与最新版本号。
   - 当本地已有可用 `current_runtime` 且距上次检查未超过 TTL（默认 **4 小时**，可通过 `INDESIGN_CLI_UPDATE_CHECK_TTL_SECONDS` 覆盖，`0` 表示强制实时检查，且 `indesign-cli-agent health` / `install` 始终实时检查）时，跳过同步读 NAS `runtime-latest.json`（省去最高 10s+30s 的同步等待），直接走本地浅校验启动。
2. **遥测去重 + 非阻塞落盘（`core/telemetry.py`、`core/batch.py`）**：
   - 消除 `record_event()` 第 244 行对 `state/<origin_key>.json` 的重复第二次读盘（复用 `_resolve_session()` 已读取状态）；
   - 将 NAS 遥测写入改为**带短时限的本地队列/非阻塞刷盘**：事件先原子追加到本机 `%LOCALAPPDATA%\indesign-cli\state\telemetry-spool.jsonl`（纯本地 SSD 耗时 <1ms），再以极短超时尝试同步/后台同步到 NAS 共享目录；NAS 抖动或离线时事件安全留在本地 spool 等下次顺带补传，绝不阻塞主业务命令。
   - `run_batch()` 不在每一步同步直写 NAS，改为在内存收集步骤遥测并在 batch 结束后一次性落盘。
3. **NAS/UNC 工作目录 `session.json` 跳过 170ms 无效重试（`core/session.py`）**：
   - 当 `self.path` 为 UNC 路径（以 `\\` 开头）且目标文件已存在时，Windows SMB 覆盖重命名大概率触发 WinError 5；对 UNC 已有目标改为**直接走已有的 `_session_lock` + `_overwrite_in_place`（单次 I/O）**，跳过必败的 3 次 `tmp.replace()` + `170ms` 休眠退避；本地磁盘仍保留标准原子 `tmp.replace()` 路径。
4. **减少热路径 `Path.cwd().resolve()` SMB 探测（`core/paths.py`、`core/mcp_backend.py`）**：
   - 在单次 CLI 进程内缓存 `allow_roots` 规范化结果，避免对子进程 `stderr` 每一行都重复调用 `Path.cwd().resolve()`。

#### 3.2 `html-indesign` 浏览器采集与入口组装瘦身

1. **本地 `file://` 页面取消 `networkidle` 500ms 固定白等（`browser-snapshot.js`）**：
   - 对本地 `file://` HTML 入口，将 `page.goto(..., { waitUntil: 'networkidle' })` 改为 `{ waitUntil: 'load' }`，配合已有的 `document.fonts.ready` + `waitForPageAssets`（图片加载完成）校验，每次 lint/compile/build 直接省去 **≥500ms** 死等。
   - 将 4 次串行 `await page.addScriptTag(...)` 合并为单次注入，消除 3 次 Playwright IPC 往返。
2. **DOM/CSS 采集去重与数据结构升级（`browser-snapshot-capture.js`、`browser-style-capture.js`、`browser-element-capture.js`、`scan-data-id-fields.js`）**：
   - `collectItemSnapshot` 复用 `ruleStyle` 结果，且 `frameEl === el` 时跳过重复调用 `authoredStyleObject`（消除每元素 3 遍全量规则匹配）；
   - 预计算 `snapshotStyleProps` 的 kebab-case 映射表，并按 tag/class 对 `styleRules` 建桶索引，将 `O(N × R)` 降至接近 `O(N)`；
   - `candidates` 查重与祖先查找由数组线性 `includes/indexOf` 改为 `Set`/`Map`；
   - `scanDataIdFields` 将 `html.toLowerCase()` 提到函数入口只计算一次。
3. **作者包入口组装消除重复读写与无效拷贝（`entry-writer.js`、`reveal-presentation.js`、`prepare-author-package.ps1`）**：
   - `writeRevealPresentation` 直接复用 `assembleAuthorPackage` 已读入内存的 `sourcePackage`、CSS 与页面 HTML，不再重读第二遍磁盘；
   - `copyRevealAssets` 检查目标 `vendor/reveal/*` 文件存在且字节大小一致时跳过覆盖拷贝；
   - 组装出的 `deck.html` / `presentation.html` 内容与磁盘已有内容字节一致时跳过原子写（从而完全避免触发锁退避重试）；
   - `skills/indesign-cli/scripts/prepare-author-package.ps1`（正式发布真源位于 `D:\AI\SA_skillhub\操作InDesign\skill\indesign-cli\scripts\prepare-author-package.ps1`，本仓仅同步本地测试夹具，且必须保持纯 ASCII）直接读取 `%LOCALAPPDATA%\indesign-cli\state\current-runtime.json` 解析 `runtime_root`，不再每次组装冷启动一遍 `indesign-cli-agent.exe health`。

---

## 5. 风险分析与防线

| 风险点 | 触发场景 | 缓解与防线 |
| --- | --- | --- |
| 后台无窗口文档 `documents.add(false)` 中途失败残留“看不见的隐形文档” | 脚本执行异常、超时或 COM 断连 | 外层 `try/finally` 恢复 `enableRedraw`；`cleanup.jsx` 按 `html_indesign_e2e_marker` 遍历 `app.documents` 关闭残留后台文档；`buildBuildJsx` 前置预检同样识别并清理未修改的旧 marker 文档 |
| `enableRedraw = false` 未恢复导致用户 InDesign 界面卡死不刷新 | 脚本未捕获异常或进程中断 | `scriptExecutor.js` 与 `hi_executor.jsxinc` 均采用 `var __prevRedraw = app.scriptPreferences.enableRedraw; try { ... } finally { app.scriptPreferences.enableRedraw = __prevRedraw; }` 强保证 |
| `textStyleRanges` 替代 `characters` 存在个别字符格式边界差异 | 极端混排、特殊字符/换行符样式边界 | 在 `html-indesign` 单测与真机 E2E 中新增**双模式等价性对照测试**（覆盖多样式混排、表格单元格混排、上标/字距/颜色局部覆盖），断言输出 JSON 与原逐字实现 100% 字节级一致 |
| `run_batch` 复用 MCP 进程后某一步把 Node 子进程打挂 | 某步脚本超时或 winax COM 崩溃 | 超时/进程异常退出时销毁句柄并按现有 `BATCH_STEP_FAILED` + `state_uncertain: true` 立即终止 batch，绝不自动重试已执行的变更步骤 |
| 插件目录缓存过期导致新装/升级插件看不到新工具 | 开发期本地覆盖插件或升级 runtime | 缓存键包含 `(manifest_path, manifest_mtime_ns, manifest_version, entry_mtime_ns, host_version)`，文件变动或版本变化立即失效；`plugin validate/doctor` 与 `server health` 永远直连不走缓存 |
| 遥测本地 spool 在 NAS 长期断网时无限增长 | 离线笔记本长期工作 | 为 `telemetry-spool.jsonl` 设置硬上限（如最大 5MB / 5000 条），超限时丢弃最旧条目，确保不占满本地磁盘 |

---

## 6. 分期验收与发布路径

每期严格独立验收、独立记录前后基准对比：

1. **Phase 1 验收（`html-indesign` + `mcp-indesign`）**：
   - 单测：覆盖 `hi_reverse` 新旧等价性、二分溢出试探边界、无窗口 `marker` 定位与异常恢复、`scriptExecutor.js` `disableRedraw`/`fastUndo` 包装与 `finally` 恢复、`populate_table` 批量赋值。
   - 真机 E2E：选取一份 10–20 页含文字、表格、图片的真实作品集/材料手册，记录优化前后 `build.jsx`、`fidelity-snapshot.jsx`、`export.jsx` 分阶段耗时与总耗时；验证生成 PDF 渲染一致性与保真报告结果 100% 一致。
   - **发布**：先升 `@sa/html-indesign` 版本并打包，再配合 `mcp-indesign` runtime 联合构建发布（遵循 `AGENTS.md` 第 2.5.2 节）。
2. **Phase 2 验收（`mcp-indesign`）**：
   - 单测：断言内置 `tool call` 仅启动 1 次 MCP Node 进程（不触发 `tools/list` 和插件握手）、`script run` 0 次插件进程、`run_batch` 多步共用 1 次 `Popen`、ProgID 缓存命中与失效回退。
   - 基准测试：实测单次内置写入与 20 步 `tool batch` 的总耗时对比。
3. **Phase 3 验收（`mcp-indesign` + `html-indesign`）**：
   - 单测：bootstrapper TTL 命中/过期、遥测本地 spool + 断网不阻塞、UNC `session.json` 跳过退避睡眠、Playwright 本地 `load` 等待、Reveal 静态文件未变跳过拷贝。
   - NAS 场景基准：在真实 `\\daga-nas5` 任务目录对比组装、lint、单次写入与 20 步 batch 的总耗时，确认无 170ms 固定延迟与 NAS 抖动卡死。

---

## 7. 后续拆分建议

经用户确认本设计后，按 `writing-plans` 流程依次拆出 **3 份独立实施计划**（不混成一个巨型分支）：

1. `docs/superpowers/plans/2026-11-19-indesign-write-speedup-phase1-jsx-plan.md`（优先，体感收益最大）
2. `docs/superpowers/plans/2026-11-19-indesign-write-speedup-phase2-cli-ipc-plan.md`
3. `docs/superpowers/plans/2026-11-19-indesign-write-speedup-phase3-nas-edge-plan.md`
