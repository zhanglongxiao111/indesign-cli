# AGENTS 主入口

## 0. 设计原则

- **先理解现状，再动手。** 先读代码、工具定义、测试和当前文档，避免凭旧印象改项目。
- **收口优先。** 能复用现有 `core`、`tools`、`utils` 时，不新增平行实现。
- **CLI 复用现有能力。** CLI 是面向 Agent 的按需入口，不重写一套 InDesign 自动化。
- **HTML 转 InDesign 在外部插件仓库实现。** 本仓库只维护 `indesign-cli` 宿主、插件协议和 InDesign 执行底座。
- **不要把 internal 工具当死代码。** 终态代码以空 `profiles` 表示 internal，并投影为 CLI `source: hidden_handler`；先查 registry、artifact、CLI 工具目录、测试和文档后再决定是否公开或删除。
- **文档按用途归档。** 长期规范、方案、计划、排查、复盘分开放，避免一个目录堆成垃圾场。
- **历史资料只追溯。** 当前开发以代码、`AGENTS.md` 和当前文档为准。

### 0.1 架构治理原则

- **SSOT（Single Source of Truth）**：工具名、schema、handler 映射、CLI 展示 id、文档目录入口必须尽量只有一个权威来源；新增第二份映射前必须说明同步机制。
- **SRP（Single Responsibility Principle）**：模块按职责拆分；handler 只做参数处理、脚本拼装、执行和响应包装，不承载新的业务框架。
- **DRY（Don't Repeat Yourself）**：重复的工具映射、响应包装、脚本执行、schema 投影应收口到共享层；但不要为了消除少量重复引入难懂抽象。
- **YAGNI（You Aren't Gonna Need It）**：没有当前需求、测试入口或明确计划支撑的能力不提前实现。
- **KISS（Keep It Simple, Stupid）**：优先选择能被当前代码、测试和文档直接解释的简单结构；复杂机制必须解决真实复杂度。

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
| MCP 暴露工具与 registry / artifact 不一致 | 以 `src/tools/index.js` 和 `src/core/indesign-tool-registry.json` 为准，先判断是否是 internal 工具 |
| CLI 目标与 MCP 现状不一致 | 让 CLI 复用现有执行链路，避免重写业务能力 |
| HTML 插件需求与 CLI 宿主不一致 | 先判断是否属于插件协议或 host action 边界；不要把 HTML 转换实现塞回本仓库 |

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

- `src/tools/index.js` 是当前工具真相 registry，按 domain 聚合全部 tool-module。
- `src/tools/<domain>/` 是工具定义、JSON Schema、contract、handler 和 CLI 投影的归属边界；新增或修改工具必须先改对应域 tool-module，再由域 `index.js` 和全局 `src/tools/index.js` 聚合。
- `src/core/` 放 MCP 运行时、tool router、registry artifact、会话状态和脚本执行。
- `src/core/mcpServer.js` 是唯一 MCP server 工厂；`src/core/toolRouter.js` 是唯一 registry dispatch 入口。
- `src/index.js` 只启动 `profile: 'classic'`；`src/advanced/index.js` 只启动 `profile: 'advanced'`。
- `src/utils/` 放跨域共享工具函数；域内共享 JSX helper 放 `src/tools/<domain>/_shared.js`。
- `src/advanced/` 只放高级模板服务器入口壳，不维护独立工具映射。
- `scripts/` 只放维护脚本和轻量检查，不放临时手测脚本。
- `tests/` 放测试入口、场景测试和测试数据。
- `skills/` 放独立发布到公司 Agent 渠道的标准 Agent Skill 目录、references、展示图和轻量模板资产。

终态已删除 `src/handlers/`、`src/types/` 和 `src/core/InDesignMCPServer.js`；不要恢复 facade、fallback 或第二套工具映射。新增代码应靠近对应功能边界。不要在根目录堆临时脚本、备份文件或一次性修复脚本。

### 2.4 MCP 与 InDesign 自动化

- 运行时通过 `winax` 和 Windows COM 控制 Adobe InDesign。
- `stdout` 保留给 MCP 协议，日志和诊断信息写 `stderr`。
- tool-module handler 负责参数处理、转义、脚本拼装和响应包装，不要变成新的业务框架。
- 生成 ExtendScript/JSX 时必须处理字符串和路径转义，尤其是中文、空格、反斜杠和网络路径。
- 脚本标签是模板槽位的重要元数据；除非工具明确负责覆盖标签，否则不要破坏现有标签。
- 不要记录客户文档内容、客户名称或私有资产路径。

### 2.5 CLI 开发边界

- CLI 实现在 `agent-harness/`，Python 包名为 `cli_anything.indesign`。
- `AGENTS.md` 只记录实现边界、测试责任和目录职责；CLI 使用教程写入 `README.md` / `README.en.md`，Agent 使用提示写入 `skills/indesign-cli/SKILL.md`。
- CLI 必须复用当前 MCP server、tool-module handler 和 COM/脚本执行层，不重写一套 InDesign 自动化。
- CLI 不应引入常驻后台服务；如需改变进程模型，先写方案并说明兼容影响。
- 工具目录、router、session、schema、artifact、插件协议和脚本执行契约发生变化时，必须同步更新 CLI 单元测试和相关对外文档。
- CLI contract 改动必须同步 CLI 单元测试、`README.md` / `README.en.md` 和 `skills/indesign-cli/SKILL.md`。
- 插件工具必须遵守与内置工具一致的 envelope、session、schema、timeout 和 document-state 契约。
- `AGENTS.md` 只记录开发边界和测试责任；不要把 Agent 使用教程写进这里。
- Book、Presentation、Export、Template 等工具域进入 CLI 工具目录；是否公开到 MCP 由 `profiles` 决定。
- 不要在 CLI 日志、session 或错误信息中记录客户文档内容、客户名称或外部资产完整路径。
- CLI 遥测字段必须白名单制；禁止记录参数值、脚本内容、文档内容、客户信息和完整路径。新增遥测字段必须过 review；共享遥测目录只写 NAS JSONL、`state` 和 `reports`，不写客户素材。
- `skills/indesign-cli/` 是公司统一 InDesign/HTML 出版 Skill 的唯一发布源；顶层 `SKILL.md` 负责路线选择，HTML 作者规则等详细内容放 `references/`。不得在 `html-indesign` 或其他仓库维护第二份可发布 Skill。
- 发布版 Skill 只写公司 Agent 能直接执行的入口；不得放源码仓库命令、内部 E2E 或开发测试流程。可重复且易错的动作放 `skills/indesign-cli/scripts/`，起步模板放 `assets/`。
- CLI 不提供自动安装 Skill 的命令；Setup 和 PyPI 包只发布程序，不携带 Skill，Skill 继续由公司 Agent 渠道直接从唯一源目录独立分发。
- 公司成品采用 `%LOCALAPPDATA%\indesign-cli\{bin,runtime,state,tmp}` 持久布局；`state/current-runtime.json` 是当前 runtime 唯一指针，业务命令不得直接从 embedded runtime 或临时解压目录运行。
- 日常更新只消费 schema v2 `runtime-latest.json` 并安装 runtime ZIP，不替换 `bin/indesign-cli-agent.exe`。必须 staging 校验后原子切换；成功只保留当前 runtime，失败保留旧 runtime，无旧 runtime 时返回 `INITIAL_INSTALL_FAILED`。
- builtin 插件来自当前 runtime 的 `plugins/*`，source 为 `builtin`；项目级同 ID 插件可覆盖 builtin 供开发调试。builtin 缺损必须在 health/doctor 中显式报告。
- 系统浏览器固定为 Edge；允许 `HTML_INDESIGN_BROWSER_EXECUTABLE` 覆盖受控路径。Skill 仍由外部渠道独立发布，CLI 不自动安装。
- `0.4.2` 用户不做旧更新协议兼容，由公司 Agent 从 NAS 重新运行一次新版 Setup 完成迁移。
- `skills/indesign-cli/assets/preview.png` 是 Skill 展示资产；更新 Skill 时如影响对外说明或展示，应同步确认该资产是否仍匹配。

### 2.6 HTML 插件接入边界

固定语义 HTML 转 InDesign 已在 `D:\AI\html-indesign` 作为独立项目开发。本仓库不实现语义 HTML 解析、模板生成、CSS 映射或 HTML 到 InDesign 的业务转换。

本仓库已经为外部 HTML 转换项目准备插件宿主能力：

- `plugin install/list/remove` 负责项目级插件记录，不复制插件源码。
- `plugin validate` 负责安装前校验 manifest、协议、工具清单、schema 和 stdout 规范。
- `plugin doctor` 负责安装后诊断插件发现、依赖和宿主能力。
- 工具目录支持动态 domain、`source: plugin`、`tool list --domain html`、`tool schema` 和 `tool call`。
- 插件需要真实 InDesign 时，通过受控 host action 使用宿主能力；第一版允许 `script.run`、`export.verify`、`session.show`。
- 插件协议规范见 `docs/superpowers/specs/2026-05-27-indesign-cli-plugin-host-protocol-design.md`。

开发边界：

- `html-indesign` 侧负责固定语义、模板协议、HTML/CSS 到 InDesign 指令的转换和自身测试。
- `indesign-cli` 侧负责插件协议、工具目录、JSON envelope、host action、session 记录和真实 InDesign 执行通道。
- 不把 `html-indesign` 源码搬进 `src/`、`agent-harness/` 或本仓库核心模块。
- 如 HTML 插件需要新的宿主动作，先扩展插件协议和安全边界，再实现 CLI host action。
- 修改插件协议后，同步更新协议 spec、CLI 单元测试、README 和配套 Skill。

### 2.7 方案与计划文档

- 需要拆解方案、制定计划或执行多阶段改造时，先判断是否需要留下过程文档。
- 方案设计写入 `docs/superpowers/specs/`。
- 执行计划写入 `docs/superpowers/plans/`。
- `specs` 和 `plans` 是工作过程材料，不自动等同于长期规范。
- 方案落地后，如果产生长期约束，必须同步更新 `AGENTS.md`、`docs/技术决策/` 或对应当前文档。

### 2.8 清理规则

- 可以删除：日志、临时脚本、备份文件、无引用且无恢复价值的工具函数。
- 暂不删除：空 `profiles` 表示的 internal 工具，以及 CLI artifact source 为 `hidden_handler` 的工具。
- 清理前先用 `rg` 查引用；清理后至少跑语法检查和轻量校验。
- 不回退用户已有改动；遇到 dirty 文件先读 diff。

### 2.9 新增工具标准动作

1. 在对应 `src/tools/<domain>/` 新增或修改 tool-module，让 `name`、`domain`、`profiles`、`cli.id`、`contract`、`inputSchema`、`handler` 共置。
2. 在域 `index.js` 聚合；新域再在全局 `src/tools/index.js` 聚合。
3. 执行 `node src/core/artifact.js --write`，再执行 `node src/core/artifact.js --check`。
4. 更新 `tests/architecture/registry.test.mjs` 中受影响的数量基线，并补对应单元、required 或真实 E2E 场景测试。
5. 若 CLI contract、工具目录或对外说明变化，同步 `README.md`、`README.en.md`、`skills/indesign-cli/SKILL.md` 和相关 `docs/` 文档。

## 3. 执行基线

| 动作 | 命令 / 规则 |
| ---- | ----------- |
| 安装依赖 | `npm install` |
| 安装 CLI harness | `pip install -e .` |
| PyPI 安装 CLI | `pip install indesign-cli` |
| 安装 Node 依赖 | `indesign-cli server setup` |
| CLI smoke | `indesign-cli server health`、`indesign-cli tool domains` |
| 启动经典服务器 | `npm run start` 或 `node src/index.js` |
| 调试经典服务器 | `npm run dev` |
| 启动高级模板服务器 | `node src/advanced/index.js` |
| 语法检查 | `node --check <file>` |
| Schema 校验 | `node scripts/validate_schemas.js` |
| 工具名重复检查 | `node scripts/check_duplicates.mjs` |
| 快速工具数检查 | `node scripts/quick_check.mjs` |
| 生成 registry artifact | `node src/core/artifact.js --write` |
| 校验 registry artifact | `node src/core/artifact.js --check` |
| 架构治理检查 | `node scripts/check_architecture.mjs` |
| 架构 registry 测试 | `node tests/architecture/registry.test.mjs` |
| 必需测试 | `node tests/index.js --required` |
| CLI 单元测试 | `python -m pytest agent-harness\cli_anything\indesign\tests -q` |
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
- 新增 tool-module 时，补 `tests/test-*.js`、`tests/architecture/registry.test.mjs` 或真实 E2E 场景，并接入 `tests/index.js`。
- 触及 CLI harness 或工具目录时，至少跑 CLI 单元测试；触及真实 InDesign 行为或 E2E runner 时，跑真实 E2E 对应阶段或全量。

## 4. 仓库地图

| 路径 | 作用 |
| ---- | ---- |
| `src/index.js` | 经典 MCP 服务器入口 |
| `src/advanced/index.js` | 高级模板 MCP 服务器入口 |
| `src/core/mcpServer.js` | 统一 MCP server 工厂，按 profile 暴露工具 |
| `src/core/toolRouter.js` | registry dispatch 入口 |
| `src/core/artifact.js` | `src/tools` registry 到 CLI JSON artifact 的单向投影 |
| `src/core/indesign-tool-registry.json` | checked-in registry artifact，供 Python CLI 只读消费 |
| `src/core/` | MCP 运行时、会话管理、脚本执行器和 artifact 生成 |
| `src/tools/index.js` | 当前工具真相 registry，全局聚合 |
| `src/tools/<domain>/` | 各域 tool-module：定义、schema、contract、handler 共置 |
| `src/utils/` | 字符串、路径、响应格式等共享工具 |
| `agent-harness/` | Agent 专用 CLI harness、CLI 文档和 CLI 测试 |
| `skills/` | 独立发布到公司 Agent 渠道的标准 Skill 目录 |
| `skills/indesign-cli/SKILL.md` | 统一 InDesign/HTML 出版 Skill 主入口与路线选择 |
| `skills/indesign-cli/references/` | HTML 作者规则等按需加载的详细说明 |
| `skills/indesign-cli/scripts/` | 作者包创建、组装等 Agent 可直接运行的辅助脚本 |
| `skills/indesign-cli/assets/html-starter/` | 从零制作固定分页 HTML 的起步作者包 |
| `skills/indesign-cli/assets/templates/catalog.json` | Skill 内置模板目录 |
| `skills/indesign-cli/agents/openai.yaml` | Skill 展示与默认提示元数据 |
| `skills/indesign-cli/assets/preview.png` | Skill 预览图 |
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
| 进行中的三大计划 | 执行顺序固定：反馈闭环批 1 → 终态架构重构 → 语义契约；反馈闭环批 2 可并行 | 全局顺序和硬约束见 `docs/README.md` 当前专项一节；不得乱序启动，旧版（2026-07-04/05）specs/plans 已取代存档 |
| Book / Presentation 等 internal 工具域 | 已进入 `src/tools/` registry、CLI artifact 和真实 E2E 覆盖；CLI source 为 `hidden_handler`，MCP 不暴露 | 不按死代码删除；是否公开到 MCP 是 `profiles` 调整，不是恢复旧 handler 目录 |
| 固定语义 HTML 转 InDesign | 在 `D:\AI\html-indesign` 独立开发；本仓库已提供插件宿主协议和本地插件接入入口 | 本仓库只维护宿主边界、验证工具和 InDesign 执行通道 |
| 终态旧结构 | `src/handlers/`、`src/types/`、`src/core/InDesignMCPServer.js` 已删除 | 文档和新代码不得再引用这些路径作为当前实现 |
| CLI Node-backed 工具目录 | 只读 `src/core/indesign-tool-registry.json` artifact | artifact 缺失或 hash 不符是硬错误；执行 `node src/core/artifact.js --write && node src/core/artifact.js --check` 修复 |
| 语义契约计划 | 已重写为终态口径，但必须等本重构合并 `master` 后执行 | 不在终态架构重构分支提前进入语义计划 |
| InDesign 集成测试 | 依赖本机 InDesign 和 COM 会话；当前真实 E2E 入口在 `tests/real-e2e/` | 没有真实环境时要明确说明未跑 |
