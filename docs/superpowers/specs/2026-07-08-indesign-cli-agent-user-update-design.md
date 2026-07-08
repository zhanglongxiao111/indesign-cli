# indesign-cli Agent 用户级单 EXE 更新方案

日期：2026-07-08

## 1. 背景

当前 `indesign-cli-agent.exe` 已按单文件自举方向实现：成品是一个 EXE，内置 Python bootstrapper、portable Node、server、`node_modules` 和预编译 `winax`，运行时释放并调用真实 InDesign 自动化链路。

已有 `2026-07-03-indesign-cli-agent-bootstrapper-design.md` 侧重公司内网服务器强制更新。现在需要把发行口径收敛为一个更简单的统一机制：

- 不按内部用户和外部用户分两套产品。
- 不改成传统安装包。
- 不把新版 EXE 落到每个项目或 Agent 工作目录。
- 保留单个 `indesign-cli-agent.exe` 成品。
- 通过 Agent 使用规则主动检查和更新用户级全局安装位。

## 2. 目标

本方案目标是让所有 Agent 使用同一种入口：

```text
%LOCALAPPDATA%\indesign-cli\bin\indesign-cli-agent.exe
```

核心目标：

- 成品仍是单个 `indesign-cli-agent.exe`。
- 安装为当前 Windows 用户级全局工具，不要求管理员权限。
- Agent 每次正式使用前主动检查新版本。
- 更新源优先公司 NAS，NAS 不可用时自动尝试 GitHub Release。
- 发现新版时下载到临时目录，校验后替换用户级全局 EXE。
- 不在项目目录、工作目录、线程目录留下副本。
- 不保留 `.bak`、历史版本或多版本缓存。
- 更新成功后提醒 Agent 工具可能变化。
- 更新失败不破坏已安装 EXE，继续使用当前本地版本。

## 3. 非目标

本方案不做以下事情：

- 不做 MSI、WiX 或图形安装器。
- 不写 `C:\Program Files`。
- 不写 HKLM 注册表。
- 不要求管理员权限。
- 不实现 EXE 运行中自我覆盖。
- 不引入后台服务或常驻更新器。
- 不做 per-project 工具缓存。
- 不把用户级全局目录加入 PATH 作为第一版必需动作。
- 不保留 `.bak` 作为长期回滚文件。
- 不维护多个本地历史 runtime。
- 不替代 PyPI / Git 源码安装方式。

## 4. 成品形态

正式成品仍是：

```text
indesign-cli-agent.exe
```

发布渠道可以同时提供：

- NAS 上的 `indesign-cli-agent.exe`。
- GitHub Release 上的 `indesign-cli-agent.exe`。
- GitHub Release 上的源码包和 PyPI 包。

但对 Agent 来说，标准运行入口只有用户级全局安装位：

```text
%LOCALAPPDATA%\indesign-cli\bin\indesign-cli-agent.exe
```

Agent 不应从项目目录、下载目录、临时工作目录长期运行自己的副本。

第一版不依赖 PATH 或注册表。Agent 必须使用该绝对路径。用户级全局的含义是“同一 Windows 用户下所有项目和 Agent 共用同一个固定 EXE”，不是系统级安装。

## 5. 用户级安装位置

默认目录：

```text
%LOCALAPPDATA%\indesign-cli\
  bin\
    indesign-cli-agent.exe
  tmp\
  state\
    update-state.json
```

目录职责：

- `bin/`：只放当前生效的全局 EXE。
- `tmp/`：只放更新过程中的临时下载文件，成功或失败后清理。
- `state/`：保存上次检查时间、上次使用的更新源、上次错误码等轻量状态。

不放：

- 项目专属缓存。
- 历史 EXE。
- `.bak`。
- 客户文件。
- 文档内容。
- 完整私有资产路径。

## 6. 更新源

默认更新源顺序：

```text
1. \\daga-nas5\sa-ai-app\tools\indesign-cli\latest.json
2. https://github.com/zhanglongxiao111/indesign-cli/releases/latest/download/latest.json
```

规则：

- NAS 可用时优先使用 NAS。
- NAS 不可用时尝试 GitHub。
- 不根据用户身份区分内部或外部用户。
- 两个源发布的同一版本内容必须一致。
- `latest.json` 是静态文件，不要求额外服务器。
- Agent 不应在 NAS manifest 可读时再主动读取 GitHub manifest 做二次决策。一次更新事务只使用一个 manifest 作为真相。
- 如果 NAS manifest 可读但 NAS artifact 下载失败，可使用同一份 NAS manifest 里的 `artifact.github_url` 兜底下载。
- 只有 NAS manifest 不可读时，才读取 GitHub `latest.json`。
- 如果后续诊断发现 NAS 与 GitHub 的 `latest.json` 版本或 hash 不一致，NAS 可读时以 NAS 为准并报告 warning，不混用两份 manifest 的字段。

## 7. latest.json 契约

推荐结构：

```json
{
  "schema_version": 1,
  "name": "indesign-cli-agent",
  "version": "0.4.1",
  "channel": "stable",
  "platform": "windows-x64",
  "url": "\\\\daga-nas5\\sa-ai-app\\tools\\indesign-cli\\releases\\0.4.1\\indesign-cli-agent.exe",
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "artifact": {
    "file": "indesign-cli-agent.exe",
    "url": "\\\\daga-nas5\\sa-ai-app\\tools\\indesign-cli\\releases\\0.4.1\\indesign-cli-agent.exe",
    "github_url": "https://github.com/zhanglongxiao111/indesign-cli/releases/download/v0.4.1/indesign-cli-agent.exe",
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  },
  "published_at": "2026-07-08T00:00:00+08:00",
  "notes": "No new InDesign features; packaging/runtime update."
}
```

说明：

- `version` 是唯一版本判断依据。
- `artifact.url` 是当前源对应的首选下载地址。
- `artifact.github_url` 可作为 NAS manifest 被读取但 NAS artifact 不可读时的兜底下载地址。
- `sha256` 必须校验。
- 顶层 `url` / `sha256` 是过渡兼容字段，用于旧 `run --source` bootstrapper 仍存在的阶段；新用户级更新流程以 `artifact.*` 为准。
- GitHub stable 渠道只使用非 prerelease 的 Release。`releases/latest/download/latest.json` 必须指向 stable 版本，不用于 alpha/beta/canary。
- 不设置最低可运行版本；只要本机已有可用版本，更新失败也允许继续执行。

## 8. 版本发现和比较

本地版本发现顺序：

```text
1. <exe> version --json
2. <exe> --version
3. 仍失败则本地版本记为 unknown
```

规则：

- 远端版本必须是可解析的 SemVer，例如 `0.4.1`。
- 远端 tag 可以是 `v0.4.1`，但 manifest 的 `version` 必须是 `0.4.1`。
- 远端版本无法解析时，不更新，报告 manifest 错误。
- 本地版本为 `unknown` 且远端 manifest 有效时，允许安装远端版本。
- 远端版本低于本地版本时，不降级。
- 远端版本等于本地版本但 hash 与已下载或已发布记录不一致时，视为发布错误，报告 warning，不静默替换。
- 第一版不处理 prerelease 升级。stable 用户只接收 stable。

## 9. 首次安装流程

如果用户级全局 EXE 不存在，Agent 不能调用本地 EXE 参与安装。首装必须由 Agent 外层命令直接完成：

```text
1. 创建 %LOCALAPPDATA%\indesign-cli\bin、tmp、state。
2. 获取用户级更新锁。
3. 读取 NAS latest.json；失败后读取 GitHub latest.json。
4. 从选中的 manifest 下载或复制 artifact 到 tmp\<pid>.download。
5. 校验 sha256。
6. 把下载文件移动到 bin\indesign-cli-agent.exe。
7. 清理 tmp。
8. 调用 bin\indesign-cli-agent.exe version --json 验证可执行。
```

首装失败时：

```text
清理 tmp。
不伪装成功。
返回“首次安装失败”，并说明最后一个失败的更新源和错误码。
```

首装流程可以由 Skill 中的 PowerShell 步骤执行，也可以由后续实现提供轻量安装命令或脚本；但不得把 EXE 下载到项目目录作为长期入口。

## 10. Agent 主动更新流程

Agent 每次正式调用 InDesign CLI 前执行以下流程：

```text
1. 找到用户级全局 EXE。
2. 如果不存在，执行首次安装流程。
3. 调用本地 EXE 查询当前版本。
4. 按顺序读取 NAS / GitHub latest.json。
5. 如果远端版本不高于本地版本，直接执行原命令。
6. 如果远端版本更高，下载新版到 tmp。
7. 校验 sha256。
8. 等本地 EXE 的版本查询进程退出。
9. 确认没有可执行路径等于 bin\indesign-cli-agent.exe 的同用户进程。
10. 把已校验的新 EXE 复制或移动到 bin 下唯一临时名。
11. 使用同目录替换操作把 bin 下临时文件覆盖到 bin 固定位置。
12. 清理 tmp 和 bin 下临时文件。
13. 使用新版 EXE 执行原命令。
```

更新检查失败时：

```text
如果本机已有 EXE -> 继续用本机版本执行，附带 warning。
如果本机没有 EXE -> 失败，提示无法完成首次安装。
```

更新下载或校验失败时：

```text
不删除旧 EXE。
清理 tmp 中失败文件。
继续用旧 EXE 执行，附带 warning。
```

替换失败时：

```text
如果旧 EXE 仍存在 -> 继续用旧 EXE 执行，附带 warning。
如果旧 EXE 已被删除且新 EXE 未就位 -> 返回安装损坏错误。
```

替换动作必须发生在本地 EXE 进程退出后，由 Agent 外层命令或安装辅助逻辑执行。不得让正在运行的 `indesign-cli-agent.exe` 覆盖自己。

实现阶段不得先手动删除旧 EXE。应先完成下载、校验、锁和进程检查，再执行同目录覆盖；覆盖失败时优先保证旧 EXE 仍可继续使用。不保留 `.bak`，但也不允许为了清理而扩大安装损坏风险。

Windows 替换应使用失败可恢复的同盘替换语义，例如 `os.replace` / `MoveFileEx` 等等价能力。PowerShell 实现也必须满足“不先删旧文件、失败后旧文件仍可用”的约束；如果不能保证，应跳过更新并继续旧版。

## 11. Agent 提示规则

更新过程不弹窗、不交互、不等待用户确认。

如果本次运行完成升级，Agent 应在结果摘要中明确提示：

```text
indesign-cli-agent 已从 0.4.0 更新到 0.4.1。工具目录或行为可能变化，后续复杂任务建议重新读取 tool list / tool schema。
```

如果更新失败但继续执行，Agent 应在结果摘要中提示：

```text
更新检查或更新下载失败，本次继续使用本地 indesign-cli-agent 0.4.0。
```

提示给 Agent 和最终用户的内容必须是结构化、简短、可行动的。不要输出长日志，不要要求交互确认。

## 12. Skill 与文档规则

`skills/indesign-cli/SKILL.md` 应加入固定规则：

- Agent 不应直接运行项目目录里的临时 EXE。
- Agent 优先使用 `%LOCALAPPDATA%\indesign-cli\bin\indesign-cli-agent.exe`。
- 正式调用前必须执行更新检查。
- 更新源按 NAS -> GitHub 顺序尝试。
- 更新成功后用新版 EXE 执行原命令。
- 更新失败但本机 EXE 可用时继续执行，并在结果中说明。
- 首次安装失败时停止，不伪装成功。
- 不在项目目录、当前工作目录或线程目录存放 EXE。
- 不保留 `.bak` 或历史版本。
- 更新完成后建议重新读取 `tool list` / `tool schema`。

该 Skill 规则是 Agent 使用入口，但不能作为唯一强约束。实施计划还必须同步：

- `README.md` / `README.en.md` 的成品 EXE 使用说明。
- `skills/indesign-cli/SKILL.md` 顶部的强制入口规则。
- 测试或脚本化验收，证明不会落项目目录副本。
- 旧“命令不存在就优先 PyPI 安装”的说明，必须降级为源码/PyPI 用户路径，不适用于成品 EXE 用户。

更新行为由 Agent 主动执行，而不是由 EXE 在运行中自我覆盖。

## 13. 并发与锁

用户级全局安装位可能被多个 Agent 同时访问。更新流程需要用户级锁：

```text
%LOCALAPPDATA%\indesign-cli\state\update.lock
```

规则：

- 锁必须使用原子创建或独占文件句柄，不能只靠普通文件存在判断。
- 锁内容记录 `pid`、`start_time`、`target_path` 和当前阶段。
- 同一用户同一时间只允许一个更新流程执行首装、下载、校验和替换。
- 其他 Agent 等待锁释放，随后重新读取本地版本。
- 锁等待超时后跳过更新，继续使用本地 EXE，并报告 warning。
- 锁必须有超时和 stale 判定，不得造成永久阻塞。
- 等待者拿到锁后必须重新读取本地版本，避免重复下载同一版本。

如果不能可靠判断是否有正在运行的旧 EXE，Agent 应跳过替换，继续使用旧版本，并提示下一次再更新。

## 14. 清理规则

更新流程必须保持本机干净：

- `tmp/` 中下载的 `.new`、`.tmp` 文件在成功或失败后删除。
- 不创建 `.bak`。
- 不保留历史版本目录。
- 不写项目目录。
- 不写 Agent 工作目录。
- 不写客户文件所在目录。

唯一长期存在的文件应是：

```text
%LOCALAPPDATA%\indesign-cli\bin\indesign-cli-agent.exe
%LOCALAPPDATA%\indesign-cli\state\update-state.json
```

`update-state.json` 不得作为跳过“每次正式调用前检查”的缓存依据。第一版只记录脱敏 source、当前版本、远端版本、错误码和时间，不记录客户文件、完整工作目录或参数值。

## 15. GitHub / NAS 发布流程

每次发布同一版本时，应同步产出：

```text
indesign-cli-agent.exe
latest.json
sha256.txt
release-notes.md
```

NAS 推荐目录：

```text
\\daga-nas5\sa-ai-app\tools\indesign-cli\
  latest.json
  releases\
    0.4.1\
      indesign-cli-agent.exe
      sha256.txt
      release-notes.md
```

GitHub Release 推荐附件：

```text
indesign-cli-agent.exe
latest.json
sha256.txt
release-notes.md
```

发布顺序：

1. 构建单 EXE。
2. 计算 SHA-256。
3. 在本机和干净测试机验证 EXE 可运行。
4. 上传 NAS release 目录。
5. 上传 GitHub Release 附件。
6. 校验 NAS 和 GitHub 的 SHA-256 一致。
7. 最后更新 NAS 和 GitHub 的 `latest.json`。

`latest.json` 是发布开关。不要在成品上传完成前提前更新它。

NAS 与 GitHub 无法做到真正同时原子更新，因此 Agent 必须按“单次读取到的 manifest 是真相”执行，不得把 NAS 的版本字段和 GitHub 的下载字段拼在一起。

## 16. 现有 bootstrapper 迁移边界

当前代码和 README 仍存在旧链路：

```text
Copy-Item \\server\...\bootstrap\indesign-cli-agent.exe $env:TEMP
indesign-cli-agent.exe run --source <latest.json> -- ...
```

旧链路的含义是“临时 EXE + `run --source` + 本地 runtime/current 更新”。本方案的新链路是“用户级全局 EXE + Agent 外层主动检查 + 原位替换 EXE”。

实施计划必须明确处理该差异：

- README / Skill 的成品 EXE 标准入口改为 `%LOCALAPPDATA%\indesign-cli\bin\indesign-cli-agent.exe`。
- `run --source` 不再作为成品用户标准入口。
- 旧 `run --source` 可以短期保留为兼容命令，但不能继续作为推荐路径。
- 旧 `%LOCALAPPDATA%\indesign-cli\current/runtime` 目录不再是成品 EXE 更新的权威状态。
- 如果保留旧命令，`latest.json` 过渡期必须同时包含顶层 `url` / `sha256` 和新 `artifact.*` 字段。
- 实施计划必须决定旧 runtime 缓存是停止写入、迁移清理，还是仅作为旧命令兼容保留；不能让新链路继续产生多版本 runtime 垃圾。

## 17. 兼容性

继续保留现有方式：

```text
pip install indesign-cli
indesign-cli server setup
```

该方式面向源码用户、PyPI 用户和需要自行编译的开发者。它不参与本方案的用户级 EXE 自动更新。

成品 EXE 发行和 PyPI 发行可以共享版本号，但使用路径不同：

- 成品用户：`indesign-cli-agent.exe`。
- 开发者用户：`pip install indesign-cli` 或 Git 源码。

README 和 Skill 必须清楚区分这两种入口，避免用户把 PyPI 包当成成品 EXE 更新源。

## 18. 风险与缓解

### 18.1 正在运行的 EXE 无法替换

缓解：

- 不做运行中自我覆盖。
- Agent 在调用真实命令前先完成替换。
- 如果检测到进程仍在运行，跳过更新并继续使用旧版。

### 18.2 GitHub 不可访问

缓解：

- NAS 优先。
- GitHub 只作为 NAS 不可用时的公共兜底。
- 两个源都不可用但本机 EXE 存在时继续运行。

### 18.3 更新文件损坏

缓解：

- 必须校验 SHA-256。
- 校验失败不替换旧 EXE。
- 清理临时文件。

### 18.4 版本散乱

缓解：

- 固定用户级全局安装位。
- 不允许项目目录副本。
- Skill 规则强制 Agent 使用同一入口。

## 19. 验收标准

方案落地后应满足：

- 新机器可从 NAS 或 GitHub 完成用户级首次安装。
- 已安装机器每次正式调用前会检查版本。
- NAS 可用时优先走 NAS。
- NAS 不可用时自动走 GitHub。
- GitHub 也不可用但本机 EXE 存在时继续运行。
- 发现新版后能下载、校验、替换用户级全局 EXE。
- 替换失败不会破坏旧 EXE。
- 更新成功后 Agent 明确提示刚升级过。
- 更新失败后 Agent 明确提示继续使用本地版本。
- 本地 EXE 缺失时，首装不依赖本地 EXE 参与。
- 版本比较支持 `version --json`、`--version` 和 `unknown` 兜底。
- 同用户并发首装或更新时，只发生一次替换。
- README / Skill 不再把旧 `run --source` 临时 EXE 作为成品标准入口。
- 旧 bootstrapper 链路的保留或清理边界在实施计划中明确。
- 更新流程不在项目目录产生文件。
- 更新流程不留下 `.bak`、历史版本或临时下载残留。
- PyPI / Git 源码安装路径不受影响。

## 20. 与既有方案关系

本方案保留 `2026-07-03-indesign-cli-agent-bootstrapper-design.md` 中的单 EXE 自举方向，但替换其中“内网服务器强制更新”和“保留旧版本回滚”的发行口径。

当前最终口径是：

```text
单 EXE 成品
用户级全局安装
Agent 主动检查
NAS 优先
GitHub 兜底
原位替换
不留垃圾
```
