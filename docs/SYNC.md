# InDesign MCP Server Windows COM 与运行同步说明

更新时间：2026-07-08

## 1. 用途

本文是当前 Windows 环境下运行、迁移和排查 InDesign MCP / CLI 的同步说明。它记录的是终态架构下的现状，不是历史迁移计划。

适用场景：

- 在 Windows 机器上通过 MCP stdio 启动 InDesign 自动化服务。
- 通过 `indesign-cli` 调用同一套工具能力。
- 排查 `winax`、COM、路径转义、registry artifact 或 CLI catalog 同步问题。

## 2. 当前架构真相

工具能力只有一条权威链路：

```text
src/tools/index.js
  -> src/tools/<domain>/ tool-module
  -> src/core/mcpServer.js
  -> src/core/toolRouter.js
  -> src/core/scriptExecutor.js
  -> winax / Windows COM
  -> Adobe InDesign DoScript
```

关键边界：

- `src/tools/index.js` 是当前工具 registry 真相。
- `src/tools/<domain>/` 内共置工具名、domain、profiles、CLI id、contract、JSON Schema 和 handler。
- `src/core/mcpServer.js` 是唯一 MCP server 工厂。
- `src/core/toolRouter.js` 是唯一 registry dispatch 入口。
- `src/core/scriptExecutor.js` 负责跨平台脚本执行；Windows 通过 `winax` 和 COM 调用 InDesign `DoScript`。
- `src/core/indesign-tool-registry.json` 是 Node registry 到 Python CLI 的 checked-in artifact。
- Python CLI 只读 `src/core/indesign-tool-registry.json`，再叠加 CLI primitives 和项目插件工具；不扫描 Node 源码目录。
- 旧 `src/handlers/`、`src/types/`、`src/core/InDesignMCPServer.js` 已删除且不得恢复。

## 3. MCP 入口

经典服务器入口：

```powershell
node src/index.js
```

高级模板服务器入口：

```powershell
node src/advanced/index.js
```

运行约束：

- MCP 使用 stdio transport，`stdout` 只给 MCP 协议使用。
- 日志、诊断和本地排错信息必须写入 `stderr`。
- `src/index.js` 只启动 `profile: 'classic'`。
- `src/advanced/index.js` 只启动 `profile: 'advanced'`。
- MCP 暴露哪些工具由 tool-module 的 `profiles` 决定；空 `profiles` 表示 internal，不等于死代码。

## 4. CLI 同步链路

CLI 实现在 `agent-harness/`，Python 包名为 `cli_anything.indesign`。CLI 不重写 InDesign 自动化，只复用 Node registry artifact、MCP server 和脚本执行底座。

常用命令：

```powershell
pip install -e .
indesign-cli server setup
indesign-cli server health
indesign-cli tool domains
indesign-cli tool list
indesign-cli tool schema <tool-id>
indesign-cli tool call <tool-id> --json <args-json>
```

同步规则：

- 修改 `src/tools/` 下任意 tool-module 后，执行：

```powershell
node src/core/artifact.js --write
node src/core/artifact.js --check
```

- `src/core/indesign-tool-registry.json` 缺失或 hash 不一致是硬错误。
- Book、Presentation、Export、Template 等 internal 工具域可以进入 CLI catalog；是否暴露到 MCP 仍由 `profiles` 控制。
- artifact 中 internal 工具会投影为 CLI `source: hidden_handler`，这是终态兼容语义，不代表存在旧 handler 目录。
- 插件工具通过 CLI 插件协议接入，遵守同一 envelope、schema、session、timeout 和 document-state 契约。

## 5. Windows COM 执行通道

Windows 运行时通过 `winax` 创建 InDesign COM 对象，并调用 InDesign `DoScript` 执行 ExtendScript / JSX。

前置条件：

- Windows 10/11。
- Adobe InDesign 已安装，并与 MCP / CLI 进程运行在同一用户会话。
- Node.js 18 及以上。
- `winax` 可安装并可加载。
- 如使用 CLI，本机 Python 3.10 及以上可用。

依赖安装：

```powershell
npm install
pip install -e .
indesign-cli server setup
```

执行注意：

- 首次 COM 启动 InDesign 可能较慢。
- InDesign 必须能在当前用户桌面会话中启动；服务会话、无桌面会话或权限隔离可能导致 COM 创建失败。
- 若 `winax` 编译失败，检查 Visual Studio Build Tools、Microsoft C++ 运行库、Python / node-gyp 环境。
- 若安全软件拦截 COM 自动化，需要将 InDesign 或当前项目目录加入信任策略。

## 6. 路径与脚本转义

生成 ExtendScript / JSX 时必须处理字符串和路径转义，尤其是：

- 中文路径。
- 空格路径。
- 反斜杠路径。
- 网络路径。
- 引号、换行和 JSON 字符串。

实现要求：

- handler 负责参数处理、脚本拼装、执行调用和响应包装。
- 跨域共享的字符串、路径和响应工具放在 `src/utils/`。
- 域内共享 JSX helper 放在 `src/tools/<domain>/_shared.js`。
- 不要在 handler 中记录客户文档内容、客户名称或私有资产完整路径。

## 7. 快速自测

MCP / CLI 基础健康检查：

```powershell
indesign-cli server health
indesign-cli tool domains
node scripts/check_architecture.mjs
node src/core/artifact.js --check
```

工具调用示例：

```powershell
indesign-cli tool call document.create_document --json "{\"width\":210,\"height\":297,\"pages\":1}"
indesign-cli tool call text.create_text_frame --json "{\"content\":\"Hello Windows\",\"x\":30,\"y\":30,\"width\":120,\"height\":30,\"fontSize\":14}"
indesign-cli tool call export.export_pdf --json "{\"filePath\":\"D:/Indesign-Exports/mcp-demo.pdf\",\"preset\":\"High Quality Print\"}"
```

真实 InDesign 行为变更需要补对应真实 E2E 或场景测试，并说明是否实际运行了 InDesign 集成测试。

## 8. 常见问题

### 无法创建 InDesign COM 对象

可能原因：

- InDesign 未安装或 COM ProgID 未注册。
- `winax` 未正确安装或加载。
- 当前进程运行在无法访问桌面的会话。
- 权限或安全软件拦截 COM 自动化。

处理：

```powershell
npm install
indesign-cli server setup
indesign-cli server health
```

如仍失败，确认 InDesign 能在当前 Windows 用户会话中手动启动。

### 工具目录与 CLI 输出不一致

可能原因：

- 修改了 `src/tools/` 后未重新生成 artifact。
- 手动修改了 `src/core/indesign-tool-registry.json`。
- CLI 正在读取旧安装路径或旧工作区。

处理：

```powershell
node src/core/artifact.js --write
node src/core/artifact.js --check
python -m pytest agent-harness\cli_anything\indesign\tests -q
```

### DoScript 语法错误

常见原因是脚本文本、路径、引号或换行被重复转义。优先检查对应 `src/tools/<domain>/` tool-module 的 handler 和共享 helper，不要绕过 registry 另写执行入口。

### 导出失败或路径错误

检查：

- 是否使用绝对路径。
- 目标目录是否可写。
- 网络路径是否可被当前用户访问。
- 导出工具是否正确创建目标目录。

## 9. 文档同步责任

以下变化必须同步更新相关文档和测试：

- 工具名、schema、contract、profiles 或 CLI id 变化。
- `src/core/indesign-tool-registry.json` artifact 生成规则变化。
- CLI tool catalog、router、session、schema、plugin protocol 或 host action 契约变化。
- Windows COM 执行、路径转义、导出验证或真实 InDesign 行为变化。

最低同步项：

- `README.md` / `README.en.md`：面向用户的安装和使用说明。
- `skills/indesign-cli/SKILL.md`：面向 Agent 的 CLI 使用提示。
- `docs/README.md`：文档入口和归档位置。
- 对应 `docs/技术决策/` 或专项文档：长期约束和设计结论。

## 10. 推荐验证基线

纯文档修复：

```powershell
git diff --check
```

触及工具 registry、artifact、CLI catalog 或架构边界：

```powershell
node scripts/check_architecture.mjs
node tests/index.js --required
python -m pytest agent-harness\cli_anything\indesign\tests -q
```

触及真实 InDesign 行为时，再运行对应真实 E2E 入口，并在结果中说明 InDesign / COM 环境是否可用。
