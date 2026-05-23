---
name: using-opencode-cli
description: 当 Codex 需要调用 OpenCode CLI 做本地 Agent 任务时使用，包括代码审核、结构分析、方案规划、替代 Claude Code，以及需要持续利用 DeepSeek Pro 1M 长上下文的多轮项目线程。
---

# 调用 OpenCode CLI

## 核心规则

- 使用 PowerShell 7：`pwsh`。不要用 Windows PowerShell 5.1。
- 默认模型：`deepseek/deepseek-v4-pro`。
- 推理深度必须锁定：`--variant max`。
- prompt 必须由 Codex 完全编写。脚本只原样传递，不自动拼接说明。
- OpenCode 作为子 agent 使用时，默认一轮一个命令。先读这一轮反馈，再决定是否继续。
- 同一专项、同一代码链路、同一计划的多轮任务，优先续同一个 `sessionID`。

DeepSeek Pro 有 1M 长上下文。相关任务不要频繁新开线程；上下文积累较多时，它通常更适合做大仓库、多文件、多轮复核。只有任务主题已经切换，或旧上下文会污染判断，才新开线程。想借旧上下文但不污染原线程时，用 `--fork` 或脚本的 `-ForkSession`。

## 模式选择

| 场景 | 模式 | 默认做法 |
| --- | --- | --- |
| 单次正式调用、用户想看过程、可能人工接管 | 人工观察 | 脚本打开外部 Windows Terminal，可用 `-Prompt` 或 `-TaskPath` |
| 多轮持续调用、长时间审核、需要反复查询状态 | 脚本托管 | 后台运行，返回 `RunDir`，再按状态摘要查询 |
| 1-2 分钟短问、连通性测试 | 前台托管 | 原生 `opencode run --format json`，过滤后只打印 `SESSION:` 和正文 |

不要把三轮、五轮循环包进同一个 PowerShell 命令里。那样 Codex 不能基于上一轮反馈临场改下一轮提示词。

不要把前台托管用于正式长任务。Codex 的 shell 命令有外层等待限制，且长时间没有正文时看起来像“无输出”。单次正式调用默认用人工观察；需要多轮持续调用或长时间后台任务时，才用脚本托管；短问或连通性测试才用前台托管。

不要用顶层 TUI 入口 `opencode [project]` 作为观察模式。该入口当前命令行不接收 `--variant`，会导致推理深度不能锁定 `max`。

## 人工观察

这是单次正式调用的默认入口。人工观察会打开外部 Windows Terminal，并在 Codex 前台稀疏监控摘要。窗口里能看到 OpenCode 过程，用户也能接管。

直接提示词，适合“一句话 + 任务文档路径 + 临时补充”：

```powershell
$repoRoot = (Get-Location).ProviderPath
$runner = Join-Path $repoRoot '.codex\skills\using-opencode-cli\scripts\run-opencode-task.ps1'
$prompt = @'
请读取这个任务文档并执行：docs/AI协作/本地Agent/进行中/[目录]/任务_[主题]_OpenCode.md

额外说明：这次只做交互式审核，先不要写输出文档，直接在当前会话说结论。
'@

& $runner -Prompt $prompt -RepoRoot $repoRoot -Mode observe
```

完整提示词文件：

```powershell
$repoRoot = (Get-Location).ProviderPath
$taskPath = 'docs/AI协作/本地Agent/进行中/[目录]/任务_[主题]_OpenCode.md'
$runner = Join-Path $repoRoot '.codex\skills\using-opencode-cli\scripts\run-opencode-task.ps1'

& $runner -TaskPath $taskPath -RepoRoot $repoRoot -Mode observe
```

默认监控：

- 每 60 秒检查一次，最多 30 次。
- 只在内容变化时输出；长时间无变化时，每 5 次输出心跳。
- OpenCode 进入 `session.idle` 后，前台监控会读取最后摘要并停止。
- `MaxUpdates` 只是防止无限等待的兜底。
- 不保留完整导出 JSON。

常用参数：

```powershell
# 调整监控频率
& $runner -Prompt $prompt -RepoRoot $repoRoot -Mode observe -WatchIntervalSeconds 90 -WatchMaxUpdates 20

# 只打开窗口，不让 Codex 自动监控
& $runner -Prompt $prompt -RepoRoot $repoRoot -Mode observe -NoWatch

# 续指定线程
& $runner -Prompt $prompt -RepoRoot $repoRoot -Mode observe -SessionId 'ses_xxx'
```

## 脚本托管

只有需要多轮持续调用、长时间后台运行、状态摘要、统一清理临时文件时，才用脚本托管。

```powershell
$repoRoot = (Get-Location).ProviderPath
$runner = Join-Path $repoRoot '.codex\skills\using-opencode-cli\scripts\run-opencode-task.ps1'

& $runner -Prompt '请用中文检查 desktop-electron/src/... 有没有明显风险。' -RepoRoot $repoRoot -Mode managed
```

续同一线程：

```powershell
& $runner -Prompt '请继续上一轮审核。' -RepoRoot $repoRoot -Mode managed -SessionId 'ses_xxx'
```

查询状态：

```powershell
$status = Join-Path $repoRoot '.codex\skills\using-opencode-cli\scripts\get-opencode-task-status.ps1'
& $status -RunDir 'tmp/local-agent-runs/[run-dir]' -RepoRoot $repoRoot
```

单独监控已知线程：

```powershell
$watch = Join-Path $repoRoot '.codex\skills\using-opencode-cli\scripts\watch-opencode-task-output.ps1'
& $watch -SessionId 'ses_xxx' -RepoRoot $repoRoot -IntervalSeconds 60 -MaxUpdates 30 -OnlyOnChange -HeartbeatUpdates 5
```

监控不是读取外部窗口屏幕文本，而是临时执行 `opencode export [sessionID]` 后提取轻量摘要。插件 `plugins/codex-opencode-signal.js` 只写 `session.created`、`session.idle`、`session.error` 这种轻量信号。

## 前台托管

只用于短问、连通性测试、快速复核。不用于正式长任务。输出只保留线程 ID 和 DeepSeek 正文；完整 JSON 不直接展示。

```powershell
$repoRoot = (Get-Location).ProviderPath
$prompt = @'
请用中文回答两句话：确认 OpenCode 可用，并说明不需要读取项目文件。
'@

$seenSession = $false
$prompt | opencode run --model deepseek/deepseek-v4-pro --variant max --format json --dir $repoRoot | ForEach-Object {
  if ([string]::IsNullOrWhiteSpace($_)) { return }
  try {
    $event = $_ | ConvertFrom-Json
    if (-not $seenSession -and $event.sessionID) {
      "SESSION: $($event.sessionID)"
      $seenSession = $true
    }
    if ($event.type -eq 'text' -and $event.part.text) {
      $event.part.text
    }
  } catch {
    $_
  }
}
```

## 文件约定

人读的协作文档默认放 `docs/AI协作/`，但这只是默认建议，不是固定路径。

```text
docs/AI协作/本地Agent/进行中/YYYY-MM-DD_主题/
├── 任务_主题_OpenCode.md
└── 输出_主题_OpenCode.md
```

输出文档是可选的。需要长期留档、人读复盘、正式审核时才要求 OpenCode 写输出文档。普通任务可以只在会话里输出结论。

机器过程文件放 `tmp/`，不得进入 git：

```text
tmp/local-agent-runs/YYYY-MM-DD_HHMMSS_主题_hash/
├── metadata.json
├── status.json
├── opencode-summary.txt
├── opencode-hook-status.json
└── opencode-stderr.log
```

`opencode-events.ndjson` 默认不保留。只有调试时显式加 `-KeepEvents`，并且不要把它读进 Codex 上下文。

## 提示词边界

- 短任务可以直接写中文提示词。
- 多行提示词用 PowerShell here-string，经 stdin 传给 OpenCode。
- Codex 的 `shell_command` 外层如果用 `@' ... '@` 包整段命令，内层 `$prompt` 不要再用 `@' ... '@`，改用 `@" ... "@`。外层和内层不要使用同一种 here-string。
- 不要把真实换行直接塞进原生 `opencode run [message]` 参数。
- 大段背景、长 diff、复杂任务边界，优先写提示词文件。
- 任务需要改代码时，必须写清可修改文件范围和最小验证集。
- 不需要长期留档时，不要强制写输出文档。

提示词文件模板：

```markdown
# [任务标题]

## 背景

[仓库、分支、相关文档、已知验证结果]

## 任务目标

[检查清单、输出要求、重点文件范围]

## 边界

- 可以读取仓库文件。
- 默认不修改业务代码。
- 如需留档，写入指定输出路径；未指定时可用默认建议路径。
- 如无需留档，直接在当前会话输出最终结论。
```

## 线程复用

常用命令：

```powershell
opencode session list
opencode export ses_xxx
```

规则：

- 同一专项的二次审核、三次复核、后续追问：续同一个 `sessionID`。
- 只有人工确认最近线程没串题时，才用 `--continue` 或脚本的 `-ContinueMostRecent`。
- 想借旧上下文但避免污染原线程：用 `--fork` 或脚本的 `-ForkSession`。

## DeepSeek 配置

如果 `opencode models deepseek --refresh` 提示 `Provider not found: deepseek`，先升级：

```powershell
opencode upgrade latest
```

如果仍没有 `deepseek` provider，再检查项目或全局 `opencode.json`：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "deepseek": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "DeepSeek",
      "options": {
        "baseURL": "https://api.deepseek.com/v1",
        "apiKey": "{env:DEEPSEEK_API_KEY}"
      },
      "models": {
        "deepseek-v4-pro": {
          "name": "DeepSeek V4 Pro"
        }
      }
    }
  }
}
```

验证：

```powershell
opencode --version
opencode models deepseek --refresh
opencode run --model deepseek/deepseek-v4-pro --variant max --format json "Return one short hello."
```

## 常见错误

| 错误 | 处理 |
| --- | --- |
| 忘记 `--variant max` | 停止重跑，正式分析必须锁定 max |
| 每次追问都新开线程 | 续同一专项的 `sessionID` |
| 把多轮循环包进一个 shell 命令 | 改成一轮一个命令，由 Codex 读反馈后决定下一轮 |
| 正式长任务用前台托管硬等 | 改用脚本托管，拿 `RunDir` 后查询状态 |
| PowerShell here-string 嵌套后命令直接退出 | 外层 `@' ... '@` 时，内层 `$prompt` 用 `@" ... "@` |
| 直接提示词里塞太多背景 | 改用提示词文件 |
| 不需要长期留档却强制写输出文档 | 让 OpenCode 直接在会话里输出结论 |
| 想监控观察模式却去抓窗口 | 用 `watch-opencode-task-output.ps1` 或观察模式默认监控 |
| 把 `opencode-events.ndjson` 放进 `docs/AI协作/` | 移到 `tmp/local-agent-runs/`，默认不保留 |
