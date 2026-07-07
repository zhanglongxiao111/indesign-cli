# InDesign CLI Agent 反馈闭环系统设计

日期：2026-07-06

状态：正式方案，待排期实施。

## 1. 第一性原理

本工具的用户是 AI Agent，不是人类。这改变了反馈系统的全部设计前提：

1. **Agent 的完整"想法"写在行为轨迹里。** 人类产品需要问卷，因为看不见用户脑内过程；Agent 的每次工具调用、报错、重试、绕路，CLI 全部可见。最高质量的反馈不是"要求 Agent 说感受"，而是让工具观察自己被怎么用。
2. **会话末尾问卷是污染信号。** LLM 天然倾向礼貌好评，且末尾总结受近因偏差影响。主动反馈必须移到摩擦发生的瞬间，且必须结构化（枚举 code），否则无法自动聚合。
3. **逃生舱是最好的传感器。** Agent 放弃结构化工具、退回 `script.run` 裸写 JSX 的每一次，都是"产品有缺口"的铁证，比任何主观反馈都硬。
4. **循环速度 = 采集 + 分诊 + 修复 + 验证 + 分发的串行延迟。** 人肉环节是瓶颈；压缩方式是采集全自动（遥测）、分诊自动聚类、修复分级放行、验证由 eval 承接。人只出现在两个位置：review 快通道 PR、决策中慢通道优先级。
5. **修复必须有 eval 承接，否则循环不闭合。** 每个摩擦簇解决时固化为回归测试；eval 套件随反馈复利增长，逐渐成为"agent 体验"的可执行规格。

## 2. 目标

1. 100% 会话被动遥测覆盖，零打扰、零内容泄露。
2. Agent 在摩擦瞬间可用一条命令结构化上报，成为使用流程的一部分。
3. 分诊无人值守：定时分析产出聚类周报和 issue 草稿。
4. 文档/错误信息类修复达到小时级—天级；工具类修复天级—周级。
5. 北极星指标可按 CLI 版本切片对比，验证改进真实生效。

## 3. 非目标

- 不引入常驻后台服务、网络上报协议或第三方遥测 SDK（遵守 `AGENTS.md`：CLI 无常驻进程；收集 = 本地文件 + 共享目录）。
- 不记录客户文档内容、客户名称、完整资产路径（遵守 `AGENTS.md` 2.4/2.5 隐私边界）。
- 不做用户（人类）行为分析；对象只是 Agent 与工具的交互。
- 不在本方案内实现自动修复合并——快通道产出 PR 草稿，合并始终有人 review。

## 4. 总体架构：五层

```text
第 0 层  被动遥测       CLI 自动记录结构化事件（每次调用、每个会话）
第 1 层  摩擦上报       feedback CLI primitive，摩擦瞬间、枚举 code
第 2 层  聚类分诊       确定性聚合脚本 + 定时分析 agent → 周报 / issue 草稿
第 3 层  分级修复       快（文档/错误文本）/ 中（schema/新工具）/ 慢（架构）
第 4 层  eval 承接      摩擦簇 → 回归场景 → 修复验证 → 防复发
```

## 5. 第 0 层：被动遥测

### 5.1 事件模型

CLI 在每次工具调用结束和会话结束时，append 一行 JSON 到当前 session 目录的 `telemetry.jsonl`。字段白名单制——只允许 schema 列出的字段，新增字段必须过 review：

```json
{
  "ts": "2026-07-06T10:00:00Z",
  "session_id": "…",
  "cli_version": "0.4.0",
  "registry_hash": "…",
  "event": "tool_call",
  "tool_id": "pageitem.move_page_item",
  "source": "classic",
  "ok": false,
  "error_code": "SCHEMA_VALIDATION_FAILED",
  "duration_ms": 840,
  "arg_keys": ["pageIndex", "itemIndex", "x", "y"],
  "retry_of": "prev-call-id"
}
```

- `tool_call` 事件：`tool_id`、`source`（classic / advanced / hidden_handler / plugin / primitive）、`ok`、结构化 `error_code`、`duration_ms`、`arg_keys`（**只记字段名，不记值**）、`via_batch`（`tool.batch` 子调用标记）。
- `feedback` 事件：见第 1 层。
- **不设 `session_end` 事件**：CLI 是每次调用一个进程的模型，没有可靠的会话结束时机，且被放弃的会话（最需要捕获的样本）永远不会触发显式结束。会话级指标（调用数、错误数、`script.run` 数、末次调用是否成功、重试链）全部由分析端从事件流按 `session_id` 推导。`retry_of` 同理由分析端从"同 session 相邻同工具失败后重试"推导，CLI 侧不计算。
- `registry_hash` 在终态重构落地前缺省（当时尚无 artifact），落地后必填。

### 5.2 隐私边界（硬规则）

- 禁止记录：参数值、脚本内容、文档内容、文件路径、客户名。路径类参数只记录"存在与否"。
- 遥测 schema 是白名单；分析端遇到未知字段直接丢弃。
- 开关：`INDESIGN_CLI_TELEMETRY=off` 完全禁用；默认开启但仅落本地。

### 5.3 收集

- 环境变量 `INDESIGN_CLI_TELEMETRY_DIR` 指向公司共享收集目录（UNC 路径即可）。
- **每次调用双写**：事件同时 append 到本地 session 目录和收集目录（收集目录文件名 = `<session_id>.jsonl`）。被放弃的会话数据因此不丢失。写收集目录失败静默降级为仅本地，不影响任务。
- 不做服务端。文件堆 + 定时分析，KISS。

## 6. 第 1 层：摩擦上报（feedback 域）

### 6.1 CLI primitive

新增 `feedback` 域（`source: cli.primitive`，Python 侧定义，遵守 overlay 规则）：

```text
indesign-cli feedback report --code TOOL_GAP --note "无法批量替换段落样式，只能逐个调用" [--tool style.apply]
```

- code 枚举：`TOOL_GAP`、`DOC_UNCLEAR`、`ERROR_MESSAGE_USELESS`、`SCHEMA_CONFUSING`、`UNEXPECTED_BEHAVIOR`、`PERFORMANCE`、`MISSING_EXAMPLE`。
- 自动附加：session_id、cli_version、registry_hash、最近 5 条 tool_call 事件摘要（脱敏形态）。
- `--note` 限长（如 500 字符），命令帮助文本明确提醒：不得包含客户文档内容或路径。
- 记录为 `feedback` 遥测事件，走同一收集通道。

### 6.2 SKILL.md 行为规则（写进 `skills/indesign-cli/SKILL.md`）

1. **不得不用 `script.run` 完成任务时，先 `feedback report --code TOOL_GAP`**，一句话说明想做什么。
2. 同一工具连续失败 2 次后靠改参数猜测成功的，报 `SCHEMA_CONFUSING` 或 `ERROR_MESSAGE_USELESS`。
3. 在文档/SKILL 里找不到答案、靠试错解决的，报 `DOC_UNCLEAR` 并写清当时想查什么。
4. 上报是一次性动作，不要求会话末尾总结，不要求礼貌评价。

这四条把反馈变成使用流程的组成部分，采样点全部落在摩擦瞬间。

## 7. 第 2 层：聚类分诊

### 7.1 确定性聚合（脚本，不靠 LLM）

`scripts/feedback/aggregate.py`（或 `.mjs`）读收集目录全部 JSONL，输出聚合 JSON：

- error_code × tool_id 频次 Top N。
- 重试率排行（`retry_of` 链）。
- **escape hatch 关联分析**：每次 `script.run` 调用的前序失败工具是什么——"想用 X 没成功、退回裸脚本"是最高信号的产品缺口证据。
- feedback 按 code 分组，关联 tool。
- 北极星指标按 `cli_version` 切片。

### 7.2 北极星指标（"agent 体验"的操作性定义）

| 指标 | 定义 | 方向 |
| ---- | ---- | ---- |
| escape hatch 率 | `script.run` 调用数 ÷ 全部业务工具调用数 | ↓ |
| 首次成功率 | 无 `retry_of` 且 `ok` 的调用占比 | ↑ |
| 会话收尾质量 | 以成功调用结尾的会话占比（任务完成的代理指标，非精确） | ↑ |
| 每任务调用数 | session 内 tool_call 数分布 | ↓ |

会话收尾质量是代理指标，周报中必须如实标注局限，不得当作完成率宣传。

### 7.3 定时分析 agent

- 用 cron/schedule 定期运行（建议每周，普及初期可每 2-3 天）。
- 固定流程：跑聚合脚本 → 读聚合结果 + 抽样脱敏轨迹 → 写周报 `docs/AI协作/反馈循环/周报_YYYY-MM-DD.md` → 对达到阈值的摩擦簇起草 issue（含簇 ID、证据、建议通道分级）。
- 摩擦簇 ID 规则：`FC-YYYYMMDD-NN`，周报间延续追踪；已修复簇若指标未降，标记 `reopened`。

## 8. 第 3 层：分级修复通道

| 通道 | 范围（白名单） | 流程 | 时延目标 |
| ---- | -------------- | ---- | -------- |
| 快 | 错误信息文本、tool description / schema description 文案、SKILL.md、README 用法示例 | 开发 agent 依据摩擦簇自动起草 PR，人 review 合并 | 小时—天 |
| 中 | schema 字段增减、新窄语义工具（走终态"新增工具标准动作"）、语义 warning 补充 | 正常开发流程，引用簇 ID | 天—周 |
| 慢 | 架构、插件协议、envelope 版本 | spec / plan 流程 | 按计划 |

规则：

- 快通道**禁止**触碰 handler 逻辑和 schema 结构——只改"数据"（文案），不改"行为"。对 Agent 而言文档和错误信息就是产品 UI，这类修复占体验改善大头且风险极低。
- 任何通道的修复 PR 必须引用摩擦簇 ID，并附第 4 层的承接测试。
- CLI contract 相关修复照旧遵守 `AGENTS.md`：同步 CLI 单测、README、SKILL.md。

## 9. 第 4 层：eval 承接

- 摩擦簇解决时，必须新增对应回归资产：
  - 错误信息类 → 单测断言新错误文本包含可执行指引。
  - 工具缺口类 → E2E 场景（进 `tests/real-e2e/scenarios/`）。
  - schema 类 → schema 单测 + CLI 契约测试。
  - 文档类 → 至少在周报核对项中记录验证方式。
- **没有承接测试的修复不算闭环**；分析 agent 下一周期核对该簇指标，未下降则 `reopened`。
- 遥测带 `cli_version` + `registry_hash`，发版后周报自动对比前后指标，验证修复真实生效。

## 10. 与终态架构和语义计划的关系

- `feedback` 域是 `cli.primitive`，落在 Python 侧，遵守终态 overlay 规则（不进 Node registry，不被 artifact 覆盖）。
- 遥测的 `error_code` 结构化程度受益于语义计划的 warning/错误契约；两者相互独立，可并行。
- 实施冲突点只有一个：终态重构 Task 0 的 golden master 会快照 CLI `tool list` 输出，feedback 域会改变该输出。因此实施时序二选一：
  - **方案 A（推荐）**：批 1（遥测 + feedback 域 + SKILL 规则，1-2 天量级）在终态重构启动**前**合并——公司普及在即，越早收集基线数据越好，且重构和语义改造期间的遥测本身就是最有价值的对照数据；golden master 在其合并后录制。
  - **方案 B**：全部排在终态重构合并后，与语义计划并行。
- 批 2（聚合脚本 + 分析 agent + 快通道流程 + 周报目录）随后独立实施，不受重构冻结影响（纯新增脚本和文档）。

## 11. 风险与控制

| 风险 | 控制 |
| ---- | ---- |
| note 自由文本泄露客户信息 | 限长 + 命令帮助明示禁令 + SKILL 规则 + 周报引用时人工过目 |
| 遥测字段膨胀失控 | 白名单 schema + 新字段必须 review + 分析端丢弃未知字段 |
| 共享目录不可达阻塞任务 | 复制失败静默降级本地，绝不影响工具调用结果 |
| Agent 滥报/漏报 | 被动遥测不依赖 Agent 自觉，是兜底真相；上报只是增强信号 |
| 快通道 PR 改坏行为 | 白名单只含文案；CI 跑 required 门禁；人 review |
| 指标被单一高频用户偏置 | 聚合按 session 加权，周报标注会话来源分布（不含身份） |
| 代理指标误读 | 周报固定标注"会话收尾质量"的局限性 |

## 12. 完成标准

- 任意一次 CLI 会话自动产生 telemetry.jsonl，字段符合白名单，无内容泄露。
- `feedback report` 可用，SKILL.md 四条规则生效。
- 聚合脚本对收集目录可产出全部北极星指标和 escape hatch 关联分析。
- 分析 agent 产出至少一期周报和带簇 ID 的 issue 草稿。
- 至少一个摩擦簇走完"上报 → 聚类 → 修复 → 承接测试 → 指标下降"完整闭环，作为流程验收样本。
