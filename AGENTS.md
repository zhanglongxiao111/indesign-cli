# AGENTS 主入口

## 0. 设计原则

- **先理解现状，再动手。** 先读代码、工具定义、测试和当前文档，避免凭旧印象改项目。
- **收口优先。** 能复用现有 `core`、`handlers`、`types`、`utils` 时，不新增平行实现。
- **CLI 复用现有能力。** CLI 是面向 Agent 的按需入口，不重写一套 InDesign 自动化。
- **下一阶段转向固定语义 HTML。** 先定义可校验、可编译的 HTML 语义，再把它转换成 InDesign 页面、样式和对象。
- **不要把暂时隐藏的工具当死代码。** 有 handler 实现但当前未暴露的能力，可能通过 CLI 工具目录继续使用。
- **文档按用途归档。** 长期规范、方案、计划、排查、复盘分开放，避免一个目录堆成垃圾场。
- **历史资料只追溯。** 当前开发以代码、`AGENTS.md` 和当前文档为准。

## 1. 真相顺序

| 优先级 | 依据 | 用法 |
| ------ | ---- | ---- |
| 1 | 当前用户指令 | 本轮任务的最高优先级 |
| 2 | `AGENTS.md` | 项目级协作入口、硬规则、目录规范 |
| 3 | 当前代码 | 校正文档、工具映射和行为判断的最终依据 |
| 4 | `docs/README.md` 与当前 `docs/` | 文档目录、当前说明、方案和记录 |
| 5 | `docs/legacy/` | 只追溯历史，不作为当前规范 |
| 6 | Git 历史 | 需要恢复旧内容时才查看 |

冲突处理：

| 冲突类型 | 处理方式 |
| -------- | -------- |
| 文档与代码不一致 | 以代码为准，顺手修正文档 |
| 当前文档与历史文档不一致 | 以当前文档为准 |
| MCP 暴露工具与 handler 实现不一致 | 先判断是否是临时隐藏，不直接按死代码删除 |
| CLI 目标与 MCP 现状不一致 | 让 CLI 复用现有执行链路，避免重写业务能力 |
| HTML 语义转换目标与现有工具不一致 | 以语义协议和可验证转换链路为准，CLI 只作为调用入口 |

## 2. 强制规则

### 2.1 沟通规则

- 与用户沟通使用中文，短句，直接说结论。
- 文件名、命令、工具名、API 名保留原文，并用代码样式标出。
- 不重复解释同一件事；已确认的项目口径直接执行。

### 2.2 文档治理

- `AGENTS.md` 是唯一项目级总入口，不新增第二个总导航。
- `docs/README.md` 是文档目录入口，新增长期文档前先查它。
- 本项目不建立大体量项目上下文目录；当前规模直接靠 `AGENTS.md`、代码和专项文档维护上下文。
- 中文文档统一使用 `UTF-8`。
- 根目录 `docs/*.md` 只保留跨主题、当前仍有用的说明文档。
- 新增专题文档必须进入对应子目录，不在 `docs/` 根目录随手堆文件。
- 方案设计放 `docs/superpowers/specs/`，实施计划放 `docs/superpowers/plans/`。
- 已落地并需要长期遵守的结论，沉淀到 `docs/技术决策/` 或更新相关当前文档。
- 本地 Agent 任务、外部咨询、用户反馈等过程材料放 `docs/AI协作/`，具体分层以 `docs/AI协作/README.md` 为准。
- 复杂缺陷修复记录放 `docs/bugfix/`。
- 当前有效 review 和复盘放 `docs/review/`；历史材料放 `docs/legacy/`。

### 2.3 代码边界

- `src/core/` 放 MCP 运行时、会话状态和脚本执行。
- `src/handlers/` 放 MCP 工具到 ExtendScript/JSX 的适配逻辑。
- `src/types/` 放工具定义和 JSON Schema。
- `src/utils/` 放共享工具函数。
- `src/advanced/` 放高级模板服务器入口。
- `scripts/` 只放维护脚本和轻量检查，不放临时手测脚本。
- `tests/` 放测试入口、场景测试和测试数据。

新增代码应靠近对应功能边界。不要在根目录堆临时脚本、备份文件或一次性修复脚本。

### 2.4 MCP 与 InDesign 自动化

- 运行时通过 `winax` 和 Windows COM 控制 Adobe InDesign。
- `stdout` 保留给 MCP 协议，日志和诊断信息写 `stderr`。
- handler 负责参数处理、转义、脚本拼装和响应包装，不要变成新的业务框架。
- 生成 ExtendScript/JSX 时必须处理字符串和路径转义，尤其是中文、空格、反斜杠和网络路径。
- 脚本标签是模板槽位的重要元数据；除非工具明确负责覆盖标签，否则不要破坏现有标签。
- 不要记录客户文档内容、客户名称或私有资产路径。

### 2.5 CLI 使用

本项目已提供 Agent 专用 CLI harness：

- 位置：`agent-harness/`
- 命令入口：`indesign-cli`
- 兼容入口：`cli-anything-indesign`
- Python 包名：`cli_anything.indesign`
- 本地 session：当前工作目录下的 `.indesign-cli/session.json`

使用原则：

- CLI 复用当前 MCP server、handler 和 COM/脚本执行层。
- 不重写 InDesign 操作，不做玩具模拟器。
- 不需要单独启动常驻服务；每次调用按需启动 Node MCP/bridge 子进程，调用完退出。
- InDesign 进程和打开文档可以连续存在，但 Node 子进程内存不跨命令保留。
- 跨步骤连续操作依赖 JSON 返回值、InDesign 真实文档状态、显式文件路径、脚本标签或 `.indesign-cli/session.json`。
- 简单单步操作用 `tool call`；复杂多步骤优先写成单个 JSX，再用 `script run` 执行。
- `script run` 支持文件和 `--stdin`；stdin 支持中文输入。
- JSX 可以返回普通字符串，也可以返回 `JSON.stringify(...)` 的 JSON 字符串；JSON 字符串会额外解析到 `data.result_json`。
- ExtendScript 执行环境会补最小 `JSON.stringify` / `JSON.parse` 兼容层。
- `script run` 成功和失败都会写入当前目录 `.indesign-cli/session.json`。
- Book、Presentation、Export、Template 等工具域都进入 CLI 工具目录；是否公开到 MCP 另行判断。
- 生成 PDF 或 IDML 后必须用 `export verify` 验证产物。
- 不要把客户文档内容、客户名称或外部资产完整路径写进日志和 session。

### 2.6 固定语义 HTML 转 InDesign

下一阶段目标是建立固定语义 HTML 到 InDesign 的转换能力。

定位：

- 本质上是一个 `HTML to InDesign` 的语义编译库，不只是 CLI 命令集合。
- CLI 是 Agent 调用入口，负责发现能力、校验输入、编排转换和返回结构化结果。
- ExtendScript/JSX 是 InDesign 执行后端，负责创建页面、文本框、图片框、样式和置入资源。
- 不在 ExtendScript 里承担复杂 HTML 解析、语义校验和模板推理；这些逻辑应放在宿主侧库中，便于测试和维护。

设计原则：

- 第一版先定义建筑设计汇报可用的固定语义，不急于生产大量模板。
- HTML 是受约束的语义输入，不是任意网页源码。
- 语义层应稳定表达 `deck`、`section`、`page`、`title`、`body`、`image`、`caption`、`metric`、`table`、`case-study`、`image-grid` 等出版/汇报对象。
- CSS 主要作为样式 token 和受限布局表达，最终应映射到 InDesign 段落样式、字符样式、对象样式和页面对象属性。
- 不支持完整浏览器 CSS；需要浏览器排版时，应作为后续受限布局能力单独设计。
- 旧 `D:\AI\html-indesign` 项目可作为语义、蓝图、校验和回填链路的参考来源，但不能原样迁入当前项目。
- 兼容已有 InDesign 模板槽位时，通过映射层把稳定语义映射到母版名、脚本标签和槽位名。

推荐转换链路：

```text
固定语义 HTML
-> 语义校验
-> 样式和资源解析
-> InDesign 构建指令 JSON
-> CLI 调用 JSX 执行后端
-> InDesign 内容页、样式和资源
```

边界：

- 模板库、模板生成和浏览器布局转换是后续能力，不作为第一版前置条件。
- InDesign 母版可以作为兼容目标或缓存优化，但不是主流程必经中间层。
- 转换过程不得记录客户文档内容、客户名称或私有资产完整路径。

### 2.7 方案与计划文档

- 需要拆解方案、制定计划或执行多阶段改造时，先判断是否需要留下过程文档。
- 方案设计写入 `docs/superpowers/specs/`。
- 执行计划写入 `docs/superpowers/plans/`。
- `specs` 和 `plans` 是工作过程材料，不自动等同于长期规范。
- 方案落地后，如果产生长期约束，必须同步更新 `AGENTS.md`、`docs/技术决策/` 或对应当前文档。

### 2.8 清理规则

- 可以删除：日志、临时脚本、备份文件、无引用且无恢复价值的工具函数。
- 暂不删除：有 handler 实现但当前 MCP 工具定义未暴露的能力。
- 清理前先用 `rg` 查引用；清理后至少跑语法检查和轻量校验。
- 不回退用户已有改动；遇到 dirty 文件先读 diff。

## 3. 执行基线

| 动作 | 命令 / 规则 |
| ---- | ----------- |
| 安装依赖 | `npm install` |
| 安装 CLI harness | `pip install -e .` |
| 远程安装 CLI | `pip install "git+https://github.com/zhanglongxiao111/indesign-cli.git"` |
| 安装 Node 依赖 | `indesign-cli server setup` |
| 安装项目 skill | `indesign-cli skill install --target <project-root>` |
| CLI 健康检查 | `indesign-cli server health` |
| CLI 工具域 | `indesign-cli tool domains` |
| CLI 工具列表 | `indesign-cli tool list --domain <domain>` |
| CLI Schema | `indesign-cli tool schema <tool_id>` |
| CLI 调用工具 | `indesign-cli tool call <tool_id> --args args.json` |
| CLI 执行 JSX | `indesign-cli script run <file.jsx>` |
| CLI 执行 stdin JSX | `indesign-cli script run --stdin` |
| CLI 验证产物 | `indesign-cli export verify <path>` |
| 启动经典服务器 | `npm run start` 或 `node src/index.js` |
| 调试经典服务器 | `npm run dev` |
| 启动高级模板服务器 | `node src/advanced/index.js` |
| 语法检查 | `node --check <file>` |
| Schema 校验 | `node scripts/validate_schemas.js` |
| 工具名重复检查 | `node scripts/check_duplicates.mjs` |
| 快速工具数检查 | `node scripts/quick_check.mjs` |
| 必需测试 | `node tests/index.js --required` |
| CLI 单元测试 | `python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q` |
| 真实 E2E 全量 | `node tests\real-e2e\run-architecture-presentation.mjs --full --offline` |
| E2E 覆盖校验 | `node tests\real-e2e\validators\validate-coverage.mjs <coverage-report.json>` |
| 测试帮助 | `node tests/index.js --help` |

环境要求：

- Node.js 18 及以上。
- Python 3.10 及以上。
- Windows。
- Adobe InDesign 已安装，并与服务器运行在同一用户会话。
- `winax` 可用。

测试原则：

- 纯文档或项目配置调整不需要跑代码测试，但要检查文件状态和路径是否正确。
- 纯代码清理至少跑语法检查、Schema 校验、工具名重复检查。
- 触及真实 InDesign 行为时，说明是否运行了 InDesign 集成测试。
- 新增 handler 或 tool definition 时，补 `tests/test-*.js` 场景，并接入 `tests/index.js`。
- 触及 CLI harness 或工具目录时，至少跑 CLI 单元测试；触及真实 InDesign 行为或 E2E runner 时，跑真实 E2E 对应阶段或全量。

## 4. 仓库地图

| 路径 | 作用 |
| ---- | ---- |
| `src/index.js` | 经典 MCP 服务器入口 |
| `src/advanced/index.js` | 高级模板 MCP 服务器入口 |
| `src/core/` | MCP 服务器、会话管理、脚本执行器 |
| `src/handlers/` | 工具处理器，主要负责拼装并执行 InDesign ExtendScript/JSX |
| `src/types/` | MCP 工具定义和输入 Schema |
| `src/utils/` | 字符串、路径、响应格式等共享工具 |
| `agent-harness/` | Agent 专用 CLI harness、CLI 文档和 CLI 测试 |
| `scripts/` | 维护脚本和轻量检查 |
| `tests/` | 测试入口、场景测试、工具套件和真实 E2E |
| `docs/` | 当前说明、流程文档、方案、计划和协作记录 |

## 5. 文档目录

| 路径 | 用途 |
| ---- | ---- |
| `docs/README.md` | 文档目录入口 |
| `docs/AI协作/` | 本地 Agent、外部咨询、用户反馈等过程材料 |
| `docs/技术决策/` | 已确认的长期技术决策 |
| `docs/系统地图/` | 架构图、模块关系、运行链路 |
| `docs/superpowers/specs/` | 方案设计、边界分析、备选方案 |
| `docs/superpowers/plans/` | 实施计划、阶段拆分、验证清单 |
| `docs/bugfix/` | 复杂缺陷根因、修复过程、回归记录 |
| `docs/review/` | 当前有效 review、复盘和审查结论 |
| `docs/image/` | 文档图片资源 |
| `docs/legacy/` | 历史资料，只追溯 |

当前根文档：

| 文档 | 用途 |
| ---- | ---- |
| `docs/MCP_INSTRUCTIONS.md` | MCP 接入、工具能力、使用说明 |
| `docs/LLM_PROMPT.md` | 给 LLM 使用 MCP 工具的提示词示例 |
| `docs/SYNC.md` | Windows COM 适配、迁移和运行说明 |
| `docs/template-blueprint.md` | 模板槽位导出示例和母版槽位清单 |
| `docs/agent-template-flow.md` | AI Agent 使用模板槽位生成页面的流程图 |

## 6. 当前注意事项

| 事项 | 当前状态 | 处理原则 |
| ---- | -------- | -------- |
| Book / Presentation 等工具域 | 已进入 CLI 工具目录和真实 E2E 覆盖，部分 MCP 工具定义仍未暴露 | 不按死代码删除；是否公开到 MCP 另行判断 |
| 固定语义 HTML 转 InDesign | 下一阶段目标；当前只形成项目级口径，尚未实现 | 先写方案和语义协议，再进入实现计划 |
| 根 README | 当前内容较薄，且指向上级 README | 后续可补成清晰项目入口 |
| 部分 docs | 存在旧平台和旧版本描述 | 触及时按当前代码和 Windows COM 现状修正 |
| InDesign 集成测试 | 依赖本机 InDesign 和 COM 会话；当前真实 E2E 入口在 `tests/real-e2e/` | 没有真实环境时要明确说明未跑 |
