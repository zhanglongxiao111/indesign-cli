# Agent 反馈循环

本目录存放 `indesign-cli` 反馈闭环的过程材料：分析 Agent 任务书、周期周报、摩擦簇追踪和 issue 草稿。

这里的材料不替代正式技术决策。已经确认要长期遵守的流程约束，沉淀到 `docs/技术决策/2026-07-06-agent反馈闭环流程.md`。

## 目录内容

| 文档 | 用途 |
| ---- | ---- |
| `分析Agent任务书.md` | 给定时分析 Agent 使用的固定任务说明 |
| `周报_YYYY-MM-DD.md` | 每期聚合分析结果、北极星指标和摩擦簇摘要 |
| `摩擦簇_FC-YYYYMMDD-NN.md` | 单个摩擦簇的证据、修复建议和跟踪状态 |

## 输入与输出

- 输入：`\\daga-nas5\sa-ai-app\feedback-reports\indesign-cli-telemetry\sessions\**\*.jsonl`
- 聚合脚本：`scripts/feedback/aggregate.py`
- 聚合输出：`\\daga-nas5\sa-ai-app\feedback-reports\indesign-cli-telemetry\reports\`

## 隐私边界

- 只读取白名单遥测字段。
- 周报和摩擦簇只能引用脱敏轨迹、`origin_key`、`cwd_hash`、工具 id、错误码和统计结果。
- 不写客户文档内容、客户名称、参数值、脚本内容或完整路径。
