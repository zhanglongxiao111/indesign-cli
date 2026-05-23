# InDesign 全覆盖真实 E2E 设计

## 1. 目标

建立一个验收级真实 E2E 测试体系，用真实 Adobe InDesign、真实 `.indd` 文档、真实图片/SVG 置入、真实导出产物，验证当前 CLI-Anything harness 和 MCP 工具链是否足够给 Agent 使用。

本 E2E 的核心不是“做出一个好看的文件”，而是证明：

- 当前所有 CLI/MCP 命令和已存在 handler 能力都被执行验收；隐藏 handler 不能只停留在目录记录。
- 每个命令的输入参数足够、输出信息有效、错误可定位。
- 复杂多步骤任务可以通过 CLI 和脚本传输工具完成。
- 最终文档不是内存假象，可以保存、关闭、重新打开、审计、导出并验证。
- 每次测试产物可追溯、可复查、不进入 git。

当前工具目录基线：

| 来源 | 能力数 | 当前可调用数 | 覆盖要求 |
| ---- | ------ | ------------ | -------- |
| `cli` | 4 | 4 | 必须执行并验收 |
| `script` | 1 | 1 | 必须执行并验收 |
| `advanced` | 6 | 6 | 必须执行并验收 |
| `classic` | 114 | 114 | 必须执行并验收 |
| `hidden_handler` | 21 | 0 | 必须写入覆盖图；full 模式前必须暴露或提供等价 direct 调用入口并验收 |

当前能力目录总数为 146，其中当前直接可调用命令为 125，隐藏 handler 能力为 21。测试运行时必须从实时目录重新计算这些数字，不允许写死。`--full` 的最终通过分母应是能力总数 146；在隐藏 handler 尚未暴露前，只能运行 `--current-callable` 或 `--inventory` 模式，不能宣称全覆盖通过。

当前隐藏 handler 清单：

```text
book.add_document_to_book
book.create_book
book.export_book
book.get_book_info
book.list_books
book.open_book
book.package_book
book.preflight_book
book.print_book
book.repaginate_book
book.set_book_properties
book.synchronize_book
book.update_all_cross_references
book.update_all_numbers
book.update_chapter_and_paragraph_numbers
presentation.add_cover_page
presentation.add_full_bleed_image
presentation.add_image_grid
presentation.add_section_page
presentation.create_presentation_document
presentation.export_presentation_pdf
```

## 2. 非目标

- 不把测试产物提交到 git。
- 不用假 InDesign、mock COM 或纯字符串模拟替代真实应用。
- 不要求每个工具都必须服务于同一个最终演示稿页面。
- 不把隐藏 handler 的 `not_callable` 状态当成 full 覆盖通过；它们必须在实现阶段被暴露为 CLI 可调用能力，或由 runner 提供等价 direct handler 调用入口。
- 不把旧 `tests/index.js` 作为唯一验收入口；它可以继续存在，但真实 E2E 要独立。

## 3. 运行目录

新增忽略目录：

```text
.indesign-e2e-runs/
└── YYYYMMDD-HHMMSS-arch-presentation/
    ├── assets/
    │   ├── photos/
    │   ├── svg/
    │   └── generated/
    ├── scripts/
    ├── outputs/
    ├── reports/
    ├── logs/
    └── manifest.json
```

必须加入 `.gitignore`：

```text
.indesign-e2e-runs/
```

目录职责：

| 路径 | 内容 |
| ---- | ---- |
| `assets/` | 本次下载或生成的图片、SVG、CSV/XML 等素材 |
| `scripts/` | 本次动态生成并执行的 JSX |
| `outputs/` | `.indd`、`.pdf`、`.idml`、导出图片、package 目录 |
| `reports/` | 覆盖报告、验收报告、审计 JSON、失败摘要 |
| `logs/` | 每个 CLI/MCP 调用的 stdout、stderr、耗时、入参摘要 |
| `manifest.json` | 运行参数、开始时间、工具基线、素材来源、最终产物 |

测试不应向 `Documents`、桌面或仓库根目录写 `.indd`。所有保存路径必须是 `outputs/` 下的绝对路径。

## 4. 入口设计

建议新增真实 E2E runner：

```text
tests/real-e2e/
├── README.md
├── run-architecture-presentation.mjs
├── coverage-map.json
├── asset-manifest.json
└── validators/
    ├── audit-document.jsx
    ├── validate-artifacts.mjs
    └── validate-coverage.mjs
```

推荐命令：

```powershell
node tests/real-e2e/run-architecture-presentation.mjs --full
node tests/real-e2e/run-architecture-presentation.mjs --keep-open
node tests/real-e2e/run-architecture-presentation.mjs --offline
node tests/real-e2e/run-architecture-presentation.mjs --tool document.create_document
```

默认行为：

- 新建时间戳运行目录。
- 下载或生成测试素材。
- 从 `cli-anything-indesign tool domains` 和 `tool list --source ...` 获取实时工具目录。
- 对每个当前可调用工具执行 `tool schema`。
- 对每个隐藏 handler 生成或补齐等价 schema，供 full 覆盖调用使用。
- 按 `coverage-map.json` 运行全部工具。
- 保存并关闭最终文档。
- 重新打开最终文档执行审计 JSX。
- 导出 PDF、IDML、图片和 package 产物。
- 写入 `reports/final-report.json` 和 `reports/coverage-report.json`。

当前 CLI 有一个已知目录问题：`tool list --callable-only` 不带 `domain/source` 时返回 domain 摘要，不是工具清单。runner 第一版必须按 source 拉取工具，或先修复该 CLI 行为。

## 5. 真实业务场景

主场景是“建筑设计汇报演示文稿”，目标为 28 页左右。页面结构：

| 页码段 | 内容 | 主要覆盖 |
| ------ | ---- | -------- |
| 1 | 封面 | 文档创建、页面尺寸、母版、标题文本、背景图 |
| 2 | 目录 | 段落样式、字符样式、页码、文本编辑 |
| 3-5 | 项目背景与区位 | 图片置入、SVG 图标、图层、说明文字 |
| 6-8 | 场地分析 | 多图网格、线框、箭头、颜色 swatch |
| 9-11 | 体块生成 | 多边形、矩形、组合、对象样式 |
| 12-14 | 功能分区 | 表格、图例、查找替换、样式套用 |
| 15-17 | 平面与剖面 | SVG/图片置入、适配、对象移动缩放旋转 |
| 18-20 | 立面与材料 | 图片、色板、对象样式、透明度 |
| 21-23 | 日照/视线/流线 | 图层显示隐藏、线框、页面复制移动 |
| 24-25 | 指标与技术说明 | 表格填充、导入数据、文本溢出检查 |
| 26 | 模板槽位页 | advanced 模板扫描、建页、填槽 |
| 27 | 导出检查页 | 链接、标签、对象查询、审计标记 |
| 28 | 总结页 | 最终保存、导出、重开审计 |

辅助场景用于覆盖不适合污染主文档的命令：

- 删除、关闭、清理类命令运行在 scratch 文档。
- open/save/close 类命令运行在 outputs 下的副本文档。
- page/spread/master 删除和移动在临时页面组内执行，再审计结果。
- error handling 使用故意错误入参验证失败 envelope。
- book/presentation hidden handler 先验证目录可见；full 模式必须通过暴露或 direct handler 调用真实执行这些能力。

## 6. 素材策略

`asset-manifest.json` 定义可下载素材：

- 建筑外观照片 4-6 张。
- 城市/场地照片 3-4 张。
- 材料纹理照片 4-6 张。
- 平面/剖面风格 SVG 6-8 个。
- 图标 SVG 10-20 个。
- CSV/XML 数据各 1 份，用于数据导入、表格和 XML 相关命令。

每个远程素材记录：

```json
{
  "id": "facade-01",
  "type": "photo",
  "url": "https://...",
  "license": "public-domain-or-test-allowed",
  "sha256": "optional-first-run-recorded",
  "fallback": "generated/facade-01.svg"
}
```

规则：

- 下载素材只保存到本次 `assets/`。
- 如果网络不可用，`--offline` 使用本地生成 SVG/PNG 占位素材。
- 每个素材都写入 `manifest.json`，包括 URL、文件大小、hash、最终路径。
- 不使用客户项目、客户名称或私有资产路径。

## 7. 覆盖模型

### 7.1 工具目录基线

runner 启动时生成：

```text
reports/tool-catalog.json
reports/tool-catalog-summary.json
```

必须记录：

- `tool_id`
- `source`
- `domain`
- `arg_names`
- `inputSchema`
- `callable`
- `side_effects`
- `needs_indesign`
- `produces_artifacts`

覆盖分母分两层：

```text
ability_total:
  source in ["cli", "script", "advanced", "classic", "hidden_handler"]

current_callable_total:
callable == true
source in ["cli", "script", "advanced", "classic"]
```

`--full` 必须以 `ability_total` 为分母。隐藏 handler 不允许永久停留在 `not_callable`，实现计划必须先完成以下二选一：

```text
方案 A：把 Book / Presentation handler 暴露到 MCP/CLI 工具定义，成为普通 callable tool。
方案 B：在真实 E2E runner 内提供 direct handler adapter，只用于测试，仍执行真实 handler 和 InDesign。
```

推荐方案 A，因为它同时提升 Agent 可用性；方案 B 只适合作为过渡。

### 7.2 覆盖表

`coverage-map.json` 不能只写“跑过”。每个工具必须有：

```json
{
  "tool_id": "graphics.place_image",
  "phase": "main_deck_assets",
  "scenario": "place facade photo and SVG diagram",
  "args_strategy": "asset manifest absolute path + page geometry",
  "expected_result": "success result contains placed path",
  "audit": ["linked_graphic_exists", "bounds_within_page", "file_name_matches_asset"],
  "cleanup": "keep in final deck"
}
```

命令覆盖状态只允许这些值：

| 状态 | 含义 |
| ---- | ---- |
| `passed` | 命令执行成功且验收通过 |
| `failed` | 命令执行或验收失败 |
| `expected_failure_passed` | 错误场景按预期失败 |
| `not_callable` | 只允许出现在 `--inventory` 或 `--current-callable` 报告里；`--full` 出现即失败 |
| `blocked` | 环境缺失，必须带原因和证据 |

不允许无原因 `skipped`。

## 8. 验收模型

验收分五层。

### 8.1 CLI 合同验收

覆盖：

- `--version`
- `server health`
- `server health --deep`
- `tool domains`
- `tool list --source cli/script/advanced/classic/hidden_handler`
- `tool search`
- 每个可调用工具的 `tool schema`
- 每个可调用工具的 `tool call`
- `script run <file>`
- `script run --stdin`
- `export verify`
- `session show`
- `session clear`

验收：

- stdout 是合法 JSON。
- `ok`、`exit_code`、`tool_id`、`domain`、`source` 字段存在。
- 失败时 `error.code` 和 `error.details` 足够定位问题。
- 查询类命令必须返回非空、可机读、含预期标识的信息。

### 8.2 文档状态验收

最终审计 JSX 返回：

```json
{
  "document": {
    "name": "architecture-presentation.indd",
    "pages": 28,
    "spreads": 14,
    "masters": ["A-Cover", "B-Content", "C-Analysis"],
    "layers": ["background", "photos", "diagrams", "text", "annotations"]
  },
  "labels": {
    "required_count": 120,
    "missing": []
  },
  "graphics": {
    "linked_count": 12,
    "svg_count": 8,
    "missing_links": []
  },
  "styles": {
    "paragraph": ["Title", "Subtitle", "Body", "Caption"],
    "character": ["Metric", "Emphasis"],
    "object": ["Image Frame", "Analysis Line", "Callout Box"]
  }
}
```

验收：

- 页数在 24-32，默认目标 28。
- 每页至少有一个测试 label。
- 所有关键页面对象 bounds 在页面内。
- 每个被置入素材都能从文档审计中找到。
- 样式、色板、图层、母版都存在并被至少一次应用。

### 8.3 产物验收

必须生成：

- `outputs/architecture-presentation.indd`
- `outputs/architecture-presentation.pdf`
- `outputs/architecture-presentation.idml`
- `outputs/page-images/`
- `outputs/package/`

验收：

- `.indd` 文件存在且大小大于最小阈值。
- PDF 以 `%PDF` 开头，创建时间晚于运行开始时间。
- IDML 是 zip，包含 `designmap.xml`。
- 导出图片数量符合预期页数或导出配置。
- package 目录包含文档、links 或 fonts 报告。
- 所有产物路径都位于本次运行目录。

### 8.4 重开验收

流程：

1. 保存最终 `.indd`。
2. 关闭文档。
3. 重新打开 `outputs/architecture-presentation.indd`。
4. 执行 `audit-document.jsx`。
5. 对比保存前后的审计摘要。

验收：

- 页数一致。
- 关键 label 数量一致。
- 关键图片链接仍可解析。
- 样式和图层仍存在。

### 8.5 覆盖验收

`reports/coverage-report.json` 在 `--full` 模式必须满足：

```json
{
  "ability_total": 146,
  "current_callable_total": 125,
  "hidden_handler_total": 21,
  "passed": 146,
  "failed": 0,
  "blocked": 0,
  "not_callable": 0
}
```

实际数字以运行时工具目录为准。只要 `failed > 0`、`blocked > 0` 或 `not_callable > 0`，`--full` E2E 失败。

## 9. 场景分组

| 分组 | 作用 | 覆盖域 |
| ---- | ---- | ------ |
| `bootstrap` | 健康检查、目录、schema、session 清理 | cli, server, session |
| `document_setup` | 创建文档、页面尺寸、保存路径 | document |
| `masters_layers` | 母版、图层、跨页 | master, layer, spread |
| `deck_layout` | 28 页演示稿主体 | page, text, graphics, style |
| `data_content` | 表格、CSV/XML、查找替换 | text, document |
| `asset_placement` | 图片、SVG、链接、对象样式 | graphics, style |
| `template_flow` | 高级模板工具 | advanced, template |
| `script_transport` | 文件 JSX、stdin JSX、classic 代码执行 | script |
| `destructive_scratch` | 删除、关闭、清理、移动类工具 | document, page, spread, master, object, book |
| `book_presentation` | 隐藏 handler 暴露后的 book / presentation 场景 | book, presentation |
| `export_package` | PDF、IDML、图片、package | export |
| `audit` | 重开、审计、覆盖报告 | utility, query tools |

## 10. 脚本传输覆盖

必须覆盖三条脚本路径：

| 路径 | 命令 | 验收 |
| ---- | ---- | ---- |
| CLI 文件脚本 | `script run scripts/audit-document.jsx` | 返回结构化 JSON，含页数和 label |
| CLI stdin 脚本 | `script run --stdin` | 执行短脚本，写入并读回测试 label |
| MCP 经典脚本 | `script.execute_indesign_code` | 执行带中文、反斜杠、引号的脚本 |
| 高级脚本文件 | `template.run_jsx_file` | 执行高级后端 run jsx，返回同一审计标记 |

脚本传输专项验收：

- 支持中文字符串。
- 支持 Windows 绝对路径和空格路径。
- 支持反斜杠、引号、换行。
- 错误脚本必须返回失败 envelope，不允许误报成功。
- 大脚本拆分或文件传输策略必须记录在 `logs/script-transport.json`。

## 11. 高级工具覆盖

advanced 工具必须进入主验收，不允许只做 schema 测试。

覆盖要求：

- `template.list_template_blueprints`：列出测试模板目录。
- `template.inspect_template_blueprint`：读取本次生成或内置模板的槽位。
- `template.create_page_with_template`：在第 26 页创建模板页。
- `template.populate_template_slots`：填充标题、指标、图片槽位。
- `template.run_jsx_file`：执行高级后端脚本。
- `page.get_page_information`：对模板页或最终页读取页面信息。

验收：

- 模板页存在。
- 模板槽位 label 存在。
- 填槽后内容可审计。
- 高级工具输出包含有效页面、槽位或执行结果，不接受空字符串。

## 12. 错误和隔离

每次工具调用写一条 JSONL：

```json
{
  "sequence": 42,
  "tool_id": "page.delete_page",
  "phase": "destructive_scratch",
  "args_hash": "sha256:...",
  "started_at": "2026-05-23T...",
  "duration_ms": 1234,
  "ok": true,
  "audit_refs": ["scratch_page_deleted"]
}
```

规则：

- 参数日志不得记录外部私有路径全文，外部路径只记 hash、扩展名和是否存在。
- 失败时保留 stdout/stderr 原文到 `logs/failures/`。
- 如果 InDesign 崩溃或 COM 不响应，runner 写入 `blocked` 并停止后续破坏性步骤。
- 失败时默认保留运行目录；通过时也保留运行目录，方便人工查看。
- `--cleanup` 可删除指定运行目录，但不得删除 `.indd` 所在目录之外的文件。

## 13. 实现阶段

建议分四阶段落地。

### 阶段一：框架、目录和隐藏能力基线

- 加 `.indesign-e2e-runs/` ignore。
- 建 `tests/real-e2e/`。
- 实现运行目录、manifest、日志、工具目录抓取。
- 把 146 个能力全部写入 `tool-catalog.json`，其中 21 个 hidden handler 单独标注。
- 修复或规避 `tool list --callable-only` 全局清单问题。
- 先覆盖 CLI 合同命令和 schema。

验收：能生成完整 `tool-catalog.json` 和空跑 coverage baseline；报告必须显示 `ability_total == current_callable_total + hidden_handler_total`。

### 阶段二：主文档场景

- 生成或下载素材。
- 创建 28 页建筑汇报文稿。
- 覆盖 document/page/spread/master/layer/text/graphics/style 主路径。
- 生成审计 JSX。

验收：`.indd` 保存、关闭、重开、审计通过。

### 阶段三：隐藏 handler 暴露与全工具覆盖

- 先把 21 个 hidden handler 暴露为可调用工具，或建立 direct handler adapter。
- 为每个 hidden handler 补 schema、参数样例、验收逻辑。
- 根据 `coverage-map.json` 补齐全部 146 个能力。
- destructive 工具进入 scratch 文档。
- 查询工具必须验证返回有效信息。
- 错误场景进入 expected failure。

验收：`passed == ability_total`，且 `not_callable == 0`。

### 阶段四：导出和报告

- PDF、IDML、图片、package 全产物导出。
- `export.verify` 验证产物。
- 生成最终 Markdown/JSON 报告。
- 将报告摘要打印到终端。

验收：全量 E2E 单命令通过，报告可读。

## 14. 通过标准

一次全覆盖真实 E2E 通过必须同时满足：

- InDesign 真实启动并执行。
- 运行目录创建成功，所有产物都在 `.indesign-e2e-runs/<run-id>/`。
- 当前全部 146 个能力都有覆盖记录；隐藏 handler 不能只记录目录，必须执行或明确导致 full 失败。
- advanced 工具全部执行并验收。
- 脚本文件、stdin、classic code、高级 JSX 文件四条脚本路径全部通过。
- 最终 `.indd` 可以重开审计。
- PDF、IDML、图片、package 产物验证通过。
- `failed == 0`。
- `blocked == 0`。
- 没有无理由 skip；`not_callable` 只能出现在非 full 模式。

## 15. 风险和处理

| 风险 | 处理 |
| ---- | ---- |
| InDesign 状态受上次运行影响 | 每次先 `session.clear`，再关闭或新建受控文档 |
| 远程素材下载失败 | 支持 `--offline` 生成本地 SVG/PNG 占位素材 |
| 旧工具返回成功但信息无效 | 每个查询工具必须有内容断言和审计交叉验证 |
| 破坏性命令影响主文档 | destructive 工具只在 scratch 文档运行 |
| 工具数量变化 | 运行时重新生成目录，coverage-map 缺项直接失败 |
| 测试耗时长 | 保留 `--tool`、`--phase` 调试入口，但 full 模式必须全覆盖 |
| Windows 路径转义问题 | 所有路径使用绝对路径，并覆盖中文、空格、反斜杠专项脚本 |

## 16. 待实现前置决策

默认决策：

- 全量 E2E 统计全部能力目录，当前基线为 146。
- 隐藏 handler 在 `--inventory` 模式可记录为 `not_callable`，但在 `--full` 模式必须被暴露或 direct 调用并通过验收。
- 主场景默认 28 页。
- 产物保留在 `.indesign-e2e-runs/`，不自动清理。
- 图片和 SVG 首选下载，网络失败时 fallback 到生成素材。
- 覆盖失败时不继续声称文档验收通过。

Book / Presentation handler 已经进入 full 覆盖分母。实现计划必须优先解决它们的调用入口，否则只能跑 current-callable 子集，不能宣称全覆盖。
