# Agent 反馈链路完整性设计

## 1. 目标

让 Agent 在任何一次失败后，仅凭返回值就能判断三件事：**发生了什么、是哪一类问题、下一步做什么**。

本设计不新增诊断字段，不改判定规则，不改严格程度。它只处理一件事：**已经生成的信息，在传递链路上被逐层丢弃**。

## 2. 背景

### 2.1 触发事件

2026-08-12，某工位手写 HTML 作者包后调用 `html.authoring_lint`，失败。返回给 Agent 的全部信息是一句写死的常量：

```
Authoring lint reported errors; fix the package before compiling.
```

Agent 修改 5 个文件后错误计数纹丝不动，弃用该工具链，当日交付改走其他方式。

2026-08-15 离线复现（`indesign-cli` 0.5.9 / `html-indesign` 0.2.8，作者包复制到临时目录，`strict: true`）：

| 指标 | 实测 |
| --- | --- |
| `errorCount` | 73 |
| 错误分类 | `GRID_ALIGNMENT_OFF` **100%** |
| `warningCount` | 23（`HTML_ROLE_INFERRED` 13 / `SEMANTIC_TOKEN_MISSING` 9 / `HTML_INLINE_SVG_NORMALIZED` 1） |
| 返回体总长 | 52,678 字符，`details.errors` 73 条完整，**无截断** |
| 单条错误结构 | `{level, code, message, pageId, itemId, edges}`，定位充分 |

（生产是 91、复现是 73，差异来自 `deck.html` 版本；性质一致。）

结论：**信息一直在返回值里，是顶层消息把它抹掉了。**

### 2.2 五路审计

以该事件为样本，对两个仓库做了五个方向的并行审计：CLI 错误质量、插件失败返回、Skill 与代码漂移、路径判定与环境失败、工具发现与 schema 契约。

审计发现的问题不是孤立的——它们是**同一个模式的 11 次重复**。

## 3. 核心发现：信息生成了，但没接上

| # | 下游已经生成 | 上游丢在哪 | 仓库 | 证据等级 |
| --- | --- | --- | --- | --- |
| 1 | JS 侧算好的 `code`（如 `NO_ACTIVE_DOCUMENT`）与真实错误文本 | `core/internal_backend.py:72-77` 只保留 `operation` | mcp | 已复核 |
| 2 | 插件构造的 `hint`（`build-indesign.js:241,270,392`） | `core/plugins/backend.py:70-74` 不读该字段 | mcp | 已复核 |
| 3 | `classify_result()` 的五分类归因 | `core/telemetry.py` 只写遥测，`envelope.failure()` 不下发 | mcp | 已复核 |
| 4 | `err.validation` 的结构化定位（`itemId`/`pageId`/`styleName`） | `dispatcher.js:119-124` 只读 `err.details` | html | 待复核 |
| 5 | `reportPath` 已算出（`reverse-export.js:122` 局部变量） | 未传入失败响应构造函数（同文件 `:149`） | html | 待复核 |
| 6 | `report.json` 已写盘（`reverse-pipeline/index.js:72-73`） | 错误响应无 `reportPath`、无 `artifacts` | html | 待复核 |
| 7 | INDD 已保存成功（导出阶段部分失败） | `build-indesign.js:381-402` 报整体失败，不提已落盘产物 | html | 待复核 |
| 8 | `gridTolerance` 代码读取生效（默认 1mm） | `tool-catalog.js` 未声明，`additionalProperties:false` 硬拒 | html | **已复核** |
| 9 | `lintFailureMessage()` 已实现（`build-indesign.js:172`） | `authoring-lint.js:27` 写死常量，不复用 | html | **已复核** |
| 10 | `underlyingHostFailure()` 已实现（`build-indesign.js:404`） | `reverse-export.js:71-86` 只报动作 ID | html | 待复核 |
| 11 | 下层错误自带 `hint`（`AUTHOR_GENERATED_ENTRY_DIRTY`） | 顶层 `error.hint` 恒为 `null` | 两侧 | **已复核** |

**11 处全部是接线问题，不是功能缺失。** 每处修复量在数行到数十行之间。

这也解释了一个长期观感：工具"该有的能力都有"，但 Agent 用起来处处碰壁——能力在，链路断。

### 3.1 这是既有约束的落地缺口

两条约束已经写明，代码未落地：

**本仓 `AGENTS.md` §2.6：**

> CLI 必须保留脚本返回的首个结构化错误代码、原因和页面\对象\字段定位；插件已经返回明确 `status: error` 时直接呈现，**不再包装成笼统的宿主失败**。

发现 1、2 直接违反。

**`html-indesign` `2026-08-03-html-authoring-compatibility-and-agent-feedback-design.md` §4.3：**

> CLI 的第一条错误消息保持简短，但报告 artifact 必须包含全部问题。Agent 能从返回值直接知道下一步，不需要先打开源码寻找错误含义。

发现 9、5、6 直接违反。

本设计不确立新方向，只把两条既有约束落到代码。

## 4. 设计原则

1. **不削薄。** 任何一层包装错误时，下层的 `code`、`message`、`hint`、结构化定位必须保留或上浮，不得替换成更笼统的表述。
2. **首条消息承载判断依据。** Agent 首先读 `message`。规模、分类、首条定位必须在 `message` 里，不能只躺在 `details`。
3. **指路显式。** 完整信息在别处（`details` 字段名、报告文件路径）时，`hint` 必须写明去哪里看。`hint` 为 `null` 视为缺陷。
4. **部分成功要说清。** 已落盘的产物必须出现在失败响应里，Agent 才能判断重跑范围。
5. **静默错位不可接受。** 结果落在非预期位置时必须给 warning，即使操作本身成功。
6. **契约与实现一致。** schema 声明的参数集合、`arg_names`、运行时实际读取的参数，三者必须相等；不一致由校验器拦截。

## 5. 分项设计

### 5.1 P0 — 确定性丢失

**5.1.1 `internal_backend.py` 丢弃 30 个工具的真实错误**

现状（`core/internal_backend.py:71-88`）：

```python
result = payload.get("result", {})
if isinstance(result, dict) and result.get("success") is False:
    raise CliError("Internal tool failed", code="INTERNAL_TOOL_FAILED",
                   details={"tool": tool["id"], "operation": result.get("operation")})
if isinstance(result, dict) and isinstance(result.get("result"), str) and result["result"].startswith("Error:"):
    ...  # 转发真实文本
```

JS 侧（`src/utils/stringUtils.js:46-59`）失败时固定产出 `success: false` + `code`（`NO_ACTIVE_DOCUMENT` / `INDESIGN_SCRIPT_FAILED` 等）+ `result`（真实文本）。

两个缺陷：

- 第一个分支先命中，`code` 与 `result` 全部丢弃，只留 `operation`；
- 第二个分支**是死代码**——任何失败都有 `success: false`，永远走不到；且它要求文本以 `Error:` 开头，而真实文本是 `No document open`、`Data source file not found: ...` 这类，不带该前缀。

改法：调换判断顺序，`code` 优先取 `result.get("code")`，`message` 取 `result.get("result")`，`INTERNAL_TOOL_FAILED` 仅作兜底。删除死分支。

**5.1.2 `plugins/backend.py` 丢弃全部插件 hint**

现状（`core/plugins/backend.py:70-74`）只读 `message` / `code` / `details`，`CliError` 的 `hint` / `retryable` 保持默认值。

被丢弃的具体提示（均在 `build-indesign.js`）：

- `:270` `Read forward-fidelity-report.json, fix the named HTML page/object/field, then start a new build.`
- `:392` `Fix the reported cause before starting a new build; unchanged input must not be retried automatically.`
- `:241` 快照读取失败提示

改法：`hint=error.get("hint")`、`retryable=bool(error.get("retryable"))` 一并传入。

插件侧可同时做冗余保险：把 `hint`/`retryable`/`stage` 复制进 `details`——`compile-instructions.js:19` 已是此模式，照抄即可，不必等宿主改完。

**5.1.3 三环闭死：规则、报错、调节手段**

`GRID_ALIGNMENT_OFF` 是本次事故 100% 的错误来源。三条路径同时堵死：

| 环 | 现状 | 证据 |
| --- | --- | --- |
| 规则是什么 | Skill 全文 0 次提及 | `grep GRID_ALIGNMENT skills/` → 0 |
| 错在哪 | 首条消息不含规则名与计数 | 发现 9 |
| 怎么调 | `gridTolerance` 被 schema 拒绝 | 代码读取生效，schema 0 声明，`additionalProperties:false` |

三处必须同时修，只修任意一处仍然闭死——修了报错但文档没有该规则，Agent 拿 `GRID_ALIGNMENT_OFF` 去 Skill 里搜依然搜不到。

`html.authoring_lint` 首条消息的具体口径已在
`html-indesign/docs/superpowers/specs/2026-08-15-authoring-lint-failure-feedback-design.md`
定稿并用实测数据验证，本设计不重复，直接引用。

`gridTolerance` 补进 `html.authoring_lint` 与 `html.build_indesign` 两处 schema，不设必填，标注默认 1mm。

Skill 文档缺口见 §6。

### 5.2 P1 — 静默错位

`outDir` 省略时默认落 `<cwd>/test/workspace/...`（`path-policy.js:39-41`）。当 cwd 本身漂移到临时目录或家目录时，输出目录、`.indesign-cli/session.json`、插件上下文全部以错误 cwd 为基准正常跑完，**返回 `ok: true`，无任何 warning**。

这是本次审计唯一一条「不报错、看起来成功、结果在错的地方」的路径，比硬拒绝危险。

而 Agent 自查用的两个工具答不上这个问题：`core/health.py:143` 关于 cwd 只给
`{"unc": str(Path.cwd()).startswith("\\\\")}`，不给实际值；`session doctor` 也不回显它读的是哪个目录下的 session。

改法：

1. `health()` 回显 `str(Path.cwd())`，并对「位于 `%TEMP%` / `%LOCALAPPDATA%` / 用户家目录根」「目录内无项目标志文件」给 warning；
2. `session doctor` / `session show` 回显所读 session 文件的绝对路径；
3. `ensureOutputDir` 走默认分支且 cwd 命中上述启发式时，在返回体 warnings 里显式提示。

### 5.3 P2 — 信息不足

| 项 | 位置 | 改法 |
| --- | --- | --- |
| `reverse_export` 消息写死，不给已落盘报告路径 | `reverse-export.js:212-227` / `:122` | 仿 `fidelityFailureMessage()` 从 `trustedSourcePreservation`/`authorAudit` 拼计数与首条原因；`details.reportPath` 带上第 122 行已算出的路径 |
| 导出后失败吞掉已保存的 INDD/IDML | `build-indesign.js:381-402` | 按 stage 用 `fs.existsSync` 确认已落盘产物，进 `artifacts`/`details.partialArtifacts`；消息前缀写明「INDD 已保存于 X」。同文件 `cleanupThenError()` 已是正确模式，对称应用即可 |
| `err.validation` 死属性 | `compile-instructions.js:52-66` | `err.details.validation = validation`，一行 |
| `reverse_export` host 失败只报动作 ID | `reverse-export.js:71-86` | 复用 `build-indesign.js:404` 的 `underlyingHostFailure()`，提为共享函数 |
| 归一化失败静默退化为字面比较 | `shared/path-containment.js:12-22` | `catch` 区分 `ENOENT`（继续向上，合理）与 `ETIMEDOUT`/`EACCES`/网络类（不得吞）；后者把失败事实带进错误。**当前消息仍断言「UNC 与映射盘符视为等价」，归一化失败时该断言不成立，属误导** |
| `OUTPUT_OUTSIDE_PROJECT` 报字面路径而非实际比较值 | `path-policy.js:38-51` | 把 `canonicalizePath()` 结果一并放进错误（`canonicalCwd`/`canonicalOutDir`） |
| 插件超时不采 stderr | `plugins/backend.py:40-48` | 仿 `internal_backend.py:47-55` 加 `stderr_tail`。这恰是驱动 InDesign 阶段的超时，最需要证据 |
| batch 硬编码 `state_uncertain=True` | `core/batch.py:99-110` | 改为 `state_uncertain=exc.state_uncertain` 透传，避免拼写错误也要求先跑 doctor |

补充：UNC 与映射盘符的判等本身**已于 `html-indesign` `3221069`（2026-08-07）修复并带 105 行测试**，用真实映射盘复现事故路径对判定正确。此处残留的仅是上述退化路径。

### 5.4 P3 — 契约漂移

| 项 | 位置 | 改法 |
| --- | --- | --- |
| `arg_names` 系统性漏报 | `tool-catalog.js`：`build_indesign` 报 6 实际 9；`reverse_export` 漏 `sourceRoot`/`nasPublicRoot`/`timeout`；`compile_instructions` 漏 `outputName` | 补齐 |
| 校验器只做单向检查，漂移查不出 | `core/plugins/validate.py:58-60` | 改双向：`set(arg_names) == set(properties)` |
| 插件工具必填校验被绕过 | `indesign_cli.py:100-130` | `validate_call_args` 补 `schema.required` 检查，统一走 `MISSING_ARGUMENT` + hint |
| 文档教 Agent 传 schema 不支持的参数 | Skill `html-authoring.md:130` 要求传 `profile`；`html.reverse_export` schema 无此参数，传了报 `ARGS_UNKNOWN_KEY` | 二选一：schema 加 `profile`/`semanticPreset`，或改文档指向 `sourceRoot`。**当前 `structured` 模式首次调用必失败**（`SEMANTIC_PRESET_LOAD_FAILED:profile-required`），且唯一退路 `sourceRoot` 同时被 `arg_names` 漏报 |
| `tool schema` 25–29% 是纯重复 | `core/router.py:139-158` `_metadata()` 与 `catalog.py:392-396` 合并进的 `tool` 字段逐字重复 | 删除重复的 `metadata` 顶层块 |
| `common_next_steps` 是宿主套话且部分是错的 | `catalog.py:534-566` 不读插件提供值，`_with_agent_contract()` 用 `setdefault` 覆盖 | 允许插件覆盖；`html.build_indesign` 在 `mode:'final'` 时已内部调用 `export.verify`，当前追加的「再跑一次 export verify」是误导 |
| `failure_example` 弱于真实消息 | `tool-catalog.js:26,50,74,98` | 从真实失败 fixture 输出复制，不手写摘要 |
| `NODE_SETUP_FAILED` 死码导致遥测分类失真 | `core/telemetry.py:75-81` 该码从未被 raise；真实的 `NPM_NOT_AVAILABLE`/`NPM_INSTALL_FAILED` 落进 `runtime_error` | 替换集合成员。**影响既有统计口径：环境类失败此前系统性漏计** |
| 路径参数「相对谁」未写明 | `tool-catalog.js` 9 处路径参数，仅 1 处说明基准 | 统一补「相对 CLI 调用时的 cwd 解析；`outDir` 必须落在 cwd 内」 |
| `resume` 不透传 context | `dispatcher.js:85-98` | 传 `request.context`。当前两个 resume 实现靠 state 里的绝对路径侥幸绕过，属结构性陷阱，成本极低 |

## 6. Skill 文档规则缺口

以下四类硬规则在 Skill 中完全缺失。Agent 不可能遵守它不知道的规则——这与错误消息是否改进无关，必须独立补齐。

| 缺口 | 实测 | 后果 |
| --- | --- | --- |
| 网格对齐规则与容差 | `grep GRID_ALIGNMENT\|容差 skills/` → **0** | 本次 73/73 错误的来源。容差硬编码 1mm，而文档鼓励的「先写正常 HTML」极易超出 |
| `data-id-grid` 作用域 / `data-id-grid-ignore` | `grep grid-ignore skills/` → **0** | 前者仅页面级、后者是元素级豁免，文档挨着写却未区分。事故中「同元素上二者并存」是 Agent 从报错反推的求生痕迹，非无知 |
| 语义 token 封闭词表位置 | `grep semantic-preset.json\|presets/ skills/` → **0** | 文档说「用已登记值」却不给词表位置，Agent 只能编名字，撞 `SEMANTIC_TOKEN_UNKNOWN` |
| 哪些规则 lint 查不到 | 未标注 | `NESTED_LAYER_PAINT_ORDER_UNSUPPORTED` 只在 compile/build 阶段生成，lint 绿灯不代表通过，浪费一次昂贵构建 |

另有一处描述用词把 Agent 推向雷区：`tool-catalog.js:109` 写 `strict` 会「把网格偏移和**语义 token 缺失**作为错误」，但 `SEMANTIC_TOKEN_MISSING` 标了 `strictBlocking: false`，**永远不会**升级为 error；真正被提升的是 `SEMANTIC_TOKEN_UNKNOWN`。Agent 照此描述会去补全语义标记，而补全时又无词表可查，正好落入上一格。此描述须改。

同时应写明：`html.build_indesign` 内部固定 `strict: true`（`build-indesign.js:47`），与 `html.authoring_lint` 的默认 `strict: false` 不一致——Agent 用默认参数「验证通过」后仍会在 build 的 lint 阶段失败。

## 7. 验证

1. 每条改动先写失败测试，再实现。
2. 发现 1：构造 `success:false` + 具体 `code` 的 bridge 响应，断言 Agent 侧拿到原始 `code` 与文本，而非 `INTERNAL_TOOL_FAILED`。
3. 发现 2：构造带 `hint` 的插件错误，断言 `envelope.failure()` 输出的 `error.hint` 非空。
4. 5.1.3：用 2026-08-12 作者包作 fixture，断言消息含 `73`、`GRID_ALIGNMENT_OFF`、集中提示与首条定位；断言 `gridTolerance: 2` 能被接受并改变结果。
5. 5.2：在 `%TEMP%` 下调用且省略 `outDir`，断言返回体带 warning；`server health` 回显真实 cwd。
6. 5.4 契约：`plugin validate` 对当前已漂移的 manifest 必须报错（现状返回 `ok: true`，这本身是回归基线）。
7. 全量 `npm test`、插件校验、打包预检、真实 InDesign E2E 各一轮。
8. 更新 Skill 后做无答案泄漏的 Agent 前向测试：Agent 应能识别 `GRID_ALIGNMENT_OFF` 为单一系统性成因，并知道 `gridTolerance` 与 `data-id-grid-ignore` 两条合法出路。

## 8. 非目标

- 不改任何检查规则、阈值或严格模式语义。
- 不自动改写作者 HTML/CSS。
- 不新增诊断字段体系；分类计数由既有 `errors[].code` 聚合。
- 不解决 `GRID_ALIGNMENT_OFF` 本身——73 个元素为何整体偏移（`top`/`left`/`right` 普遍未对齐、`bottom` 全对齐）属网格判定或容差取值问题，另行开单。
- 不涉及 Agent 侧观测能力（模型归因、会话存档），那属 SA-AIAPP，已记在该仓 issue #385。

## 9. 落地后的长期约束

以下两条落地后需同步进 `AGENTS.md` 或 `docs/技术决策/`：

1. 任何一层包装错误时不得削薄下层信息——这是 `AGENTS.md` §2.6 既有条款的具体化，应补上可执行的判据与测试要求。
2. schema 声明、`arg_names`、运行时实际读取的参数三者必须相等，由 `plugin validate` 双向校验强制。
