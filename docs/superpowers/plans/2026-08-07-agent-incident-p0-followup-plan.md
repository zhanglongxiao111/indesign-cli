# 8/6 事故跟进 P0 批 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修掉 8/6 通宵事故复盘中确认的 5 项 P0 信息可得性缺陷,外加一处本仓库文档事实性更正,让 Agent 不再把工时耗在"命令怎么调、报错怎么修、产物在哪"上。

**Architecture:** 本批不改转换算法和门禁判定,只改三类东西:①脚本入参的路径规范化;②错误与 health 返回体补可执行信息(hint、绝对路径、产物去向);③Skill 文档从"裸命令 + pwsh"改为"绝对路径优先 + powershell.exe"。跨两个仓库:`html-indesign` 负责 lint hint 与产物标注,`mcp-indesign` 负责 PS 脚本、health 与 Skill 文档。

**Tech Stack:** Node.js 20+(CommonJS,`node:test`)、Python 3.10+(pytest)、PowerShell 7、Markdown。

---

## Source Issues

- `zhanglongxiao111/indesign-cli#5` — P0-1 Setup PATH、P0-2 health node 探针、P0-3 Skill 文档命令、P0-4 PS 脚本 UNC。
- `zhanglongxiao111/html-indesign#13` — P0-1 lint hint、P0-2 失败构建产物保留标注。

已确认不在本批(P1/P2 留待后续):摘要输出模式、报告 runId、content-manifest、presentation.html 清理、观察态 lint profile、grid-ignore 文档、EBUSY 处置、assemble-author-package.cjs 用法。

硬前提(已用代码与实测核实,不要在实现时重新推翻):

- `prepare-author-package.ps1:49` 的 `(Resolve-Path).Path` 对 UNC 返回 `Microsoft.PowerShell.Core\FileSystem::\\...`;`.ProviderPath` 与 `Convert-Path` 返回干净 UNC。
- `build-indesign.js` 的 `exportAction` 在 fidelity 通过之后才执行,门禁失败时 INDD/PDF/IDML **从未落盘**,只有中间 JSON 保留在 outDir。本仓库 bugfix 文档"outDir 产物完整"一句需更正。
- `lint.js` 的 `packageFailure` 目前不透传 `hint` 字段,错误对象靠 `{code, message, entryPath}` 展开。
- `health.py:122` 的 `node.available` 只反映 PATH;内嵌 node 在 `<runtime_root>/node/node.exe`,由 `resolve_node_executable` 解析。

## File Structure

**Modify(html-indesign)**

- `src/authoring/lint.js:40-51` — `AUTHOR_GENERATED_ENTRY_DIRTY` 错误补 `hint`,附可复制的组装命令。
- `src/indesign-cli-plugin/tools/build-indesign.js:263-277` — fidelity 失败错误补"产物未导出"的显式说明与中间产物位置。
- `docs/bugfix/2026-08-07-fidelity-gate-strokeweight-and-text-overset.md` — 更正"outDir 产物完整"措辞。
- `test/authoring/authoring-lint.test.js` — 新增 hint 断言。
- `test/indesign-cli-plugin/plugin-tools.test.js` — 新增产物标注断言。

**Modify(mcp-indesign)**

- `skills/indesign-cli/scripts/prepare-author-package.ps1:49` — `.Path` → `.ProviderPath`。
- `agent-harness/cli_anything/indesign/core/health.py:118-147` — `node` 块补 `bundled_node_path` 与 `note`。
- `agent-harness/cli_anything/indesign/agent_bootstrapper.py:197` — registration 补 `launcher_abspath`、`path_effective_in_current_process`。
- `agent-harness/cli_anything/indesign/core/agent_update.py:87-96` — `register_user_command` 返回体扩展。
- `skills/indesign-cli/references/installation-and-update.md` — 填真实 Setup 路径、补"Agent 运行时安装落点"一节。
- `skills/indesign-cli/SKILL.md` + `references/*.md` — 裸命令改绝对路径优先、`pwsh` → `powershell.exe`。
- `agent-harness/cli_anything/indesign/tests/test_health.py`、`tests/test_agent_update.py` — 新增断言。

---

## Task 1: PS 脚本 UNC 入参修复

**Files:**
- Modify: `D:\AI\mcp-indesign\skills\indesign-cli\scripts\prepare-author-package.ps1:49`

- [ ] **Step 1: 先复现畸形路径**

```powershell
$p = "\\daga-nas5\sa-ai-app\tools\indesign-cli"
(Resolve-Path -LiteralPath $p).Path
```

Expected: 输出带 `Microsoft.PowerShell.Core\FileSystem::` 前缀。

- [ ] **Step 2: 改用 ProviderPath**

把第 49 行:

```powershell
    $configPath = (Resolve-Path -LiteralPath $Package).Path
```

改为:

```powershell
    # Resolve-Path 的 .Path 对 UNC 会带 PowerShell provider 前缀，交给 node 会变成畸形路径。
    $configPath = (Resolve-Path -LiteralPath $Package).ProviderPath
```

- [ ] **Step 3: 用 UNC 实跑一次组装**

Run:

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\AI\mcp-indesign\skills\indesign-cli\scripts\prepare-author-package.ps1" -Package "\\daga-nas5\daga-2025-project\CONCEPT\C20260624_北小河\00_agent\re-layout-20260806-v1\deck.config.json"
```

Expected: 不再出现 `AUTHOR_PACKAGE_CONFIG_MISSING`,输出组装结果 JSON。

- [ ] **Step 4: 提交**

```bash
git -C D:/AI/mcp-indesign add skills/indesign-cli/scripts/prepare-author-package.ps1
git -C D:/AI/mcp-indesign commit -m "fix: pass unc author package paths to node"
```

---

## Task 2: lint 的 AUTHOR_GENERATED_ENTRY_DIRTY 补 hint

**Files:**
- Modify: `D:\AI\html-indesign\src\authoring\lint.js:40-51`
- Test: `D:\AI\html-indesign\test\authoring\authoring-lint.test.js`

- [ ] **Step 1: 写失败测试**

在测试文件末尾追加:

```javascript
test('authoring lint gives a runnable hint when the generated entry is stale', async () => {
  const root = makeTempAuthorPackage();
  fs.rmSync(path.join(root, 'deck.html'), { force: true });

  const report = await lintAuthoringPackage({ packagePath: path.join(root, 'deck.config.json'), strict: true });

  assert.equal(report.ok, false);
  const issue = report.errors.find((entry) => entry.code === 'AUTHOR_GENERATED_ENTRY_DIRTY');
  assert.ok(issue, 'expected AUTHOR_GENERATED_ENTRY_DIRTY');
  assert.ok(issue.hint, 'expected a hint');
  assert.match(issue.hint, /assemble-authoring\.js/);
  assert.match(issue.hint, /--package/);
});
```

`makeTempAuthorPackage` 若文件中尚不存在,复用同文件既有的临时作者包构造方式;若既有用例用的是 fixture 路径,则改为复制该 fixture 到 `fs.mkdtempSync` 目录后删除 `deck.html`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /d/AI/html-indesign && node --test test/authoring/authoring-lint.test.js`
Expected: FAIL,`expected a hint`。

- [ ] **Step 3: 实现 hint**

`src/authoring/lint.js` 第 40-51 行改为:

```javascript
  const packageCheck = checkAuthorPackageEntry(packagePath);
  if (!packageCheck.ok) {
    const message = `AUTHOR_GENERATED_ENTRY_DIRTY: ${packageCheck.message}: ${packageCheck.entryPath}`;
    return normalizeLintPayload(packageFailure(sourceFormat, {
      code: 'AUTHOR_GENERATED_ENTRY_DIRTY',
      message,
      entryPath: packageCheck.entryPath,
      // 修法唯一且确定：重跑组装。直接给可复制命令，避免 Agent 在上下文压缩后编造入口。
      hint: '重新组装作者包后再 lint：'
        + '& "<runtime_root>\\node\\node.exe" '
        + '"<runtime_root>\\plugins\\html-indesign\\scripts\\assemble-authoring.js" '
        + `--package "${packagePath}"`,
    }, null, semanticPreset), {
      packagePath,
      htmlPath: packageCheck.entryPath,
    });
  }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /d/AI/html-indesign && node --test test/authoring/authoring-lint.test.js`
Expected: PASS。

- [ ] **Step 5: 全量单测**

Run: `cd /d/AI/html-indesign && npm test`
Expected: 全部通过,无新增失败。

- [ ] **Step 6: 提交**

```bash
git -C D:/AI/html-indesign add src/authoring/lint.js test/authoring/authoring-lint.test.js
git -C D:/AI/html-indesign commit -m "feat: give a runnable hint for stale generated entry"
```

---

## Task 3: fidelity 失败显式标注产物去向

**Files:**
- Modify: `D:\AI\html-indesign\src\indesign-cli-plugin\tools\build-indesign.js:263-277`
- Test: `D:\AI\html-indesign\test\indesign-cli-plugin\plugin-tools.test.js`

事实前提:门禁失败时不导出 INDD/PDF/IDML,不改变这一行为;只把"没有成品、中间产物在哪、能否作者端自修"讲清楚。

- [ ] **Step 1: 写失败测试**

在测试文件末尾追加(沿用该文件既有的 `resume` 调用与 state 构造方式,若既有用例用的是 helper,则复用 helper):

```javascript
test('build_indesign states that a rejected build produced no deliverable', async () => {
  const state = fidelityFailureState();

  const result = await buildIndesign.resume({ state, host_results: [{ status: 'complete', ok: true }] });

  const error = result.error || (result.state && result.state.pendingError);
  assert.equal(error.code, 'FIDELITY_GATE_FAILED');
  assert.equal(error.details.artifactsExported, false);
  assert.match(error.details.artifactNote, /未导出|not exported/);
  assert.equal(typeof error.details.intermediateDir, 'string');
});
```

`fidelityFailureState()` 构造一个 stage 为 `snapshot`、指向必然失败的 expected/actual 组合的 state;若该文件已有构造 build state 的 helper,直接复用并把 snapshot 内容改成与 instructions 不符。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /d/AI/html-indesign && node --test test/indesign-cli-plugin/plugin-tools.test.js`
Expected: FAIL,`artifactsExported` undefined。

- [ ] **Step 3: 实现标注**

`build-indesign.js` 第 263-277 行的 `if (!report.ok)` 块,`details` 扩展为:

```javascript
      details: {
        reportPath: state.fidelityReportPath,
        summary: report.summary,
        firstError: first,
        // 门禁失败不导出成品：文档在 InDesign 中构建过但从未落盘，只保留可离线复查的中间产物。
        artifactsExported: false,
        artifactNote: 'InDesign 文档已构建但未通过核对，未导出 INDD/PDF/IDML；'
          + '可复查的中间产物(instructions、读回快照、保真报告)保留在 intermediateDir。',
        intermediateDir: state.runDir,
      },
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /d/AI/html-indesign && node --test test/indesign-cli-plugin/plugin-tools.test.js`
Expected: PASS。

- [ ] **Step 5: 全量单测**

Run: `cd /d/AI/html-indesign && npm test`
Expected: 全部通过。

- [ ] **Step 6: 提交**

```bash
git -C D:/AI/html-indesign add src/indesign-cli-plugin/tools/build-indesign.js test/indesign-cli-plugin/plugin-tools.test.js
git -C D:/AI/html-indesign commit -m "feat: state that a rejected build exported no deliverable"
```

---

## Task 4: 更正 bugfix 文档的产物措辞

**Files:**
- Modify: `D:\AI\html-indesign\docs\bugfix\2026-08-07-fidelity-gate-strokeweight-and-text-overset.md`

- [ ] **Step 1: 改第 5 行**

把:

```markdown
日期:2026-08-07。来源:内部工位一次 21 页汇报重排版构建连续两次被 `FIDELITY_GATE_FAILED` 拒绝,遥测与 outDir 产物完整,可离线复现。
```

改为:

```markdown
日期:2026-08-07。来源:内部工位一次 21 页汇报重排版构建连续两次被 `FIDELITY_GATE_FAILED` 拒绝。门禁失败不导出成品(INDD/PDF/IDML 从未落盘),但 outDir 保留了 instructions、读回快照与保真报告,足以离线复现。
```

- [ ] **Step 2: 在"关联"一节补一条**

```markdown
- 门禁失败时"无成品但有中间产物"此前只体现在代码里,已在 `build-indesign.js` 的错误 details 显式标注(`artifactsExported`/`intermediateDir`)。
```

- [ ] **Step 3: 提交**

```bash
git -C D:/AI/html-indesign add docs/bugfix/2026-08-07-fidelity-gate-strokeweight-and-text-overset.md
git -C D:/AI/html-indesign commit -m "docs: correct the rejected-build artifact wording"
```

---

## Task 5: health 暴露内嵌 node 绝对路径

**Files:**
- Modify: `D:\AI\mcp-indesign\agent-harness\cli_anything\indesign\core\health.py:118-147`
- Test: `D:\AI\mcp-indesign\agent-harness\cli_anything\indesign\tests\test_health.py`

- [ ] **Step 1: 写失败测试**

```python
def test_health_reports_bundled_node_path(tmp_path, monkeypatch):
    runtime_root = tmp_path / "runtime"
    (runtime_root / "node").mkdir(parents=True)
    node_exe = runtime_root / "node" / "node.exe"
    node_exe.write_text("", encoding="utf-8")
    monkeypatch.setenv("INDESIGN_CLI_RUNTIME_ROOT", str(runtime_root))

    payload = health(tmp_path, deep=False)

    assert payload["node"]["bundled_node_path"] == str(node_exe)
    assert "PATH" in payload["node"]["note"]
```

若测试文件不存在,新建 `tests/test_health.py` 并按同目录其它测试的 import 风格引入 `from ..core.health import health`(以该目录既有测试的实际写法为准)。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /d/AI/mcp-indesign && python -m pytest agent-harness/cli_anything/indesign/tests/test_health.py -q`
Expected: FAIL,KeyError `bundled_node_path`。

- [ ] **Step 3: 实现**

`health.py` 第 122 行改为:

```python
        "node": {
            "available": toolchain["node"]["path"] is not None,
            **toolchain["node"],
            # available 只反映 PATH。CLI 自带便携 node，不依赖 PATH 上的 node。
            "note": "available 仅表示 PATH 上是否有 node；CLI 使用 bundled_node_path，不依赖 PATH。",
            "bundled_node_path": _bundled_node_path(),
        },
```

在 `_runtime_diagnostics` 之后新增:

```python
def _bundled_node_path() -> str | None:
    root_value = os.environ.get("INDESIGN_CLI_RUNTIME_ROOT")
    if not root_value:
        return None
    candidate = Path(root_value).resolve() / "node" / ("node.exe" if os.name == "nt" else "node")
    return str(candidate) if candidate.exists() else None
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /d/AI/mcp-indesign && python -m pytest agent-harness/cli_anything/indesign/tests/test_health.py -q`
Expected: PASS。

- [ ] **Step 5: CLI 全量单测**

Run: `cd /d/AI/mcp-indesign && python -m pytest agent-harness/cli_anything/indesign/tests -q`
Expected: 全部通过。

- [ ] **Step 6: 提交**

```bash
git -C D:/AI/mcp-indesign add agent-harness/cli_anything/indesign/core/health.py agent-harness/cli_anything/indesign/tests/test_health.py
git -C D:/AI/mcp-indesign commit -m "feat: report the bundled node path in health"
```

---

## Task 6: Setup 注册结果承认 PATH 当次不生效

**Files:**
- Modify: `D:\AI\mcp-indesign\agent-harness\cli_anything\indesign\core\agent_update.py:87-96`
- Test: `D:\AI\mcp-indesign\agent-harness\cli_anything\indesign\tests\test_agent_update.py`

- [ ] **Step 1: 写失败测试**

```python
def test_register_user_command_reports_launcher_abspath(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))

    result = register_user_command(tmp_path / "indesign-cli")

    assert result["launcher_abspath"].endswith("indesign-cli-agent.exe")
    assert result["path_effective_in_current_process"] is False
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /d/AI/mcp-indesign && python -m pytest agent-harness/cli_anything/indesign/tests/test_agent_update.py -q`
Expected: FAIL,KeyError `launcher_abspath`。

- [ ] **Step 3: 实现**

`agent_update.py` 的 `register_user_command` 改为:

```python
def register_user_command(root: Path | None = None) -> dict[str, Any]:
    actual_root = root or install_root()
    directory = str(bin_dir(actual_root))
    # 写用户 PATH 只影响后续新进程；调用方所在会话（尤其 Agent 运行时）必须用绝对路径。
    base = {
        "bin": directory,
        "launcher_abspath": str(agent_exe_path(actual_root)),
        "path_effective_in_current_process": False,
    }
    current_user_path = read_user_path()
    new_user_path = updated_user_path(directory, current_path=current_user_path)
    if new_user_path == current_user_path:
        return {"registered": False, **base}
    write_user_path(new_user_path)
    os.environ["PATH"] = updated_user_path(directory, current_path=os.environ.get("PATH", ""))
    return {"registered": True, **base}
```

如果 `agent_exe_path` 的签名不接受 root 参数,以该函数当前定义为准调整调用方式,不要改它的签名。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /d/AI/mcp-indesign && python -m pytest agent-harness/cli_anything/indesign/tests/test_agent_update.py -q`
Expected: PASS。

- [ ] **Step 5: CLI 全量单测**

Run: `cd /d/AI/mcp-indesign && python -m pytest agent-harness/cli_anything/indesign/tests -q`
Expected: 全部通过。

- [ ] **Step 6: 提交**

```bash
git -C D:/AI/mcp-indesign add agent-harness/cli_anything/indesign/core/agent_update.py agent-harness/cli_anything/indesign/tests/test_agent_update.py
git -C D:/AI/mcp-indesign commit -m "feat: report launcher path and path effectiveness on register"
```

---

## Task 7: Skill 文档改绝对路径优先

**Files:**
- Modify: `D:\AI\mcp-indesign\skills\indesign-cli\references\installation-and-update.md`
- Modify: `D:\AI\mcp-indesign\skills\indesign-cli\SKILL.md`
- Modify: `D:\AI\mcp-indesign\skills\indesign-cli\references\*.md`(裸命令与 `pwsh` 出现处)

- [ ] **Step 1: 填掉 Setup 占位符并补运行时落点说明**

`installation-and-update.md` 第 7-9 行改为:

```powershell
& "\\daga-nas5\sa-ai-app\tools\indesign-cli\indesign-cli-agent-setup.exe"
```

并在第 25 行那段之后新增一节:

```markdown
## 在 Agent 运行时里安装

部分 Agent 运行时会把 `HOME` / `LOCALAPPDATA` 重定向到隔离目录,安装落点随之改变,且**注册的用户 PATH 在当次会话不会生效**。表现为 Setup 返回 `registered: true`,但紧接着调用裸命令 `indesign-cli-agent` 报找不到命令。

处理方式:

- 用 Setup 返回体里的 `registration.launcher_abspath` 作为后续所有调用的可执行文件路径。
- 该返回体同时带 `path_effective_in_current_process: false`,表示当次会话不要指望裸命令。
- 需要内嵌 Node 时,用 `server health` 返回的 `node.bundled_node_path`,不要在磁盘上搜。
```

- [ ] **Step 2: 裸命令改绝对路径优先**

对 `SKILL.md` 与 `references/*.md` 中出现的裸 `indesign-cli-agent <子命令>`,统一在该文件首次出现处前面加一段说明:

```markdown
调用 CLI 一律优先使用绝对路径(Setup 返回的 `registration.launcher_abspath`);只有 `Get-Command indesign-cli-agent` 能查到时才可用裸命令。下文示例中的 `<agent-exe>` 代表该绝对路径。
```

并把示例中的裸命令替换为 `& "<agent-exe>" <子命令>`。

- [ ] **Step 3: pwsh 改 powershell.exe**

把全部 `pwsh` 调用改为:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<脚本绝对路径>"
```

- [ ] **Step 4: 补反向导出模式选择表**

在 `references/html-authoring.md` 的"从现有 INDD 重建"一节开头补:

```markdown
| 模式 | 用途 | 必需参数 |
| ---- | ---- | -------- |
| `observation` | 只观察现有版面,不做语义重建;人做的 INDD 首选 | 无 |
| `structured` | 结构化回读并重建白名单语义 | 必须显式传 `semanticPreset` 或 `reconstructionProfile`,否则报 `SEMANTIC_PRESET_LOAD_FAILED` |
```

- [ ] **Step 5: 补三条通用调用规则**

在 `SKILL.md` 通用规则处补:

```markdown
- 复杂参数一律用 `--args-file`;内联 JSON 会被 shell 转义打坏。
- `tool schema <id>` 用位置参数;`tool search` 必须带 `--query`;`tool list` 没有 `--all`。
- CLI 与脚本都用绝对路径调用。
```

- [ ] **Step 6: 核对占位符与自相矛盾表述**

Run:

```bash
grep -rn "pwsh\|<setup-path>" /d/AI/mcp-indesign/skills/indesign-cli/
```

Expected: 无输出。

- [ ] **Step 7: 提交**

```bash
git -C D:/AI/mcp-indesign add skills/indesign-cli
git -C D:/AI/mcp-indesign commit -m "docs: prefer absolute paths in the published skill"
```

---

## Task 8: 发布

前置:Task 1-7 全部完成且两仓库单测全绿。

- [ ] **Step 1: html-indesign 升版打包**

`package.json` 与 `src/indesign-cli-plugin/manifest.json` 同步升到 `0.2.8`,然后:

Run: `cd /d/AI/html-indesign && npm test && npm pack`
Expected: 生成 `sa-html-indesign-0.2.8.tgz`。

- [ ] **Step 2: mcp-indesign 捆绑并升 runtime**

按 `docs/` 既有发布流程把 0.2.8 捆绑进 runtime,版本升到 `0.5.9`,构建成品目录。

- [ ] **Step 3: 内网发布 dry-run**

Run: `cd /d/AI/mcp-indesign && python scripts\publish_agent_runtime.py --release-dir <release-dir> --dry-run`
Expected: 版本、组件、SHA-256 正确。

- [ ] **Step 4: 正式发布**

去掉 `--dry-run` 重跑。
Expected: `ok: true`、`verify.sha256_match: true`、`verify.archive_exists: true`。

- [ ] **Step 5: 发布统一 Skill**

Run: `python "%USERPROFILE%\.codex\skills\sa-aiapp-publish-skill\scripts\publish_gallery_skill.py" --source "D:\AI\mcp-indesign\skills\indesign-cli" --dry-run`
确认后去掉 `--dry-run`。
Expected: `ok: true`、`verify.published_rows: 1`、`verify.skill_md_match: true`。

- [ ] **Step 6: 推送与 GitHub Release**

```bash
git -C D:/AI/html-indesign push origin main
git -C D:/AI/mcp-indesign push origin master
```

再按 v0.5.8 的方式创建 v0.5.9 Release 并上传四个资产。

- [ ] **Step 7: 回复两个 issue**

在 `indesign-cli#5` 与 `html-indesign#13` 下说明本批覆盖了哪些条、剩余 P1/P2 待排期。
