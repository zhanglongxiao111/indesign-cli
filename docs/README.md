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
| `SYNC.md` | Windows COM 适配、迁移和运行说明 |
| `template-blueprint.md` | 模板槽位导出示例和母版槽位清单 |
| `agent-template-flow.md` | AI Agent 使用模板槽位生成页面的流程图 |

新增长期文档前，先确认是否应进入标准目录，而不是继续放在根目录。

## 当前专项

| 文档 | 用途 |
| ---- | ---- |
| `superpowers/specs/2026-07-01-indesign-cli-agent-ux-hardening-design.md` | indesign-cli Agent 体验与可靠性整改方案 |
| `superpowers/plans/2026-07-01-indesign-cli-agent-ux-hardening-plan.md` | indesign-cli Agent 体验与可靠性整改实施计划 |
| `superpowers/specs/2026-07-03-indesign-cli-agent-bootstrapper-design.md` | indesign-cli Agent 单文件自举发布与强制更新方案 |
| `superpowers/specs/2026-07-03-indesign-tool-semantics-design.md` | InDesign 工具语义全面提升方案 |
