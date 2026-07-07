# InDesign CLI Agent 反馈闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/superpowers/specs/2026-07-06-indesign-agent-feedback-loop-design.md` 落地五层反馈闭环：被动遥测、`feedback` CLI 域、SKILL 行为规则、确定性聚合脚本、分析 agent 任务书与闭环流程规范。

**Architecture:** 遥测和 `feedback` 域全部在 Python CLI 侧（`cli.primitive` overlay，不进 Node registry）；事件白名单 schema、每次调用双写（本地 session 目录 + 共享收集目录）；会话级指标与重试链由分析端从事件流推导，CLI 侧不计算；聚合是确定性脚本，LLM 只做周报表述和修复建议。

**Tech Stack:** Python CLI harness（`agent-harness/cli_anything/indesign/`）、JSONL、现有 session / envelope / catalog 机制、cron 分析 agent。

---

## 计划口径

- **时序采纳 spec §10 方案 A**：批 1（Task 1–3）必须在终态重构计划（`2026-07-06-indesign-terminal-architecture-plan.md`）的 Task 0 golden master 录制**之前**完成合并——feedback 域会改变 `tool list` 输出，先合并再录快照。批 2（Task 4–5）只新增脚本和文档，不改 CLI 行为，不受重构冻结影响，可随时执行。
- 本计划不触碰 Node 侧代码（`src/`），与终态重构、语义计划零文件冲突。
- 遥测事件字段白名单是硬边界：只允许 spec §5.1 列出的字段；禁止记录参数值、脚本内容、文档内容、文件路径、客户名。
- CLI contract 变化（新增 `feedback` 域）按 `AGENTS.md` 同步：CLI 单元测试、`README.md` / `README.en.md`、`skills/indesign-cli/SKILL.md`。
- 不写伪代码。每个任务只描述文件范围、机械动作、验证命令和完成条件。

## 执行前必读

- `docs/superpowers/specs/2026-07-06-indesign-agent-feedback-loop-design.md`：五层架构、事件模型、隐私边界、北极星指标定义。
- `agent-harness/cli_anything/indesign/core/catalog.py`：`CLI_PRIMITIVES` 注册形态（`feedback` 域照此登记）。
- `agent-harness/cli_anything/indesign/indesign_cli.py`：子命令解析与统一 emit 路径（遥测挂点）。
- `AGENTS.md` §2.5：CLI 开发边界与隐私规则。

---

## Task 1: 遥测核心

**Files:**
- Create: `agent-harness/cli_anything/indesign/core/telemetry.py`
- Modify: `agent-harness/cli_anything/indesign/indesign_cli.py`
- Modify: `agent-harness/cli_anything/indesign/core/batch.py`
- Create: `agent-harness/cli_anything/indesign/tests/test_feedback.py`

- [ ] `telemetry.py` 提供 `record_event(event_dict)`：按白名单 schema 过滤字段（未知字段丢弃）、append 到本地 session 目录 `telemetry.jsonl`；若 `INDESIGN_CLI_TELEMETRY_DIR` 已配置，双写到 `<收集目录>/<session_id>.jsonl`；任何写失败静默降级，绝不抛错影响命令结果。
- [ ] 事件字段（白名单全集）：`ts`、`session_id`、`cli_version`、`registry_hash`（当前缺省，终态重构落地后填充）、`event`、`tool_id`、`source`、`ok`、`error_code`、`duration_ms`、`arg_keys`、`via_batch`、`code`、`note`、`recent_calls`。
- [ ] `INDESIGN_CLI_TELEMETRY=off` 完全禁用（不写本地也不写收集目录）。
- [ ] 在 `indesign_cli.py` 的统一 envelope emit 路径挂接：每次 `tool call`（含 primitive、plugin、hidden）结束时记一条 `tool_call` 事件；`error_code` 取 envelope 现有结构化错误标识，缺失时记 `"UNSTRUCTURED"`；`arg_keys` 只取 payload 顶层字段名。
- [ ] `tool.batch` 的每个子调用各记一条事件，`via_batch: true`。
- [ ] 路径类参数不进 `arg_keys` 值域（本就只记字段名，此条为测试断言点）。
- [ ] `test_feedback.py` 覆盖：白名单过滤（塞入非法字段被丢弃）、off 开关、双写目录生效、收集目录不可写时静默降级、batch 子调用事件、`arg_keys` 无参数值。

**Verify:**

- [ ] `python -m pytest agent-harness\cli_anything\indesign\tests\test_feedback.py -q`
- [ ] `python -m pytest agent-harness\cli_anything\indesign\tests -q`
- [ ] 手动冒烟：`indesign-cli server health` 后确认 session 目录出现 `telemetry.jsonl` 且无参数值、无路径。

**Complete when:**

- [ ] 任意 CLI 调用自动产生符合白名单的遥测事件，隐私断言有测试保护。
- [ ] 遥测故障不影响任何命令的返回。

## Task 2: feedback 域 primitive

**Files:**
- Modify: `agent-harness/cli_anything/indesign/core/catalog.py`
- Modify: `agent-harness/cli_anything/indesign/indesign_cli.py`
- Modify: `agent-harness/cli_anything/indesign/tests/test_feedback.py`

- [ ] `catalog.py` 的 `CLI_PRIMITIVES` 登记 `feedback.report`（`source: cli.primitive`，`side_effects: ["session_write"]`），schema：`code`（enum：`TOOL_GAP` / `DOC_UNCLEAR` / `ERROR_MESSAGE_USELESS` / `SCHEMA_CONFUSING` / `UNEXPECTED_BEHAVIOR` / `PERFORMANCE` / `MISSING_EXAMPLE`，必填）、`note`（string，maxLength 500，必填）、`tool`（可选，关联工具 id）。
- [ ] `indesign_cli.py` 新增 `feedback report` 子命令；执行时记一条 `feedback` 遥测事件，自动附加 `session_id`、`cli_version`、最近 5 条 `tool_call` 事件摘要（`recent_calls`，脱敏形态：tool_id + ok + error_code）。
- [ ] 命令帮助文本明示：`note` 不得包含客户文档内容、客户名称或文件路径。
- [ ] 返回标准 v2 envelope；`tool list` / `tool schema feedback.report` / `tool explain feedback.report` 可发现。
- [ ] 测试覆盖：enum 校验拒绝非法 code、note 超长拒绝、事件落盘含 `recent_calls`、catalog 契约（`feedback` 域出现在 `tool domains`）。

**Verify:**

- [ ] `python -m pytest agent-harness\cli_anything\indesign\tests -q`
- [ ] `indesign-cli tool domains`（含 `feedback`）
- [ ] `indesign-cli tool schema feedback.report`
- [ ] `indesign-cli feedback report --code TOOL_GAP --note "smoke test"`
- [ ] `git diff --check`

**Complete when:**

- [ ] `feedback.report` 与内置工具走同一 envelope / session / schema 契约。
- [ ] 上报事件与遥测走同一收集通道。

## Task 3: SKILL 规则与文档同步（批 1 收口）

**Files:**
- Modify: `skills/indesign-cli/SKILL.md`
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `AGENTS.md`

- [ ] SKILL.md 写入四条行为规则：用 `script.run` 兜底前先 `feedback report --code TOOL_GAP`；同一工具连续失败 2 次靠猜成功后报 `SCHEMA_CONFUSING` 或 `ERROR_MESSAGE_USELESS`；文档查不到靠试错解决后报 `DOC_UNCLEAR`；上报是摩擦瞬间的一次性动作，不做会话末尾总结。
- [ ] README / README.en 增加 `feedback` 域用法、遥测说明（记录什么、不记录什么）、`INDESIGN_CLI_TELEMETRY` / `INDESIGN_CLI_TELEMETRY_DIR` 配置。
- [ ] `AGENTS.md` §2.5 增加一行长期约束：遥测字段白名单制，禁止记录参数值与客户信息；新增字段必须过 review。
- [ ] 确认 `skills/indesign-cli/preview.png` 是否仍匹配更新后的 Skill 说明。
- [ ] **批 1 合并检查点**：本任务完成并合并后，才允许终态重构执行 Task 0 golden master 录制。

**Verify:**

- [ ] `rg -n "feedback report|TOOL_GAP|INDESIGN_CLI_TELEMETRY" skills/indesign-cli/SKILL.md README.md README.en.md AGENTS.md`
- [ ] `git diff --check`
- [ ] `python -m pytest agent-harness\cli_anything\indesign\tests -q`

**Complete when:**

- [ ] Agent 侧行为规则、用户侧配置说明、项目级隐私约束三处口径一致。

## Task 4: 确定性聚合脚本

**Files:**
- Create: `scripts/feedback/aggregate.py`
- Create: `scripts/feedback/fixtures/sample/`（3–4 个构造的 `<session_id>.jsonl`，覆盖：正常会话、含重试会话、escape hatch 会话、被放弃会话、含 feedback 会话）
- Create: `scripts/feedback/fixtures/expected.json`

- [ ] `aggregate.py --input <收集目录> --output <聚合JSON路径>`：读全部 JSONL，丢弃未知字段和坏行（计数报告，不中断）。
- [ ] 会话级推导：按 `session_id` 聚合调用数、错误数、`script.run` 数、末次调用是否成功；`retry` 由同 session 相邻同工具"失败→再调"推导。
- [ ] 输出北极星指标（按 `cli_version` 切片）：escape hatch 率、首次成功率、会话收尾质量（标注代理指标局限）、每任务调用数分布。
- [ ] 输出摩擦分析：`error_code × tool_id` 频次 Top N、重试率排行、**escape hatch 关联**（每次 `script.run` 的前序失败工具统计）、feedback 按 code 分组并关联 tool。
- [ ] 会话来源分布只输出数量分布，不含任何身份信息。
- [ ] `--check-golden scripts/feedback/fixtures/expected.json`：对 fixture 输入比对期望输出，作为脚本自身的回归入口。

**Verify:**

- [ ] `python scripts/feedback/aggregate.py --input scripts/feedback/fixtures/sample --check-golden scripts/feedback/fixtures/expected.json`
- [ ] 对 Task 1–2 冒烟产生的真实收集目录跑一次，人工确认输出合理。

**Complete when:**

- [ ] 四个北极星指标与 escape hatch 关联分析可从任意收集目录一键产出。
- [ ] fixture golden 保护聚合逻辑不回归。

## Task 5: 分析 agent 任务书与闭环流程规范

**Files:**
- Create: `docs/AI协作/反馈循环/README.md`
- Create: `docs/AI协作/反馈循环/分析Agent任务书.md`
- Create: `docs/技术决策/2026-07-06-agent反馈闭环流程.md`
- Modify: `docs/README.md`

- [ ] `README.md`（目录入口）：说明本目录存放周报、摩擦簇追踪和分析 agent 材料。
- [ ] `分析Agent任务书.md`（cron agent 的固定 prompt 底稿）：跑 `aggregate.py` → 读聚合结果与抽样脱敏轨迹 → 写 `周报_YYYY-MM-DD.md` → 对达到阈值的摩擦簇分配簇 ID（`FC-YYYYMMDD-NN`）并起草 issue（证据 + 建议通道分级）→ 核对上期已修复簇的指标，未下降标 `reopened`。周报必须标注"会话收尾质量"是代理指标。
- [ ] `技术决策` 文档沉淀长期流程约束：快通道白名单（错误信息文本、description 文案、SKILL、README 示例——只改文案不改行为）；任何修复 PR 必须引用簇 ID；**没有承接测试的修复不算闭环**（错误信息类→单测断言、工具缺口类→E2E 场景、schema 类→契约测试）；发版后按 `cli_version` 切片对比指标验证修复生效。
- [ ] `docs/README.md` 登记 `docs/AI协作/反馈循环/` 目录和技术决策文档。
- [ ] 建议的 cron 频率写入任务书：普及初期每 2–3 天，稳定后每周。

**Verify:**

- [ ] `rg -n "FC-|承接测试|快通道" docs/AI协作/反馈循环 docs/技术决策`
- [ ] `git diff --check`

**Complete when:**

- [ ] 分析 agent 可按任务书无人值守运行；修复闭环规则有长期文档依据。

---

## 执行顺序

1. Task 1 → 2 → 3 串行（批 1），完成后合并——这是终态重构 Task 0 的前置。
2. Task 4 → 5（批 2）随时可做，不受重构冻结影响；建议在公司普及开始后两周内就位，赶上第一批真实数据。

## 最小验证集合（每批次结束）

```powershell
git diff --check
python -m pytest agent-harness\cli_anything\indesign\tests -q
indesign-cli tool domains
indesign-cli tool schema feedback.report
```

## 运营验收（系统上线后，非代码验收）

- [ ] 收集目录出现 ≥ 20 个真实会话的遥测文件，抽查无隐私泄露。
- [ ] 分析 agent 产出第一期周报，含北极星指标基线和至少一个带簇 ID 的摩擦簇。
- [ ] 至少一个摩擦簇走完"上报 → 聚类 → 修复 → 承接测试 → 指标下降"完整闭环，记录在周报中作为流程验收样本。
