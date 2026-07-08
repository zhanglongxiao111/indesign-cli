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

## 7. latest.json 契约

推荐结构：

```json
{
  "schema_version": 1,
  "name": "indesign-cli-agent",
  "version": "0.4.1",
  "channel": "stable",
  "platform": "windows-x64",
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
- 不设置最低可运行版本；只要本机已有可用版本，更新失败也允许继续执行。

## 8. Agent 主动更新流程

Agent 每次正式调用 InDesign CLI 前执行以下流程：

```text
1. 找到用户级全局 EXE。
2. 如果不存在，从默认更新源安装当前版本。
3. 调用本地 EXE 查询当前版本。
4. 按顺序读取 NAS / GitHub latest.json。
5. 如果远端版本不高于本地版本，直接执行原命令。
6. 如果远端版本更高，下载新版到 tmp。
7. 校验 sha256。
8. 确认没有正在运行的全局 indesign-cli-agent.exe 进程。
9. 使用同目录替换操作把新 EXE 覆盖到 bin 固定位置。
10. 清理 tmp。
11. 使用新版 EXE 执行原命令。
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

实现阶段不得先手动删除旧 EXE。应先完成下载、校验和进程检查，再执行同目录覆盖；覆盖失败时优先保证旧 EXE 仍可继续使用。不保留 `.bak`，但也不允许为了清理而扩大安装损坏风险。

## 9. Agent 提示规则

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

## 10. Skill 规则

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

该 Skill 规则是本方案的关键入口。更新行为由 Agent 主动执行，而不是由 EXE 在运行中自我覆盖。

## 11. 并发与锁

用户级全局安装位可能被多个 Agent 同时访问。更新流程需要用户级锁：

```text
%LOCALAPPDATA%\indesign-cli\state\update.lock
```

规则：

- 同一用户同一时间只允许一个更新流程替换 EXE。
- 其他 Agent 等待锁释放，随后重新读取本地版本。
- 锁等待超时后跳过更新，继续使用本地 EXE，并报告 warning。
- 锁文件必须可清理，不得造成永久阻塞。

如果不能可靠判断是否有正在运行的旧 EXE，Agent 应跳过替换，继续使用旧版本，并提示下一次再更新。

## 12. 清理规则

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

## 13. GitHub / NAS 发布流程

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

## 14. 兼容性

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

## 15. 风险与缓解

### 15.1 正在运行的 EXE 无法替换

缓解：

- 不做运行中自我覆盖。
- Agent 在调用真实命令前先完成替换。
- 如果检测到进程仍在运行，跳过更新并继续使用旧版。

### 15.2 GitHub 不可访问

缓解：

- NAS 优先。
- GitHub 只作为 NAS 不可用时的公共兜底。
- 两个源都不可用但本机 EXE 存在时继续运行。

### 15.3 更新文件损坏

缓解：

- 必须校验 SHA-256。
- 校验失败不替换旧 EXE。
- 清理临时文件。

### 15.4 版本散乱

缓解：

- 固定用户级全局安装位。
- 不允许项目目录副本。
- Skill 规则强制 Agent 使用同一入口。

## 16. 验收标准

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
- 更新流程不在项目目录产生文件。
- 更新流程不留下 `.bak`、历史版本或临时下载残留。
- PyPI / Git 源码安装路径不受影响。

## 17. 与既有方案关系

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
