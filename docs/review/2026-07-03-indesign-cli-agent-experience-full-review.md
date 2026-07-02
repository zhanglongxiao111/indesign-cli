# indesign-cli Agent 使用体验全面审查（2026-07-03）

> **修复状态（2026-07-03 当日）**：P0-1、P0-2、P1-1 至 P1-8、P2-1 至 P2-6 及 P2-7 大部分杂项已全部修复并通过 CLI 单元测试（95 个）与真实冒烟验证；envelope 升级为 `schema_version: 2`。未处理项：`plugin doctor --deep`（保留 no-op，help 已注明"保留给深度诊断"）、`tool search` 双语关键词字段（长期项，文档已先行说明子串匹配语义）、session 文件锁（已做原子写替换，读-改-写竞态为 last-writer-wins）。本报告其余描述以修复后代码为准核对。

- 审查对象：`agent-harness/cli_anything/indesign`（`indesign-cli` v0.3.0）
- 审查方法：通读 CLI 与 `core/` 全部模块 + 实测只读命令（未连接 InDesign COM、未运行 `server setup`、未安装插件）
- 视角：唯一用户是 AI Agent——上下文有限、按 JSON 决策、靠错误信息自我修复、靠 `--help` 和 `SKILL.md` 发现能力
- 背景：另一会话正在修复 4 个已知问题（`INDESIGN_CLI_SERVER_ROOT` 文档、`server setup` npm 选择、`server health` 工具链诊断、server root 裸 traceback）。实测中已看到 `server health` 输出包含 npm/python/server_root/long_path_risk/cwd.unc 诊断，属"已在修复中"，本报告不重复展开。审查期间代码被并发修改，个别瞬时报错（如一次 `NameError`）不计入结论。

## 1. 结论摘要

总体判断：`indesign-cli` 的核心设计是对的——渐进披露（`tool domains` → `search` → `schema`）、统一 JSON envelope、错误码 + `hint` + `state_uncertain` + `next_action` 体系、session 落盘、降级不崩溃，这些在同类 Agent CLI 里属于第一梯队。但两条最高频的 Agent 出错路径（`--args` 传内联 JSON、命令行参数拼错/缺失）会直接跌出 JSON 契约或跌进无信息的 `UNEXPECTED_ERROR`，Agent 无法只靠输出自我纠正；`tool list` 单工具约 30 个字段、`--source classic` 一次 189KB，加上 `ensure_ascii` 把所有中文转成 `\uXXXX` 转义，上下文经济性打了折扣。修完 P0 两条和上下文瘦身后，这个 CLI 对 Agent 会非常好用。

| 维度 | 评分 | 一句话理由 |
| ---- | ---- | ---- |
| 可发现性 | 良 | 渐进披露和 `tool explain` 好；`tool batch` plan 格式零文档、搜索 recall 不稳拖后腿 |
| JSON envelope 契约 | 中 | 结构稳定有 `schema_version`；但 success/failure 字段不对称、`mcp_ok`/`tool_success` 硬编码失真、argparse 错误绕过 envelope |
| 错误体验 | 中 | 错误码 + `hint` 体系是亮点；但内联 JSON、未预期异常两条路径信息为零，顶层 message 常退化成 "MCP tool failed" |
| 参数传递 | 中 | `--args-file` 和 `--args -`（stdin）可解 Windows 引号地狱；但 `--args` 命名误导且内联 JSON 直接崩、无 client-side schema 校验 |
| 上下文经济性 | 中 | `tool domains` 紧凑（约 5KB data）；`tool list` 冗余字段多、中文全转义、无 compact 模式 |
| session 与状态 | 良 | 失败也落盘、`session doctor` 有 `next_action`；但 `documents` 恒为 null、`--verbose` 是死 flag |
| 长任务与超时 | 良 | `TIMEOUT` 错误契约（retryable + state_uncertain + next_action）设计好；`--timeout` 秒参数绕过校验、`tool call` 默认 30s 未文档化 |
| 插件体验 | 优 | `plugin list/validate/doctor` 输出结构化、host action allowlist 已在 manifest 校验收口、`DOMAIN_NOT_FOUND` hint 引导 `plugin list` |
| 文档与代码一致性 | 良 | SKILL.md 关键断言实测均成立；"147 个可调用能力" 与实测 149 漂移、个别提示文本过时 |
| 安全与防呆 | 良 | `close_document` 多文档护栏已落地、health 默认不碰 COM、路径脱敏有意识；但脱敏过度反噬调试 |

## 2. 主要发现

### P0-1 `--args` 传内联 JSON 得到零信息的 `UNEXPECTED_ERROR`

- 位置：`agent-harness/cli_anything/indesign/core/router.py:259-271`（`load_args` 把值当路径）、`agent-harness/cli_anything/indesign/indesign_cli.py:436-439`（兜底 handler 丢弃异常信息）
- 问题：`--args` 的语义是"JSON 参数**文件路径**"，但绝大多数 CLI 的 `--args` 约定是内联 JSON。Agent 按直觉传内联 JSON 时，Windows 上 `{`、`:` 是非法路径字符，`read_text` 抛 `OSError`（不是 `FileNotFoundError`），逃过 `ARGS_FILE_NOT_FOUND` 分支，落进通用兜底，输出只剩异常类型名。
- 实测证据：

  ```powershell
  python -m cli_anything.indesign tool call graphics.place_image --args '{"filePath":"C:/x.png"}'
  ```

  ```json
  "error": {
    "code": "UNEXPECTED_ERROR",
    "message": "Unexpected CLI error",
    "details": { "type": "OSError" },
    "retryable": false,
    "hint": null
  }
  ```

- Agent 视角影响：这是新 Agent 第一次调用工具最可能犯的错，而拿到的错误既不说"这是路径不是 JSON"，也不给 `--args-file` / `--args -` 的替代写法。Agent 只能瞎试或问人。
- 建议：`load_args` 对以 `{`/`[` 开头的值先尝试 `json.loads`（或至少捕获 `OSError` 并归入 `ARGS_FILE_NOT_FOUND`）；给 `ARGS_FILE_NOT_FOUND`/`ARGS_REQUIRED` 补 hint："`--args` 接收文件路径；内联 JSON 请用 `--args -` 配 stdin，或写入 UTF-8 文件后用 `--args-file`"。

### P0-2 argparse 层错误完全绕过 JSON envelope

- 位置：`agent-harness/cli_anything/indesign/indesign_cli.py:72-160`（`build_parser` 未覆写 `ArgumentParser.error`）
- 问题：缺必填参数、flag 拼错、子命令拼错时，argparse 直接向 stderr 打印英文 usage 并以 exit code 2 退出。既不是 JSON，exit code 语义也在契约之外（envelope 只定义 0/1）。
- 实测证据：

  ```powershell
  python -m cli_anything.indesign tool schema
  # usage: indesign-cli tool schema [-h] tool_id
  # indesign-cli tool schema: error: the following arguments are required: tool_id
  # EXIT=2
  ```

- Agent 视角影响：Agent 端的 JSON 解析器直接失败。命令行拼装错误是 Agent 高频错误类型，恰好在这里契约断裂。对比：`indesign-cli`（无参数）能返回带 hint 的 `COMMAND_REQUIRED` envelope（`indesign_cli.py:408-413`），说明这层能力已存在，只差覆盖 argparse。
- 建议：子类化 `ArgumentParser`，`error()` 里 emit `failure(code="BAD_CLI_ARGS", details={"usage": ...}, hint=...)`。exit code 可保留 2，但输出必须是 envelope。

### P1-1 `UNEXPECTED_ERROR` 吞掉全部异常信息

- 位置：`agent-harness/cli_anything/indesign/indesign_cli.py:436-439`
- 问题：兜底 handler 只保留 `details.type`（异常类名），`str(exc)`、出错位置全部丢弃，`hint` 为 null。
- Agent 视角影响：任何未预期 bug 对 Agent 都不可诊断、不可上报细节。审查期间实测到一次真实案例（并发修改造成的瞬时 `NameError`），输出只有 `{"type": "NameError"}`，无法定位。
- 建议：附 `scrub_text_paths(str(exc))` 和最后一帧的模块内相对位置；这与"不泄露客户路径"不冲突。

### P1-2 envelope 字段在 success/failure 间不对称，且 `mcp_ok`/`tool_success` 语义失真

- 位置：`agent-harness/cli_anything/indesign/core/envelope.py:25-43`（success 硬编码 `"mcp_ok": True, "tool_success": True, "raw_result_type": "json"`）、`envelope.py:46-65`（failure 完全没有这三个字段和 `data`/`tool_id`）、`indesign_cli.py:206-212`（`emit_check` 又造出第三种形态：`ok:false` 但无 `error` 对象，错误在 `data.errors`）
- 问题：`version`、`session show` 这类不经过 MCP 的命令也返回 `mcp_ok: true`；`skills/indesign-cli/SKILL.md:129` 教 Agent "看 `ok`、`exit_code`、`tool_success`"，但 failure envelope 里根本没有 `tool_success`。`plugin validate` 失败时（实测）`tool_success: false` 却 `mcp_ok: true` 且无 `error` 对象。
- Agent 视角影响：Agent 需要为三种失败形态写三套判断；照 SKILL.md 读 `tool_success` 在失败分支会 KeyError。
- 建议：统一字段集合（failure 也带 `tool_id`/`domain`/`source`/`tool_success:false`）；`mcp_ok`/`raw_result_type` 要么按真实后端状态填，要么删除。改动时递增 `schema_version`。

### P1-3 `tool batch` 的 plan 格式在所有 Agent 文档中缺失，错误逐条挤牙膏

- 位置：`agent-harness/cli_anything/indesign/core/batch.py:34-48`；`skills/indesign-cli/SKILL.md:140`（只给命令不给格式）；`tool schema tool.batch` 只说 "JSON batch plan 路径"（`core/router.py:51-60`）
- 实测证据：全仓库 Agent 面向文档（README、README.en、SKILL.md、INDESIGN.md）中 `batch` 仅 SKILL.md 一处提及，无 plan 结构说明。写一个直觉版 plan `{"steps":[{"tool":"session.show","args":{}}]}`：

  ```json
  "code": "BATCH_STEP_INVALID",
  "message": "Batch step id is required",
  "details": { "index": 0 },
  "hint": null
  ```

  修完 `id` 还会再撞 "type must be tool"，Agent 需要 3-4 个来回才能凑出 `{"id","type":"tool","tool","args"}`。
- 建议：`BATCH_STEP_INVALID` 的 details 附一个最小合法 step 示例；SKILL.md/README 给 plan 模板；`tool schema tool.batch` 的 `plan` 描述里内嵌格式。

### P1-4 顶层 `error.message` 退化为 "MCP tool failed"，真实原因埋在 `details.result`

- 位置：`agent-harness/cli_anything/indesign/core/mcp_backend.py:208-213`（message 回退链没包含 `parsed.result`）
- 实测证据：`script run nope.jsx` 返回：

  ```json
  "code": "MCP_TOOL_FAILED",
  "message": "MCP tool failed",
  "details": { "tool": "run_jsx_file", "result": "无法访问 JSX 文件：ENOENT: ..." }
  ```

  真实原因（"无法访问 JSX 文件：ENOENT"）在 `details.result` 里，顶层 message 无信息。
- Agent 视角影响：只读 `error.message` 的 Agent 会误判为后端故障去跑 health，而不是改文件路径。此问题与 `docs/review/2026-07-02-indesign-cli-agent-ux-hardening-review.md` Finding 6 同源，实测仍未修复。
- 建议：message 回退链加 `parsed.result` 截断值；或在 `src/utils/stringUtils.js` 侧保留 message。

### P1-5 路径脱敏无 cwd 白名单，项目内路径也被打码，阻碍自我修复

- 位置：`agent-harness/cli_anything/indesign/core/paths.py:35-41`（`scrub_text_paths` 对所有盘符路径无条件替换，不像 `scrub_path` 那样先判断是否在 cwd 内）
- 实测证据：上一条 `script run nope.jsx` 中，`nope.jsx` 解析后就在当前项目目录内，错误文本仍变成 `<external_path extension=.jsx hash=516f67d07adebd82>`。
- Agent 视角影响：Agent 自己刚传入的路径被打码，多候选路径场景下无法确认是哪个文件出错；脱敏本意是保护客户资产路径，打码工作区内路径纯属误伤。
- 建议：`scrub_text_paths` 增加 cwd（和 server root）白名单，白名单内输出相对路径，其余保持 hash。

### P1-6 `ensure_ascii=True` 把全部中文输出转成 `\uXXXX` 转义

- 位置：`agent-harness/cli_anything/indesign/indesign_cli.py:33`（`json.dumps(payload, ensure_ascii=True, indent=2)`）；对比 `core/session.py:24` 写 session 用的是 `ensure_ascii=False`
- 实测证据：`tool domains` 输出中所有中文摘要形如 `"模板槽位、脚本标签..."`；所有错误 hint 同样被转义。
- Agent 视角影响：每个中文字符膨胀成 6 字节 ASCII，token 成本约 2-3 倍；hint 是给 Agent 读的核心信息，转义后可读性变差。这个 CLI 的域摘要、工具用途、hint 大量是中文，是重灾区。
- 建议：`sys.stdout.reconfigure(encoding="utf-8")` 后改 `ensure_ascii=False`（转义本是防 Windows 控制台 GBK 乱码的保守选择，显式 reconfigure 即可两全）；或提供 `--ascii` 开关保底。

### P1-7 `tool list` 上下文经济性差：单工具约 30 字段，全量近 189KB，无 compact 模式

- 位置：`agent-harness/cli_anything/indesign/core/catalog.py:247-268`（`_agent_contract` 给每个工具注入 `return_shape`/`return_example`/`failure_example`/`common_next_steps` 等大量同值 boilerplate）；`indesign_cli.py:226-227`
- 实测证据：`tool list --source classic` 输出 188,732 字节（114 个工具）；`--domain text` 10,522 字节；每个条目含 8 组几乎恒定的样板字段（`return_example: {"success": true, "data": {}, ...}` 等）。另：`tool list --callable-only` 不带 `--domain`/`--source` 时 flag 被**静默忽略**，返回的是域摘要而非工具列表（`indesign_cli.py:226` 只判断 domain/source）。
- Agent 视角影响：按域浏览一个中等域就吃掉约 3K token，其中过半是对决策无增量信息的 boilerplate；`--callable-only` 静默忽略会让 Agent 误读返回结构。
- 建议：`tool list` 默认输出瘦身为 `id`/`one_line_purpose`/`arg_names`/`destructive`/`needs_indesign`/`schema_size`，完整契约留给 `tool explain`/`tool schema`；`--callable-only` 单独出现时按全量工具过滤或明确报错。

### P1-8 `--timeout`（秒）绕过范围校验，负值产生误导性 `TIMEOUT`

- 位置：`agent-harness/cli_anything/indesign/indesign_cli.py:53-58`（只校验 `timeout_ms`，`fallback_seconds` 直通）；`core/router.py:156`（默认 30s）
- 实测证据：

  ```powershell
  python -m cli_anything.indesign tool call graphics.place_image --timeout -5
  # "code": "TIMEOUT"   （threading.Timer(-5) 立即杀掉 node 子进程）
  python -m cli_anything.indesign tool call graphics.place_image --timeout-ms -5
  # "code": "BAD_TIMEOUT", "message": "timeout_ms must be between 1 and 3600000"
  ```

- Agent 视角影响：`TIMEOUT` 自带 `retryable: true`、`state_uncertain: true` 和 "先跑 session doctor" 的 next_action，会把 Agent 引向完全错误的恢复路径（实际只是 flag 值非法）。另外 `tool call` 走 MCP 后端的默认 30s 超时在 `--help`、SKILL.md 均未提及（SKILL.md 只写了 `script run` 的 300s），长导出用 `tool call` 会莫名超时。
- 建议：`--timeout` 与 `--timeout-ms` 走同一校验；在 `tool call --help` 与 SKILL.md 写明默认 30s；`TIMEOUT` details 附上生效的超时值。

### P2-1 `session doctor` 的 `documents` 恒为 null，`session show --verbose` 是死 flag

- 位置：`agent-harness/cli_anything/indesign/core/session.py:41`（`document_state` 参数全仓库无调用方传入，grep `document_state=` 零命中）、`session.py:19`（`verbose_paths` 只在 read 时 pop，从无写入方）
- 实测证据：`session doctor` 返回 `"documents": null`；`session show --verbose` 与不带 flag 输出完全一致。
- 影响：SKILL.md 承诺的"文档状态线索"实际拿不到；doctor 对"InDesign 现在开着什么"这一最关键问题永远沉默。MCP 后端失败路径其实已解析出 `documentState`（`mcp_backend.py:200`），只是没接进 `record_call`。
- 建议：把后端返回的 `documentState` 贯通到 `record_call(document_state=...)`；删掉或实现 `--verbose`。

### P2-2 README 双语版 "147 个可调用能力" 与实测 149 漂移

- 位置：`README.md:9`、`README.md:117`、`README.en.md:9/24/148`
- 实测：`tool list` 按 source 汇总 = cli 7 + script 1 + advanced 6 + classic 114 + hidden_handler 21 = 149，全部 callable。
- 建议：改为约数（"约 150"）或由脚本生成校验，避免每次加工具都漂移。

### P2-3 `tool search` 是字面子串匹配，中英混合语料 recall 不稳

- 位置：`agent-harness/cli_anything/indesign/core/catalog.py:461-469`
- 实测：`--query 模板` 只命中 3 个 template 工具（classic 工具描述是英文）；`--query image` 命中 5 个。中文查询漏英文描述工具，英文查询漏中文描述工具，除非 id 恰好包含关键词。
- 建议：短期在文档里明示"搜索按 id/名称/用途子串匹配，建议用英文工具名词"；长期给条目加双语关键词字段。

### P2-4 一批高频错误缺 `hint`，63 个错误码无对外枚举

- 位置与实测：`ARGS_REQUIRED`（`indesign_cli.py:68`，只列 required 字段名，不说怎么传）、`SCRIPT_INPUT_REQUIRED`、`BATCH_PLAN_NOT_FOUND`、`PLUGIN_NOT_INSTALLED`（可提示先跑 `plugin list`）、`MISSING_ARGUMENT` 均 `hint: null`。Python 侧 `code=` 字面量去重 63 个，README/SKILL.md 无任何错误码清单（仅 specs/plans 有零散提及）。
- 建议：对以上高频码补一句话 hint；提供 `docs/` 错误码速查表或 `indesign-cli errors` 只读命令。

### P2-5 `--json`/`--pretty` 均为 no-op，且无紧凑输出模式

- 位置：`agent-harness/cli_anything/indesign/indesign_cli.py:32-34、78-79`（emit 恒定 `indent=2`，两个 flag 解析后从未被读取）
- 影响：无害但有成本——SKILL.md/README 的所有示例都带 `--json --pretty`，Agent 会忠实照抄，浪费命令长度；`indent=2` 恒定意味着没有单行紧凑模式可选（对 Agent 而言紧凑 JSON 更省 token）。
- 建议：让 `--pretty` 真正控制缩进（默认紧凑单行），文档示例去掉冗余 flag；或删掉两个 flag 并在 help 说明"恒为 JSON"。

### P2-6 `tool call` 无 client-side schema 校验，参数名 typo 静默放行

- 位置：`agent-harness/cli_anything/indesign/core/router.py:132-149`（MCP 路径不校验）；对比 `core/hidden_backend.py:111-116`（hidden handler 有 required 校验）
- 实测：`echo '{"filePath":123}' | ... tool call export.verify --args -` 只报 `Missing required argument: path`，对多余的 `filePath` 键无任何提示。写错参数名（如 `file_path` vs `filePath`）时，工具可能以默认值静默执行。
- 建议：调用前用已取到的 `inputSchema` 做 required + 未知键校验（schema 反正已经取了，见 `indesign_cli.py:286`），未知键报 `ARGS_UNKNOWN_KEY` 并列出合法键。

### P2-7 杂项一致性问题

- `server health --deep` 的 `indesign_com.reason` 指向 "运行 `INDESIGN_E2E=1` 的 E2E 测试"（`core/health.py:39`），应指向现成的 `--connect-indesign`。
- `export verify` 返回 `mtime` 为 epoch 浮点，与输入 `created_after` 的 ISO 格式不对称（`core/artifacts.py:56/70`），Agent 做时间比对要自己换算。
- `tool explain` 的 `failure_example` 对 CLI primitive 有误导：`export.verify` 的 failure_example 是 `MCP_TOOL_FAILED`，实际失败码是 `ARTIFACT_*` 系列（`core/catalog.py:263-264` boilerplate）。
- 帮助文本中英混排：`--timeout` 说明是英文，其余是中文（`indesign_cli.py:105、117`）。
- `agent-harness/INDESIGN.md:10` 仍用旧写法 `--args args.json`，与 "`--args-file` 推荐写法"矛盾；SKILL.md 通篇未提 `--args -`（stdin JSON）——这是 Windows 引号地狱的最优解之一，却没进 Agent 教程。
- 讨论发现（degraded 模式）：node 不在 PATH 时 `tool domains` 仍返回 `ok:true` + 18 域（好），但 warning 只有 `"advanced backend unavailable: MCP_START_FAILED"`，无 "跑 `server health` 排查" 的指引。
- `session.json` 读改写无锁（`core/session.py:22-24`），多 Agent 并发在同一项目会互相覆盖记录。
- `plugin doctor --deep` 是保留 no-op flag（`indesign_cli.py:155`）。

### 值得肯定的设计（保持）

- 渐进披露链路完整：`tool domains`（data 约 5KB）→ `search` → `schema` → `explain`，`agent quickstart` 提供最短路径。
- 错误契约整体先进：`code` + `hint` + `retryable` + `state_uncertain` + `next_action`；`DOMAIN_NOT_FOUND` 的 hint 会引导 `plugin list` → `plugin install`，是教科书级的自愈引导。
- 降级不崩：无 node 时目录回退到 CLI primitives + hidden handlers，warnings 保留。
- 编码兜底扎实：args 文件支持 UTF-8 BOM（`utf-8-sig`）、stdin 脚本多编码兜底、中文路径实测正常。
- 安全护栏已落地：`close_document` 的 `DOCUMENT_TARGET_AMBIGUOUS`/`allowDiscard` 链路在 `src/handlers/documentHandlers.js:244-290` 实测存在；health 默认不碰 COM；plugin host action allowlist 已在 manifest 校验收口（`core/plugins/manifest.py:226-236`）。
- `plugin validate` 失败输出是结构化 errors 数组（code + details + path），Agent 可直接逐条修。
- CLI 单测 1444 行，对 envelope、hint、编码、session 契约覆盖认真。

## 3. 改进路线建议（按投入产出排序）

1. **修 `--args` 内联 JSON 路径**（P0-1）：`load_args` 容错 + `ARGS_*` 系列补 hint。改动小，消灭最高频挫败点。
2. **argparse 错误 envelope 化**（P0-2）：一个 `ArgumentParser` 子类覆写 `error()`，全 CLI 契约闭环。
3. **`UNEXPECTED_ERROR` 带脱敏后异常信息**（P1-1）：一行改动，所有未知 bug 变得可诊断。
4. **`MCP_TOOL_FAILED` message 回退到 `details.result`**（P1-4）：呼应 07-02 review Finding 6，一处回退链改动。
5. **`tool list` 瘦身 + `--callable-only` 语义修正**（P1-7）：对 Agent token 成本收益最大的单项。
6. **batch step 错误附合法 step 模板 + SKILL.md 补 plan 格式**（P1-3）。
7. **`scrub_text_paths` 增加 cwd 白名单**（P1-5）。
8. **stdout UTF-8 + `ensure_ascii=False`**（P1-6）：需在 Windows 控制台/重定向两种场景验证。
9. **envelope 字段统一**（P1-2）：涉及契约变更，随 `schema_version` 递增一次性做。
10. **`--timeout` 校验 + 默认 30s 文档化**（P1-8）。
11. **文档批次**：149 计数、health reason、`--args -` 进 SKILL.md、错误码速查表、`documents` 贯通或降级承诺（P2 各条）。

## 4. 附录：实际执行的命令清单

以下命令均在 `D:\AI\mcp-indesign\agent-harness` 下以 `python -m cli_anything.indesign` 执行（未运行 `server setup`、未加 `--connect-indesign`、未安装/移除插件；`plugin doctor` 仅对不存在 id 测错误路径）：

```text
--help / tool call --help / script run --help
--version
tool domains（含输出字节测量、无 node PATH 降级测试、耗时测量）
tool list / tool list --domain template|text|html / tool list --source cli|script|advanced|classic|hidden_handler|bogus / tool list --callable-only
tool search --query image / --query 模板
tool schema graphics.place_image / template.populate_template_slots / document.create_document / no.such_tool /（缺 tool_id）
tool explain document.close_document / export.verify
tool call graphics.place_image（无参 / --args 内联 JSON / --args-file 坏 JSON / --args-file 不存在 / --timeout -5 / --timeout-ms -5）
tool call export.verify --args -（stdin，故意传错键名）
tool call no.such_tool
tool batch --plan nope.json / --plan 缺 id 的 plan / --plan 合法 plan（仅含 session.show 只读步骤）
script run（无参）/ script run nope.jsx
export verify does-not-exist.pdf / ../README.md（.md 不支持）/ 仓库内真实 PDF（外部路径脱敏验证）
session show / session show --verbose / session doctor / session clear（清理本次测试残留）
server health / server health --deep
plugin list / plugin validate ./no-such-plugin / plugin doctor not-installed
agent quickstart
（裸命令，验证 COMMAND_REQUIRED 与 exit code）
```

辅助验证：`git status`（确认 `.indesign-cli/` 已被 `.gitignore:114` 忽略、确认并发修改文件清单）、`Get-Process InDesign`（确认全程未启动 InDesign）、按 source 汇总工具数（149）、grep 校验 `document_state`/`verbose_paths` 无写入方、错误码字面量去重（63）。
