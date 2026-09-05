# 失败时能拿到什么

任何 `tool call` 失败时，返回体不是只有一句提示。`ok: false` 之外还有一整套结构化字段，读懂它们能直接判断下一步，不用盲目重试或去翻源码猜错误含义。

## 顶层字段（与 `error` 平级）

- `ok`：`false` 才是失败的权威判据；不要用"命令跑完了""没抛异常"之类的旁证判断成功。
- `state_uncertain`：宿主侧动作（驱动 InDesign 脚本、导出等）执行到一半、成功与失败之间状态不确定时为 `true`——不知道上一次调用是否已经改动了文档。为 `true` 时不要直接用原参数重试，否则可能把同一个改动重复应用一遍；先按 `next_action` 或用 `session doctor` 核实当前文档状态，确认清楚再决定要不要重试。
- `next_action`：宿主给出的具体下一步指令（常见于 `state_uncertain: true` 的场景，比如先跑哪个诊断命令）。有值时按它做；没有值才退回自己判断。

## `error` 对象

- `error.code`：机器可读的错误代码，用来判断问题种类和能不能重试；不要只看 `message` 猜。
- `error.message`：人类可读的简短描述。
- `error.details`：结构化定位（页面/对象/字段、文件路径等）。失败后先看这里，不要只读 `message` 就动手改。
- `error.hint`：具体的下一步建议，经常带着可以直接复制执行的命令；有值时优先照它做。
- `error.retryable`：这一类失败本身是否可能只是暂时性的、原样重试有机会成功。默认 `false`；为 `true` 说明换个时机重试是合理的（不代表现在立刻重试一定对，仍需结合 `state_uncertain`）。
- `error.category`：五选一，决定下一步方向，不要一律"改改重试"：

  | category | 含义 | 下一步 |
  | --- | --- | --- |
  | `gate_rejection` | 门禁正常拒绝——作者检查、保真度核对、输出路径越界等规则生效了，不是 bug | 按 `error.details` 里的页面/对象/字段定位修改作者源码或参数，改完重新调用；不要对未修改的输入原样重试 |
  | `input_error` | 参数或调用方式写错了（缺参数、参数不认识、JSON 格式错、超时值非法等） | 按 `error.message`/`error.details` 改参数或调用方式后重试；不用碰环境或作者源码 |
  | `environment_error` | 环境问题（npm 缺失、运行时装不起来、更新检查失败等），不是这次调用本身写错了 | 不要对着同一次调用反复重试；先按提示修环境，修不了就上报，不要在环境问题上空耗调用次数 |
  | `timeout` | 调用超时 | 先看 `state_uncertain`：为 `true` 说明宿主状态不确定，按 `next_action`（通常是 `session doctor`）核实当前文档状态后再决定要不要重试；不能默认"超时=什么都没做，可以直接重试" |
  | `runtime_error` | 其余情况，包含疑似工具本身的缺陷；未被归入前四类的错误码默认落在这里 | 收集 `error.details` 完整上报；不要用相同输入反复重试指望它自己变好 |

`error.category` 由 `error.code` 归类得到，不认识的代码一律保守归到 `runtime_error`，不会被误标成门禁拒绝——所以看到 `runtime_error` 不代表一定是工具缺陷，也可能只是这个错误码还没被归类，实际定位仍要看 `error.details`。

## 失败报告落盘

`html.authoring_lint` 失败和 `html.build_indesign` 的 lint/保真阶段，会在 `outDir`（lint 未传 outDir 时为作者包旁的 `.indesign-cli/`）落盘 `authoring-lint-report.json` / `forward-fidelity-report.json` 主报告（原地覆盖，永远是最新一次的结果）；失败态还会**另存** `<name>.failed-<时间戳>.json`，同名归档保留最近 3 份——这是离线复盘（无 InDesign 重跑审计）的第一入口，返回体 `artifacts` 里带报告路径。归档时间戳是 UTC，与遥测 `ts` 同口径，比北京时间早 8 小时，对时注意。保真报告里 `FORWARD_TEXT_CHANGED` 条目若读回文本是源文本的前缀，会带 `reason: 'overset'` 与提示（文本框容不下：加大框或减少内边距、缩小字号或缩短文本）；`FORWARD_TABLE_CHANGED` 条目带 `dimensions` 说明差在表头、段落样式、文本还是行列数。

## 目标 INDD 正在 InDesign 中打开

`html.build_indesign` 会在建文档前检查 `<outDir>/<outputBaseName>.indd` 是否已在 InDesign 里打开。是本工具上一轮产物且未被修改，会自动关闭并继续（成功结果 `data.warnings` 里有 `PREVIOUS_OUTPUT_CLOSED`）；否则立即返回 `OUTPUT_TARGET_OPEN`（`retryable: true`，不会白跑一次构建）。处理：让用户在 InDesign 里关闭该文档，或改用别的 `outputBaseName`，然后重跑同一命令。不要删文件、不要改 outDir 绕过。只有同一个 InDesign 实例里打开的文档能被查到；UNC 路径和映射盘路径不互认，这类情况仍会在保存阶段失败并给出 `INDD_SAVE_FAILED`。

## 宿主脚本的警告

构建过程中 InDesign 脚本产生的警告（字体回落 `FONT_FALLBACK_APPLIED`、IDML 导出失败 `IDML_EXPORT_FAILED`、预检自动关闭 `PREVIOUS_OUTPUT_CLOSED` 等）会随结果一起返回：成功时在 `data.warnings`，失败时在 `error.details.hostWarnings`，每条含 `code`、`message` 和标量 `details`（如 `requestedFont`/`appliedFont`/`itemId`）。读它们，尤其是 `BUILD_ARTIFACTS_MISSING` 时——缺的那份产物通常在这里能找到原因。

## 上报工具本身的问题

遇到下面任一情况，用 `feedback report` 把摩擦记进共享遥测，不要只在对话里抱怨：`error.category` 为 `runtime_error` 且 `details` 看不出原因；文档说不清某个参数或错误码；明显缺一个本该有的工具或参数。

```powershell
indesign-cli feedback report --code <TOOL_GAP|DOC_UNCLEAR|ERROR_MESSAGE_USELESS|SCHEMA_CONFUSING|UNEXPECTED_BEHAVIOR> --note "<一句话摩擦摘要>" --tool <相关工具 id，可省略>
```

`--note` 最多 500 字，不得包含客户名称、文档内容或文件路径。上报不会改变当前任务的结果，只是让维护者下次能修。
