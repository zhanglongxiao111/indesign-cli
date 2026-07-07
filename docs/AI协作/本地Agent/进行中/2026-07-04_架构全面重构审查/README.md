# 架构全面重构审查

日期：2026-07-04

状态：进行中

## 目的

本目录集中保存 InDesign MCP / CLI 架构全面重构前的本地 Agent 审查材料。这里记录任务书、结构指标、子agent报告、主agent汇总和 spec 修订记录，保证重构依据可追溯。

## 关联正式文档

| 文档 | 路径 |
| ---- | ---- |
| 架构全面重构设计 | `docs/superpowers/specs/2026-07-04-indesign-architecture-refactor-design.md` |
| 架构全面重构计划 | `docs/superpowers/plans/2026-07-05-indesign-architecture-refactor-plan.md` |
| 语义契约设计 | `docs/superpowers/specs/2026-07-03-indesign-tool-semantics-design.md` |
| 语义契约计划 | `docs/superpowers/plans/2026-07-04-indesign-tool-semantics-plan.md` |

## 文档清单

| 文件 | 用途 |
| ---- | ---- |
| `00_审查总账.md` | 审查范围、子agent状态、采纳结论 |
| `01_结构图与指标.md` | 主agent用工具生成的结构指标和依赖图 |
| `任务_MCP_registry_router_Agent.md` | MCP / registry / router 审查任务书 |
| `任务_handler拆分_Agent.md` | handler 职责拆分审查任务书 |
| `任务_CLI_catalog_packaging_Agent.md` | CLI catalog / packaging 审查任务书 |
| `任务_tests_e2e_Agent.md` | 测试和真实 E2E 审查任务书 |
| `任务_对抗式架构审查_Agent.md` | 对抗式架构审查任务书 |
| `任务_plan审核_Agent_2026-07-05.md` | 架构和语义 plan 二次审核任务书 |
| `报告_*.md` | 子agent审查报告 |
| `99_汇总结论与spec修订记录.md` | 主agent汇总结论和 spec 修订记录 |

## 约束

- 子agent默认使用 `gpt-5.4-mini`、`xhigh`；单独任务书指定模型时，以任务书为准。
- 子agent只读审查，不修改代码和文档。
- 每份报告必须包含文件路径、证据、风险级别和可执行建议。
- 主agent负责落盘报告、交叉校验和修订正式 spec。
