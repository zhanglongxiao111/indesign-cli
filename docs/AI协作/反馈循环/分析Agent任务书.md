# 分析 Agent 任务书

## 目标

周期性分析 `indesign-cli` 共享遥测，生成周报、识别摩擦簇、起草修复 issue，并复核已修复簇的指标是否下降。

## 频率

- 普及初期：每 2-3 天运行一次。
- 稳定后：每周运行一次。

## 固定输入

```powershell
$TelemetryRoot="\\daga-nas5\sa-ai-app\feedback-reports\indesign-cli-telemetry"
$Aggregate="\\daga-nas5\sa-ai-app\feedback-reports\indesign-cli-telemetry\reports\aggregate_YYYY-MM-DD.json"
python scripts\feedback\aggregate.py --input $TelemetryRoot --output $Aggregate
```

## 执行步骤

1. 运行 `aggregate.py`，确认输出包含 `totals`、`by_cli_version`、`friction`、`origin_distribution` 和 `cwd_distribution`。
2. 读取聚合结果；必要时抽样查看原始 JSONL，但只能引用白名单字段和脱敏轨迹。
3. 写 `docs/AI协作/反馈循环/周报_YYYY-MM-DD.md`。
4. 对达到阈值的摩擦分配簇 ID：`FC-YYYYMMDD-NN`。
5. 为每个摩擦簇起草 issue，包含证据、影响范围、建议修复通道和承接测试。
6. 复核上期已修复簇：按 `cli_version` 对比修复前后指标；没有下降的标记为 `reopened`。

## 周报必须包含

- 北极星指标：escape hatch 率、首次成功率、会话收尾质量、每任务调用数分布。
- 明确标注：会话收尾质量只是代理指标；被放弃的真实任务不一定能被完全观测。
- `error_code × tool_id` Top N。
- 重试率排行。
- `script.run` escape hatch 的前序失败工具统计。
- feedback 按 code 分组，并关联工具。
- `origin_key` / `cwd_hash` 分布，用于判断样本是否被少数来源偏置；不得还原身份或路径。

## 摩擦簇阈值

满足任一条件即可建簇：

- 同一 `error_code × tool_id` 影响 3 个及以上 session。
- 某工具失败数不少于 5，且重试率不低于 30%。
- 某工具在 `escape_hatch_precursors` 中出现 2 次及以上。
- 同一工具同一 feedback code 出现 2 次及以上。

## issue 草稿格式

```markdown
## 簇 ID

FC-YYYYMMDD-NN

## 证据

- 指标：
- 脱敏轨迹：
- 影响版本：

## 建议通道

- 快通道 / 正常修复 / 架构修复：

## 承接测试

- 错误信息类：
- 工具缺口类：
- schema 类：
- 文档类：
```

## 修复后复核

- 修复 PR 必须引用簇 ID。
- 发版后按 `cli_version` 切片比较指标。
- 没有承接测试的修复不算闭环。
