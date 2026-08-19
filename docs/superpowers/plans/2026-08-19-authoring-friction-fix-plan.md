# 常见创作写法兼容与脚手架修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> 🏁 **执行完毕（2026-08-20）**：10/10 任务完成，双仓库分支 `fix/authoring-friction-0819`。html-indesign 8 个 commit（253475d…c3a9b51），全量 1245/1245 绿；mcp-indesign 4 个 commit（1bab285…d6ca5de），285 passed + 2 skipped。执行方式：Opus 5 子代理逐任务实现，控制器逐提交审查。待决策：合入 main/master 时机；遥测 `plugin_metrics` 是否补 `normalized_count`；批 3 手动验收（真机 InDesign 跑一次 friction deck 过保真门）尚未执行。

**Goal:** 落地 `2026-08-19-authoring-friction-fix-design.md`：把 LLM 高频 HTML 写法从「lint 拒绝」改为「自动归一化」，并修掉脚手架三个工程坑（UNC 路径、双组装脚本、废命令提示）与报告覆盖问题。

**Architecture:** 改动横跨两个仓库。`D:\AI\mcp-indesign`（任务 1-2：CLI argparse 提示、PS1 路径解析）与 `D:\AI\html-indesign`（任务 3-10：浏览器捕获层归一化、lint 规则、报告落盘、计数口径）。捕获层（`browser-element-capture.js` 等）运行在 Playwright 页面上下文里，通过 `renderSnapshot()` 端到端测试；`validateAuthoringRules` / `normalizeLintPayload` / `auditHtmlCompatibility` 是纯函数，直接单测。

**Tech Stack:** Node 20 + `node --test`（html-indesign，基线 1225 绿）；Python + pytest（mcp-indesign，基线 282 绿）；PowerShell 5.1 与 pwsh 双兼容（PS1 脚本）。

**执行约定：**
- 每个任务独立提交到各自仓库；commit message 末尾带 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- 任务顺序即依赖顺序：任务 7（A2 物化）依赖任务 4（A1 孤儿 span），不能提前。
- html-indesign 全量 `npm test` 很重（要拉起 Edge），单任务内先跑受影响的单个测试文件，任务 10 末尾再跑全量。

---

## 涉及文件总览

| 仓库 | 文件 | 动作 | 任务 |
| --- | --- | --- | --- |
| mcp | `agent-harness\cli_anything\indesign\indesign_cli.py` | 改 `AgentArgumentParser.error()` | 1 |
| mcp | `agent-harness\cli_anything\indesign\tests\test_paths_envelope.py` | 加测试 | 1 |
| mcp | `skills\indesign-cli\scripts\prepare-author-package.ps1` | 三处路径解析收口 | 2 |
| html | `scripts\assemble-authoring.js` | Unknown argument 报错指路 | 3 |
| html | `test\authoring\assemble-authoring-cli.test.js` | 加测试 | 3 |
| html | `src\adapters\html\reader\browser-element-capture.js` | 孤儿 span 文本推断 | 4 |
| html | `test\html-to-indesign\browser-snapshot.test.js` | 加测试 + 脚本清单断言 | 4, 7 |
| html | `src\adapters\html\validators\authoring-validator.js` | textPreview + 右边豁免 | 5, 6 |
| html | `test\html-to-indesign\authoring-validator.test.js` | 加测试 | 5, 6 |
| html | `src\adapters\html\reader\browser-pseudo-materialize.js` | **新建** 伪元素物化 | 7 |
| html | `src\adapters\html\reader\browser-snapshot-scripts.js` | 注册新脚本 | 7 |
| html | `src\adapters\html\reader\browser-snapshot-capture.js` | 调用物化 + 透传字段 | 7 |
| html | `src\adapters\html\reader\browser-snapshot.js` | 透传 `pseudoMaterialized` | 7 |
| html | `src\adapters\html\compatibility\audit.js` | 物化归一化消息 | 7 |
| html | `test\html-to-indesign\html-compatibility-audit.test.js` | 加测试 | 7 |
| html | `src\indesign-cli-plugin\report-archive.js` | **新建** 失败报告归档 | 8 |
| html | `src\indesign-cli-plugin\lint-feedback.js` | 改用归档写入 | 8 |
| html | `src\indesign-cli-plugin\tools\build-indesign.js` | 两处写盘改用归档 | 8 |
| html | `test\indesign-cli-plugin\report-archive.test.js` | **新建** 单测 | 8 |
| html | `src\authoring\lint.js` | warningCount 拆分 | 9 |
| html | `test\authoring\lint-normalized-count.test.js` | **新建** 单测 | 9 |
| html | `test\fixtures\fixed-html\friction-0819-deck.html` | **新建** 回归基准 fixture | 10 |
| html | `test\html-to-indesign\authoring-friction-regression.test.js` | **新建** 综合回归 | 10 |
| html | `docs\规范\AGENT_HTML_AUTHORING_GUIDE.md` | 文档同步（权威源） | 10 |
| mcp | `skills\indesign-cli\references\html-authoring.md` | 文档同步（精简版） | 10 |
| mcp | `docs\AI协作\反馈循环\README.md` | 遥测口径变化记录 | 10 |
| mcp | `docs\superpowers\specs\2026-08-19-authoring-friction-fix-design.md` | 实施偏差注记 | 10 |

**与设计文档的两处已知偏差**（实施时按本计划执行，任务 10 把偏差写回设计文档）：

1. **A1 不新增 `HTML_TEXT_LEAF_INFERRED` 码。** 孤儿 span 提升为文本候选后，`audit.js:89-99` 现有的 `HTML_ROLE_INFERRED` 分支（tagName 含 `span`、无显式 role、推断为 text）会自动为它产出归一化消息，无需第二套码。
2. **A3 不为被豁免的右边发 info 条目。** 每页页标题都豁免会产出恒定的 per-page 噪音，与 C1 降噪目标冲突；豁免逻辑写进文档即可。

---

## 批 1 · mcp-indesign 仓库

### Task 1: `BAD_CLI_ARGS` 定向迁移提示（B3）

> ✅ **已完成** 2026-08-19，commit `ad55353`。TDD 红→绿；三 token 映射 + 未知 token 回落均实测验证；hint 指向的工具 id 已对照 plugin catalog 确认真实存在。测试基线勘误：实际是 283 passed + 2 skipped（计划写 282），现为 285 + 2 skipped。

**Files:**
- Modify: `D:\AI\mcp-indesign\agent-harness\cli_anything\indesign\indesign_cli.py:47-56`
- Test: `D:\AI\mcp-indesign\agent-harness\cli_anything\indesign\tests\test_paths_envelope.py`

背景：0819 会话中外部模型把 `indesign-cli-agent health` 的用法套到 `indesign-cli` 上，收到裸 `invalid choice` 列表后靠自己翻 `--help` 纠正。`health` 从未被移除——它属于另一个可执行文件。修法：在 `AgentArgumentParser.error()` 里对已知混淆 token 追加定向 hint，只维护实测踩过的映射，不做模糊匹配。

- [ ] **Step 1: 写失败测试**

在 `test_paths_envelope.py` 中 `test_argparse_errors_emit_json_envelope`（约 :133）之后追加：

```python
def test_top_level_health_redirects_to_server_health():
    result = run_module("health")
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["error"]["code"] == "BAD_CLI_ARGS"
    assert "server health" in payload["error"]["hint"]
    assert "indesign-cli-agent" in payload["error"]["hint"]


def test_generic_bad_args_hint_unchanged():
    result = run_module("tool", "schema")
    payload = json.loads(result.stdout)
    assert "indesign-cli --help" in payload["error"]["hint"]
    assert "server health" not in payload["error"]["hint"]
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /d/AI/mcp-indesign && python -m pytest agent-harness/cli_anything/indesign/tests/test_paths_envelope.py -k "redirects_to_server_health or generic_bad_args" -q
```

预期：`test_top_level_health_redirects_to_server_health` FAIL（hint 中无 `server health`），另一条 PASS。

- [ ] **Step 3: 实现**

把 `indesign_cli.py:47-56` 的 `AgentArgumentParser` 整体替换为（类定义前加映射表；不需要新 import，用字符串切分不用正则）：

```python
# 实测踩过的跨命令面/旧用法混淆映射；只收录真实事故 token，不做模糊匹配。
_SUBCOMMAND_REDIRECTS = {
    "health": "顶层 `health` 属于 indesign-cli-agent（bootstrapper 可执行文件）；"
    "本 CLI 的健康检查是 `indesign-cli server health`。",
    "lint": "作者包检查用 `indesign-cli tool call html.authoring_lint --args-file args.json`。",
    "build": "构建用 `indesign-cli tool call html.build_indesign --args-file args.json`。",
}


class AgentArgumentParser(argparse.ArgumentParser):
    """argparse 错误也走 JSON envelope，保持全 CLI 契约闭环。"""

    def error(self, message: str) -> None:
        hint = "用 `indesign-cli --help` 或对应子命令 `--help` 查看用法；JSON 参数优先用 `--args-file` 传文件。"
        marker = "invalid choice: '"
        if marker in message:
            token = message.split(marker, 1)[1].split("'", 1)[0]
            redirect = _SUBCOMMAND_REDIRECTS.get(token)
            if redirect:
                hint = f"{redirect} {hint}"
        raise CliError(
            f"Invalid command line: {message}",
            code="BAD_CLI_ARGS",
            details={"usage": self.format_usage().strip()},
            hint=hint,
        )
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd /d/AI/mcp-indesign && python -m pytest agent-harness/cli_anything/indesign/tests/test_paths_envelope.py -q
```

预期：全绿（含既有 `test_argparse_errors_emit_json_envelope`、`test_session_show_rejects_removed_verbose_flag`——前者只断言 hint 非空，不受影响）。

- [ ] **Step 5: 全量回归 + 提交**

```bash
cd /d/AI/mcp-indesign && python -m pytest agent-harness/cli_anything/indesign/tests -q
```

预期：282+2 全绿。然后：

```bash
cd /d/AI/mcp-indesign && git add agent-harness/cli_anything/indesign/indesign_cli.py agent-harness/cli_anything/indesign/tests/test_paths_envelope.py && git commit -m "feat(cli): BAD_CLI_ARGS 对已知混淆子命令给出定向迁移提示

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 2: `prepare-author-package.ps1` 支持 UNC/中文/provider 前缀路径（B1，P0）

> ✅ **已完成** 2026-08-19，commit `7e9ef98`。冒烟五例全过（PS5.1 中文/provider 前缀/真实 NAS UNC + pwsh 两例），并用 HEAD 旧脚本复现了原始 `GetFullPath` 异常作对照；额外验证了 `-Package` provider 前缀、`INDESIGN_CLI_RUNTIME_ROOT` provider 前缀与不存在两种情况。计划文本两处勘误：Step 5 的 grep 会命中新注释里的 `GetFullPath` 字样（活调用点为零，注释保留）；成功输出实为 JSON（`{"ok":true,...}`）而非 `Wrote ...`。

**Files:**
- Modify: `D:\AI\mcp-indesign\skills\indesign-cli\scripts\prepare-author-package.ps1`（全文仅 84 行）

背景：`[System.IO.Path]::GetFullPath()` 遇到带 PowerShell provider 前缀的输入（`Microsoft.PowerShell.Core\FileSystem::\\daga-nas5\...`，来自 `$PWD` 派生路径）抛 NotSupportedException「不支持给定路径的格式」。0819 会话因此整个脚本不可用，模型手搓了 8 页。修法：新增 `Remove-ProviderPrefix` helper，三处路径解析全部收口为「剥前缀 → 确保存在 → `Resolve-Path -LiteralPath` 取 `.ProviderPath`」，全脚本禁用裸 `GetFullPath`。

**纪律**：本文件必须保持纯 ASCII 注释（脚本 49-51 行原注释解释过：PS 5.1 用 ANSI 代码页解码无 BOM 脚本，非 ASCII 字节会吞行）。新增注释一律英文。

- [ ] **Step 1: 加 helper 函数**

在 `Write-Utf8NoBom` 函数（:19-22）之后插入：

```powershell
# Strip PowerShell provider prefixes (for example
# Microsoft.PowerShell.Core\FileSystem::\\server\share) before any path API
# sees the value. [System.IO.Path]::GetFullPath throws NotSupportedException
# on provider-qualified paths, which is exactly what callers pass when the
# value derives from $PWD in a UNC working directory.
function Remove-ProviderPrefix([string]$Value) {
    return $Value -replace '^[^:]+::', ''
}
```

- [ ] **Step 2: 替换 Create 分支的路径解析（原 :25-36）**

把：

```powershell
    $templateRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\assets\html-starter'))
    $destinationPath = [System.IO.Path]::GetFullPath($Destination)
    if (Test-Path -LiteralPath $destinationPath) {
        if (-not (Test-Path -LiteralPath $destinationPath -PathType Container)) {
            throw "Destination is not a directory: $destinationPath"
        }
        if (@(Get-ChildItem -LiteralPath $destinationPath -Force).Count -gt 0) {
            throw "Destination must be empty: $destinationPath"
        }
    } else {
        New-Item -ItemType Directory -Path $destinationPath | Out-Null
    }
```

替换为：

```powershell
    $templateRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\assets\html-starter')).ProviderPath
    $destinationRaw = Remove-ProviderPrefix $Destination
    if (Test-Path -LiteralPath $destinationRaw) {
        if (-not (Test-Path -LiteralPath $destinationRaw -PathType Container)) {
            throw "Destination is not a directory: $destinationRaw"
        }
        if (@(Get-ChildItem -LiteralPath $destinationRaw -Force).Count -gt 0) {
            throw "Destination must be empty: $destinationRaw"
        }
    } else {
        New-Item -ItemType Directory -Path $destinationRaw -Force | Out-Null
    }
    $destinationPath = (Resolve-Path -LiteralPath $destinationRaw).ProviderPath
```

- [ ] **Step 3: 替换 Assemble 分支（原 :52）与 runtime root 解析（原 :55-56）**

原 :52 替换为（保留 49-51 行注释）：

```powershell
    $configPath = (Resolve-Path -LiteralPath (Remove-ProviderPrefix $Package)).ProviderPath
```

原 :55-57 的 `if` 分支替换为：

```powershell
if ($env:INDESIGN_CLI_RUNTIME_ROOT) {
    $runtimeRootRaw = Remove-ProviderPrefix $env:INDESIGN_CLI_RUNTIME_ROOT
    if (-not (Test-Path -LiteralPath $runtimeRootRaw -PathType Container)) {
        throw "INDESIGN_CLI_RUNTIME_ROOT does not exist: $runtimeRootRaw"
    }
    $runtimeRoot = (Resolve-Path -LiteralPath $runtimeRootRaw).ProviderPath
} else {
```

- [ ] **Step 4: 双 shell 冒烟验证**

前置：本机已有 runtime（`indesign-cli-agent health` 可用），或先 `$env:INDESIGN_CLI_RUNTIME_ROOT` 指向最近一次 stage 目录。三个用例 × 两个 shell（`pwsh` 与 `powershell`）：

```powershell
# 用例 1：中文相对/绝对路径
powershell -NoProfile -File D:\AI\mcp-indesign\skills\indesign-cli\scripts\prepare-author-package.ps1 -Destination "$env:TEMP\冒烟-作者包\目标一"
# 用例 2：provider 前缀路径（0819 事故形态）
powershell -NoProfile -File D:\AI\mcp-indesign\skills\indesign-cli\scripts\prepare-author-package.ps1 -Destination "Microsoft.PowerShell.Core\FileSystem::$env:TEMP\冒烟-作者包\目标二"
# 用例 3：真实 NAS UNC 中文路径（手动，一次即可）
powershell -NoProfile -File D:\AI\mcp-indesign\skills\indesign-cli\scripts\prepare-author-package.ps1 -Destination '\\daga-nas5\daga-2025-project\D0486_大兴永定湾花园\00_agent\_smoke\author'
```

预期：三例均输出 `Wrote ...deck.html`，目标目录出现 `deck.config.json` + `pages\` + `styles\`。验证后删除 `_smoke` 目录。同样三例在 `pwsh -NoProfile -File ...` 下重复。

- [ ] **Step 5: 确认全脚本无残留 GetFullPath 后提交**

```bash
cd /d/AI/mcp-indesign && grep -n "GetFullPath" skills/indesign-cli/scripts/prepare-author-package.ps1; git add skills/indesign-cli/scripts/prepare-author-package.ps1 && git commit -m "fix(skills): prepare-author-package.ps1 支持 UNC/中文/provider 前缀路径

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

预期：grep 无输出（退出码 1 属正常），提交成功。

---

## 批 1 · html-indesign 仓库

### Task 3: `assemble-authoring.js` 报错双轨指路（B2）

> ✅ **已完成** 2026-08-19，commit `29af242`（fix/authoring-friction-0819）。TDD 红→绿完整；审查通过：改动仅限目标 else 分支，测试真实拉起子进程断言 stderr。指路文案中 cjs 参数顺序已对照 mcp 仓库源码核实无误。

**Files:**
- Modify: `D:\AI\html-indesign\scripts\assemble-authoring.js:45`
- Test: `D:\AI\html-indesign\test\authoring\assemble-authoring-cli.test.js`

背景：仓库内开发脚本 `assemble-authoring.js`（flag 式参数）与分发态 `assemble-author-package.cjs`（位置参数，由 `prepare-author-package.ps1` 调用）名字相近，0819 会话模型对前者猜错两次参数。两脚本服务对象不同，不合并；让报错自己指路。

- [ ] **Step 1: 写失败测试**

在 `test\authoring\assemble-authoring-cli.test.js` 末尾追加（该文件已有 `node:test` + `spawnSync` 的既有用例，沿用其风格；若文件顶部尚未引入 `spawnSync`，补 `const { spawnSync } = require('node:child_process');`）：

```js
test('unknown argument error points runtime users to the installed-runtime entry', () => {
  const scriptPath = path.resolve(__dirname, '../../scripts/assemble-authoring.js');
  const result = spawnSync(process.execPath, [scriptPath, 'first.json', 'second-positional'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown argument: second-positional/);
  assert.match(result.stderr, /prepare-author-package\.ps1 -Package/);
  assert.match(result.stderr, /assemble-author-package\.cjs <pluginRoot> <deck\.config\.json>/);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /d/AI/html-indesign && node --test test/authoring/assemble-authoring-cli.test.js
```

预期：新用例 FAIL（stderr 只有 `Unknown argument: second-positional`，无指路文案）。

- [ ] **Step 3: 实现**

把 `scripts/assemble-authoring.js:45` 的：

```js
    else throw new Error(`Unknown argument: ${arg}`);
```

替换为：

```js
    else {
      throw new Error([
        `Unknown argument: ${arg}.`,
        'This repo-internal script takes one config: --package <deck.config.json>.',
        'In an installed runtime (outside the html-indesign repo checkout), do not call this script;',
        'use prepare-author-package.ps1 -Package <deck.config.json>, which runs',
        'assemble-author-package.cjs <pluginRoot> <deck.config.json> with the runtime Node.',
      ].join(' '));
    }
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd /d/AI/html-indesign && node --test test/authoring/assemble-authoring-cli.test.js
```

预期：全绿。

- [ ] **Step 5: 提交**

```bash
cd /d/AI/html-indesign && git add scripts/assemble-authoring.js test/authoring/assemble-authoring-cli.test.js && git commit -m "feat(scripts): assemble-authoring 未知参数报错指向分发态入口

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 批 2 · html-indesign 仓库

### Task 4: 孤儿 span 文本自动归一化（A1，消除 0819 的 20/32 个错误）

> ✅ **已完成** 2026-08-19，commit `253475d`。红→绿完整，两个守护用例（p 内 span 仍为 run、混排容器仍报错）全程绿。勘误：`isNaturalTextElement` 的消费点实为 **四** 处——计划列的三处之外 `textRunsFor`（:549）也依赖它，这正是提升后的 span 能带上文本的原因（有益副作用）。

**Files:**
- Modify: `D:\AI\html-indesign\src\adapters\html\reader\browser-element-capture.js:449-456`
- Test: `D:\AI\html-indesign\test\html-to-indesign\browser-snapshot.test.js`

机制说明（给零上下文工程师）：捕获层把页面元素分为「候选」（会变成 InDesign 对象）和其余。`isNaturalTextElement()` 目前只认 `div`，所以 `<div class="card"><span>徽标</span><p>正文</p></div>` 里的裸 span 既成不了候选，又没有覆盖它文本的祖先候选（card 含 `<p>` 子元素，不是纯文本 div），于是被 `collectUncapturedTextElements()` 判为 `uncapturedText`，lint 层转成 `HTML_TEXT_NOT_CONVERTIBLE` error。修法：让「无覆盖祖先、子节点全内联」的孤儿 span 也算 natural text element。三处消费点（候选收集 `isSemanticCandidate`、覆盖判定 `candidateCoversText`、快照字段 `naturalTextElement`）都直接调用 `isNaturalTextElement`，改一处全通；`naturalTextElement: true` 会让 `item-role-helpers.js:34` 自动推出 `role: 'text'`，`audit.js:89-99` 的 `HTML_ROLE_INFERRED` 分支自动产出归一化消息（这就是设计偏差 1 的依据）。

关键安全性：`<p>` 内部的内联 span 有文本祖先覆盖（`hasTextCoveringAncestor` 命中 `isTextTag`），不会被提升成独立对象，段内富文本 runs 行为不变。

- [ ] **Step 1: 写失败测试**

在 `test\html-to-indesign\browser-snapshot.test.js` 末尾追加三个用例（沿用文件内 `test/workspace` 内联 fixture 的既有写法）：

```js
test('renderSnapshot promotes bare label spans in layout containers to text items', async () => {
  const outDir = path.resolve('test/workspace/browser-orphan-text-span');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'deck.html');
  fs.writeFileSync(htmlPath, `<!doctype html>
<style>
  .page { width: 800px; height: 450px; position: relative; }
  .card { position: absolute; left: 40px; top: 40px; width: 300px; background: #eee; }
</style>
<section class="page" id="page-1">
  <div class="card">
    <span class="badge" id="badge">行业调查</span>
    <p>正文段落</p>
  </div>
</section>`, 'utf8');

  const snapshot = await renderSnapshot({ htmlPath });
  const page = snapshot.pages[0];
  assert.deepEqual(page.uncapturedText, []);
  const badge = page.items.find((item) => item.id === 'badge');
  assert.ok(badge, 'badge span should become a capture item');
  assert.equal(badge.role, 'text');
  assert.equal(badge.text, '行业调查');
});

test('renderSnapshot keeps inline spans inside paragraphs as runs, not items', async () => {
  const outDir = path.resolve('test/workspace/browser-inline-span-run');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'deck.html');
  fs.writeFileSync(htmlPath, `<!doctype html>
<style>.page { width: 800px; height: 450px; }</style>
<section class="page" id="page-1">
  <p id="para">前缀<span id="inline-run" style="font-weight:700">强调</span>后缀</p>
</section>`, 'utf8');

  const snapshot = await renderSnapshot({ htmlPath });
  const page = snapshot.pages[0];
  assert.deepEqual(page.uncapturedText, []);
  assert.equal(page.items.some((item) => item.id === 'inline-run'), false);
  const para = page.items.find((item) => item.id === 'para');
  assert.ok(para);
  assert.equal(para.runs.some((run) => run.text === '强调'), true);
});

test('renderSnapshot still reports mixed text-and-block containers as uncaptured', async () => {
  const outDir = path.resolve('test/workspace/browser-mixed-container');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'deck.html');
  fs.writeFileSync(htmlPath, `<!doctype html>
<style>.page { width: 800px; height: 450px; }</style>
<section class="page" id="page-1">
  <div id="mixed">直接文本<div>块级子内容</div></div>
</section>`, 'utf8');

  const snapshot = await renderSnapshot({ htmlPath });
  const page = snapshot.pages[0];
  assert.equal(page.uncapturedText.length, 1);
  assert.equal(page.uncapturedText[0].text, '直接文本');
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /d/AI/html-indesign && node --test test/html-to-indesign/browser-snapshot.test.js
```

预期：第 1 个新用例 FAIL（`uncapturedText` 非空、badge 不是 item），后 2 个 PASS（守护现状）。

- [ ] **Step 3: 实现**

把 `browser-element-capture.js:449-456` 的 `isNaturalTextElement` 整体替换为：

```js
  function isNaturalTextElement(el) {
    const tagName = String(el && el.tagName || '').toLowerCase();
    if (tagName === 'div') return isNaturalTextDiv(el);
    if (tagName === 'span') return isOrphanTextSpan(el);
    return false;
  }

  function isNaturalTextDiv(el) {
    if (!sourceText(el).trim()) return false;
    const dataId = dataIdAttributes();
    if (el.querySelector(`h1,h2,h3,h4,h5,h6,p,li,figcaption,hr,img,object,embed,svg,canvas,table,[${dataId.OBJECT}],[${dataId.PARAGRAPH_STYLE}]`)) return false;
    return Array.from(el.children || []).every(isInlineSourceElement);
  }

  // A bare span holding visible text inside a layout container is the most
  // common LLM authoring pattern; treat it as an implicit text leaf when no
  // ancestor text element already covers it, instead of rejecting it.
  function isOrphanTextSpan(el) {
    if (!sourceText(el).trim()) return false;
    if (!Array.from(el.children || []).every(isInlineSourceElement)) return false;
    return !hasTextCoveringAncestor(el);
  }

  function hasTextCoveringAncestor(el) {
    const dataId = dataIdAttributes();
    let parent = el.parentElement;
    while (parent && parent.nodeType === 1) {
      const tagName = String(parent.tagName || '').toLowerCase();
      if (isTextTag(tagName)) return true;
      if (tagName === 'div' && isNaturalTextDiv(parent)) return true;
      if (parent.hasAttribute(dataId.PARAGRAPH_STYLE)) return true;
      if (String(parent.getAttribute(dataId.ROLE) || '').trim().toLowerCase() === 'text') return true;
      parent = parent.parentElement;
    }
    return false;
  }
```

注意：`isNaturalTextDiv` 的函数体与原 `isNaturalTextElement` 的 div 分支逐字相同，只是换名；`hasTextCoveringAncestor` 只对 div 祖先调 `isNaturalTextDiv`（不递归进 span 分支），无死循环风险。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd /d/AI/html-indesign && node --test test/html-to-indesign/browser-snapshot.test.js test/html-to-indesign/authoring-validator.test.js test/html-to-indesign/authoring-lint-cli.test.js
```

预期：全绿。若既有用例因「原先被 lint 拒绝的 span 现在变成合法 item」而失败，逐条核对：断言的旧行为若正是本任务要消除的 `HTML_TEXT_NOT_CONVERTIBLE`，更新断言为新语义并在 commit message 里点名。

- [ ] **Step 5: 提交**

```bash
cd /d/AI/html-indesign && git add src/adapters/html/reader/browser-element-capture.js test/html-to-indesign/browser-snapshot.test.js && git commit -m "feat(capture): 孤儿文本 span 自动归一化为文本叶子候选

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 5: `HTML_TEXT_NOT_CONVERTIBLE` 附带文本预览（C2）

> ✅ **已完成** 2026-08-19，commit `201e673`。无既有用例受影响。

**Files:**
- Modify: `D:\AI\html-indesign\src\adapters\html\validators\authoring-validator.js:40-49`
- Test: `D:\AI\html-indesign\test\html-to-indesign\authoring-validator.test.js`

背景：该错误的 `itemId` 是 `div:nth-of-type(3)>span:nth-of-type(1)` 式 CSS 路径，结构一动整体偏移。捕获层其实已把元素文本带进了 `uncapturedText[].text`（`browser-element-capture.js:489`），lint 层只是没用——把前 20 个字符拼进 message 并落 `textPreview` 字段即可。A1 落地后此错误只剩「混排」情形，预览帮助定位残余案例。

- [ ] **Step 1: 写失败测试**

在 `test\html-to-indesign\authoring-validator.test.js` 末尾追加：

```js
test('HTML_TEXT_NOT_CONVERTIBLE carries a text preview for location', () => {
  const snapshot = {
    pages: [{
      id: 'page-1',
      uncapturedText: [{ sourcePath: 'div:nth-of-type(1)>span:nth-of-type(1)', text: '这是一段超过二十个字符的不可转换文本示例内容' }],
      items: [],
    }],
  };
  const result = validateAuthoringRules(snapshot, {});
  const error = result.errors.find((entry) => entry.code === 'HTML_TEXT_NOT_CONVERTIBLE');
  assert.ok(error);
  assert.equal(error.textPreview, '这是一段超过二十个字符的不可转换文本示例');
  assert.match(error.message, /Text starts with: "这是一段超过二十个字符的不可转换文本示例"/);
});
```

（若文件顶部尚未引入 `validateAuthoringRules`，按该文件既有 require 风格补：`const { validateAuthoringRules } = require('../../src/adapters/html/validators/authoring-validator');`。页面缺 margin/grid 会额外产出两条无关 error，用 `find` 按 code 过滤即可，不要断言 errors 总数。）

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /d/AI/html-indesign && node --test test/html-to-indesign/authoring-validator.test.js
```

预期：新用例 FAIL（`textPreview` 为 undefined）。

- [ ] **Step 3: 实现**

把 `authoring-validator.js:40-49` 的 uncapturedText 循环替换为：

```js
    for (const issue of Array.isArray(page.uncapturedText) ? page.uncapturedText : []) {
      const itemId = issue.id || issue.sourcePath || null;
      const preview = String(issue.text || '').replace(/\s+/g, ' ').trim().slice(0, 20);
      errors.push({
        ...message(
          'error',
          HTML_TEXT_NOT_CONVERTIBLE,
          pageId,
          itemId,
          'Visible HTML text cannot be assigned safely to an InDesign text object. '
            + 'Put it in a leaf text element such as p, a heading, or a text-only div; keep layout containers separate.'
            + (preview ? ` Text starts with: "${preview}"` : ''),
        ),
        ...(preview ? { textPreview: preview } : {}),
      });
    }
```

- [ ] **Step 4: 跑测试确认通过 + 提交**

```bash
cd /d/AI/html-indesign && node --test test/html-to-indesign/authoring-validator.test.js && git add src/adapters/html/validators/authoring-validator.js test/html-to-indesign/authoring-validator.test.js && git commit -m "feat(lint): HTML_TEXT_NOT_CONVERTIBLE 报错附带 20 字文本预览

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 6: 自动宽度文本框豁免右边网格校验（A3，消除 0819 的 8/32 个错误）

> ✅ **已完成** 2026-08-19，commit `e69458e`。一个既有用例按新语义更新（class-only folio：edges `['left','right']` → `['left']`，正是本任务定义的假阳性形态，用例本意经 left 边保留）。`test/html-to-indesign` 197/197 绿。

**Files:**
- Modify: `D:\AI\html-indesign\src\adapters\html\validators\authoring-validator.js:546-558`（`gridEdgesForItem`）
- Test: `D:\AI\html-indesign\test\html-to-indesign\authoring-validator.test.js`

机制说明：`gridEdgesForItem` 已对文本/表格角色豁免 bottom 边（承认内容自适应撑高），但 right 边一律校验。无显式宽度声明的自动宽度标题（flex 收缩、内容撑宽）右边缘天然不落网格线，0819 会话 8/8 页 100% 误报。修法同型扩展：`role === 'text'` 且无任何宽度声明（`authoredStyle` 的 width/minWidth/gridColumn/gridArea/flexBasis，或 `cssVars` 的 `--grid-col`/`--grid-span`——这些 CSS 变量由捕获层 `cssVarsFor()` 采集，是 starter 模板声明网格跨度的约定）时跳过 right 边。注意 `GRID_ALIGNMENT_OFF` 产出时是 warning，strict 模式下被 `:114-122` 提升为 error——单测用非 strict 断言 warnings 即可。

- [ ] **Step 1: 写失败测试**

在 `test\html-to-indesign\authoring-validator.test.js` 末尾追加（`gridPage` 是本用例自带的构造器，页面 297×210mm、12 栏、10mm 边距；网格竖线在 10、33.08、56.17…mm，横线在 0、10、200、210mm）：

```js
function gridPage(items) {
  return {
    id: 'page-1',
    widthMm: 297,
    heightMm: 210,
    rectPx: { x: 0, y: 0, width: 1122.5, height: 793.7 },
    attributes: { 'data-id-margin': '10mm', 'data-id-grid': '12' },
    computedStyle: {},
    authoredStyle: {},
    uncapturedText: [],
    items,
  };
}

function gridTextItem(overrides) {
  return {
    id: 't1',
    tagName: 'h2',
    role: 'text',
    boundsMm: { x: 10, y: 10, width: 50, height: 8 },
    attributes: {},
    classList: [],
    computedStyle: {},
    authoredStyle: {},
    cssVars: {},
    ...overrides,
  };
}

test('auto-width text items skip the right grid edge', () => {
  const result = validateAuthoringRules({ pages: [gridPage([gridTextItem({})])] }, { gridTolerance: 1 });
  assert.equal(result.warnings.some((entry) => entry.code === 'GRID_ALIGNMENT_OFF' && entry.itemId === 't1'), false);
});

test('text items with a declared width still check the right grid edge', () => {
  const result = validateAuthoringRules({
    pages: [gridPage([gridTextItem({ authoredStyle: { width: '50mm' } })])],
  }, { gridTolerance: 1 });
  const warning = result.warnings.find((entry) => entry.code === 'GRID_ALIGNMENT_OFF' && entry.itemId === 't1');
  assert.ok(warning);
  assert.deepEqual(warning.edges, ['right']);
});

test('text items with a grid span css var still check the right grid edge', () => {
  const result = validateAuthoringRules({
    pages: [gridPage([gridTextItem({ cssVars: { '--grid-span': '3' } })])],
  }, { gridTolerance: 1 });
  assert.ok(result.warnings.some((entry) => entry.code === 'GRID_ALIGNMENT_OFF' && entry.itemId === 't1'));
});

test('non-text items keep full edge checking', () => {
  const result = validateAuthoringRules({
    pages: [gridPage([gridTextItem({ id: 's1', tagName: 'div', role: 'shape' })])],
  }, { gridTolerance: 1 });
  const warning = result.warnings.find((entry) => entry.code === 'GRID_ALIGNMENT_OFF' && entry.itemId === 's1');
  assert.ok(warning);
  assert.equal(warning.edges.includes('right'), true);
});
```

（bounds 说明：`x:10` 落在左边距线上、`y:10` 落在横线上，`right = 60mm` 距最近竖线 56.17mm 有 3.8mm 偏差，>1mm 容差，必然触发 right 误差——这正是要豁免/保留的那条边。）

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /d/AI/html-indesign && node --test test/html-to-indesign/authoring-validator.test.js
```

预期：第 1 个新用例 FAIL（当前 right 边仍被校验），后 3 个 PASS。

- [ ] **Step 3: 实现**

把 `authoring-validator.js:546-558` 的 `gridEdgesForItem` 整体替换，并在其后新增 `hasDeclaredWidth`：

```js
function gridEdgesForItem(bounds, vertical, horizontal, item) {
  const role = String(item && item.role || '').toLowerCase();
  const authoredRole = String(attributeValue(attributesFor(item), HTML_DATA_ID_ATTRIBUTES.ROLE) || '').trim().toLowerCase();
  const edges = [
    ['left', Number(bounds.x), vertical],
    ['top', Number(bounds.y), horizontal],
  ];
  // Auto-width text frames (no authored width or grid span) size to their
  // content; their right edge cannot land on a grid line by construction,
  // mirroring the existing bottom-edge exemption for content-grown text.
  if (role !== ITEM_ROLE.TEXT || hasDeclaredWidth(item)) {
    edges.push(['right', Number(bounds.x) + Number(bounds.width), vertical]);
  }
  if (role !== ITEM_ROLE.TEXT && role !== ITEM_ROLE.TABLE && authoredRole !== ITEM_ROLE.CONTAINER) {
    edges.push(['bottom', Number(bounds.y) + Number(bounds.height), horizontal]);
  }
  return edges;
}

function hasDeclaredWidth(item) {
  const authored = item && item.authoredStyle || {};
  const declared = [authored.width, authored.minWidth, authored.gridColumn, authored.gridArea, authored.flexBasis]
    .some((value) => value != null && String(value).trim() !== '' && String(value).trim().toLowerCase() !== 'auto');
  if (declared) return true;
  const cssVars = item && item.cssVars || {};
  return ['--grid-col', '--grid-span'].some((name) => cssVars[name] != null && String(cssVars[name]).trim() !== '');
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd /d/AI/html-indesign && node --test test/html-to-indesign/authoring-validator.test.js test/html-to-indesign/authoring-lint-cli.test.js
```

预期：全绿。若既有 GRID_ALIGNMENT_OFF 用例中有「文本项 + 无宽度声明 + 只差 right 边」形态而失败，那正是本任务定义的假阳性，更新断言。

- [ ] **Step 5: 提交**

```bash
cd /d/AI/html-indesign && git add src/adapters/html/validators/authoring-validator.js test/html-to-indesign/authoring-validator.test.js && git commit -m "feat(lint): 自动宽度文本框豁免右边网格校验

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 批 3 · html-indesign 仓库

### Task 7: 伪元素静态内容物化（A2，消除 0819 的 4/32 个错误；依赖 Task 4）

> ✅ **已完成** 2026-08-20，commit `9d7cbfa`。红→绿 4 例全中；`test/html-to-indesign` 全套 200/200 绿。paint 伪元素不误杀有既有 `unsupported-deck.html` 用例背书；禁用规则幂等、样式快照时序均经双页探针实测。已知边界（可接受，暂不处理）：同宿主 before+after 产两条同 pageId/itemId 的归一化消息；宿主无 id/data-id 时消息省略 itemId（仍有 pageId+hostTag）；`data-id-object` 协议对象宿主 + 伪元素的组合无用例覆盖。

**Files:**
- Create: `D:\AI\html-indesign\src\adapters\html\reader\browser-pseudo-materialize.js`
- Modify: `D:\AI\html-indesign\src\adapters\html\reader\browser-snapshot-scripts.js`
- Modify: `D:\AI\html-indesign\src\adapters\html\reader\browser-snapshot-capture.js`（:14-18 旁加 pseudoApi、:93-120 `collectPageSnapshot`）
- Modify: `D:\AI\html-indesign\src\adapters\html\reader\browser-snapshot.js:104-128`（`pageSnapshotToModel` 透传）
- Modify: `D:\AI\html-indesign\src\adapters\html\compatibility\audit.js:17-32`（`auditHtmlCompatibility` 页级消息）
- Test: `D:\AI\html-indesign\test\html-to-indesign\browser-snapshot.test.js`（含脚本清单断言更新）、`test\html-to-indesign\html-compatibility-audit.test.js`

机制说明：伪元素拿不到 `getBoundingClientRect`，所以物化必须发生在浏览器里、捕获量测**之前**：把 `content` 为纯字符串字面量的 `::before`/`::after` 替换为真实 `<span>`（拷贝布局相关 computed style），并注入一条样式规则关掉原伪元素（按 before/after 分别打标记，避免误杀纯装饰 paint 伪元素）。物化出来的 span 之后走 Task 4 的孤儿 span 通道（宿主是布局容器时成为独立文本 item）或并入宿主文本 runs（宿主本身是文本元素时）——两种结果都正确。`content` 含 `counter()`/`attr()`/`url()`/空串的保持现状（`audit.js` 继续 blocked）。物化记录随页面快照上行，`audit.js` 为每条产出 `HTML_PSEUDO_CONTENT_MATERIALIZED` 归一化消息。

- [ ] **Step 1: 写失败测试（端到端 + 审计单测）**

`test\html-to-indesign\browser-snapshot.test.js`：先把文件开头（:7-19）脚本清单断言的期望数组改为四项（新脚本排在 element-capture 之前）：

```js
    [
      'browser-style-capture.js',
      'browser-pseudo-materialize.js',
      'browser-element-capture.js',
      'browser-snapshot-capture.js',
    ],
```

再在文件末尾追加两个用例：

```js
test('renderSnapshot materializes static pseudo-element text into real spans', async () => {
  const outDir = path.resolve('test/workspace/browser-pseudo-materialize');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'deck.html');
  fs.writeFileSync(htmlPath, `<!doctype html>
<style>
  .page { width: 800px; height: 450px; position: relative; }
  .gov { position: absolute; left: 40px; top: 40px; }
  .gov-item::before { content: "01"; font-weight: 700; margin-right: 8px; color: #c00; }
</style>
<section class="page" id="page-1">
  <div class="gov">
    <div class="gov-item" id="gov-1">建立可复核流程</div>
  </div>
</section>`, 'utf8');

  const snapshot = await renderSnapshot({ htmlPath });
  const page = snapshot.pages[0];
  assert.equal(page.pseudoMaterialized.length, 1);
  assert.equal(page.pseudoMaterialized[0].pseudo, 'before');
  assert.equal(page.pseudoMaterialized[0].text, '01');
  assert.equal(page.pseudoMaterialized[0].hostId, 'gov-1');
  const host = page.items.find((item) => item.id === 'gov-1');
  assert.ok(host);
  assert.equal(host.unsupported.beforeContent, '');
  assert.match(host.text, /01/);
  assert.match(host.text, /建立可复核流程/);
});

test('renderSnapshot leaves dynamic pseudo content unsupported', async () => {
  const outDir = path.resolve('test/workspace/browser-pseudo-dynamic');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'deck.html');
  fs.writeFileSync(htmlPath, `<!doctype html>
<style>
  .page { width: 800px; height: 450px; counter-reset: idx; }
  .num { counter-increment: idx; }
  .num::before { content: counter(idx); }
</style>
<section class="page" id="page-1">
  <div class="num" id="num-1">条目</div>
</section>`, 'utf8');

  const snapshot = await renderSnapshot({ htmlPath });
  const page = snapshot.pages[0];
  assert.deepEqual(page.pseudoMaterialized, []);
  const host = page.items.find((item) => item.id === 'num-1');
  assert.ok(host);
  assert.notEqual(host.unsupported.beforeContent, '');
});
```

`test\html-to-indesign\html-compatibility-audit.test.js` 末尾追加：

```js
test('materialized pseudo content surfaces as a normalized compatibility message', () => {
  const { auditHtmlCompatibility } = require('../../src/adapters/html');
  const audit = auditHtmlCompatibility({
    pages: [{
      id: 'page-1',
      pseudoMaterialized: [{ pseudo: 'before', text: '01', hostTag: 'div', hostId: 'gov-1' }],
      items: [],
    }],
  });
  const entry = audit.messages.find((message) => message.code === 'HTML_PSEUDO_CONTENT_MATERIALIZED');
  assert.ok(entry);
  assert.equal(entry.action, 'normalized');
  assert.equal(entry.level, 'warning');
  assert.equal(entry.pageId, 'page-1');
  assert.equal(entry.itemId, 'gov-1');
  assert.equal(audit.summary.normalized, 1);
  assert.equal(audit.summary.blocked, 0);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /d/AI/html-indesign && node --test test/html-to-indesign/browser-snapshot.test.js test/html-to-indesign/html-compatibility-audit.test.js
```

预期：脚本清单断言 FAIL（缺新文件）、两个物化用例 FAIL、审计用例 FAIL。

- [ ] **Step 3: 新建 `browser-pseudo-materialize.js`**

完整文件内容：

```js
(function installBrowserPseudoMaterialize(globalObject) {
  const HOST_MARKER_BEFORE = 'data-pseudo-materialized-before';
  const HOST_MARKER_AFTER = 'data-pseudo-materialized-after';
  const GENERATED_MARKER = 'data-pseudo-generated';
  const STYLE_MARKER = 'data-pseudo-materialize-style';

  // Layout-relevant properties copied from the pseudo-element onto the
  // generated span so that disabling the pseudo rule does not shift layout.
  const COPY_PROPS = [
    'position', 'top', 'right', 'bottom', 'left', 'display',
    'width', 'height', 'box-sizing',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'font-family', 'font-size', 'font-weight', 'font-style',
    'line-height', 'letter-spacing', 'text-align', 'white-space',
    'color', 'background-color', 'border-radius', 'opacity', 'z-index',
    'border-top-width', 'border-top-style', 'border-top-color',
    'border-right-width', 'border-right-style', 'border-right-color',
    'border-bottom-width', 'border-bottom-style', 'border-bottom-color',
    'border-left-width', 'border-left-style', 'border-left-color',
  ];

  // Only a concatenation of quoted string literals is safe to materialize;
  // counter()/attr()/url()/quotes keep their unsupported status and block.
  function staticPseudoText(el, pseudo) {
    const style = getComputedStyle(el, pseudo);
    if (!style || style.display === 'none') return null;
    const content = String(style.content || '');
    if (!/^"(?:[^"\\]|\\.)*"(?:\s+"(?:[^"\\]|\\.)*")*$/.test(content)) return null;
    const text = (content.match(/"(?:[^"\\]|\\.)*"/g) || [])
      .map((part) => part.slice(1, -1).replace(/\\(.)/g, '$1'))
      .join('');
    if (!text.trim()) return null;
    const styleCopy = {};
    for (const name of COPY_PROPS) {
      const value = style.getPropertyValue(name);
      if (value != null && String(value).trim() !== '') styleCopy[name] = value;
    }
    return { text, styleCopy };
  }

  function materializePseudoContent(pageEl) {
    const doc = pageEl.ownerDocument || document;
    const targets = [];
    for (const el of [pageEl, ...Array.from(pageEl.querySelectorAll('*'))]) {
      for (const pseudo of ['::before', '::after']) {
        const marker = pseudo === '::before' ? HOST_MARKER_BEFORE : HOST_MARKER_AFTER;
        if (el.hasAttribute(marker)) continue;
        const found = staticPseudoText(el, pseudo);
        if (found) targets.push({ el, pseudo, marker, found });
      }
    }
    const materialized = [];
    for (const target of targets) {
      const span = doc.createElement('span');
      span.textContent = target.found.text;
      for (const name of Object.keys(target.found.styleCopy)) {
        span.style.setProperty(name, target.found.styleCopy[name]);
      }
      span.setAttribute(GENERATED_MARKER, target.pseudo === '::before' ? 'before' : 'after');
      if (target.pseudo === '::before') target.el.insertBefore(span, target.el.firstChild);
      else target.el.appendChild(span);
      target.el.setAttribute(target.marker, 'true');
      materialized.push({
        pseudo: target.pseudo === '::before' ? 'before' : 'after',
        text: target.found.text,
        hostTag: target.el.tagName.toLowerCase(),
        hostId: target.el.id || target.el.getAttribute('data-id') || null,
      });
    }
    if (materialized.length) ensureDisableRule(doc);
    return materialized;
  }

  function ensureDisableRule(doc) {
    if (doc.querySelector(`style[${STYLE_MARKER}]`)) return;
    const styleEl = doc.createElement('style');
    styleEl.setAttribute(STYLE_MARKER, 'true');
    styleEl.textContent = [
      `[${HOST_MARKER_BEFORE}]::before { content: none !important; }`,
      `[${HOST_MARKER_AFTER}]::after { content: none !important; }`,
    ].join('\n');
    doc.head.appendChild(styleEl);
  }

  const api = { materializePseudoContent };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalObject) globalObject.htmlIndesignBrowserPseudoMaterialize = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
```

- [ ] **Step 4: 注册脚本 + 接线捕获与透传**

`browser-snapshot-scripts.js`：在 `browser-style-capture.js` 条目后插入一行：

```js
  path.join(__dirname, 'browser-pseudo-materialize.js'),
```

`browser-snapshot-capture.js`：在 `elementApi()`（:14-18）后加：

```js
  function pseudoApi() {
    const api = globalObject && globalObject.htmlIndesignBrowserPseudoMaterialize;
    if (!api) throw new Error('htmlIndesignBrowserPseudoMaterialize is not installed');
    return api;
  }
```

`collectPageSnapshot`（:93）第一行、任何量测之前加：

```js
    const pseudoMaterialized = pseudoApi().materializePseudoContent(pageEl);
```

并在其返回对象中 `uncapturedText:` 一行之前加：

```js
      pseudoMaterialized,
```

`browser-snapshot.js` `pageSnapshotToModel`（:104-128）返回对象中 `uncapturedText:` 一行后加：

```js
    pseudoMaterialized: pageInfo.pseudoMaterialized || [],
```

`audit.js` 把 `auditHtmlCompatibility`（:17-32）的页循环改为：

```js
function auditHtmlCompatibility(snapshot) {
  const messages = [];
  for (const page of Array.isArray(snapshot && snapshot.pages) ? snapshot.pages : []) {
    for (const entry of Array.isArray(page && page.pseudoMaterialized) ? page.pseudoMaterialized : []) {
      messages.push(normalizedMessage(
        'HTML_PSEUDO_CONTENT_MATERIALIZED',
        { pageId: page.id, itemId: entry.hostId || null },
        `Static ::${entry.pseudo} text "${entry.text}" on <${entry.hostTag}> was materialized into a real text element.`,
        'No authoring rewrite is required; move the text into a real element when it must stay explicit in the source.',
        'css/pseudo-elements',
      ));
    }
    for (const item of Array.isArray(page && page.items) ? page.items : []) {
      auditItem(page, item, messages);
    }
  }
  return {
    summary: {
      normalized: messages.filter((entry) => entry.action === 'normalized').length,
      warnings: messages.filter((entry) => entry.level === 'warning').length,
      blocked: messages.filter((entry) => entry.level === 'error').length,
    },
    messages,
  };
}
```

- [ ] **Step 5: 跑测试确认通过**

```bash
cd /d/AI/html-indesign && node --test test/html-to-indesign/browser-snapshot.test.js test/html-to-indesign/html-compatibility-audit.test.js test/architecture/orphan-modules.test.js
```

预期：全绿（`orphan-modules` 校验新 src 文件被 `browser-snapshot-scripts.js` 引用，正常应直接通过；若它维护了文件清单快照则按报错补登记）。

- [ ] **Step 6: 提交**

```bash
cd /d/AI/html-indesign && git add src/adapters/html/reader/browser-pseudo-materialize.js src/adapters/html/reader/browser-snapshot-scripts.js src/adapters/html/reader/browser-snapshot-capture.js src/adapters/html/reader/browser-snapshot.js src/adapters/html/compatibility/audit.js test/html-to-indesign/browser-snapshot.test.js test/html-to-indesign/html-compatibility-audit.test.js && git commit -m "feat(capture): 静态伪元素文本物化为真实元素并归一化上报

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**批 3 手动验收（设计 §7 验收 5）**：在有 InDesign 的工位跑一次 `html.build_indesign`（fixture 可用任务 10 的 friction deck），确认物化文本「01」在 `forward-fidelity-report.json` 中逐字通过、无新增 fidelity error。

### Task 8: 失败态报告时间戳归档（B4）

> ✅ **已完成** 2026-08-20，commit `7664c1c`。三个接线点按规格落地；既有测试无断言返回形状，零波及。

**Files:**
- Create: `D:\AI\html-indesign\src\indesign-cli-plugin\report-archive.js`
- Modify: `D:\AI\html-indesign\src\indesign-cli-plugin\lint-feedback.js:98-109`（`writeLintFailureReport`）
- Modify: `D:\AI\html-indesign\src\indesign-cli-plugin\tools\build-indesign.js:137`（lint 报告写盘）、`:273`（fidelity 报告写盘）
- Test: `D:\AI\html-indesign\test\indesign-cli-plugin\report-archive.test.js`（新建）

背景：两份报告都是单文件原地覆盖，0819 的 p6-el19 保真失败快照被成功构建覆盖，只能靠 Supabase 对话复原。修法：主文件语义不变（下游读取方零改动）；失败时**额外**写 `<name>.failed-<yyyyMMdd-HHmmss>.json`，同名归档只保留最近 3 份。

- [ ] **Step 1: 写失败测试**

新建 `test\indesign-cli-plugin\report-archive.test.js`：

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { writeReportFile } = require('../../src/indesign-cli-plugin/report-archive');

test('failed reports get a timestamped archive pruned to the last three', () => {
  const dir = path.resolve('test/workspace/report-archive');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const reportPath = path.join(dir, 'authoring-lint-report.json');

  writeReportFile(reportPath, { ok: true }, { failed: false });
  assert.deepEqual(fs.readdirSync(dir), ['authoring-lint-report.json']);

  for (const stamp of ['20260819-120001', '20260819-120002', '20260819-120003', '20260819-120004']) {
    writeReportFile(reportPath, { ok: false, stamp }, { failed: true, stamp });
  }
  assert.deepEqual(fs.readdirSync(dir).sort(), [
    'authoring-lint-report.failed-20260819-120002.json',
    'authoring-lint-report.failed-20260819-120003.json',
    'authoring-lint-report.failed-20260819-120004.json',
    'authoring-lint-report.json',
  ]);
  assert.equal(JSON.parse(fs.readFileSync(reportPath, 'utf8')).stamp, '20260819-120004');
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(dir, 'authoring-lint-report.failed-20260819-120002.json'), 'utf8')).stamp,
    '20260819-120002',
  );
});

test('default stamp is derived from the clock and archive write returns its path', () => {
  const dir = path.resolve('test/workspace/report-archive-default-stamp');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const reportPath = path.join(dir, 'forward-fidelity-report.json');
  const { archivedPath } = writeReportFile(reportPath, { errors: [{ code: 'X' }] }, { failed: true });
  assert.ok(archivedPath);
  assert.match(path.basename(archivedPath), /^forward-fidelity-report\.failed-\d{8}-\d{6}\.json$/);
  assert.equal(fs.existsSync(archivedPath), true);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /d/AI/html-indesign && node --test test/indesign-cli-plugin/report-archive.test.js
```

预期：模块不存在，加载即 FAIL。

- [ ] **Step 3: 新建 `report-archive.js`**

完整文件内容：

```js
// 失败态报告加时间戳归档：主文件仍原地覆盖（下游读取方零改动），
// 失败快照另存 <name>.failed-<ts>.json，只保留最近 MAX_FAILED_ARCHIVES 份。
// 背景：2026-08-19 p6-el19 保真失败现场被后续成功构建覆盖，离线复盘断链。
const fs = require('node:fs');
const path = require('node:path');

const MAX_FAILED_ARCHIVES = 3;

function writeReportFile(reportPath, payload, options = {}) {
  const text = JSON.stringify(payload, null, 2);
  fs.writeFileSync(reportPath, text, 'utf8');
  if (!options.failed) return { archivedPath: null };
  const dir = path.dirname(reportPath);
  const ext = path.extname(reportPath) || '.json';
  const base = path.basename(reportPath, ext);
  const stamp = options.stamp || new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
  const archivedPath = path.join(dir, `${base}.failed-${stamp}${ext}`);
  fs.writeFileSync(archivedPath, text, 'utf8');
  pruneFailedArchives(dir, base, ext);
  return { archivedPath };
}

function pruneFailedArchives(dir, base, ext) {
  const prefix = `${base}.failed-`;
  const stale = fs.readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(ext))
    .sort()
    .slice(0, -MAX_FAILED_ARCHIVES);
  for (const name of stale) fs.rmSync(path.join(dir, name), { force: true });
}

module.exports = { writeReportFile };
```

- [ ] **Step 4: 接线两个既有写盘点**

`lint-feedback.js`：顶部 require 区加 `const { writeReportFile } = require('./report-archive');`，把 `writeLintFailureReport`（:98-109）内的：

```js
    const reportPath = path.join(dir, REPORT_FILE_NAME);
    fs.writeFileSync(reportPath, JSON.stringify(withoutLintSnapshot(lint), null, 2), 'utf8');
    return { path: reportPath, error: null };
```

替换为（该函数只在 lint 失败路径被调用，恒为 failed）：

```js
    const reportPath = path.join(dir, REPORT_FILE_NAME);
    const { archivedPath } = writeReportFile(reportPath, withoutLintSnapshot(lint), { failed: true });
    return { path: reportPath, archivedPath, error: null };
```

`build-indesign.js`：顶部 require 区加 `const { writeReportFile } = require('../report-archive');`。
- `:137`（此处 lint 已通过，成功态）：`fs.writeFileSync(lintReportPath, JSON.stringify(withoutLintSnapshot(lint), null, 2), 'utf8');` → `writeReportFile(lintReportPath, withoutLintSnapshot(lint), { failed: false });`
- `:273`（fidelity 报告，成败共用同一写盘点）：`fs.writeFileSync(state.fidelityReportPath, JSON.stringify(report, null, 2), 'utf8');` → `writeReportFile(state.fidelityReportPath, report, { failed: Array.isArray(report.errors) && report.errors.length > 0 });`

（若 :273 实际变量名与上述不符——以打开文件所见为准，判定条件不变：报告对象的 errors 数组非空即 failed。）

- [ ] **Step 5: 跑测试确认通过 + 提交**

```bash
cd /d/AI/html-indesign && node --test test/indesign-cli-plugin/report-archive.test.js test/indesign-cli-plugin/authoring-lint-feedback.test.js "test/indesign-cli-plugin/plugin-tools.test.js"
```

预期：全绿（`authoring-lint-feedback.test.js` 若断言了返回对象形状，`archivedPath` 是新增字段，按需补断言而不是删）。然后：

```bash
cd /d/AI/html-indesign && git add src/indesign-cli-plugin/report-archive.js src/indesign-cli-plugin/lint-feedback.js src/indesign-cli-plugin/tools/build-indesign.js test/indesign-cli-plugin/report-archive.test.js && git commit -m "feat(plugin): lint/fidelity 失败报告加时间戳归档，保留最近三份

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 批 4 · html-indesign 仓库

### Task 9: `warningCount` 拆分归一化计数（C1）

> ✅ **已完成** 2026-08-20，commit `e07da30`。全量 1244/1244 绿；仅 1 条既有用例更新口径。**计划勘误（已修复）**：存在嵌套归一化——`lintAuthoringPackage` 从 `htmlResult` 重新组装后二次归一化，必须把 `htmlResult.normalized` 带回警告池（lint.js:76 一行 + 注释），否则归一化条目双双消失、issueCount 从 96 缩水到 73。审核认可该计划外修复（总量守恒实测 96/96）。遗留跟进项：遥测 `plugin_metrics` 未加 `normalized_count` 字段，周报如需可后续补。

**Files:**
- Modify: `D:\AI\html-indesign\src\authoring\lint.js:171-189`（`normalizeLintPayload`）及 module.exports
- Test: `D:\AI\html-indesign\test\authoring\lint-normalized-count.test.js`（新建）

背景：`withCompatibility()`（:191-203）把 `action:'normalized'` 的兼容消息并进 warnings，`warningCount` 因此被 44 条「工具已自动处理、无需行动」的记录撑满且随卡片数线性增长。修法：`normalizeLintPayload` 是所有 lint 出口的最后一道整形（:35/:44/:61/:79/:113/:129 六处调用都过它），在这里把 `action === 'normalized'` 的条目从 `warnings` 拆到新的 `normalized` 数组，`warningCount` 只计真 warning；新增 `normalizedCount` 与按 code 折叠的 `normalizedSummary`。`messages` 仍含全部条目（报告完整性不变）。`withCompatibility` 本身不动。

**口径影响**：`build-indesign.js` 的 `plugin_metrics.warning_count` 读的就是这里的 `warningCount`，遥测周报口径随之变化——任务 10 在反馈循环 README 里记一笔，不在本任务处理。

- [ ] **Step 1: 写失败测试**

新建 `test\authoring\lint-normalized-count.test.js`：

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeLintPayload } = require('../../src/authoring/lint');

test('normalized entries leave warningCount and fold into normalizedSummary', () => {
  const payload = normalizeLintPayload({
    errors: [],
    warnings: [
      { level: 'warning', code: 'HTML_ROLE_INFERRED', action: 'normalized' },
      { level: 'warning', code: 'HTML_ROLE_INFERRED', action: 'normalized' },
      { level: 'warning', code: 'SEMANTIC_TOKEN_MISSING', action: 'normalized' },
      { level: 'warning', code: 'GRID_ALIGNMENT_OFF' },
    ],
  });
  assert.equal(payload.warningCount, 1);
  assert.equal(payload.warnings.length, 1);
  assert.equal(payload.warnings[0].code, 'GRID_ALIGNMENT_OFF');
  assert.equal(payload.normalizedCount, 3);
  assert.deepEqual(payload.normalizedSummary, [
    { code: 'HTML_ROLE_INFERRED', count: 2 },
    { code: 'SEMANTIC_TOKEN_MISSING', count: 1 },
  ]);
  assert.equal(payload.messages.length, 4);
  assert.equal(payload.issueCount, 4);
});

test('payloads without normalized entries keep their counts unchanged', () => {
  const payload = normalizeLintPayload({
    errors: [{ level: 'error', code: 'X' }],
    warnings: [{ level: 'warning', code: 'Y' }],
  });
  assert.equal(payload.errorCount, 1);
  assert.equal(payload.warningCount, 1);
  assert.equal(payload.normalizedCount, 0);
  assert.deepEqual(payload.normalizedSummary, []);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /d/AI/html-indesign && node --test test/authoring/lint-normalized-count.test.js
```

预期：`normalizeLintPayload` 未导出即 FAIL；若已导出则计数断言 FAIL。

- [ ] **Step 3: 实现**

把 `lint.js:171-189` 的 `normalizeLintPayload` 替换为，并在其后加 `normalizedSummaryByCode`：

```js
function normalizeLintPayload(payload, paths = {}) {
  const errors = payload.errors || [];
  const allWarnings = payload.warnings || [];
  const normalized = allWarnings.filter((entry) => entry && entry.action === 'normalized');
  const warnings = allWarnings.filter((entry) => !entry || entry.action !== 'normalized');
  const messages = payload.messages || errors.concat(allWarnings);
  return {
    ...payload,
    ok: errors.length === 0,
    valid: errors.length === 0,
    ...(paths.packagePath ? { packagePath: paths.packagePath } : {}),
    ...(paths.htmlPath ? { htmlPath: paths.htmlPath } : {}),
    errors,
    warnings,
    normalized,
    normalizedSummary: normalizedSummaryByCode(normalized),
    messages,
    issueCount: messages.length,
    errorCount: errors.length,
    warningCount: warnings.length,
    normalizedCount: normalized.length,
    compatibility: payload.compatibility || emptyCompatibility(),
  };
}

function normalizedSummaryByCode(normalized) {
  const counts = new Map();
  for (const entry of normalized) {
    const code = entry && entry.code || 'other';
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([code, count]) => ({ code, count }));
}
```

并把 `normalizeLintPayload` 加进 `lint.js` 的 `module.exports`（保持既有导出不动，追加一项）。

- [ ] **Step 4: 全量回归**

```bash
cd /d/AI/html-indesign && npm test
```

预期：既有断言里凡把归一化条目计入 `warningCount`/`warnings` 的用例会失败——逐条改为新口径（`warningCount` 排除 `action:'normalized'`；需要总量的断言改用 `normalizedCount + warningCount` 或 `issueCount`）。除口径外不得有其他失败。

- [ ] **Step 5: 提交**

```bash
cd /d/AI/html-indesign && git add src/authoring/lint.js test/authoring/lint-normalized-count.test.js && git add -u test && git commit -m "feat(lint): warningCount 只计真 warning，归一化条目单列 normalizedCount

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 10: 0819 摩擦模式综合回归 + 文档同步

> ✅ **已完成** 2026-08-20，html commit `c3a9b51` + mcp commit `d6ca5de`。fixture 一次通过无需调几何，严格模式 0 error；html 全量 1245/1245 绿。两处合理的主动处置：反馈循环 README 新起「指标口径切换点」小节（避免挂在隐私边界节下）；GRID_ALIGNMENT_OFF 不在指南的阻断表内，豁免说明改写进第 4 节网格契约段。

**Files:**
- Create: `D:\AI\html-indesign\test\fixtures\fixed-html\friction-0819-deck.html`
- Create: `D:\AI\html-indesign\test\html-to-indesign\authoring-friction-regression.test.js`
- Modify: `D:\AI\html-indesign\docs\规范\AGENT_HTML_AUTHORING_GUIDE.md`（§1.2）
- Modify: `D:\AI\mcp-indesign\skills\indesign-cli\references\html-authoring.md`
- Modify: `D:\AI\mcp-indesign\docs\AI协作\反馈循环\README.md`
- Modify: `D:\AI\mcp-indesign\docs\superpowers\specs\2026-08-19-authoring-friction-fix-design.md`（实施注记）

- [ ] **Step 1: 建回归 fixture**

新建 `test\fixtures\fixed-html\friction-0819-deck.html`，一页集齐 0819 的三类写法（几何说明：页面 1122.5×793.7px = 297×210mm；10mm = 37.8px；12 栏网格竖线在 10、33.08…mm，横线在 0、10、200、210mm；所有元素左/上边压线，右边靠 A3 豁免、伪元素靠 A2 物化、裸 span 靠 A1 归一化）：

```html
<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>friction-0819</title>
<style>
  .page { width: 1122.5px; height: 793.7px; position: relative; background: #fff; }
  /* 0819 模式 2：自动宽度页标题，右边缘天然不落网格线（A3 豁免对象） */
  .page-title { position: absolute; left: 37.8px; top: 37.8px; margin: 0; font-size: 28px; }
  /* 0819 模式 1：布局卡片里的裸 span 徽标（A1 归一化对象） */
  .card { position: absolute; left: 125px; top: 37.8px; background: #eee; }
  .badge { font-size: 14px; color: #c00; }
  /* 0819 模式 3：伪元素静态编号（A2 物化对象） */
  .gov { position: absolute; left: 37.8px; top: 755.9px; }
  .gov-item { font-size: 14px; }
  .gov-item::before { content: "01"; font-weight: 700; margin-right: 8px; }
</style>
</head>
<body>
<section class="page" id="page-1" data-id-margin="10mm" data-id-grid="12">
  <h2 class="page-title" id="title">简报</h2>
  <div class="card" id="card">
    <span class="badge" id="badge">行业调查</span>
    <!-- 无文本、无背景的块级子元素：既让 card 不构成纯文本 div（保证 badge 走孤儿 span 通道），又不会自己成为捕获候选 -->
    <div class="spacer" style="height: 8px;"></div>
  </div>
  <div class="gov">
    <div class="gov-item" id="gov-1">建立可复核流程</div>
  </div>
</section>
</body>
</html>
```

- [ ] **Step 2: 写综合回归测试**

新建 `test\html-to-indesign\authoring-friction-regression.test.js`：

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { renderSnapshot, auditHtmlCompatibility } = require('../../src/adapters/html');
const { validateAuthoringRules } = require('../../src/adapters/html/validators/authoring-validator');

test('0819 friction patterns pass strict lint with normalizations reported', async () => {
  const htmlPath = path.resolve(__dirname, '../fixtures/fixed-html/friction-0819-deck.html');
  const snapshot = await renderSnapshot({ htmlPath });
  const page = snapshot.pages[0];

  // A1：裸 span 徽标成为文本 item，而不是 uncapturedText
  assert.deepEqual(page.uncapturedText, []);
  const badge = page.items.find((item) => item.id === 'badge');
  assert.ok(badge);
  assert.equal(badge.role, 'text');

  // A2：伪元素编号被物化并并入宿主文本
  assert.equal(page.pseudoMaterialized.length, 1);
  const gov = page.items.find((item) => item.id === 'gov-1');
  assert.ok(gov);
  assert.match(gov.text, /01/);
  assert.equal(gov.unsupported.beforeContent, '');

  // A1+A2+A3 合并结果：严格模式 0 error
  const result = validateAuthoringRules(snapshot, { strict: true, gridTolerance: 1 });
  assert.deepEqual(result.errors, []);

  // 归一化消息可见：角色推断 + 伪元素物化
  const compatibility = auditHtmlCompatibility(snapshot);
  const codes = compatibility.messages.map((entry) => entry.code);
  assert.equal(codes.includes('HTML_ROLE_INFERRED'), true);
  assert.equal(codes.includes('HTML_PSEUDO_CONTENT_MATERIALIZED'), true);
  assert.equal(compatibility.summary.blocked, 0);
});
```

- [ ] **Step 3: 跑测试**

```bash
cd /d/AI/html-indesign && node --test test/html-to-indesign/authoring-friction-regression.test.js
```

预期：PASS（任务 4-7 已全部落地的前提下）。若 `result.errors` 非空，逐条看 code：残余 `GRID_ALIGNMENT_OFF` 通常是 fixture 几何没压线（对照上面几何注释调坐标），不是产品代码问题。

- [ ] **Step 4: html-indesign 全量回归**

```bash
cd /d/AI/html-indesign && npm test
```

预期：≥ 1225 全绿（新增用例后总数更多；不得有失败）。

- [ ] **Step 5: 文档同步（四处）**

1. `D:\AI\html-indesign\docs\规范\AGENT_HTML_AUTHORING_GUIDE.md` §1.2「安全归一化清单」（约 :65-73）追加两条：

```markdown
- 布局容器里的裸 `<span>`/纯文本 `<div>` 文本：自动按文本叶子捕获（`HTML_ROLE_INFERRED`），无需改写；仅当直接文本与块级子元素混排时仍然阻断（报错会带前 20 字预览）。
- `::before`/`::after` 的纯字符串 `content`：自动物化为真实文本元素（`HTML_PSEUDO_CONTENT_MATERIALIZED`），无需改写；`counter()`/`attr()`/`url()` 等动态 content 仍然阻断。
```

同节「视觉阻断码对照表」（约 :77-87）把 `HTML_PSEUDO_ELEMENT_UNSUPPORTED` 行的触发条件改为「仅动态 content 或纯装饰 paint 伪元素」；`GRID_ALIGNMENT_OFF` 行补一句「文本元素未声明宽度/网格跨度时右边缘不参与校验」。

2. `D:\AI\mcp-indesign\skills\indesign-cli\references\html-authoring.md`：`:90`（伪元素行）、`:107-108`（网格容差行）、`:116`（内联 SVG 提醒行）按上述同一口径改写；另在组装命令一节加双脚本对照表：

```markdown
| 你在哪 | 用什么 |
| --- | --- |
| 已安装 runtime（日常使用） | `prepare-author-package.ps1 -Package <deck.config.json>`（底层为 `assemble-author-package.cjs <pluginRoot> <deck.config.json>`） |
| html-indesign 仓库开发 | `npm run assemble:authoring -- -- --package <deck.config.json>` |
```

3. `D:\AI\mcp-indesign\docs\AI协作\反馈循环\README.md` 末尾追加：

```markdown
- 2026-08-19 起（html-indesign > 0.2.9）：lint 的 `warningCount` / 遥测 `plugin_metrics.warning_count` 不再计入 `action:"normalized"` 的兼容归一化条目（另计 `normalizedCount`）。跨版本对比 warning 数时注意口径切换点。
```

4. `D:\AI\mcp-indesign\docs\superpowers\specs\2026-08-19-authoring-friction-fix-design.md` 末尾追加：

```markdown
## 9. 实施注记（2026-08-19）

实施计划见 `../plans/2026-08-19-authoring-friction-fix-plan.md`。两处与本设计的偏差：

1. §3 A1 未新增 `HTML_TEXT_LEAF_INFERRED` 码：孤儿 span 提升为文本候选后，既有 `HTML_ROLE_INFERRED` 分支自动覆盖其归一化消息，避免双码同义。
2. §3 A3 未对被豁免的右边发 info 条目：每页页标题都命中会产出恒定 per-page 噪音，与 C1 降噪目标冲突；豁免规则改为写入两侧 authoring 文档。
```

- [ ] **Step 6: 分仓库提交**

```bash
cd /d/AI/html-indesign && git add test/fixtures/fixed-html/friction-0819-deck.html test/html-to-indesign/authoring-friction-regression.test.js docs/规范/AGENT_HTML_AUTHORING_GUIDE.md && git commit -m "test: 0819 摩擦模式综合回归基准 + 文档同步归一化口径

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

```bash
cd /d/AI/mcp-indesign && git add skills/indesign-cli/references/html-authoring.md docs/AI协作/反馈循环/README.md docs/superpowers/specs/2026-08-19-authoring-friction-fix-design.md && git commit -m "docs: 同步创作写法归一化口径、双脚本对照与遥测口径切换点

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 批 5 · 真实数据 E2E 反馈修复（2026-08-20 追加）

**背景**：用 0819 真实作者包做「反修复」E2E（现场在 html 仓库 `test/workspace/e2e-0819-real-deck/`）：A1/A2/C1/B4 全部兑现（A1 逐条同位置比对 19/20 + 1 并流；A2 精确 4 条物化；warningCount 53→0 / normalizedCount 44；归档修剪 3 份实测），**但 A3 在真实包上零触发**，反修复后 15 条 GRID_ALIGNMENT_OFF。

### Task 11: A3 真实缺口修复 + E2E 抛光

**根因与修法**：
1. `hasDeclaredWidth` 读 `item.cssVars['--grid-span']`，而 CSS 自定义属性会继承——`.page-head` 声明的值被 h2 继承导致误判。修：捕获层 `cssVarsFor()` 只保留元素自有声明（computed 值与父元素相同即视为继承、丢弃）。
2. A1 提升的页眉徽标（flex space-between 子项）left/top 天然不落网格线。修：捕获层新增 `inFlexFlow` 事实（父元素 display 含 flex 且自身 position 为 static/relative），`shouldCheckGrid` 对「text 角色 + inFlexFlow + 无声明宽度」整体豁免（flex 排布的文本家具作者无法对齐网格）。既有 folio 用例（合成 item 无 inFlexFlow）不受影响。

**抛光三项**（E2E 发现）：`scripts/lint-authoring.js` 人读输出补 `Normalized:` 行并区分前缀（原先 `Warnings: 0` 下面跟 75 行 `[warning]` 自相矛盾）；`authoring-lint.js`/`build-indesign.js` 的 metrics 补 `normalized_count`（遥测可见 C1 完整口径）；`SEMANTIC_TOKEN_MISSING` 跳过 `data-pseudo-generated` 物化产物。

**验收**：defixed 副本严格 lint 0 error；`probe-gridonly` 0 error；全量测试绿。已知留档不修：`compatibility.summary` 维持子对象自身口径（level 计数，内部自洽）；failed 归档时间戳维持 UTC（与遥测 ts 同口径）。

**真机验收（设计 §7 验收 5）**：✅ **PASS** 2026-08-20。本机 InDesign 2025 实跑 `html.build_indesign`（probe-spanonly 副本 + 0819 真实构建参数）：一次成功 82 秒，`forward-fidelity-report.json` errors:[]，物化的 01-04 编号成为 4 个独立 TextFrame 逐字回读（回读快照 sourceNode 带 `data-pseudo-generated:"before"`，该字符串在 builtin 旧插件中 grep 为 0——铁证跑的是新代码），裸 span「行业调查」逐字回读，indd/pdf/idml 三产物落盘，metrics 出现 `normalized_count:71`。产物保留在 `test/workspace/e2e-0819-real-deck/build-e2e/deliverables/`。
**过程发现（重要）**：① `indesign-cli plugin install` 是 **cwd 级注册**（不拷文件进 runtime），且发现记录**不向父目录回溯**——子目录构建会静默回落 builtin 旧插件，`plugin list` 只是 source 字段变化、不报错。建议后续在 build 返回里回显生效插件的 source/root。② launcher 会无条件自动升级 runtime 并**删除旧版本目录**（本次 0.5.9→0.5.10，旧版已不可回退）。③ `--pretty` 是全局 flag，必须放在子命令之前。

> ✅ **已完成** 2026-08-20，commit `f858234`（10 文件）。真实包反修复复验 **15→1**：两个根因的 14 条全灭；残余 1 条（p1-el3）经审定为**真阳性保留**——作者同时声明 `--grid-span:8` 与 `max-width:980px` 属矛盾声明，lint 指出它是本职，作者侧正解是 `data-id-grid-ignore` 或消除冲突（验收标准由「0 error」修正为「0 假阳性」）。全量 1249/1249 绿；`authoring-lint-feedback.test.js` 的 grid 事故基线 73→56（掉的 17 条经逐条核对均为 flex 家具噪声，审核通过）。另留档：本机 Node v22 下 `node --test a.js b.js` 只跑第一个文件，多文件验证须逐个跑或走 npm test。

---

## 收尾：与设计 §7 验收标准对照

| 设计验收 | 由谁覆盖 | 形态 |
| --- | --- | --- |
| 1. 0819 失败作者包 lint 0 error | Task 10 fixture（等价重建三类模式；原始失败包已被覆盖不可复原） | 自动化 |
| 2. PS1 在 UNC 中文路径下双 shell 成功 | Task 2 Step 4（含真实 NAS 用例） | 手动冒烟 |
| 3. `--json health` 报错 hint 指路 | Task 1 | 自动化 |
| 4. 失败产出 `*.failed-*.json` 且主报告最新 | Task 8 | 自动化 |
| 5. 物化文本过保真门逐字一致 | Task 7 末尾手动验收（需真机 InDesign） | 手动 |
| 6. 两侧测试套件全绿 | Task 1/5（mcp ≥284）、Task 10 Step 4（html ≥1225+新增） | 自动化 |

**版本与发布**：全部合入后 `html-indesign` 升 0.2.10、按既有流程重打 runtime 并更新四个发布目标（见 memory `runtime-build-inputs`：构建输入只在上次 stage 目录）；`indesign-cli` 侧只有 CLI/PS1/文档改动，随下一次常规发版走。

**风险与回滚**：A1/A2 都是捕获层行为扩张，若线上出现「span 被误提升」或「物化引起布局位移」，回滚单位是 Task 4 / Task 7 各自的单个 commit（互相独立，A2 回滚不需要动 A1）；C1 只改计数口径，回滚 Task 9 commit 即可恢复旧遥测口径。

