# Agent 运行环境与 8/6 事故跟进待办

> 待办清单，不是实施计划。每条给出阻塞条件和判定依据；条目开工时再单独写 spec 或 plan。

来源：2026-08-06 通宵零产出事故复盘（`zhanglongxiao111/indesign-cli#5`、`zhanglongxiao111/html-indesign#13`），以及 2026-08-07 修复过程中新发现的 PowerShell 版本问题。

已完成部分见 `docs/superpowers/plans/2026-08-07-agent-incident-p0-followup-plan.md` 与 `html-indesign` 仓库 `docs/bugfix/2026-08-07-fidelity-gate-strokeweight-and-text-overset.md`。

## T1　切换到 PowerShell 7（✅ 前置条件已满足，2026-08-20 落地）

> **状态注记（2026-08-20）**：方案 A 已由 SA-AIAPP 侧实现——agent toolbox 从 NAS 自动安装便携 PowerShell 7，opencode 运行时写死 `shell: "pwsh"`，PATH 前插 + `SA_AGENT_PWSH` 兜底（SA-AIAPP 批次 B，`agentToolboxProvision.ts`/`opencodeRuntimeShell.ts`，有单测断言）。据此本仓库已执行解锁后动作 1-4：`skills/indesign-cli/` 全部改为 `pwsh` 优先、SKILL.md 通用规则同步、中文操作禁止静默回落 5.1、ASCII-only 规则（T2）保留。`prepare-author-package.ps1` 另已修复 UNC/中文/provider 前缀路径（2026-08-19 摩擦修复批次）。

**目标**：Skill 文档和脚本调用从 `powershell.exe`（Windows PowerShell 5.1）切到 `pwsh`（PowerShell 7+）。

**为什么要切**——2026-08-07 在同时装有两个版本的机器上实测，中文场景差异如下：

| 场景 | 5.1 | 7 |
| ---- | --- | - |
| 读自身 `.ps1` 源码（UTF-8 无 BOM） | 按 ANSI(936) 解码成乱码，**可吞掉下一行代码** | 正常 |
| `Set-Content` 写中文 | 写成 ANSI | UTF-8 |
| `Out-File` / `>` 写中文 | 写成 UTF-16LE | UTF-8 |
| `Get-Content` 读 UTF-8 无 BOM | 乱码 | 正常 |
| 传中文参数给原生程序 | 正常 | 正常 |
| 捕获原生程序 UTF-8 输出 | 正常 | 正常 |

规律：危险区是「PowerShell 自己读写文件、以及读自己的脚本源码」，不是进程边界。公司场景中文项目名、中文路径、中文内容普遍，落在危险区。

**为什么现在还不能切**：事故工位上 `pwsh` 不存在（事故记录 seq 125/336/534 三次实证）。文档若写 `pwsh`，结果是「命令找不到」，即事故原始失败形态。`powershell.exe` 是 Windows 自带、必然存在的保底。

**解除阻塞的前置条件（二选一，未定）**：

- 方案 A：随 agent runtime 自带 pwsh。与现有 node 自带同一套分发机制，零安装、零管理员权限、版本可控。代价：pwsh 安装目录实测 282 MB，而当前 runtime 解压后共 163 MB（node 93 + plugins 30 + server 25.5 + cli 15）、压缩 57 MB，分发体积约翻三倍。
- 方案 B：IT 统一推送。实测 `winget` 可用（v1.29.280），且 pwsh 可装用户级（本机安装于 `AppData\Local\Programs\PowerShell\7`，当前用户非管理员），故 `winget install --id Microsoft.PowerShell --scope user` 无需提权。代价：需要覆盖全部工位并管理版本漂移。

不采用的方案：由 agent 在任务过程中静默安装。装软件属 IT 决策；agent 中途改环境会在最坏时机引入新失败模式，而本次事故约 16% 的工具调用正是耗在 agent 临场排查环境上。

**解除阻塞后要做的事**：

1. `skills/indesign-cli/` 全部 `powershell.exe` 改 `pwsh`；SKILL.md 通用规则同步。
2. 补一条硬规则：**agent 一律调 `pwsh`，不调 `powershell.exe`**。`powershell.exe` 永远解析到 5.1，只装 7 不改调用方式等于白装。
3. 找不到 `pwsh` 时，涉及中文的操作宁可显式报错，也不静默落回 5.1 损坏数据。
4. **保留** ASCII-only 规则（见 T2），作为纵深防御——总有工位会漏网。

**负责方**：环境打包属 SA-AIAPP 侧决策，本仓库只在前置条件满足后改文档和调用方式。

## T2　发布类 `.ps1` 保持纯 ASCII（已生效，长期约束）

`skills/**/*.ps1` 不得含非 ASCII 字节。2026-08-07 已有回归测试 `test_published_skill_powershell_scripts_are_pure_ascii` 守护，并实测「塞回中文即变红」。

根因记录：当日在 `prepare-author-package.ps1` 加中文注释后，5.1 按 ANSI 解码产生的乱码吞掉了下一行 `$configPath = ...` 赋值，组装模式以 `VariableIsUndefined` 失败；该脚本原本是纯 ASCII，故此前 5.1 下正常。

T1 完成后此约束仍保留，不随之取消。

## T3　消除 PowerShell 依赖（推荐优先于 T1）

把 `prepare-author-package.ps1` 的两件事——从起步模板建包、发现 runtime 根目录——做成 CLI 子命令（暂定 `html.assemble_package`），`.ps1` 降级为可选便利脚本。

理由：runtime 已自带 node，node 读写文件天然 UTF-8，不存在 5.1 那套陷阱。与其再自带第二个脚本运行时，不如让链路不需要 shell。做完后不论工位上是 5.1、7 还是都没有，行为一致。

顺带解决 `indesign-cli#5` P1-4：当前三个名字高度相似的组装入口（`prepare-author-package.ps1`、`assemble-author-package.cjs`、`assemble-authoring.js`）收敛为一个权威入口。事故中 agent 编造出第四个不存在的名字 `assemble-deck.mjs`，与此直接相关。

## T4　两个 issue 中本批未覆盖项

`indesign-cli#5`：

- P1-1 `data-id-grid-ignore` 判据写进文档。已核实该属性在 `forward-fidelity.js` 中零引用，**确实不参与保真度比对**，可按此表述。
- P1-2 NAS/EBUSY 标准处置写进文档；组装脚本改原子覆写加重试（临时文件 + 改名）。
- P1-3 收编「制作汇报文本」07 号 ref 中的独家事实（Setup 真实路径、`--json --pretty` 旗标位置、内嵌 node 备用调法）。
- P1-4 `assemble-author-package.cjs` 给出用法或删除（与 T3 合并处理）。

`html-indesign#13`：

- P1-1 lint / build 支持摘要输出模式（`--summary` 或 `format: "summary"`），避免 76–85KB 全文进上下文。
- P1-2 构建报告带运行标识（`runId` 或顶层 `requestId` + `generatedAt`），杜绝陈旧报告被误读。事故中 agent 读到上一轮遗留报告并据此对用户二次误判，优先级不低于 P1-1。
- P1-3 反向导出增产 `content-manifest.json`（每页文字块、图片 UNC 路径、真实像素尺寸与长宽比）。
- P1-4 组装时重写或删除陈旧 `presentation.html`，消除一个作者包内两份「页面真相」。
- P2 观察态包的 lint 模式（`profile: reverse-export`），网格检查降为提示级并显式报告豁免数量。
