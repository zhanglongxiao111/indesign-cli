# indesign-cli Agent 自举式发布与强制更新方案

日期：2026-07-03

## 1. 背景

当前 `indesign-cli` 的真实 InDesign 自动化链路依赖：

```text
Python CLI -> Node MCP server -> winax -> Windows COM -> Adobe InDesign
```

其中 `winax` 是连接 InDesign COM 的必要依赖，但它是 Node 原生模块。普通工位如果没有 Node、npm、MSVC C++ Build Tools、Windows SDK 等工具链，`indesign-cli server setup` 可能触发本地编译失败，甚至被误导安装 WiX 等无关组件。

建筑事务所内部使用场景不是人类手动安装 CLI，而是 Agent 在有 InDesign 的工位上自动复制工具、初始化环境、运行命令并读取结构化结果。因此发布形态应面向 Agent，而不是面向普通开发者。

## 2. 目标

提供一个事务所内网可分发的 Agent 专用成品：

```text
indesign-cli-agent.exe
```

Agent 从服务器复制该 exe 到本机后即可运行，无需人工干预。

目标能力：

- 不要求用户预装 Python。
- 不要求用户预装 Node.js。
- 不要求用户运行 `npm install`。
- 不要求用户安装 `winax`。
- 不要求用户安装 MSVC、Windows SDK、WiX 或其他编译工具。
- 不要求管理员权限。
- 首次运行自动释放内置 runtime。
- 后续运行自动检查服务器最新版本。
- 发现新版本时强制更新，更新成功后才执行业务命令。
- 所有结果输出为 Agent 可解析的 JSON。
- 保留旧版本用于失败回滚。

## 3. 非目标

本方案不做以下事情：

- 不做面向人类用户的图形安装器。
- 不做 MSI，不依赖 WiX。
- 不写入 `C:\Program Files`。
- 不修改系统级 PATH。
- 不写 HKLM 注册表。
- 不绕过现有 `src/core`、`src/handlers`、`src/types`、`src/utils` 执行链路。
- 不替换 InDesign COM 自动化后端；`winax` 仍是主后端。
- 不承诺在无桌面会话、SYSTEM 服务会话或未登录用户会话中操作 InDesign。

## 4. 运行前提

目标工位仍必须满足：

- Windows x64。
- Adobe InDesign 已安装。
- InDesign COM 注册正常。
- Agent 运行在与 InDesign 相同的 Windows 用户桌面会话中。
- Agent 当前用户可读事务所服务器共享目录。
- Agent 当前用户可写 `%LOCALAPPDATA%` 和 `%TEMP%`。
- 本机安全策略允许执行事务所签发或白名单内的 exe。

不需要管理员权限。所有安装、更新和缓存都只写用户目录。

## 5. 总体形态

### 5.1 单文件自举 exe

对 Agent 暴露一个文件：

```text
indesign-cli-agent.exe
```

该 exe 内置：

- 打包后的 Python CLI 或等价 bootstrapper。
- portable Node runtime。
- `src/` server 代码。
- `package.json` / `package-lock.json`。
- 已预编译的 `node_modules`，包含 `winax`。
- bundled `skills/indesign-cli/SKILL.md`。
- runtime manifest。

技术上不要求所有内容长期停留在单个进程内。首次运行时允许自动解压到本机用户缓存目录，因为 Node 和 `winax` 原生模块需要真实文件路径加载。

### 5.2 本机目录布局

默认安装目录：

```text
%LOCALAPPDATA%\indesign-cli\
  bin\
    indesign-cli.exe
    indesign-cli-agent.exe
  current\
    manifest.json
  runtime\
    0.4.1\
      node\
        node.exe
      server\
        package.json
        package-lock.json
        src\
        node_modules\
          winax\
      skills\
        indesign-cli\
          SKILL.md
  previous\
  downloads\
  logs\
  lock\
```

`current` 不必实现为 Windows symlink。为避免权限和安全软件问题，可以使用 `current\manifest.json` 保存当前激活版本路径。

### 5.3 服务器目录布局

事务所服务器共享目录建议：

```text
\\server\tools\indesign-cli\
  latest.json
  bootstrap\
    indesign-cli-agent.exe
  releases\
    0.4.1\
      indesign-cli-agent.exe
      manifest.json
      sha256.txt
    0.4.2\
      indesign-cli-agent.exe
      manifest.json
      sha256.txt
```

Agent 不应直接从 UNC 路径运行 runtime。推荐先复制 bootstrapper 到 `%TEMP%` 后执行，降低 UNC、杀毒软件和原生模块加载的不确定性。

## 6. Agent 入口

Agent 标准调用方式：

```powershell
Copy-Item "\\server\tools\indesign-cli\bootstrap\indesign-cli-agent.exe" "$env:TEMP\indesign-cli-agent.exe" -Force
& "$env:TEMP\indesign-cli-agent.exe" run --source "\\server\tools\indesign-cli\latest.json" -- server health --deep --connect-indesign
```

所有业务命令都通过 `run --` 进入：

```powershell
indesign-cli-agent.exe run --source "\\server\tools\indesign-cli\latest.json" -- script run build.jsx
indesign-cli-agent.exe run --source "\\server\tools\indesign-cli\latest.json" -- tool domains
indesign-cli-agent.exe run --source "\\server\tools\indesign-cli\latest.json" -- export verify output.pdf
```

不建议 Agent 直接调用旧的本地 `indesign-cli.exe`，否则会绕过强制更新。

## 7. 强制更新策略

### 7.1 默认规则

强制更新是默认行为：

```text
每次 run
-> 读取服务器 latest.json
-> 读取本机 current manifest
-> 比较版本
-> 如果 latest > current，先更新
-> 更新成功后用新版本执行原命令
-> 更新失败则停止，不执行业务命令
```

不为普通 Agent 文档提供跳过更新参数。内部调试可以保留隐藏参数，例如 `--no-update-check`，但不能作为标准使用路径。

### 7.2 严格离线策略

事务所目标是确保所有 Agent 使用最新能力，因此采用严格模式：

```text
无法访问 latest.json
-> 返回 UPDATE_CHECK_FAILED
-> 不执行业务命令
```

如果后续需要支持外出离线工位，可另行增加受控的 `offline allowed until` 策略，但不作为第一版目标。

### 7.3 服务器 latest.json

示例：

```json
{
  "schema_version": 1,
  "name": "indesign-cli-agent",
  "version": "0.4.2",
  "channel": "stable",
  "force": true,
  "url": "\\\\server\\tools\\indesign-cli\\releases\\0.4.2\\indesign-cli-agent.exe",
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "runtime": {
    "platform": "win32",
    "arch": "x64",
    "node_major": 20,
    "winax_version": "3.6.2"
  },
  "published_at": "2026-07-03T00:00:00+08:00",
  "notes": "Agent runtime update."
}
```

### 7.4 更新流程

更新必须是原子化的：

1. 下载或复制新版 `indesign-cli-agent.exe` 到 `%LOCALAPPDATA%\indesign-cli\downloads\`。
2. 校验 `sha256`。
3. 解压新版 runtime 到独立目录，例如 `runtime\0.4.2\`。
4. 使用新版 runtime 执行只读自检。
5. 自检通过后更新 `current\manifest.json`。
6. 保留上一版本路径。
7. 用新版本重新执行原业务命令。

更新失败时：

- 不改写 `current\manifest.json`。
- 不删除旧版本。
- 返回结构化失败。
- 不执行业务命令。

## 8. 命令设计

建议 `indesign-cli-agent.exe` 支持：

```powershell
indesign-cli-agent.exe run --source <latest.json> -- <indesign-cli args...>
indesign-cli-agent.exe install --source <latest.json> --quiet
indesign-cli-agent.exe update --source <latest.json> --quiet
indesign-cli-agent.exe health --source <latest.json> --json
indesign-cli-agent.exe version --json
indesign-cli-agent.exe rollback --quiet
indesign-cli-agent.exe runtime reset --quiet
indesign-cli-agent.exe uninstall --quiet
```

第一版必须实现：

- `run`
- `update`
- `health`
- `version`

`rollback`、`runtime reset`、`uninstall` 可作为同一阶段的辅助命令，但不能影响主链路交付。

## 9. JSON 输出契约

### 9.1 成功

```json
{
  "ok": true,
  "command": "run",
  "version": "0.4.2",
  "updated": true,
  "previous_version": "0.4.1",
  "runtime_root": "%LOCALAPPDATA%\\indesign-cli\\runtime\\0.4.2",
  "data": {
    "exit_code": 0
  }
}
```

### 9.2 需要更新但失败

```json
{
  "ok": false,
  "code": "UPDATE_REQUIRED_BUT_FAILED",
  "message": "A newer indesign-cli version is required, but update failed.",
  "current": "0.4.1",
  "latest": "0.4.2",
  "details": {
    "source": "\\\\server\\tools\\indesign-cli\\latest.json",
    "reason": "sha256 mismatch"
  },
  "next_action": "Check the release manifest and sha256, then rerun update."
}
```

### 9.3 无法检查更新

```json
{
  "ok": false,
  "code": "UPDATE_CHECK_FAILED",
  "message": "Cannot read latest indesign-cli release manifest.",
  "details": {
    "source": "\\\\server\\tools\\indesign-cli\\latest.json"
  },
  "next_action": "Verify network share permissions and rerun the command."
}
```

### 9.4 InDesign COM 不可用

```json
{
  "ok": false,
  "code": "INDESIGN_COM_UNAVAILABLE",
  "message": "Adobe InDesign COM automation is not available in the current user session.",
  "details": {
    "checked": true
  },
  "next_action": "Start InDesign in the same Windows user session and rerun health."
}
```

## 10. Node 与 winax 处理

### 10.1 固定 runtime 组合

发布包应固定组合：

```text
Windows x64
Node 20 x64
winax 3.6.2
```

`winax` 编译产物与 Node ABI 和架构相关，因此发布物命名必须包含 Node 大版本和平台信息：

```text
indesign-cli-agent-0.4.2-win-x64-node20.exe
```

对 Agent 暴露的 bootstrap 文件名可以保持稳定：

```text
\\server\tools\indesign-cli\bootstrap\indesign-cli-agent.exe
```

但 `latest.json` 和 release manifest 必须记录真实版本、平台和 Node major。

### 10.2 CLI Node 查找顺序

现有 CLI 直接依赖 PATH 上的 `node`。为支持内置 runtime，需要调整为：

1. `INDESIGN_CLI_NODE` 指定的 `node.exe`。
2. 当前 runtime manifest 里的 `node.exe`。
3. `INDESIGN_CLI_RUNTIME_ROOT\node\node.exe`。
4. `INDESIGN_CLI_SERVER_ROOT\..\node\node.exe`。
5. PATH 上的 `node`。

Agent bootstrapper 应优先通过环境变量或子进程参数传入当前 runtime 的 `node.exe`，避免误用用户机器上的 Node。

### 10.3 server root 查找

现有 `INDESIGN_CLI_SERVER_ROOT` 仍保留。Agent bootstrapper 执行业务命令时应显式设置：

```text
INDESIGN_CLI_SERVER_ROOT=%LOCALAPPDATA%\indesign-cli\runtime\<version>\server
INDESIGN_CLI_NODE=%LOCALAPPDATA%\indesign-cli\runtime\<version>\node\node.exe
```

这样旧的开发者安装方式不受影响，Agent 发布方式也不依赖系统环境。

## 11. 权限与安全

### 11.1 权限边界

只写：

```text
%LOCALAPPDATA%\indesign-cli\
%TEMP%\
```

不写：

```text
C:\Program Files\
C:\Windows\
HKLM
系统 PATH
```

因此不需要 UAC。

### 11.2 文件校验

必须校验：

- `latest.json` schema。
- release exe 的 `sha256`。
- 解压后的 runtime manifest。
- `node.exe` 存在且版本匹配。
- `server/package.json` 存在。
- `server/src/index.js` 存在。
- `server/node_modules/winax` 存在。

建议后续增加代码签名，但第一版最低要求是 SHA-256 校验和内网可信来源。

### 11.3 并发锁

多个 Agent 进程可能同时启动。必须使用本机锁文件：

```text
%LOCALAPPDATA%\indesign-cli\lock\update.lock
```

规则：

- 同一时刻只允许一个进程执行安装或更新。
- 其他进程等待锁释放，随后重新读取 current manifest。
- 锁超时返回 `UPDATE_LOCK_TIMEOUT`。
- 锁文件不得导致永久死锁；必须记录持有进程和时间戳。

## 12. 回滚策略

更新失败不切换版本，因此天然保留旧版本。

如果新版已切换但后续健康检查失败，支持：

```powershell
indesign-cli-agent.exe rollback --quiet
```

回滚规则：

- 读取 `current\manifest.json` 中的 `previous_version`。
- 检查旧 runtime 仍存在。
- 切回旧版本。
- 输出 JSON。

强制更新策略下，回滚后下一次 `run` 仍会尝试更新到最新版本。回滚主要用于人工排查或临时恢复，不作为长期跳过升级机制。

## 13. 日志与隐私

日志位置：

```text
%LOCALAPPDATA%\indesign-cli\logs\
```

日志只记录：

- 版本。
- 命令类型。
- 错误码。
- 耗时。
- runtime 路径。
- release manifest 摘要。
- health 检查摘要。

不得记录：

- 客户文档内容。
- 客户名称。
- 私有资产完整路径。
- InDesign 文档正文。

路径进入日志前应复用现有 scrub 规则，只保留必要诊断信息。

## 14. 发布流程

内部发布流程建议：

1. 在标准构建机安装固定 Node 20 x64。
2. 安装依赖并构建 `winax`。
3. 运行 CLI 单元测试。
4. 运行 Node schema 和重复工具检查。
5. 在有 InDesign 的构建或验收机运行 `server health --deep --connect-indesign`。
6. 打包 `indesign-cli-agent.exe`。
7. 生成 release `manifest.json` 和 `sha256.txt`。
8. 上传到 `\\server\tools\indesign-cli\releases\<version>\`。
9. 先不更新 `latest.json`，在测试工位用显式 source 验证。
10. 验证通过后原子替换 `latest.json`。

`latest.json` 是发布开关。替换它之前，新版本不会被普通 Agent 强制更新。

## 15. 兼容现有开发者安装方式

保留现有方式：

```powershell
pip install indesign-cli
indesign-cli server setup
```

该方式适合开发者和开源用户。

新增 Agent 发布方式不应破坏：

- PyPI 安装。
- editable 安装。
- `INDESIGN_CLI_SERVER_ROOT`。
- PATH 上 Node 的开发体验。
- 当前 MCP server 和 handler 执行链路。

也就是说，Agent 自举 exe 是分发层增强，不是重写业务能力。

## 16. 风险

### 16.1 杀毒软件误拦截

单文件 exe 内置 runtime 并自解压，可能触发安全软件关注。

缓解：

- 内网固定路径分发。
- SHA-256 校验。
- 后续增加代码签名。
- 解压到 `%LOCALAPPDATA%` 固定目录，不使用随机深层路径运行原生模块。

### 16.2 InDesign 首次启动弹窗

即使 CLI 安装成功，InDesign 许可、更新、插件提示也可能阻塞 COM 自动化。

缓解：

- `health --deep --connect-indesign` 明确报告 COM 状态。
- 事务所标准镜像预先完成 InDesign 激活和首次启动。

### 16.3 Node ABI 不匹配

如果误用系统 Node 或替换 runtime 中的 Node，`winax` 可能加载失败。

缓解：

- bootstrapper 显式设置 `INDESIGN_CLI_NODE`。
- runtime manifest 记录 Node major 和 arch。
- health 检查验证实际 node 路径与 runtime 一致。

### 16.4 强制更新导致服务器故障放大

严格模式下 `latest.json` 不可读会阻断业务命令。

缓解：

- `latest.json` 使用原子替换。
- 服务器路径高可用或至少稳定备份。
- 返回 `UPDATE_CHECK_FAILED`，让 Agent 明确报告网络或权限问题。

## 17. 验收标准

第一版完成必须满足：

- 在未安装 Python、Node、npm、MSVC、WiX 的干净 Windows x64 工位上，Agent 可运行 `indesign-cli-agent.exe run -- ...`。
- 首次运行自动释放 runtime 到 `%LOCALAPPDATA%\indesign-cli\`。
- 本机没有 PATH Node 时仍可执行 `server health --deep`。
- 本机没有编译工具时仍可加载 `winax`。
- `server health --deep --connect-indesign` 能连接已安装 InDesign。
- 服务器发布更高版本后，旧本机版本会强制更新。
- 更新失败时不执行业务命令。
- `sha256` 不匹配时返回 `UPDATE_REQUIRED_BUT_FAILED`。
- `latest.json` 不可读时返回 `UPDATE_CHECK_FAILED`。
- 并发两个 Agent 同时启动时，不破坏 runtime。
- 更新成功后旧版本可回滚。
- 所有 bootstrapper 输出为 JSON，stdout 不混入诊断日志。
- 不写系统目录，不要求管理员权限。

## 18. 后续实施拆分

本方案落地时建议拆成后续计划文档：

1. Runtime 查找改造：让 CLI 支持 `INDESIGN_CLI_NODE` 和 runtime manifest。
2. Bootstrapper 命令实现：`run/update/health/version`。
3. 打包脚本：生成单文件 exe、manifest、sha256。
4. 强制更新和并发锁。
5. 干净工位验收和 InDesign COM 验收。
6. README、Skill、AGENTS 相关说明同步。

实施阶段仍需遵守当前项目边界：CLI 复用现有 MCP server、handler 和 COM 执行层，不重写 InDesign 自动化。
