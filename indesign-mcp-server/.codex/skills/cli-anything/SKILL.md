---
name: cli-anything
description: 当用户要把本项目或 Adobe InDesign 自动化能力 CLI 化、构建/优化/测试/验证 CLI-Anything harness、或要求生成 agent 可用命令行接口时使用。
---

# CLI-Anything 项目级 Skill

本 skill 是当前仓库的项目级 CLI 化入口，来源参考 `D:\AI\clianything`。

当用户要求“CLI 化”“做成 CLI”“生成 harness”“按 CLI-Anything 改造”“让 Agent 通过命令行操作 InDesign”时，优先按本 skill 工作。

## 方法论来源

完整方法论已复制到：

`references/HARNESS.md`

实现前先阅读该文件中与当前任务相关的章节，尤其是：

- `MCP Backend Pattern`
- `Directory Structure`
- `Principles & Rules`
- `Testing Strategy`
- `SKILL.md Generation`
- `PyPI Publishing and Installation`

## 本项目的目标软件定位

目标不是重新实现 InDesign，而是为现有 InDesign 自动化能力提供 agent 原生 CLI。

本仓库已有 MCP 服务和 COM 执行层：

- 经典 MCP 服务器：`src/index.js`
- 高级模板服务器：`src/advanced/index.js`
- COM/脚本执行核心：`src/core/scriptExecutor.js`
- 工具处理器：`src/handlers/`
- 工具定义：`src/types/toolDefinitions*.js`

CLI 化时优先复用这些已有能力，避免绕开现有处理器重新写一套业务逻辑。

## 推荐 harness 形态

在仓库内新增：

```text
agent-harness/
├── INDESIGN.md
├── setup.py
└── cli_anything/
    └── indesign/
        ├── README.md
        ├── __init__.py
        ├── __main__.py
        ├── indesign_cli.py
        ├── core/
        ├── utils/
        ├── skills/
        │   └── SKILL.md
        └── tests/
            ├── TEST.md
            ├── test_core.py
            └── test_full_e2e.py
```

命令入口建议为：

`cli-anything-indesign`

Python 包名建议为：

`cli_anything.indesign`

## 后端集成策略

优先级如下：

1. 通过已有 MCP server 调用 InDesign 工具，CLI 作为 MCP 客户端/编排层。
2. 复用 `src/core/scriptExecutor.js` 的脚本执行思路，提供最小 Node bridge。
3. 仅在确有必要时添加新的 ExtendScript/COM 封装。

不要把 CLI 做成玩具模拟器。真实导出、真实文档创建、真实模板填充必须最终调用 Adobe InDesign。

## 初始命令域建议

先覆盖最能形成闭环的命令组：

- `server`：启动/探测经典服务器和高级模板服务器。
- `document`：新建、打开、保存、关闭、查看信息。
- `page`：页面创建、页面尺寸、页面列表。
- `text`：文本框、段落样式、字符样式。
- `graphics`：图片放置、框架适配、基础图形。
- `template`：母版槽位扫描、槽位填充、脚本标签管理。
- `export`：PDF、IDML、图片导出，并验证输出文件。
- `session`：当前文档、历史、撤销/重做能力边界。

每个命令必须支持 `--json` 机器可读输出。无子命令时应进入 REPL。

## 测试要求

先写 `agent-harness/cli_anything/indesign/tests/TEST.md` 测试计划，再写测试代码。

测试分层：

- `test_core.py`：不依赖 InDesign 的参数校验、命令编排、输出格式测试。
- `test_full_e2e.py`：调用真实 InDesign，验证文档创建、模板流程和导出结果。
- 子进程测试：通过已安装的 `cli-anything-indesign` 调用，而不是只 import 模块。

真实 InDesign 是硬依赖。需要 InDesign 的 E2E 测试不应静默伪造结果。

## 输出和交付

每次 CLI 化工作结束时说明：

- 新增或修改的 harness 文件。
- 新增命令和命令组。
- 已运行的验证命令。
- 尚未覆盖的 InDesign 后端限制。
