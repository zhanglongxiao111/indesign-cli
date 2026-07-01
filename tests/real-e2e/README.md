# InDesign 真实 E2E Runner

本目录用于生成“东岸文化中心更新方案”模拟建筑设计汇报，并验证 CLI 工具目录、schema、素材和覆盖报告结构。

## 当前入口

```powershell
node tests/real-e2e/run-architecture-presentation.mjs --inventory --offline
node tests/real-e2e/run-architecture-presentation.mjs --phase assets --offline
```

`--inventory` 不启动 InDesign，只生成运行目录、实时工具目录、schema 快照、coverage baseline 和报告骨架。

`--phase assets --offline` 只复制素材并校验 `deck-brief.json` 的 28 页页纲是否能解析到素材。

## 运行产物

每次运行会创建：

```text
.indesign-e2e-runs/YYYYMMDD-HHMMSS-arch-presentation/
```

目录中包含 `assets/`、`outputs/`、`scripts/`、`reports/` 和 `logs/`。这些产物不进入 git。

## 后续 full 模式目标

`--full --offline` 后续会在真实 Adobe InDesign 中创建 28 页 `.indd`，导出 PDF/IDML/图片/package，并写入 `coverage-report.json`。

Agent UX hardening smoke:

```powershell
node tests\real-e2e\run-agent-ux-hardening.mjs --offline
```

该 runner 覆盖显式 COM 探针、可省略空参数工具调用、`--args-file`、圆角矩形、JPEG-only 图片导出、PNG 拒绝、JSX wrapper 失败、`tool batch` 失败步骤和 `session doctor`。报告写入 `.indesign-e2e-runs/<run-id>/reports/agent-ux-hardening-report.json`。

## 关键报告

- `reports/tool-catalog.json`：实时 CLI 工具目录。
- `reports/tool-catalog-summary.json`：按 source/domain 统计，当前应为 146 项。
- `reports/coverage-baseline.json`：由实时目录生成的唯一 `tool_id` 覆盖基线。
- `reports/coverage-report.json`：`summary + tools[]` 结构，summary 只由唯一 `tool_id` 计算。
- `reports/asset-report.json`：本次使用的 seed assets 和中文空格路径压力素材。
- `reports/deck-brief-report.json`：28 页模拟建筑汇报页纲摘要。
