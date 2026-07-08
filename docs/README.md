# 文档目录说明

本目录用于放长期可追溯的项目文档。`AGENTS.md` 是项目级协作入口，本文只规定文档放置位置。

## 仓库级入口

这些文件不放在 `docs/` 下，但属于当前项目入口或对外分发资料：

| 路径 | 用途 |
| ---- | ---- |
| `../AGENTS.md` | 项目级 Agent 协作规则、目录职责和执行基线 |
| `../README.md` / `../README.en.md` | 面向人类用户的项目说明、安装和能力概览 |
| `../skills/indesign-cli/SKILL.md` | 可手动复制到其他项目的 InDesign CLI 配套 Agent Skill |
| `../skills/indesign-cli/preview.png` | InDesign CLI 配套 Skill 预览图 |

## 标准目录

| 目录 | 用途 | 命名建议 |
| ---- | ---- | -------- |
| `AI协作/` | 本地 Agent、外部咨询、用户反馈等过程材料 | 见 `AI协作/README.md` |
| `技术决策/` | 已确认的长期技术决策、架构取舍和影响范围 | `YYYY-MM-DD_主题.md` |
| `系统地图/` | 架构图、模块关系、工具链路、运行流程 | `主题.md` 或 `index.md` |
| `superpowers/specs/` | 方案设计、问题分析、边界定义、备选方案 | `YYYY-MM-DD-topic-design.md` |
| `superpowers/plans/` | 实施计划、阶段拆分、验证清单 | `YYYY-MM-DD-topic-plan.md` |
| `bugfix/` | 复杂缺陷根因、修复过程、回归记录 | `YYYY-MM-DD_问题.md` |
| `review/` | 当前有效 review、复盘和审查结论 | `YYYY-MM-DD_主题.md` |
| `image/` | 文档图片资源 | 跟随引用文档分目录 |
| `legacy/` | 历史资料，只追溯 | 保持原名或按来源归档 |

## 根文档

| 文档 | 用途 |
| ---- | ---- |
| `MCP_INSTRUCTIONS.md` | MCP 接入、工具能力、使用说明 |
| `LLM_PROMPT.md` | 给 LLM 使用 MCP 工具的提示词示例 |
| `SYNC.md` | Windows COM 执行通道、MCP / CLI 运行同步和终态架构入口说明 |
| `template-blueprint.md` | 模板槽位导出示例和母版槽位清单 |
| `agent-template-flow.md` | AI Agent 使用模板槽位生成页面的流程图 |

新增长期文档前，先确认是否应进入标准目录，而不是继续放在根目录。

## 当前专项

| 文档 | 用途 |
| ---- | ---- |
| `superpowers/specs/2026-07-01-indesign-cli-agent-ux-hardening-design.md` | indesign-cli Agent 体验与可靠性整改方案 |
| `superpowers/plans/2026-07-01-indesign-cli-agent-ux-hardening-plan.md` | indesign-cli Agent 体验与可靠性整改实施计划 |
| `superpowers/specs/2026-07-03-indesign-cli-agent-bootstrapper-design.md` | indesign-cli Agent 单文件自举发布与强制更新方案 |
| `superpowers/specs/2026-07-08-indesign-cli-agent-user-update-design.md` | indesign-cli Agent 用户级单 EXE 更新方案（NAS 优先、GitHub 兜底、Agent 主动更新） |
| `superpowers/specs/2026-07-03-indesign-tool-semantics-design.md` | InDesign 工具语义领域设计（落点以 2026-07-06 语义 plan 为准） |
| `superpowers/specs/2026-07-06-indesign-terminal-architecture-design.md` | 终态架构设计（tool-module 共置、一次性重构） |
| `superpowers/plans/2026-07-06-indesign-terminal-architecture-plan.md` | 终态架构一次性重构实施计划 |
| `superpowers/plans/2026-07-06-indesign-tool-semantics-plan.md` | 语义契约实施计划（终态口径） |
| `superpowers/specs/2026-07-06-indesign-agent-feedback-loop-design.md` | Agent 反馈闭环系统设计 |
| `superpowers/plans/2026-07-06-indesign-agent-feedback-loop-plan.md` | Agent 反馈闭环实施计划 |
| `AI协作/反馈循环/README.md` | Agent 反馈循环周报、摩擦簇和分析材料目录 |
| `AI协作/反馈循环/分析Agent任务书.md` | 定时分析 Agent 的固定任务书 |
| `技术决策/2026-07-07_终态架构.md` | 终态架构长期决策：tool-module 共置、profiles/internal、artifact 单向投影、无 fallback |
| `技术决策/2026-07-06-agent反馈闭环流程.md` | Agent 反馈闭环的长期流程约束 |

已取代存档：`2026-07-04-indesign-architecture-refactor-design.md`、`2026-07-05-indesign-architecture-refactor-plan.md`、`2026-07-04-indesign-tool-semantics-plan.md`（顶部均有取代标注，不要按其执行；旧 `src/handlers/`、`src/types/`、`src/core/InDesignMCPServer.js` 口径只作为历史资料追溯）。

### 当前计划全局执行顺序（2026-07-06 确定）

```text
1. 反馈闭环批 1（feedback plan Task 1–3：遥测 + feedback 域 + SKILL 规则）
2. 终态架构重构（terminal-architecture plan Task 0–7，专用分支，golden master 门禁）
3. 语义契约计划（semantics plan Task 1–8）

反馈闭环批 2（feedback plan Task 4–5：聚合脚本 + 分析 agent）与上述任意阶段并行。
```

硬约束：批 1 必须先于重构 Task 0 合并（feedback 域改变 `tool list` 输出，golden master 须在其之后录制）；语义计划必须等终态架构重构合并 `master` 后启动。各计划的"计划口径"一节记录了同样的依赖，以本节为全局总览。
