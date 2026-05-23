# CLI-Anything 方法论摘要

本文件是针对当前 InDesign MCP 项目的中文项目版方法论摘要。原始参考来自
`D:\AI\clianything\cli-anything-plugin\HARNESS.md`。

## 目标

把已有软件能力封装成 Agent 友好的 CLI，而不是重新实现软件本身。

对本项目来说，目标是让 Agent 可以通过 `cli-anything-indesign` 操作 Adobe InDesign：
创建文档、放置文本和图片、套用样式、使用模板槽位、导出 PDF/IDML/图片，并获得稳定的
JSON 输出。

## 核心原则

- 使用真实 Adobe InDesign 作为硬依赖，不做玩具模拟器。
- 优先复用现有 MCP 工具、处理器和 COM/ExtendScript 执行层。
- CLI 负责命令组织、会话状态、参数校验、JSON 输出和工作流编排。
- 每个命令都应支持 `--json`，方便 Agent 稳定解析。
- 直接运行 `cli-anything-indesign` 应进入 REPL。
- 导出结果必须验证文件存在、大小合理、格式正确，不能只看进程退出码。

## 建议阶段

### 1. 代码分析

梳理现有能力边界：

- `src/index.js`：经典 MCP 服务器入口。
- `src/advanced/index.js`：高级模板服务器入口。
- `src/core/`：会话和脚本执行。
- `src/handlers/`：功能处理器。
- `src/types/toolDefinitions*.js`：工具名、参数和 schema。
- `tests/`：已有场景测试。

重点找出 GUI/InDesign 操作和现有 MCP 工具之间的映射关系。

### 2. CLI 设计

推荐命令域：

- `server`：启动、探测、健康检查。
- `document`：新建、打开、保存、关闭、信息查询。
- `page`：页面列表、创建、尺寸、布局。
- `text`：文本框、段落样式、字符样式。
- `graphics`：图片放置、图形框、适配。
- `style`：段落、字符、对象样式。
- `template`：母版槽位、脚本标签、模板填充。
- `export`：PDF、IDML、图片导出和结果验证。
- `session`：当前文档、历史、撤销/重做边界。

CLI 应同时支持一次性子命令和 REPL。一次性命令用于脚本化，REPL 用于 Agent 多轮操作。

### 3. 实现策略

优先后端方案：

1. CLI 作为 MCP 客户端调用当前服务器暴露的工具。
2. 需要时增加最小 Node bridge，复用现有脚本执行器。
3. 只有在现有能力无法覆盖时，才新增 ExtendScript/COM 封装。

目录建议：

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

注意：`cli_anything/` 顶层不要放 `__init__.py`，保持命名空间包形态。

### 4. 测试计划

写测试代码前先写：

`agent-harness/cli_anything/indesign/tests/TEST.md`

内容包括：

- 单元测试计划。
- 真实 InDesign 端到端测试计划。
- 子进程调用测试计划。
- 典型工作流：创建文档、模板填充、导出验证、保存/打开回环。

### 5. 测试实现

测试分层：

- `test_core.py`：参数校验、状态模型、JSON 输出、命令编排，不依赖 InDesign。
- `test_full_e2e.py`：调用真实 InDesign，生成真实文档和导出文件。
- 子进程测试：通过已安装的 `cli-anything-indesign` 调用，验证真实用户路径。

需要 InDesign 的测试不应静默跳过或伪造成功。没有后端时应给出清晰错误。

### 6. Skill 生成

harness 完成后需要生成可被 Agent 发现的 skill：

- 规范位置：`agent-harness/cli_anything/indesign/skills/SKILL.md`
- 内容包括安装要求、命令结构、JSON 输出说明、常见工作流示例、错误处理建议。

### 7. 打包安装

`setup.py` 应暴露：

`cli-anything-indesign`

本地验证：

```powershell
cd agent-harness
pip install -e .
cli-anything-indesign --help
cli-anything-indesign --json document info
```

## InDesign 特有注意事项

- Windows + Adobe InDesign 是硬依赖。
- 所有调试日志继续写 `stderr`，不要破坏 MCP 的 `stdout` 协议流。
- 不要泄露客户文档内容或本地资产路径。
- 模板槽位和脚本标签是关键元数据，CLI 命令必须谨慎保留或明确覆盖。
- 导出测试应至少验证 PDF 魔术字节、文件大小和路径可读性。
