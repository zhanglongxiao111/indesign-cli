# indesign-cli 插件宿主实施计划

日期：2026-05-27

对应方案：`docs/superpowers/specs/2026-05-27-indesign-cli-plugin-host-protocol-design.md`

## 目标

为 `indesign-cli` 增加第一版插件宿主能力，让 `html-indesign` 可以作为本地插件接入，并通过统一工具目录被 Agent 使用。

第一版完成后，应能跑通：

```powershell
indesign-cli plugin install D:\AI\html-indesign
indesign-cli plugin list
indesign-cli plugin validate D:\AI\html-indesign
indesign-cli plugin doctor html-indesign
indesign-cli tool list --domain html
indesign-cli tool schema html.authoring_lint
indesign-cli tool call html.authoring_lint --args args.json
```

## 总体策略

- 先用 fake plugin 把宿主协议打稳，再接 `html-indesign`。
- 第一阶段只做项目级本地插件，不做远程插件市场。
- 插件能力进入 `tool domains/list/search/schema/call`，这是 Agent 稳定入口。
- `plugin validate` 和 `plugin doctor` 不是附属功能，而是插件协议能长期稳定的必要工具。
- 插件不能直接调用 InDesign COM；需要真实 InDesign 时通过 host action 调宿主 `script.run`、`export.verify`、`session.show`。

## 代码边界

### 新增文件建议

| 文件 | 作用 |
| ---- | ---- |
| `agent-harness/cli_anything/indesign/core/plugins/manifest.py` | manifest 读取、规范化、字段校验 |
| `agent-harness/cli_anything/indesign/core/plugins/discovery.py` | 项目级、用户级、entry point、内置插件发现 |
| `agent-harness/cli_anything/indesign/core/plugins/install.py` | `plugin install/remove/list` 逻辑 |
| `agent-harness/cli_anything/indesign/core/plugins/backend.py` | Node 插件 JSON-RPC 子进程调用 |
| `agent-harness/cli_anything/indesign/core/plugins/validate.py` | `plugin validate` 检测器 |
| `agent-harness/cli_anything/indesign/core/plugins/host_actions.py` | 受控 host action 执行和 resume |
| `agent-harness/cli_anything/indesign/tests/fixtures/plugins/fake-html-plugin/` | 测试用插件 |

### 修改文件

| 文件 | 修改点 |
| ---- | ------ |
| `agent-harness/cli_anything/indesign/indesign_cli.py` | 增加 `plugin` 命令组，构建 catalog 时加载插件 |
| `agent-harness/cli_anything/indesign/core/catalog.py` | 支持 `source: plugin`、插件工具、动态 domain |
| `agent-harness/cli_anything/indesign/core/domains.py` | 支持核心 domain 与插件 domain 合并 |
| `agent-harness/cli_anything/indesign/core/router.py` | 支持插件 schema/call 路由 |
| `agent-harness/cli_anything/indesign/core/session.py` | 记录插件调用元数据和 artifact |
| `agent-harness/cli_anything/indesign/tests/test_core.py` | 增加不依赖真实 InDesign 的插件宿主测试 |
| `README.md` / `README.en.md` | 后续补充插件使用说明 |
| `AGENTS.md` | 如形成长期约束，再同步插件边界和命令 |

## Task 0：基线确认

- [ ] 确认工作区状态，记录已有未跟踪文件，不清理无关目录。
- [ ] 跑当前 CLI 单元测试，确认插件改造前基线可用。
- [ ] 用当前 catalog 统计工具数，作为插件接入前基线。
- [ ] 确认 `indesign-cli --version`、`tool domains`、`tool schema script.run` 正常。

验收命令：

```powershell
git status --short
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
$env:PYTHONPATH='agent-harness'; python -m cli_anything.indesign --json --pretty tool domains
```

## Task 1：建立 fake plugin 测试夹具

目标：先有一个极小插件，用来验证宿主协议，不依赖 `html-indesign` 真实代码。

- [ ] 新增 `agent-harness/cli_anything/indesign/tests/fixtures/plugins/fake-html-plugin/manifest.json`。
- [ ] 新增 fake plugin Node 入口 `index.js`。
- [ ] fake plugin 支持 `plugin/handshake`。
- [ ] fake plugin 支持 `tools/list`，返回至少三个工具：
  - `html.authoring_lint`：不需要 InDesign，无副作用。
  - `html.compile_instructions`：不需要 InDesign，生成 JSON artifact。
  - `html.build_indesign`：需要 InDesign，返回 host action。
- [ ] fake plugin 支持 `tools/schema`。
- [ ] fake plugin 支持 `tools/call`。
- [ ] fake plugin 支持 `tools/resume`。
- [ ] fake plugin 提供可控失败模式，用于测试错误响应、stdout 噪声、非法 host action。

验收标准：

- fake plugin 可被 Node 单独启动并响应协议 JSON。
- fake plugin 不输出协议外 stdout。
- fake plugin 的工具 ID、schema、arg_names 与 spec 一致。

## Task 2：manifest 读取与校验

目标：宿主可以读取插件安装记录和插件自身 manifest，并给出稳定错误。

- [ ] 实现 manifest JSON 读取。
- [ ] 支持两类输入：
  - 插件 root：自动寻找 `src/indesign-cli-plugin/manifest.json`。
  - manifest 文件：直接读取。
- [ ] 校验必填字段：
  - `schema_version`
  - `protocol`
  - `id`
  - `name`
  - `version`
  - `kind`
  - `domain`
  - `entry`
  - `description`
  - `requires`
  - `capabilities`
  - `permissions`
- [ ] 校验 `id`、`domain`、`version` 格式。
- [ ] 校验 `entry` 存在且不越出插件 root。
- [ ] 校验 `kind` 第一版只接受 `node-plugin`。
- [ ] 校验 `protocol` 第一版只接受 `indesign-cli-plugin.v1`。
- [ ] 校验 `permissions.indesign` 必须是 `host_only`。
- [ ] 错误统一抛 `CliError`，错误码使用 spec 中的 `PLUGIN_*`。

验收标准：

- 合法 fake manifest 通过。
- 缺字段 manifest 失败，并指出字段。
- entry 不存在失败。
- entry 越界失败。
- 非法 domain 失败。

## Task 3：项目级插件安装、移除和列表

目标：完成第一版本地插件安装机制。

- [ ] 实现项目级插件目录 `<cwd>/.indesign-cli/plugins/`。
- [ ] `plugin install <path>` 写入 `<cwd>/.indesign-cli/plugins/<id>.json`。
- [ ] 安装记录使用绝对 `root`，不复制插件源码。
- [ ] 重复安装同 ID 时默认覆盖同一项目级记录。
- [ ] `plugin remove <id>` 删除项目级安装记录，不删除插件源码。
- [ ] `plugin list` 展示：
  - 插件 ID
  - domain
  - version
  - source：project/user/entry_point/builtin
  - enabled
  - root
  - warnings
- [ ] 第一版可以预留 `--user` 参数，但不要求实现用户级写入。

验收命令：

```powershell
indesign-cli plugin install agent-harness\cli_anything\indesign\tests\fixtures\plugins\fake-html-plugin
indesign-cli plugin list
indesign-cli plugin remove html-indesign
```

验收标准：

- 安装后能看到 `.indesign-cli/plugins/fake-html-plugin.json`。
- `plugin list` 能列出项目级插件。
- 删除后插件不再出现在项目级列表中。

## Task 4：插件发现与优先级

目标：把插件发现做成独立模块，为后续用户级、entry point、内置插件留口。

- [ ] 实现项目级插件发现。
- [ ] 预留用户级插件发现接口。
- [ ] 预留 Python entry point `indesign_cli.plugins` 发现接口。
- [ ] 预留包内置插件目录发现接口。
- [ ] 实现同 ID 优先级合并。
- [ ] 高优先级覆盖低优先级时生成 warning。
- [ ] 同一优先级重复 ID 报错。
- [ ] 发现失败的插件不应让整个 CLI 崩掉；应进入 warnings，除非用户正在显式操作该插件。

验收标准：

- 项目级插件可以被发现。
- 被覆盖插件会出现在 warnings。
- 同级重复插件报错。
- 坏插件不会影响 `server health` 等非插件命令。

## Task 5：插件 backend

目标：实现一次性 Node 插件进程调用。

- [ ] 实现插件入口启动：`node <entry>`。
- [ ] 使用 UTF-8 JSON stdin/stdout。
- [ ] `stderr` 收集为诊断信息，不进入协议 JSON。
- [ ] 禁止协议外 stdout；发现后 `plugin validate` 报错。
- [ ] 实现请求 ID。
- [ ] 实现超时，默认 30 秒。
- [ ] 实现 `plugin/handshake`。
- [ ] 实现 `tools/list`。
- [ ] 实现 `tools/schema`。
- [ ] 实现 `tools/call`。
- [ ] 实现 `tools/resume`。
- [ ] 插件错误转换为 `CliError`，并保留 `code/message/details`。

验收标准：

- fake plugin 的 handshake 成功。
- fake plugin 的工具清单可读取。
- fake plugin schema 可读取。
- fake plugin call 可执行。
- stdout 噪声被检测出来。
- 插件超时有明确错误码。

## Task 6：catalog 支持动态 domain 和 `source: plugin`

目标：插件工具进入 Agent 可见的统一目录。

- [ ] `VALID_SOURCES` 增加 `plugin`。
- [ ] `Catalog` 支持接收 plugin tools。
- [ ] `domains()` 合并核心 domain 和插件 domain。
- [ ] `list_tools(domain='html')` 支持插件 domain。
- [ ] `list_tools(source='plugin')` 支持插件来源。
- [ ] `search` 能搜索插件工具 ID、name、purpose。
- [ ] 插件工具由宿主补齐：
  - `source: plugin`
  - `plugin`
  - `availability: exposed`
- [ ] 插件工具字段缺失时，`plugin validate` 失败，catalog 只加载合格工具。
- [ ] 核心工具和插件工具 ID 冲突时，插件加载失败。

验收命令：

```powershell
indesign-cli tool domains
indesign-cli tool list --domain html
indesign-cli tool list --source plugin
indesign-cli tool search --domain html --query lint
```

验收标准：

- `html` domain 出现在 `tool domains`。
- `tool list --domain html` 只列出 HTML 插件工具。
- `tool list --source plugin` 列出插件工具。
- 搜索结果包含 `html.authoring_lint`。

## Task 7：router 支持插件 schema/call

目标：让 Agent 稳定入口真正能调用插件工具。

- [ ] `Router.schema()` 支持 `source: plugin`。
- [ ] `Router.call()` 支持 `source: plugin`。
- [ ] 插件 schema 返回值包装成现有 `tool schema` envelope。
- [ ] 插件 call 返回值包装成现有 `tool call` envelope。
- [ ] 插件调用失败时记录 session 失败。
- [ ] 插件调用成功时记录 session 成功。
- [ ] 插件返回 artifact 时，session 只记录允许展示的相对路径。
- [ ] 插件错误不能直接穿透为非结构化异常。

验收命令：

```powershell
indesign-cli tool schema html.authoring_lint
indesign-cli tool call html.authoring_lint --args args.json
indesign-cli session show
```

验收标准：

- schema 命令返回插件 schema。
- call 命令返回统一 envelope。
- session 中能看到 `source: plugin` 和 `plugin: html-indesign` 或 fake plugin ID。

## Task 8：host action 和 resume

目标：需要真实 InDesign 的插件工具通过宿主受控执行。

- [ ] 插件 call 返回 `status: requires_host_actions` 时进入 host action 执行流程。
- [ ] 第一版只允许：
  - `script.run`
  - `export.verify`
  - `session.show`
- [ ] `script.run` host action 只允许执行当前项目目录或插件输出目录下的 JSX。
- [ ] 拒绝任意 shell、任意 Node、任意 Python host action。
- [ ] 每个 host action 使用现有 Router 调用。
- [ ] host action 失败后仍调用插件 `tools/resume`，让插件生成最终错误报告。
- [ ] 限制 resume 最大轮数，默认 3。
- [ ] 超过 resume 轮数报 `PLUGIN_HOST_ACTION_LIMIT_EXCEEDED`。
- [ ] host action 结果进入最终返回数据的诊断区，但不能泄露客户私有路径。

验收标准：

- fake `html.build_indesign` 返回 host action 后，宿主能执行并 resume。
- 非法 host action 被拒绝。
- host action 失败时最终 envelope 可定位失败 action。
- resume 循环不会无限执行。

## Task 9：`plugin validate`

目标：提供给 `html-indesign` 开发者的标准检测工具。

- [ ] `plugin validate <path-or-manifest>` 支持插件 root。
- [ ] `plugin validate <path-or-manifest>` 支持 manifest 文件。
- [ ] 检查 manifest 必填字段。
- [ ] 检查协议版本。
- [ ] 检查 ID、domain、version。
- [ ] 检查 entry 路径。
- [ ] 检查 host-only InDesign 权限。
- [ ] 执行 handshake。
- [ ] 执行 tools/list。
- [ ] 对每个工具执行 tools/schema。
- [ ] 校验工具 ID 格式。
- [ ] 校验 tool domain 与 manifest domain 一致。
- [ ] 校验 `arg_names` 与 schema properties 一致。
- [ ] 校验 schema object 子集。
- [ ] 校验工具必须声明 `needs_indesign`、`side_effects`、`artifact_kinds`。
- [ ] 检查 stdout 噪声。
- [ ] 检查错误响应格式。
- [ ] 输出 JSON envelope。
- [ ] 有错误时退出码为 1。

验收命令：

```powershell
indesign-cli plugin validate agent-harness\cli_anything\indesign\tests\fixtures\plugins\fake-html-plugin
```

验收标准：

- 合法 fake plugin 返回 `data.ok: true`。
- 故意破坏 schema 后返回 `data.ok: false`，并列出错误。
- 检测器自身参数错误退出码为 2。

## Task 10：`plugin doctor`

目标：安装后排查插件在当前项目是否真的可用。

- [ ] `plugin doctor <id>` 先执行已安装插件解析。
- [ ] 显示插件来自哪个发现来源。
- [ ] 显示是否被更高优先级覆盖。
- [ ] 检查当前 `.indesign-cli/session.json` 是否可写。
- [ ] 检查插件输出目录是否可写。
- [ ] 检查 Node 版本是否满足。
- [ ] 检查宿主是否提供插件声明的 host action。
- [ ] 如果插件实现 `plugin/doctor`，调用并合并结果。
- [ ] 对支持 dry run 的工具执行 dry run。
- [ ] 默认不执行真实 InDesign mutation。
- [ ] `--deep` 才允许执行真实 InDesign 相关检测。

验收命令：

```powershell
indesign-cli plugin doctor html-indesign
indesign-cli plugin doctor html-indesign --deep
```

验收标准：

- 未安装插件时错误清晰。
- 安装 fake plugin 后 doctor 返回 `ok: true`。
- Node 不满足时能定位问题。
- 不传 `--deep` 不会修改 InDesign 文档。

## Task 11：CLI 命令层整合

目标：把插件命令接进现有 `argparse` CLI。

- [ ] 增加 `plugin` 命令组。
- [ ] 增加 `plugin list`。
- [ ] 增加 `plugin install <path>`。
- [ ] 增加 `plugin remove <id>`。
- [ ] 增加 `plugin validate <path-or-manifest>`。
- [ ] 增加 `plugin doctor <id>`。
- [ ] `safe_command()` 支持插件命令，避免错误 envelope command 混乱。
- [ ] 构建 catalog 时合并插件 warnings。
- [ ] 非插件命令不因为坏插件完全不可用。
- [ ] 第一版不实现 `indesign-cli html ...`，只在 plan 后续阶段保留。

验收标准：

- 所有 plugin 子命令能返回统一 envelope。
- 命令缺参数时错误清晰。
- `tool` 命令能带插件 warnings。

## Task 12：测试覆盖

目标：不依赖真实 InDesign 的宿主行为必须被单元测试覆盖。

- [ ] 测试合法 manifest。
- [ ] 测试缺字段 manifest。
- [ ] 测试 entry 缺失。
- [ ] 测试 entry 越界。
- [ ] 测试项目级 install/list/remove。
- [ ] 测试发现优先级。
- [ ] 测试重复 ID。
- [ ] 测试 plugin validate 成功。
- [ ] 测试 plugin validate 失败。
- [ ] 测试 plugin doctor 成功。
- [ ] 测试 catalog 动态 html domain。
- [ ] 测试 `tool list --domain html`。
- [ ] 测试 `tool schema html.authoring_lint`。
- [ ] 测试 `tool call html.authoring_lint`。
- [ ] 测试非法 host action。
- [ ] 测试 host action resume。
- [ ] 测试插件 stdout 噪声。
- [ ] 测试插件超时。
- [ ] 测试 session 记录插件调用。

验收命令：

```powershell
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
```

## Task 13：`html-indesign` 本地接入验证

目标：在 `html-indesign` 插件实现后，用真实项目路径验证协议。

- [ ] 在 `D:/AI/html-indesign` 新增或确认插件 manifest。
- [ ] 在 `D:/AI/html-indesign` 新增或确认插件 Node 入口。
- [ ] 从本项目安装本地插件。
- [ ] 执行 `plugin validate D:\AI\html-indesign`。
- [ ] 执行 `plugin doctor html-indesign`。
- [ ] 执行 `tool list --domain html`。
- [ ] 执行 `tool schema html.authoring_lint`。
- [ ] 执行不需要 InDesign 的 `html.authoring_lint`。
- [ ] 执行不需要 InDesign 的 `html.compile_instructions`。
- [ ] 在真实 E2E 阶段执行 `html.build_indesign` 或 `html.roundtrip_run`。

验收标准：

- `html-indesign` 不复制 InDesign COM 执行层。
- `html-indesign` 需要真实 InDesign 时返回 host action。
- `indesign-cli` 统一执行真实 JSX 和 export verify。
- 失败能定位到插件、工具、host action 或 schema。

## Task 14：文档和 Skill 更新

目标：把长期入口写清楚，但不把插件细节塞满 Agent 上下文。

- [ ] 更新 `README.md`，增加插件能力概览和本地安装示例。
- [ ] 更新 `README.en.md`。
- [ ] 更新内置 Skill，只补 CLI 内无法发现的信息：
  - 插件机制存在。
  - 优先用 `tool domains/list/schema/call` 发现插件工具。
  - 需要 HTML 能力时先检查 `tool list --domain html`。
- [ ] 必要时更新 `AGENTS.md` 当前注意事项。
- [ ] 如果插件协议成为长期约束，补 `docs/技术决策/`。

验收标准：

- README 面向人类用户讲清楚插件安装。
- Skill 不重复列完整工具清单。
- Agent 可以靠 CLI 自发现插件工具。

## Task 15：后续阶段预留

这些不进入第一阶段完成范围，但实现时不能堵死：

- [ ] Python entry point：`indesign_cli.plugins`。
- [ ] 用户级插件：`%USERPROFILE%/.indesign-cli/plugins/*.json`。
- [ ] 包内置插件目录：`cli_anything/indesign/plugins/*/manifest.json`。
- [ ] `pip install "indesign-cli[html]"`。
- [ ] `indesign-cli html ...` 人类短命令。
- [ ] npm 包发布形态。
- [ ] 插件权限更强的沙箱模型。
- [ ] 常驻插件进程。

## 最终验收清单

- [ ] 当前 CLI 原有测试通过。
- [ ] fake plugin 通过 `plugin validate`。
- [ ] fake plugin 通过 `plugin doctor`。
- [ ] `tool domains` 出现 `html`。
- [ ] `tool list --domain html` 出现 fake plugin 工具。
- [ ] `tool schema html.authoring_lint` 返回 schema。
- [ ] `tool call html.authoring_lint --args args.json` 成功。
- [ ] `html.build_indesign` 的 host action/resume 链路可跑通 fake 场景。
- [ ] 非法 host action 被拒绝。
- [ ] session 记录插件调用。
- [ ] `html-indesign` 本地插件可以安装并通过 validate。
- [ ] 不安装插件时，基础 `indesign-cli` 仍可正常使用。
- [ ] 文档更新完成。

