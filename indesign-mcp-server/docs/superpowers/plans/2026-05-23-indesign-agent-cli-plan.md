# InDesign Agent CLI 实施计划

日期：2026-05-23

对应设计：[2026-05-23-indesign-agent-cli-design.md](../specs/2026-05-23-indesign-agent-cli-design.md)

## 1. 实施目标

第一版只做 Agent 专用轻量 CLI 底座：

- 建立 `agent-harness/` Python CLI 包。
- 默认 JSON 输出。
- 实现统一功能域目录：`tool domains -> tool list/search --domain -> tool schema -> tool call`。
- 工具来源统一进入目录：`cli`、`script`、`advanced`、`classic`、`hidden_handler`。
- 默认不做常驻服务，每条命令启动并关闭对应 Node MCP 子进程。
- 支持 `script run <file.jsx>` 和 `script run --stdin`。
- 支持 `.indesign-cli/session.json` 最小状态。
- 支持产物验证和健康检查。

## 2. 非目标

- 不做完整人类友好 CLI。
- 不把所有 MCP 工具包装成独立子命令。
- 不做 daemon、HTTP server 或长连接服务。
- 不做 MCP session rehydrate。
- 不恢复隐藏 handler 的可调用 schema，只把它们作为目录线索列出。

## 3. 阶段拆分

### Phase 0：脚手架和测试计划

文件范围：

- `agent-harness/setup.py`
- `agent-harness/INDESIGN.md`
- `agent-harness/cli_anything/indesign/__init__.py`
- `agent-harness/cli_anything/indesign/__main__.py`
- `agent-harness/cli_anything/indesign/indesign_cli.py`
- `agent-harness/cli_anything/indesign/tests/TEST.md`

任务：

- 建立 Python 包结构和入口 `cli-anything-indesign`。
- CLI 默认输出 JSON。
- 写 `TEST.md`，覆盖单元、MCP 冒烟、真实 InDesign E2E。
- `.gitignore` 增加 `.indesign-cli/`。

验收：

- `pip install -e agent-harness` 成功。
- `cli-anything-indesign --help` 可运行。
- `cli-anything-indesign --version` 返回 JSON。

### Phase 1：JSON envelope、错误模型、路径工具

文件范围：

- `agent-harness/cli_anything/indesign/core/envelope.py`
- `agent-harness/cli_anything/indesign/core/errors.py`
- `agent-harness/cli_anything/indesign/core/paths.py`
- `agent-harness/cli_anything/indesign/tests/test_core.py`

任务：

- 实现统一 JSON envelope。
- 实现错误类型和错误序列化。
- 实现路径相对化、外部路径脱敏、salted hash。
- 实现 stdout/stderr 分离。

验收：

- 成功 envelope 包含 `schema_version`、`ok`、`exit_code`、`request_id`、`duration_ms`。
- 失败 envelope 包含 `error.type`、`error.code`、`retryable`、`hint`。
- 外部路径默认不输出 basename 和完整路径。

### Phase 2：工具目录索引

文件范围：

- `agent-harness/cli_anything/indesign/core/catalog.py`
- `agent-harness/cli_anything/indesign/core/domains.py`
- `agent-harness/cli_anything/indesign/tests/test_core.py`

任务：

- 定义 domain 清单。
- 从高级模板 server `ListTools` 生成 `source: advanced` 条目。
- 从经典 server `ListTools` 生成 `source: classic` 条目。
- 从本地 primitive 生成 `source: cli` 条目。
- 加入 `script.run` 条目。
- 加入有 handler 但未暴露工具的 `availability: hidden_handler` 条目。
- 实现 `rank`、`schema_size`、`requires`、`side_effects`、`artifact_kinds`、`destructive`、`target_scope`。

验收：

- `tool domains` 返回低 token 摘要。
- `tool list --domain template` 返回精简条目。
- `tool list` 不带 domain 不返回全量工具。
- hidden handler 出现在对应 domain，但 `callable: false`。
- `--callable-only` 只返回可调用条目。

### Phase 3：MCP 后端路由

文件范围：

- `agent-harness/cli_anything/indesign/core/mcp_backend.py`
- `agent-harness/cli_anything/indesign/core/router.py`
- `agent-harness/cli_anything/indesign/tests/test_core.py`

任务：

- 实现 stdio MCP 客户端。
- 每次命令启动对应 Node MCP server 子进程。
- 实现超时、失败分类和强制清理。
- 实现 `tool schema <tool_id>`。
- 实现 `tool call <tool_id> --args args.json` 和 `--args -`。
- 路由到 `advanced` 或 `classic` 后端。

验收：

- `tool schema` 只读取单个工具 schema。
- `tool call` 能解析 MCP 协议成功但工具失败的双层状态。
- 子进程超时后会被清理，返回 `TimeoutError`。

### Phase 4：JSX 执行

文件范围：

- `agent-harness/cli_anything/indesign/core/scripts.py`
- `agent-harness/cli_anything/indesign/tests/test_core.py`
- `agent-harness/cli_anything/indesign/tests/test_full_e2e.py`

任务：

- 实现 `script run <file.jsx>`。
- 实现 `script run --stdin`，stdin 内容落到 `.indesign-cli/tmp/` 后执行。
- 相对路径解析成绝对路径，输出 `input_path` 和 `resolved_path`。
- 约束 JSX 返回 JSON 对象：`ok`、`data`、`warnings`、`artifacts`。

验收：

- 文件脚本和 stdin 脚本走同一执行链路。
- 脚本错误返回 `ScriptExecutionError`。
- 输出不会混入自然语言日志。

### Phase 5：session 和产物验证

文件范围：

- `agent-harness/cli_anything/indesign/core/session.py`
- `agent-harness/cli_anything/indesign/core/artifacts.py`
- `agent-harness/cli_anything/indesign/tests/test_core.py`

任务：

- 实现 `.indesign-cli/session.json`。
- 实现 `session show`、`session show --verbose`、`session clear`。
- 实现 `--no-session`。
- 实现 `export verify`。
- PDF 验证 `%PDF`。
- IDML 验证 ZIP 和 `designmap.xml`。
- 支持 `--created-after`。

验收：

- session 默认 compact。
- 外部路径默认脱敏。
- `recent_calls` 不保存完整 args。
- `export verify` 能识别旧产物和错误格式。

### Phase 6：健康检查和文档

文件范围：

- `agent-harness/cli_anything/indesign/core/health.py`
- `agent-harness/cli_anything/indesign/README.md`
- `agent-harness/INDESIGN.md`
- `docs/superpowers/plans/2026-05-23-indesign-agent-cli-plan.md`

任务：

- 实现 `server health`。
- 实现 `server health --deep`。
- 文档写清 Agent 推荐调用路径。
- 记录已知限制：无 daemon、无 MCP session rehydrate、hidden handler 不可直接 call。

验收：

- `server health` 返回 Node、项目路径、高级 MCP、经典 MCP 状态。
- `server health --deep` 返回 `winax` 和 InDesign COM 状态。
- 没有 InDesign 环境时返回清晰失败，不伪造成功。

## 4. 测试计划

### 单元测试

命令：

```powershell
python -m pytest agent-harness/cli_anything/indesign/tests/test_core.py -q
```

覆盖：

- JSON envelope。
- 错误模型。
- 路径脱敏。
- domain 映射。
- hidden handler 目录条目。
- `rank` 排序。
- session compact/verbose。
- artifact verify。
- 子进程超时清理。

### MCP 冒烟测试

命令：

```powershell
cli-anything-indesign tool domains
cli-anything-indesign tool list --domain template
cli-anything-indesign tool list --domain export
cli-anything-indesign server health
```

覆盖：

- 高级模板 server 能启动并返回工具。
- 经典 server 能启动并返回工具。
- catalog 能合并两个来源和 hidden handler。

### 真实 InDesign E2E

命令：

```powershell
python -m pytest agent-harness/cli_anything/indesign/tests/test_full_e2e.py -q
```

覆盖：

- `server health --deep`。
- 执行简单 JSX。
- 获取当前活动文档信息。
- 导出测试 PDF。
- `export verify` 验证 PDF。

## 5. 风险和处理

| 风险 | 处理 |
| ---- | ---- |
| MCP SDK Python 侧接入复杂 | 可先实现最小 stdio JSON-RPC 客户端，再评估是否引入 SDK |
| 高级 server 和经典 server schema 风格不一致 | catalog 层统一成精简条目，完整 schema 保持原样透传 |
| 一次性子进程冷启动慢 | 第一版接受；多步骤操作推荐单个 JSX |
| Node 内存 session 不连续 | 所有跨步骤状态必须结构化返回给 Agent |
| 外部路径泄露 | 默认只存扩展名和 salted hash，错误详情统一 scrub |
| hidden handler 不可调用 | 目录中明确 `callable: false`，不允许 schema/call |

## 6. 完成定义

- `cli-anything-indesign tool domains` 可用。
- `tool list/search/schema/call` 可用。
- `script run` 文件和 stdin 路径可用。
- `session show/clear` 可用。
- `export verify` 可用。
- `server health` 可用。
- 单元测试通过。
- 无 InDesign 环境时 E2E 清晰失败或显式跳过。
- 有 InDesign 环境时最小 E2E 真实通过。
