# indesign-cli 插件宿主协议设计

日期：2026-05-27

配套文档：`D:/AI/html-indesign/docs/superpowers/specs/2026-05-27-indesign-cli-plugin-integration-design.md`

## 1. 背景

`indesign-cli` 当前是 Agent 使用 Adobe InDesign 的通用自动化底座，已经提供工具发现、JSX 执行、MCP handler 调用、导出验证、session 记录和 Skill 安装能力。

`html-indesign` 当前定位是固定语义 HTML 与 InDesign 的双向翻译库。它需要真实 InDesign 通道执行 JSX、导出 PDF/IDML、做回环验证，但不应该并入 `indesign-cli` 核心，也不应该重新实现 InDesign COM、MCP 或脚本执行层。

因此，本设计定义 `indesign-cli` 插件宿主协议，让 `html-indesign` 可以作为一等插件接入 `indesign-cli`，并让后续插件有统一开发依据。

## 2. 目标

- 建立 `indesign-cli` 插件宿主层。
- 允许插件把工具加入统一 `tool domains/list/search/schema/call` 目录。
- 让插件工具使用 `source: plugin`，与 `cli`、`script`、`advanced`、`classic`、`hidden_handler` 并列。
- 支持项目级本地插件安装，优先服务 `D:/AI/html-indesign` 本地开发。
- 明确插件 manifest、工具清单、schema、调用、错误、artifact、session 和 host action 约束。
- 提供插件标准检测工具，避免插件实现和宿主协议漂移。
- 保持基础 `indesign-cli` 轻量，不默认安装 HTML 转换、浏览器、PDF 预览等重依赖。

## 3. 非目标

- 不把 `html-indesign` 源码搬进 `indesign-cli` 的 `src/` 或 `agent-harness/` 核心目录。
- 不让插件直接调用 InDesign COM、MCP server 内部对象或宿主私有 Python API。
- 不要求第一版支持远程插件市场。
- 不要求第一版支持常驻插件进程。
- 不要求第一版实现所有人类友好短命令。
- 不把 HTML 能力塞进 `template`、`presentation`、`document` 等既有域。

## 4. 术语

| 术语 | 含义 |
| ---- | ---- |
| 宿主 | `indesign-cli`，负责发现插件、暴露工具目录、执行插件请求和统一输出 |
| 插件 | 按本协议提供 manifest 和工具入口的外部能力包 |
| 项目级插件 | 写入当前项目 `.indesign-cli/plugins/*.json` 的插件 |
| 用户级插件 | 写入用户目录 `.indesign-cli/plugins/*.json` 的插件 |
| 内置插件 | 随 `indesign-cli` 或 extra 安装的官方插件 |
| host action | 插件请求宿主代为执行的受控动作，例如 `script.run`、`export.verify` |
| envelope | `indesign-cli` 现有成功/失败 JSON 输出契约 |

## 5. 总体架构

```text
Agent
  |
  v
indesign-cli
  |
  +-- tool catalog
  |     +-- cli primitive
  |     +-- script primitive
  |     +-- advanced MCP backend
  |     +-- classic MCP backend
  |     +-- hidden handler bridge
  |     +-- plugin tools
  |
  +-- plugin host
  |     +-- discovery
  |     +-- manifest validation
  |     +-- plugin backend
  |     +-- host action executor
  |
  +-- InDesign execution
        +-- script.run
        +-- export.verify
        +-- session
```

插件不直接接触 InDesign COM。需要真实 InDesign 的插件工具必须通过 host action 请求宿主执行，或生成宿主可执行的脚本和指令。

## 6. 插件发现顺序

完整发现顺序如下：

| 优先级 | 来源 | 位置 |
| ------ | ---- | ---- |
| 1 | 项目级插件 | `<cwd>/.indesign-cli/plugins/*.json` |
| 2 | 用户级插件 | `%USERPROFILE%/.indesign-cli/plugins/*.json` |
| 3 | Python entry point | `indesign_cli.plugins` |
| 4 | 内置插件 | `cli_anything/indesign/plugins/*/manifest.json` |

第一阶段必须实现项目级插件。其他来源可以先预留接口，但不能破坏 manifest 和 catalog 设计。

同一 `id` 出现多次时：

- 项目级覆盖用户级。
- 用户级覆盖 entry point。
- entry point 覆盖内置。
- 被覆盖项必须在 `plugin list` 的 `warnings` 中出现。
- 如果同一优先级出现重复 `id`，必须报错，不允许随机选择。

## 7. 插件安装位置

项目级安装命令：

```powershell
indesign-cli plugin install D:\AI\html-indesign
```

安装后写入：

```text
<cwd>/.indesign-cli/plugins/html-indesign.json
```

该 JSON 是指向插件的安装记录，不是插件源码副本。

示例：

```json
{
  "schema_version": 1,
  "id": "html-indesign",
  "kind": "node-plugin",
  "root": "D:/AI/html-indesign",
  "manifest": "src/indesign-cli-plugin/manifest.json",
  "enabled": true
}
```

规则：

- `root` 必须是显式绝对路径，或来自已安装包的可解析位置。
- 项目级安装不得复制插件源码。
- 默认不写用户级配置，除非用户显式指定 `--user`。
- `plugin remove <id>` 只删除安装记录，不删除插件源码目录。

## 8. 插件 manifest

插件自身必须提供 manifest。Node 插件推荐位置：

```text
src/indesign-cli-plugin/manifest.json
```

最小 manifest：

```json
{
  "schema_version": 1,
  "protocol": "indesign-cli-plugin.v1",
  "id": "html-indesign",
  "name": "html-indesign",
  "version": "0.1.0",
  "kind": "node-plugin",
  "domain": "html",
  "entry": "src/indesign-cli-plugin/index.js",
  "description": "固定语义 HTML 与 InDesign 的双向翻译插件",
  "requires": {
    "indesign_cli": ">=0.2.0",
    "node": ">=18.0.0"
  },
  "capabilities": {
    "tools": true,
    "host_actions": ["script.run", "export.verify", "session.show"]
  },
  "permissions": {
    "filesystem": ["read_project", "write_project"],
    "indesign": "host_only",
    "network": false
  }
}
```

### 8.1 必填字段

| 字段 | 类型 | 要求 |
| ---- | ---- | ---- |
| `schema_version` | number | 当前为 `1` |
| `protocol` | string | 当前为 `indesign-cli-plugin.v1` |
| `id` | string | 插件唯一 ID，格式见 8.3 |
| `name` | string | 可读名称 |
| `version` | string | SemVer |
| `kind` | string | 第一版支持 `node-plugin` |
| `domain` | string | 插件主工具域，例如 `html` |
| `entry` | string | 相对插件 root 的入口文件 |
| `description` | string | 一句话说明 |
| `requires` | object | 宿主和运行时要求 |
| `capabilities` | object | 插件能力声明 |
| `permissions` | object | 权限声明 |

### 8.2 可选字段

| 字段 | 类型 | 用途 |
| ---- | ---- | ---- |
| `homepage` | string | 项目主页 |
| `repository` | string | 源码仓库 |
| `license` | string | License |
| `domains` | array | 插件需要注册多个域时使用，第一版不推荐 |
| `skill` | string | 插件自带 Skill 路径 |
| `shortcuts` | array | 人类友好短命令声明 |

### 8.3 ID 和 domain 规则

`id`：

- 只能使用小写字母、数字、短横线。
- 必须以小写字母开头。
- 建议长度 3 到 64。
- 示例：`html-indesign`。

`domain`：

- 只能使用小写字母、数字、下划线。
- 必须以小写字母开头。
- 建议长度 2 到 32。
- 不能覆盖核心域，除非宿主显式允许。
- `html-indesign` 第一版固定使用 `html`。

## 9. 插件入口协议

第一版插件入口使用一次性 Node 子进程。宿主启动插件入口，通过 `stdin/stdout` 交换 JSON-RPC 风格消息。

启动方式：

```text
node <plugin-entry>
```

约束：

- `stdout` 只能输出协议 JSON。
- 日志、调试、警告写 `stderr`。
- 输入输出使用 UTF-8。
- 插件进程不保证跨命令保留内存。
- 宿主必须设置超时，并在超时后终止插件进程。

请求格式：

```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "method": "tools/list",
  "params": {
    "context": {}
  }
}
```

成功响应：

```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "result": {}
}
```

失败响应：

```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "error": {
    "code": "PLUGIN_ERROR",
    "message": "Human readable message",
    "details": {}
  }
}
```

## 10. 必须支持的方法

| 方法 | 必需 | 作用 |
| ---- | ---- | ---- |
| `plugin/handshake` | 是 | 返回插件身份、协议版本和能力 |
| `tools/list` | 是 | 返回插件工具清单 |
| `tools/schema` | 是 | 返回单个工具 schema |
| `tools/call` | 是 | 调用插件工具 |
| `tools/resume` | 需要 host action 时必需 | 宿主执行 host action 后继续插件流程 |
| `plugin/doctor` | 建议 | 插件自检 |

### 10.1 `plugin/handshake`

请求：

```json
{
  "method": "plugin/handshake",
  "params": {
    "host": {
      "name": "indesign-cli",
      "version": "0.2.0",
      "protocol": "indesign-cli-plugin.v1"
    }
  }
}
```

响应：

```json
{
  "id": "html-indesign",
  "version": "0.1.0",
  "protocol": "indesign-cli-plugin.v1",
  "domain": "html",
  "capabilities": {
    "tools": true,
    "host_actions": ["script.run", "export.verify"]
  }
}
```

### 10.2 `tools/list`

返回插件工具摘要。宿主会把这些工具并入 catalog。

响应示例：

```json
{
  "tools": [
    {
      "id": "html.authoring_lint",
      "domain": "html",
      "name": "authoring_lint",
      "one_line_purpose": "检查固定语义 HTML 作者包",
      "arg_names": ["package", "strict"],
      "rank": 10,
      "schema_size": "medium",
      "callable": true,
      "requires": [],
      "side_effects": [],
      "artifact_kinds": ["json"],
      "destructive": false,
      "target_scope": "workspace",
      "needs_indesign": false,
      "produces_artifacts": true
    }
  ]
}
```

宿主必须补齐或覆盖：

```json
{
  "source": "plugin",
  "plugin": "html-indesign",
  "availability": "exposed"
}
```

### 10.3 `tools/schema`

请求：

```json
{
  "method": "tools/schema",
  "params": {
    "tool_id": "html.authoring_lint"
  }
}
```

响应：

```json
{
  "tool": {
    "id": "html.authoring_lint"
  },
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "package": {
        "type": "string",
        "description": "作者包配置文件路径"
      },
      "strict": {
        "type": "boolean",
        "description": "是否按严格模式检查"
      }
    },
    "required": ["package"]
  }
}
```

要求：

- `inputSchema` 使用 JSON Schema object 子集。
- `arg_names` 必须与 `inputSchema.properties` 一致。
- 默认禁止 `additionalProperties`，除非工具确实需要透传参数。
- 路径参数必须说明相对路径解析规则。

### 10.4 `tools/call`

请求：

```json
{
  "method": "tools/call",
  "params": {
    "tool_id": "html.authoring_lint",
    "args": {
      "package": "deck.config.json",
      "strict": true
    },
    "context": {
      "cwd": "D:/AI/html-indesign",
      "session_path": "D:/AI/html-indesign/.indesign-cli/session.json",
      "host_tools": ["script.run", "export.verify", "session.show"]
    }
  }
}
```

直接完成响应：

```json
{
  "status": "complete",
  "data": {
    "ok": true,
    "errors": [],
    "warnings": []
  },
  "artifacts": [
    {
      "kind": "json",
      "path": "test/workspace/lint-report.json"
    }
  ]
}
```

## 11. host action 协议

需要真实 InDesign 的插件工具不得直接调用 COM。它必须返回 `requires_host_actions`，由宿主执行允许的动作。

示例：

```json
{
  "status": "requires_host_actions",
  "state": {
    "run_id": "2026-05-27-001",
    "step": "build_indesign"
  },
  "actions": [
    {
      "id": "create-document",
      "tool_id": "script.run",
      "args": {
        "file": "test/workspace/build-html-indesign.jsx"
      }
    },
    {
      "id": "verify-pdf",
      "tool_id": "export.verify",
      "args": {
        "path": "test/workspace/output/deck.pdf"
      }
    }
  ],
  "resume": {
    "method": "tools/resume"
  }
}
```

宿主执行后调用：

```json
{
  "method": "tools/resume",
  "params": {
    "tool_id": "html.build_indesign",
    "state": {
      "run_id": "2026-05-27-001",
      "step": "build_indesign"
    },
    "host_results": [
      {
        "id": "create-document",
        "ok": true,
        "data": {}
      },
      {
        "id": "verify-pdf",
        "ok": true,
        "data": {}
      }
    ]
  }
}
```

host action 规则：

- 第一版允许的 `tool_id` 只有 `script.run`、`export.verify`、`session.show`。
- `script.run` 只能执行当前项目目录下或插件生成输出目录下的 JSX 文件。
- 插件不得要求宿主执行任意 shell 命令。
- 宿主必须限制最大 resume 轮数，建议默认 3 轮。
- 任一 host action 失败，宿主必须把失败结果传给插件 resume；插件不能吞掉失败。
- 插件最终仍必须返回 `status: complete` 或标准错误。

## 12. 工具目录字段规范

插件工具进入 catalog 后必须具备以下字段：

| 字段 | 要求 |
| ---- | ---- |
| `id` | `<domain>.<snake_case_name>` |
| `domain` | 插件注册域 |
| `name` | 不含 domain 的 snake_case 名称 |
| `one_line_purpose` | 一句话说明，面向 Agent |
| `arg_names` | 参数名数组 |
| `source` | 宿主填充为 `plugin` |
| `plugin` | 宿主填充插件 ID |
| `rank` | 插件内排序，数字越小越靠前 |
| `schema_size` | `small`、`medium`、`large` |
| `availability` | 宿主填充为 `exposed` |
| `callable` | 是否可被 `tool call` 调用 |
| `requires` | 运行依赖，例如 `node`、`indesign_com` |
| `side_effects` | 副作用声明 |
| `artifact_kinds` | 可能输出的 artifact 类型 |
| `destructive` | 是否有破坏性 |
| `target_scope` | `workspace`、`filesystem`、`indesign` 等 |
| `needs_indesign` | 是否需要真实 InDesign |
| `produces_artifacts` | 是否会生成文件 |

`side_effects` 推荐值：

```text
filesystem_read
filesystem_write
indesign_mutation
session_write
network_access
```

`artifact_kinds` 推荐值：

```text
html
json
jsx
indd
idml
pdf
png
jpg
svg
report
```

## 13. 错误规范

插件错误必须返回：

```json
{
  "code": "PLUGIN_SCHEMA_INVALID",
  "message": "Tool schema is invalid",
  "details": {}
}
```

错误码建议：

| code | 场景 |
| ---- | ---- |
| `PLUGIN_MANIFEST_INVALID` | manifest 缺字段或格式错误 |
| `PLUGIN_PROTOCOL_UNSUPPORTED` | 协议版本不兼容 |
| `PLUGIN_ENTRY_NOT_FOUND` | 入口文件不存在 |
| `PLUGIN_HANDSHAKE_FAILED` | handshake 失败 |
| `PLUGIN_TOOL_NOT_FOUND` | 工具不存在 |
| `PLUGIN_SCHEMA_INVALID` | schema 无效 |
| `PLUGIN_CALL_FAILED` | 工具执行失败 |
| `PLUGIN_HOST_ACTION_DENIED` | 请求了不允许的 host action |
| `PLUGIN_HOST_ACTION_FAILED` | host action 执行失败 |
| `PLUGIN_TIMEOUT` | 插件超时 |

宿主必须把插件错误包装进现有 failure envelope，不允许插件直接打印最终 CLI envelope。

## 14. session 与 artifact 规则

宿主负责写当前项目 `.indesign-cli/session.json`。

插件工具调用结束后，session 至少记录：

- `tool_id`
- `domain`
- `source: plugin`
- `plugin`
- `ok`
- `duration_ms`
- 允许展示的 artifact 相对路径

隐私规则：

- 不记录客户文档内容。
- 不记录客户名称。
- 不记录外部私有资产完整路径。
- 对必须返回的文件路径，优先返回相对当前项目的路径。

artifact 返回规则：

```json
{
  "artifacts": [
    {
      "kind": "pdf",
      "path": "test/workspace/output/deck.pdf",
      "description": "Generated presentation PDF"
    }
  ]
}
```

## 15. CLI 命令

第一阶段必须提供：

```powershell
indesign-cli plugin list
indesign-cli plugin install <path>
indesign-cli plugin remove <id>
indesign-cli plugin validate <path-or-manifest>
indesign-cli plugin doctor <id>
```

Agent 稳定入口必须提供：

```powershell
indesign-cli tool list --domain html
indesign-cli tool search --domain html --query lint
indesign-cli tool schema html.authoring_lint
indesign-cli tool call html.authoring_lint --args args.json
```

人类友好短命令可以第二阶段提供：

```powershell
indesign-cli html lint --package deck.config.json --strict
indesign-cli html build --package deck.config.json
indesign-cli html roundtrip --package deck.config.json
```

短命令只是 `tool call html.*` 的薄包装，不能成为唯一入口。

## 16. 插件标准检测工具

需要写检测工具。否则插件是否满足协议只能靠人工 review，后续 `html-indesign` 和 `indesign-cli` 很容易各自演化导致断裂。

检测工具分两类：

| 命令 | 检测对象 | 用途 |
| ---- | -------- | ---- |
| `plugin validate <path-or-manifest>` | 未安装插件 | 插件开发前置验收 |
| `plugin doctor <id>` | 已安装插件 | 用户环境诊断和集成排查 |

### 16.1 `plugin validate`

`plugin validate` 必须检查：

1. 安装记录或 manifest JSON 可解析。
2. manifest 满足必填字段。
3. `schema_version` 和 `protocol` 被当前宿主支持。
4. `id`、`domain`、`version` 格式合法。
5. `root` 和 `entry` 可解析，入口文件存在。
6. `entry` 不越出插件 root。
7. `requires.indesign_cli` 与当前宿主版本兼容。
8. `kind` 被当前宿主支持。
9. `permissions.indesign` 为 `host_only`。
10. `plugin/handshake` 可成功执行。
11. `tools/list` 可成功执行。
12. 每个工具 ID 符合 `<domain>.<snake_case>`。
13. 每个工具声明 `needs_indesign`、`side_effects`、`artifact_kinds`。
14. 每个工具的 `arg_names` 与 `tools/schema` 返回的 `inputSchema.properties` 一致。
15. 每个工具 schema 是合法 JSON Schema object 子集。
16. 插件 `stdout` 没有协议外噪声。
17. 插件错误响应包含 `code`、`message`、`details`。

输出示例：

```json
{
  "ok": false,
  "plugin": "html-indesign",
  "errors": [
    {
      "code": "PLUGIN_SCHEMA_INVALID",
      "message": "html.build_indesign arg_names does not match inputSchema.properties"
    }
  ],
  "warnings": [],
  "summary": {
    "tools": 8,
    "needs_indesign": 3,
    "host_actions": ["script.run", "export.verify"]
  }
}
```

退出码：

| 退出码 | 含义 |
| ------ | ---- |
| 0 | 通过 |
| 1 | 有错误 |
| 2 | 检测器自身参数或环境错误 |

警告不导致非零退出码，但必须进入 JSON `warnings`。

### 16.2 `plugin doctor`

`plugin doctor <id>` 在 `validate` 基础上额外检查：

1. 插件是否在当前发现顺序中生效。
2. 是否被更高优先级插件覆盖。
3. 当前 `cwd` 下 `.indesign-cli/session.json` 是否可写。
4. 插件声明的输出目录是否可写。
5. 需要 Node 时，当前 Node 版本是否满足。
6. 需要 InDesign 的工具是否能看到宿主 `script.run`。
7. 可选执行插件自带 `plugin/doctor`。
8. 对标记 `supports_dry_run` 的工具执行 dry run。

`plugin doctor` 不应默认执行真实 InDesign mutation。需要真实 InDesign 检测时，必须显式传入：

```powershell
indesign-cli plugin doctor html-indesign --deep
```

### 16.3 检测器输出契约

检测命令也必须使用现有 envelope：

```json
{
  "ok": true,
  "command": "plugin validate",
  "data": {
    "ok": true,
    "plugin": "html-indesign",
    "errors": [],
    "warnings": []
  }
}
```

## 17. `html-indesign` 第一阶段插件要求

`html-indesign` 第一阶段至少应提供以下工具：

| tool id | needs_indesign | 说明 |
| ------- | -------------- | ---- |
| `html.preset_init` | false | 初始化项目语义 preset |
| `html.preset_validate` | false | 校验项目语义 preset |
| `html.authoring_assemble` | false | 组装作者包 |
| `html.authoring_lint` | false | 检查作者 HTML、token 和语义 |
| `html.compile_instructions` | false | 生成 InDesign 构建指令 |
| `html.build_indesign` | true | 生成 InDesign 文档和导出物 |
| `html.reverse_export` | true | 从 InDesign 导出反向 HTML 作者包 |
| `html.roundtrip_run` | true | 前向、反向和漂移报告 |

命名规则：

- 插件工具 ID 用下划线，不用点分多层。
- 人类短命令可以用空格分层，但必须映射回单个 tool id。
- 例如 `indesign-cli html preset init` 映射到 `html.preset_init`。

## 18. 安全与权限

插件 manifest 必须显式声明权限。宿主第一版不提供强沙箱，但必须把权限声明纳入检测和展示。

基础规则：

- 插件不得默认访问网络。
- 插件不得要求宿主执行任意 shell。
- 插件不得读取宿主 repo 内部私有源码，除非路径属于插件 root 或当前项目。
- 插件不得把客户内容写入日志。
- 插件不得把外部私有资产完整路径写入 session。
- 插件生成的临时文件应写入当前项目显式目录，例如 `test/workspace/`、`.indesign-cli/work/` 或用户指定 `--out`。

## 19. 版本兼容

宿主和插件通过两个版本协商：

| 字段 | 用途 |
| ---- | ---- |
| `protocol` | 通信协议兼容 |
| `requires.indesign_cli` | 宿主版本兼容 |

规则：

- 宿主不支持的 `protocol` 必须拒绝加载。
- `requires.indesign_cli` 不满足时，`plugin validate` 报错。
- 同一 protocol 内允许新增可选字段。
- 删除字段、改变字段含义、改变错误结构必须升级 protocol。

## 20. 测试要求

`indesign-cli` 侧必须补：

- manifest schema 校验测试。
- 项目级插件发现测试。
- 重复插件 ID 优先级测试。
- `plugin validate` 成功和失败测试。
- `plugin doctor` 安装后诊断测试。
- `tool list --domain html` 能列出 fake plugin 工具。
- `tool schema html.authoring_lint` 能返回 schema。
- `tool call html.authoring_lint` 能调用 fake plugin。
- 插件 `stdout` 噪声导致检测失败。
- 插件请求非法 host action 时被拒绝。
- 插件 host action 失败时，失败能进入最终 envelope。

`html-indesign` 侧必须补：

- manifest 有效性测试。
- `plugin/handshake` 测试。
- `tools/list` 工具清单测试。
- `tools/schema` 与现有脚本参数一致性测试。
- `tools/call html.authoring_lint` 调用真实 lint 逻辑。
- `tools/call html.compile_instructions` 调用真实编译逻辑。
- `html.build_indesign` dry run 能返回 host action。

真实 E2E：

- 在项目目录执行 `indesign-cli plugin install D:\AI\html-indesign`。
- 执行 `indesign-cli plugin validate D:\AI\html-indesign`。
- 执行 `indesign-cli plugin doctor html-indesign`。
- 执行 `indesign-cli tool list --domain html`。
- 执行至少一个不需要 InDesign 的 HTML 工具。
- 在 `--deep` 或真实 E2E 阶段执行 `html.build_indesign` 或 `html.roundtrip_run`。

## 21. 实施分期

第一阶段：本地插件协议。

- 实现项目级插件安装记录。
- 实现 manifest loader 和 validator。
- 实现 `plugin list/install/remove/validate/doctor`。
- 实现 plugin backend 的 `handshake`、`tools/list`、`tools/schema`、`tools/call`。
- catalog 支持动态 domain 和 `source: plugin`。
- router 支持调用插件工具。
- 先用 fake plugin 完成宿主测试。

第二阶段：`html-indesign` 接入。

- `html-indesign` 新增 manifest 和 Node 插件入口。
- 暴露第一批 `html.*` 工具。
- 打通 `tool list/schema/call`。
- 打通不需要 InDesign 的 lint、assemble、compile。
- 打通需要 host action 的 build、reverse、roundtrip。

第三阶段：发布形态。

- 支持 Python entry point `indesign_cli.plugins`。
- 支持 `pip install "indesign-cli[html]"`。
- 支持官方插件包 `indesign-html-plugin`。
- 可选支持 `indesign-cli-full`。

## 22. 成功标准

- `html-indesign` 不进入 `indesign-cli` 核心源码，也能被 `indesign-cli` 发现。
- `indesign-cli tool domains` 可以出现 `html` 域。
- `indesign-cli tool list --domain html` 可以列出插件工具。
- `indesign-cli tool schema html.authoring_lint` 可以返回 schema。
- `indesign-cli tool call html.authoring_lint --args args.json` 可以执行插件工具并返回统一 envelope。
- 需要 InDesign 的插件工具通过 host action 使用 `script.run` 和 `export.verify`。
- `plugin validate` 能在安装前发现 manifest、schema、协议和 stdout 问题。
- `plugin doctor` 能在安装后定位发现顺序、依赖、权限和宿主能力问题。
- 普通 `indesign-cli` 用户不安装插件时，基础 CLI 仍保持轻量。

