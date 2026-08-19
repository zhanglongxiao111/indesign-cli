# 常见创作写法兼容与脚手架修复设计

## 1. 目标

把外部模型（LLM）写 HTML 的高频惯用写法从「拒绝」改为「兼容」，并修掉门禁之前脚手架环节的三个工程坑。原则一句话：

> **存在确定性、保真的转换时，自动归一化并降为提示；只有转换语义有歧义、会丢内容时，才保留为阻断。**

本设计不放松保真门（fidelity gate）的任何判定——本次实测证明保真门工作正确且报错格式是标杆。

## 2. 背景

### 2.1 触发事件

2026-08-19 12:35–12:52 UTC，外部模型 GPT 5.6 terra 通过 `indesign-cli` 0.5.10 + `html-indesign` 0.2.9 在 UNC 中文路径工作目录（`\\Daga-nas5\daga-2025-project\D0486_大兴永定湾花园`）生成 8 页简报。证据链：NAS 遥测 JSONL + outDir 落盘报告 + SA-AIAPP Supabase 原始对话（thread `884e20a0`，168 条消息），三方互证。

全程四段摩擦，按耗时排序：

| # | 环节 | 现象 | 耗时/代价 |
| --- | --- | --- | --- |
| 1 | 作者包初始化 | `prepare-author-package.ps1 -Destination <UNC中文路径>` 抛 `GetFullPath` NotSupportedException，模型被迫手读 html-starter 模板、手搓 8 页；期间又两次猜错组装脚本（`assemble-authoring.js` 报 `Unknown argument`） | **约 8 分钟黑箱期**，全程最大隐性耗时 |
| 2 | 首次 lint | 32 errors：`HTML_TEXT_NOT_CONVERTIBLE`×20、`GRID_ALIGNMENT_OFF`×8、`HTML_PSEUDO_ELEMENT_UNSUPPORTED`×4 | 一轮批量修复（约 3 分钟），一次通过 |
| 3 | 首次 build | `FIDELITY_GATE_FAILED`：page-6 `p6-el19` 文本框放不下被截断（expected/actual 直给），模型加一条缩字号 CSS 一次修对 | 29 秒真机构建 + 一轮修复 |
| 4 | 环境探测 | 模型先用 `indesign-cli --json health` 被 `BAD_CLI_ARGS` 拒绝（`health` 属于 `indesign-cli-agent` 这个可执行文件；`indesign-cli` 下是 `server health`），靠翻 `--help` 自行纠正 | 一轮探测 |

### 2.2 核心观察：32 个错误里 24 个是 LLM 惯用写法

- 20 个 `HTML_TEXT_NOT_CONVERTIBLE` 全部是「裸 `span`/`div` 文本直接挂在布局容器下」（`div>span` 徽标、卡片小标签、`div` 里的统计数字）。
- 4 个 `HTML_PSEUDO_ELEMENT_UNSUPPORTED` 全部是 `::before { content: "01" }` 式装饰编号。
- 8 个 `GRID_ALIGNMENT_OFF` 是 8/8 页 100% 命中的系统性假阳性：无显式 grid-span 的自动宽度页标题 `<h2>`，右边缘天然不落网格线（模型最终用 `data-id-grid-ignore` 压掉，等于人肉确认这是误报）。

与此同时，兼容层在同一次 lint 里已经**静默归一化了 44~49 处**（`HTML_ROLE_INFERRED`、`HTML_INLINE_SVG_NORMALIZED`），证明「自动兜底 + 提示」的机制已经存在且运转良好——只是这两类最高频的写法被划在了「阻断」一侧。这是划线问题，不是能力缺失。

### 2.3 明确不改的部分

- **保真门判定与时机不动。** p6-el19 的截断是浏览器与 InDesign 字体度量差异导致的，lint 阶段（浏览器侧）无法可靠预测，保真门是它唯一正确的拦截位置。本次它报错带 `pageId/itemId/field/expected/actual` 四元组，模型一次修对——这个格式反而应推广（见 §5.2）。
- **`htmlhub_publish` 登录态错误文案不动。**「谁负责/禁绕过/禁重试」三要素文案被模型完全服从，作为门禁文案规范的另一标杆。

## 3. A 组：兼容性升级（blocked → normalized）

三项都在 `html-indesign` 仓库。共同验收标准见 §7。

### A1. 裸文本容器自动归一化（消除 20/32）

**现状**：`src\adapters\html\reader\browser-element-capture.js:473-508` 的 `collectUncapturedTextElements()` 把「有直接文本子节点、自身又不是文本候选、也没被文本候选祖先覆盖」的元素判为 `uncapturedText`；`src\adapters\html\validators\authoring-validator.js:40-49` 将其逐条转为 error。

**改法**：在快照采集层加一档推断——`uncapturedText` 元素若满足**安全条件**：

1. 其可见子节点**只有**文本节点和纯内联格式元素（`strong`/`em`/`b`/`i`/`span` 且这些内联元素自身不含块级后代）；
2. 自身未声明与文本冲突的角色（无 `data-id-role` 为 graphic/container 等）；

则按「隐式 `data-id-role="text"`」处理为文本叶子候选，走既有的 role-inference 通道，产出新的归一化码 `HTML_TEXT_LEAF_INFERRED`（`action:'normalized'`，复用 `audit.js:245-257` 的 `normalizedMessage()`）。文本节点与块级子元素混排（转换必丢内容）时保持 error 不变，且 error message 附上被判定为「混排」的具体子元素。

本次 20 条案例（`div>span` 徽标、`div>div>strong` 统计句）全部落在安全条件内。

### A2. 伪元素静态内容物化（消除 4/32）

**现状**：`src\adapters\html\compatibility\audit.js:148-159` 对 `beforeContent/afterContent/...` 五个 unsupported fact 一律 `blockedMessage()`。

**改法**：在快照捕获阶段（`getComputedStyle(el, '::before')` 已能拿到 content 与样式）对**安全子集**做物化：`content` 为静态字符串（非 `attr()`/`counter()`/`url()`/空串）且伪元素参与正常流或简单绝对定位时,合成一个真实子 item 注入语义模型，产出 `HTML_PSEUDO_CONTENT_MATERIALIZED`（normalized）。`counter()`、`attr()`、图片型 content、纯 paint 技巧（`beforePaint`/`afterPaint`）保持 blocked，报错文案不变（现有 suggestedFix「改为真实元素」已被验证可操作）。

本次 4 条 `content: "01"` 式编号全部落在安全子集内。

### A3. 自动宽度文本框豁免右边校验（消除 8/32）

**现状**：`authoring-validator.js:546-558` 的 `gridEdgesForItem()` 已对文本/表格角色豁免 bottom 边（承认「内容自适应撑高」），但 right 边仍一律校验；无显式宽度声明的自动宽度 `<h2>` 因此 8/8 页误报。

**改法**：与 bottom 豁免同型——文本角色且无显式网格跨度声明（无 `--grid-col`/`--grid-span`，宽度由内容撑开）的元素，right 边不参与 `offGridEdges()` 校验。同时在报告里对被豁免的元素记一条 info 级说明（不计入 warningCount），避免「静默不查」引起的困惑。`data-id-grid-ignore` 通道保留，供确需全豁免的元素使用。

## 4. B 组：脚手架修复

### B1. `prepare-author-package.ps1` 支持 UNC/中文路径（P0）

**落点**：`D:\AI\mcp-indesign\skills\indesign-cli\scripts\prepare-author-package.ps1` 三处：

- `:25-26` — `[System.IO.Path]::GetFullPath($Destination)`：对带 PowerShell provider 前缀（`Microsoft.PowerShell.Core\FileSystem::\\...`）或 PSDrive 的输入直接抛 NotSupportedException，本次事故点；
- `:52` — `Resolve-Path -LiteralPath` 的 `.ProviderPath` 补丁只覆盖了 `Assemble` 分支；
- `:56` — 对 `$env:INDESIGN_CLI_RUNTIME_ROOT` 的同型 `GetFullPath`，风险相同。

**改法**：新增统一的 `Resolve-DestinationPath` helper：先剥离 provider 前缀（`-replace '^[^:]+::'`），目录不存在时先 `New-Item -ItemType Directory -Force` 再 `(Resolve-Path -LiteralPath).ProviderPath`，三处全部收口到该 helper，禁用裸 `GetFullPath`。脚本保存为 UTF-8 with BOM（脚本 49-51 行注释已记录 PS5.1 ANSI 解码坑）。

### B2. 组装脚本双轨指路（P1）

**现状**：开发态 `html-indesign\scripts\assemble-authoring.js`（flag 式参数，绑死仓库内相对路径）与分发态 `mcp-indesign\skills\indesign-cli\scripts\assemble-author-package.cjs`（位置参数 `pluginRoot packagePath`，供已安装 runtime 用）名字相近、约定不同，本次模型猜错两次。

**改法**（不合并，两者服务对象确实不同）：

1. `assemble-authoring.js:35-48` 的 `parseArgs()` 在 `Unknown argument` 报错时追加一句：「若在已安装 runtime 环境（而非 html-indesign 仓库内），请改用 `prepare-author-package.ps1 -Package <deck.config.json>`，其底层为 `assemble-author-package.cjs <pluginRoot> <packagePath>`」；
2. 两侧 authoring 文档（见 §6）各加一张「我在哪个环境 → 用哪个脚本」二选一表。

### B3. `BAD_CLI_ARGS` 加迁移/跨命令面提示（P1）

**事实修正**：`health` 从未被移除。`indesign-cli-agent health`（`agent_bootstrapper.py:81`）与 `indesign-cli server health`（`indesign_cli.py`，自 `c1b7bca` 引入即嵌套）是两个可执行文件上的两个命令，本次是模型把前者的用法套到了后者上。

**改法**：`indesign_cli.py:47-56` 的 `AgentArgumentParser.error()` 加一张静态映射表，检测 invalid choice 的 token 并追加定向 hint：

| 误输入 | 追加提示 |
| --- | --- |
| `health` | 你可能想要 `indesign-cli server health`；顶层 `health` 属于 `indesign-cli-agent` |
| `lint` / `build` | 用 `indesign-cli tool call html.authoring_lint / html.build_indesign` |

表内只维护实测踩过的混淆项，不做模糊匹配。

### B4. 失败态报告归档（P1）

**现状**：`build-indesign.js:137`（lint 报告）、`:273`（fidelity 报告）、`lint-feedback.js:98-108` 均为单文件覆盖写。本次 p6-el19 的失败快照被成功构建覆盖，expected/actual 只能靠 Supabase 对话记录复原——违背「遥测 JSONL → outDir 落盘产物 → 离线重跑」证据链的第二环。

**改法**：三处落盘统一走一个 `writeReport(path, payload, {failed})` helper：成功照旧覆盖主文件；失败时**额外**写 `<name>.failed-<yyyyMMddHHmmss>.json`，同名失败归档只保留最近 3 份（写前清理）。主文件语义不变，下游读取方零改动。

## 5. C 组：信噪比

### C1. compatibility 归一化不再计入 warningCount

**现状**：`src\authoring\lint.js:194`（`withCompatibility()`）把 `action:'normalized'` 的消息并进 warnings，`:186` 计入 `warningCount`。结果是 44 条「工具已自动处理、无需行动」的记录撑起了全部 warning 数，且随卡片数线性增长，让使用方误以为还有没修完的问题。

**改法**：`withCompatibility()` 不再把 `action:'normalized'` 的条目并入 `warnings`，改挂到 `compatibility.messages` 原位并新增顶层 `normalizedCount`；`warningCount` 只统计需要使用方判断的真 warning。报告 JSON 里归一化明细按 code 分组折叠（`HTML_ROLE_INFERRED ×38（按页分布见 details）`）。遥测侧 `plugin_metrics.warning_count` 口径随之变化，需在周报口径说明里记一笔。

### C2. lint 首条错误带内容预览

**现状**：`HTML_TEXT_NOT_CONVERTIBLE` 的 `itemId` 是 CSS 路径（`div:nth-of-type(3)>div:nth-of-type(1)>strong`），页面结构一动整体偏移，模型要在数千字符 HTML 里数第 N 个 div 定位。对照组：`FIDELITY_GATE_FAILED` 直给 expected/actual，模型一次修对。

**改法**：`collectUncapturedTextElements()` 采集时顺带截取元素 `directText` 前 20 字符，`authoring-validator.js:40-49` 构造 error 时附 `textPreview` 字段并拼进 message。A1 落地后此类 error 只剩「混排」情形，预览字段帮助定位残余案例。

## 6. 文档同步

A1/A2/A3 落地后，两份 authoring 指引同步更新（权威源 → 精简版单向同步）：

- 权威源：`D:\AI\html-indesign\docs\规范\AGENT_HTML_AUTHORING_GUIDE.md` §1.2（65-73 行「安全归一化清单」加入 `HTML_TEXT_LEAF_INFERRED`、`HTML_PSEUDO_CONTENT_MATERIALIZED`；77-87 行阻断表中相应条目改注「仅混排/动态 content 时阻断」）。
- 精简版：`D:\AI\mcp-indesign\skills\indesign-cli\references\html-authoring.md` 对应行（:90、:107-108、:116）+ B2 的脚本二选一表。

文档基调随本设计原则调整：从「这些写法禁止」改为「这些写法会被自动归一化（无需改）；以下情形才需要改」。

## 7. 验收标准

1. **回归基准**：用本次 0819 会话第一版失败作者包（`00_agent\建筑设计AI行业动态简报_20260819\author` 的 20:44 前状态，可从失败 lint 报告 + 当前源码反推重建）跑 `html.authoring_lint --strict`：A 组落地后应为 **0 error**，`normalizedCount` ≥ 68（原 44 归一化 + 20 文本叶子 + 4 伪元素物化），`warningCount` 显著小于 44。
2. `prepare-author-package.ps1 -Destination '\\daga-nas5\daga-2025-project\D0486_大兴永定湾花园\00_agent\_smoke'` 在 PS 5.1 与 pwsh 下均成功（B1），加入 CI/冒烟清单。
3. `indesign-cli --json health` 的报错 JSON 中 hint 含 `server health` 与 `indesign-cli-agent` 指引（B3）。
4. 人为构造一次 lint 失败 + 一次 build 失败，outDir 中出现对应 `*.failed-*.json` 且主报告仍为最新态（B4）。
5. 物化伪元素的页面过保真门：`::before` 静态文本在 InDesign 回读文本中逐字一致（A2 的保真验证，防止「归一化了但转换丢字」）。
6. 两侧测试套件全绿（基线 `mcp-indesign` 282 / `html-indesign` 1225）。

## 8. 优先级与依赖

| 批次 | 内容 | 理由 |
| --- | --- | --- |
| 批 1 | B1、B3 | 纯工程小改，无行为争议；B1 是本次最大耗时源 |
| 批 2 | A1、A3、C2 | 消除 28/32 个错误；A1 依赖快照层改动，与 C2 同文件顺手做 |
| 批 3 | A2、B4 | A2 涉及语义模型注入合成 item，需保真验证（验收 5）兜底 |
| 批 4 | C1 + 文档同步 | 口径变化牵动遥测周报，放最后统一切换 |
