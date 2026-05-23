# InDesign 全覆盖真实 E2E 实施计划

> **给执行 Agent：**按任务逐项执行和勾选。实现时使用 `executing-plans`；本计划是测试体系实施计划，不采用 TDD 红绿循环，不写伪代码。

**目标：**建立一个可重复运行的真实 InDesign E2E 测试体系，制作一份可人工打开核对的模拟建筑设计汇报演示文稿，覆盖当前 CLI 目录中的 146 个可调用能力，并生成可核对的覆盖报告和真实 `.indd` / `.pdf` / `.idml` / package 产物。

**架构：**新增 `tests/real-e2e/` 作为独立真实 E2E runner，所有操作通过 `cli-anything-indesign` 或 `python -m cli_anything.indesign` 调用现有 CLI，再由 CLI 复用 MCP/handler/COM/JSX 链路。runner 负责运行目录、素材、调用日志、覆盖状态、文档审计和产物验收，不在仓库根目录写临时产物。

**技术栈：**Node.js ESM runner、PowerShell/Windows、Adobe InDesign COM、现有 Python CLI harness、ExtendScript/JSX、JSON/JSONL 报告。

---

## 1. 执行边界

- 不改 MCP 工具定义作为本计划的前置条件；当前 CLI 已经有 146 个 `callable` 工具。
- 不使用 mock InDesign；`--full` 必须连接真实 Adobe InDesign。
- 不把 `tool schema` 当作工具执行覆盖；schema 只算合同检查，真正覆盖必须 `tool call` 或专用 CLI 子命令执行。
- 不把 `--version` 计入 146 个工具覆盖分母；它只属于 CLI preflight。
- 覆盖报告必须按唯一 `tool_id` 去重统计，不能按调用次数统计。
- 不把错误场景算失败；预期错误必须记录为 `expected_failure_passed`，并验证 `error.code`。
- 所有测试产物写入 `.indesign-e2e-runs/<run-id>/`，不进入 git。
- 每个工具必须由实时目录生成一条覆盖基线，并在 `coverage-report.json` 中有最终状态；人工策略只写入 `coverage-overrides.json`。

## 2. 文件结构

### 创建

| 文件 | 职责 |
| ---- | ---- |
| `tests/real-e2e/README.md` | 运行方式、环境要求、报告说明 |
| `tests/real-e2e/run-architecture-presentation.mjs` | 真实 E2E 主入口，解析 `--full`、`--inventory`、`--phase`、`--tool`、`--offline`、`--keep-open` |
| `tests/real-e2e/deck-brief.json` | 模拟建筑设计演示文稿的项目设定、28 页页纲、每页必需对象和审计 label |
| `tests/real-e2e/coverage-overrides.json` | 少量人工覆盖策略：fixture、acceptance、cleanup；基础覆盖表由实时目录生成 |
| `tests/real-e2e/asset-manifest.json` | 可下载素材和离线 fallback 素材定义 |
| `tests/real-e2e/seed-assets/` | 预置测试素材：小图、SVG、CSV、XML |
| `tests/real-e2e/lib/run-dir.mjs` | 创建运行目录、manifest、日志路径 |
| `tests/real-e2e/lib/cli.mjs` | 调用 `python -m cli_anything.indesign`，记录 stdout/stderr/duration |
| `tests/real-e2e/lib/catalog.mjs` | 拉取 `tool domains`、按 source 拉取工具、读取每个 schema |
| `tests/real-e2e/lib/assets.mjs` | 下载或生成照片、SVG、CSV、XML 测试素材 |
| `tests/real-e2e/lib/coverage.mjs` | 读取覆盖表、写入覆盖状态、验证缺项 |
| `tests/real-e2e/lib/scenarios.mjs` | 主文档、scratch 文档、book、presentation 场景编排 |
| `tests/real-e2e/lib/artifacts.mjs` | PDF、IDML、图片、package 产物验证 |
| `tests/real-e2e/validators/audit-document.jsx` | 审计文档页数、label、链接、样式、图层、母版 |
| `tests/real-e2e/validators/expected-error.jsx` | 预期错误脚本，用于错误 envelope 验收 |
| `tests/real-e2e/validators/validate-coverage.mjs` | 独立校验 `coverage-report.json` |

### 修改

| 文件 | 修改点 |
| ---- | ------ |
| `.gitignore` | 增加 `.indesign-e2e-runs/` |
| `agent-harness/cli_anything/indesign/tests/TEST.md` | 增加真实 E2E runner 的执行命令和验收范围 |
| `docs/superpowers/specs/2026-05-23-full-coverage-real-e2e-design.md` | 如果执行中发现覆盖口径需要固化，回写长期口径 |

## 3. 当前覆盖分母

运行时必须重新计算，当前基线如下：

| 来源 | 数量 | 要求 |
| ---- | ---- | ---- |
| `cli` | 4 | 执行并验证 JSON envelope |
| `script` | 1 | 文件脚本和 stdin 脚本都要执行 |
| `advanced` | 6 | 真实执行模板/高级脚本流程 |
| `classic` | 114 | 真实执行或预期错误执行 |
| `hidden_handler` | 21 | 通过 CLI direct bridge 真实执行 |
| 合计 | 146 | `--full` 通过时 146 个都有覆盖结果 |

## 4. 场景总览

| 场景 | 目标文档 | 覆盖重点 | 产物/审计 |
| ---- | -------- | -------- | --------- |
| `bootstrap_contract` | 无 | CLI 目录、schema、session、health | `tool-catalog.json`、schema 全量快照 |
| `main_deck_setup` | 主文档 | 创建 28 页建筑汇报文稿、尺寸、保存、基础层级 | `.indd` 初稿、manifest |
| `masters_layers_spreads` | 主文档 | 母版、图层、跨页、页面导航和页面属性 | 审计母版/图层/跨页 |
| `content_text_table` | 主文档 | 文本框、样式、查找替换、表格、故事和章节 | 审计文本、表格、section |
| `data_content` | 主文档 | CSV 指标表、XML 置入、结构化数据页 | 审计表格、XML 标记、数据文本 |
| `asset_graphics` | 主文档 | 图片、SVG、形状、链接、颜色、对象样式 | 审计链接、bounds、swatch |
| `template_flow` | 主文档第 26 页 | 高级模板扫描、建页、填槽、高级 JSX | 审计模板槽位 label |
| `script_transport` | 主文档 | CLI 文件脚本、stdin、classic code、高级 JSX 文件 | 中文/路径/换行转义审计 |
| `presentation_hidden` | presentation scratch 文档 | 6 个 presentation hidden handler | PDF 输出和页面内容审计 |
| `book_hidden` | book scratch 目录 | 15 个 book hidden handler | `.indb`、book info、package/preflight |
| `destructive_scratch` | scratch 文档 | 删除、移动、关闭、清理、分组/解组 | scratch 审计，不污染主文档 |
| `export_package` | 主文档 | PDF、IDML、图片、EPUB/package、产物验证 | PDF/IDML/image/package 报告 |
| `final_audit` | 主文档重开 | 保存、关闭、重开、最终审计、覆盖报告 | `final-report.json` |

### 4.1 模拟建筑设计演示文稿内容

主文档不是命令堆叠容器，而是一份可打开阅读的模拟建筑设计汇报。runner 必须按 `deck-brief.json` 生成以下虚构项目：

| 项目字段 | 内容 |
| -------- | ---- |
| 项目名 | 东岸文化中心更新方案 |
| 项目类型 | 城市滨水文化综合体概念设计 |
| 汇报对象 | 方案评审会 |
| 场地设定 | 架空城市：东岸新区滨水工业遗存片区 |
| 设计主题 | 旧厂房更新、公共文化、滨水慢行、低碳材料 |
| 输出文档 | `outputs/architecture-presentation.indd` |
| PDF 输出 | `outputs/architecture-presentation.pdf` |

人工打开 `.indd` 或 PDF 时，应能看到一份结构完整的建筑设计汇报，而不是随机形状测试页。每页必须有 `script label`，命名规则为 `e2e.deck.page.<页码>.<slug>`。

| 页码 | 页面标题 | 主要内容 | 必须出现的素材 / 对象 / 验收 label |
| ---- | -------- | -------- | ---------------------------------- |
| 1 | 东岸文化中心更新方案 | 封面、项目名、汇报日期、背景图 | 全幅背景图 `asset.hero-waterfront`，标题文本，`e2e.deck.page.01.cover` |
| 2 | 汇报目录 | 章节目录、页码、章节编号 | 自动页码文本框，目录列表，`e2e.deck.page.02.toc` |
| 3 | 城市区位 | 城市位置图、滨水轴线、到达关系 | SVG 区位图 `asset.svg.location-map`，箭头线，`e2e.deck.page.03.location` |
| 4 | 场地现状 | 现状照片网格、旧厂房边界 | 4 张场地照片，图片 caption，`e2e.deck.page.04.site-photos` |
| 5 | 问题诊断 | 交通割裂、公共空间不足、界面消极 | 三个诊断卡片、警示色 swatch，`e2e.deck.page.05.issues` |
| 6 | 设计目标 | 文化客厅、滨水廊道、工业记忆 | 三个目标图标 SVG，段落样式，`e2e.deck.page.06.goals` |
| 7 | 总体策略 | 保留、缝合、激活三步策略 | 三段流程箭头，编号样式，`e2e.deck.page.07.strategy` |
| 8 | 体块生成 01 | 原始厂房体量和保留边界 | 多个矩形/多边形，图层 `diagrams`，`e2e.deck.page.08.massing-a` |
| 9 | 体块生成 02 | 新增公共体量和退台 | 复制体块、透明度、对象样式，`e2e.deck.page.09.massing-b` |
| 10 | 体块生成 03 | 连廊、入口雨棚、观景平台 | 多边形、线框、标注，`e2e.deck.page.10.massing-c` |
| 11 | 总平面 | 总平面 SVG、功能色块、出入口 | SVG 总平面 `asset.svg.masterplan`，色板应用，`e2e.deck.page.11.masterplan` |
| 12 | 功能分区 | 展览、剧场、教育、商业、公共服务 | 功能表格，CSV 指标数据，`e2e.deck.page.12.program` |
| 13 | 首层平面 | 首层开放界面、入口大厅、共享中庭 | 平面 SVG `asset.svg.floor-01`，图例，`e2e.deck.page.13.floor-01` |
| 14 | 二层平面 | 空中连廊、展厅、屋顶花园 | 平面 SVG `asset.svg.floor-02`，图例，`e2e.deck.page.14.floor-02` |
| 15 | 剖面关系 | 老厂房、新体量、滨水平台剖面 | 剖面 SVG `asset.svg.section`，标高文本，`e2e.deck.page.15.section` |
| 16 | 立面策略 | 保留砖墙、新增玻璃盒子、夜景界面 | 立面图/照片混排，透明叠加，`e2e.deck.page.16.facade` |
| 17 | 公共流线 | 市民、游客、后勤三类流线 | 三色路径线、箭头、图例，`e2e.deck.page.17.circulation` |
| 18 | 景观系统 | 滨水步道、雨水花园、活动草坪 | 景观 SVG、绿色 swatch，`e2e.deck.page.18.landscape` |
| 19 | 日照与遮阳 | 夏季遮阳、冬季采光、平台阴影 | 太阳路径 SVG、半透明阴影形状，`e2e.deck.page.19.sun` |
| 20 | 视线分析 | 城市视廊、滨水观景点、入口可见性 | 视线线框、编号点位，`e2e.deck.page.20.views` |
| 21 | 材料策略 | 旧砖、新钢、低铁玻璃、再生木 | 材料纹理 4 张、材料表格，`e2e.deck.page.21.materials` |
| 22 | 结构与更新 | 保留结构、新增钢结构、加固节点 | 节点 SVG、说明文字，`e2e.deck.page.22.structure` |
| 23 | 低碳策略 | 再利用、光伏、雨洪、自然通风 | 指标卡片、图标、数值强调字符样式，`e2e.deck.page.23.sustainability` |
| 24 | 技术指标 | 用地、建筑面积、容积率、绿地率 | CSV 生成指标表，`e2e.deck.page.24.metrics` |
| 25 | 实施分期 | 近期开放、中期更新、远期联动 | 三阶段时间轴，`e2e.deck.page.25.phasing` |
| 26 | 模板槽位页 | 使用高级模板生成的汇报页 | 模板槽位 title/metric/image 全部填充，`e2e.deck.page.26.template` |
| 27 | 导出检查页 | 链接、样式、图层、对象清单摘要 | 自动审计摘要文本，`e2e.deck.page.27.audit-summary` |
| 28 | 结论 | 三条设计价值、结束语、项目标识 | 结论卡片、最终背景图，`e2e.deck.page.28.closing` |

### 4.2 演示文稿验收标准

- PDF 前 3 页人工预览时必须能识别项目名、目录和区位关系。
- 第 11-15 页必须能看出总平面、功能分区、平面和剖面关系。
- 第 21-24 页必须包含材料纹理和技术指标表，不允许只有占位文字。
- 第 26 页必须来自高级模板流程，不允许手工拼一个普通页面冒充。
- 第 27 页必须由审计结果生成摘要，包括页数、链接数、样式数、图层数。
- 每页至少一个可审计 label；关键图像、SVG、表格、样式、色板必须有独立 label。
- `final-report.md` 必须列出 28 页页纲完成情况，标明每页 `passed/failed`。

## 5. 命令覆盖矩阵

### 5.0 CLI Preflight（不计入 146 工具分母）

| 命令 | 场景 | 验收 |
| ---- | ---- | ---- |
| `--version` | `bootstrap_contract` | 返回 JSON，`data.name == cli-anything-indesign` |

### 5.1 CLI / Server / Session / Utility

| 命令 | 场景 | 验收 |
| ---- | ---- | ---- |
| `server.health` | `bootstrap_contract` | 基础项目文件存在；`--deep` 记录 `winax` 检查结果 |
| `session.clear` | `bootstrap_contract` | 返回 `cleared: true`，后续 session 为空 |
| `session.show` | `bootstrap_contract` | compact 输出包含 recent calls，不包含完整 args |
| `utility.help` | `bootstrap_contract` | 返回可机读帮助信息或非空帮助文本 |

### 5.2 Script

| 命令 | 场景 | 验收 |
| ---- | ---- | ---- |
| `script.run` | `script_transport` | 文件 JSX 和 stdin JSX 都执行；写入并读回中文 label |
| `script.execute_indesign_code` | `script_transport` | 执行含中文、空格路径、反斜杠、引号、换行的代码，返回结构化标记 |

### 5.3 Document

| 命令 | 场景 | 验收 |
| ---- | ---- | ---- |
| `document.create_document` | `main_deck_setup` | 创建 28 页或初始文档，页面尺寸正确 |
| `document.get_document_info` | `main_deck_setup` | 返回页数、名称、尺寸等非空信息 |
| `document.open_document` | `final_audit` | 重新打开 `outputs/architecture-presentation.indd` |
| `document.save_document` | `main_deck_setup` / `final_audit` | 文件存在，大小大于阈值 |
| `document.close_document` | `final_audit` / `destructive_scratch` | 文档关闭后可重新打开 |
| `document.get_document_elements` | `final_audit` | 返回页面对象统计，数量大于 0 |
| `document.get_document_styles` | `content_text_table` | 返回段落/字符/对象样式，含测试样式 |
| `document.get_document_colors` | `asset_graphics` | 返回测试 swatch |
| `document.get_document_preferences` | `main_deck_setup` | 返回页面尺寸、对页等偏好 |
| `document.set_document_preferences` | `main_deck_setup` | 设置后再次读取一致 |
| `document.get_document_stories` | `content_text_table` | 返回故事列表，含正文文本 |
| `document.get_document_layers` | `masters_layers_spreads` | 返回 `background/photos/diagrams/text/annotations` |
| `document.organize_document_layers` | `masters_layers_spreads` | 图层顺序和可见性符合预期 |
| `document.get_document_hyperlinks` | `content_text_table` | 返回测试超链接 |
| `document.create_document_hyperlink` | `content_text_table` | 创建链接后可查询到 URL/目标 |
| `document.get_document_sections` | `content_text_table` | 返回章节列表 |
| `document.create_document_section` | `content_text_table` | 创建章节后页码/section 可审计 |
| `document.get_document_grid_settings` | `masters_layers_spreads` | 返回网格设置 |
| `document.set_document_grid_settings` | `masters_layers_spreads` | 设置后再次读取一致 |
| `document.get_document_layout_preferences` | `main_deck_setup` | 返回布局偏好 |
| `document.set_document_layout_preferences` | `main_deck_setup` | 设置后再次读取一致 |
| `document.view_document` | `main_deck_setup` | 返回视图操作结果，不要求人工交互 |
| `document.get_session_info` | `bootstrap_contract` | 返回 MCP/handler session 信息 |
| `document.clear_session` | `bootstrap_contract` | 清理后 session 信息为空或重置 |
| `document.list_master_spreads` | `masters_layers_spreads` | 返回测试母版清单 |

### 5.4 Page

| 命令 | 场景 | 验收 |
| ---- | ---- | ---- |
| `page.get_page_information` | `template_flow` | 返回模板页或最终页信息 |
| `page.add_page` | `main_deck_setup` | 页数增加，label 写入新页 |
| `page.delete_page` | `destructive_scratch` | scratch 页被删除，主文档不受影响 |
| `page.duplicate_page` | `destructive_scratch` | scratch 页复制后内容 label 一致 |
| `page.navigate_to_page` | `main_deck_setup` | 当前页切换到目标页 |
| `page.get_page_info` | `main_deck_setup` | 返回目标页尺寸和对象统计 |
| `page.move_page` | `destructive_scratch` | 页面顺序变化可审计 |
| `page.set_page_properties` | `main_deck_setup` | 页面名称/属性设置后可读取 |
| `page.adjust_page_layout` | `main_deck_setup` | 页面布局调整后 bounds 仍在页内 |
| `page.resize_page` | `destructive_scratch` | scratch 页面尺寸变化可读取 |
| `page.place_file_on_page` | `asset_graphics` | SVG/图片文件置入指定页 |
| `page.place_xml_on_page` | `data_content` | XML 数据置入或返回预期可定位结果 |
| `page.snapshot_page_layout` | `destructive_scratch` | 快照创建并可列出/删除 |
| `page.delete_page_layout_snapshot` | `destructive_scratch` | 指定快照删除 |
| `page.delete_all_page_layout_snapshots` | `destructive_scratch` | 快照清空 |
| `page.reframe_page` | `destructive_scratch` | scratch 页重构后对象仍可审计 |
| `page.create_page_guides` | `masters_layers_spreads` | guide 数量增加 |
| `page.select_page` | `main_deck_setup` | 返回选中页信息 |
| `page.get_page_content_summary` | `final_audit` | 返回文本/图像/对象摘要 |
| `page.set_page_background` | `asset_graphics` | 背景色或背景对象可审计 |
| `page.zoom_to_page` | `main_deck_setup` | 返回成功，不触发交互阻塞 |
| `page.get_page_item_info` | `asset_graphics` | 返回指定 item 的 bounds/label |
| `page.select_page_item` | `asset_graphics` | 选择指定 item 成功 |
| `page.move_page_item` | `asset_graphics` | bounds 变化符合预期 |
| `page.resize_page_item` | `asset_graphics` | 尺寸变化符合预期 |
| `page.set_page_item_properties` | `asset_graphics` | label/透明度/描边等属性可读取 |
| `page.duplicate_page_item` | `asset_graphics` | 新 item 存在且 label 可区分 |
| `page.delete_page_item` | `destructive_scratch` | scratch item 删除后不存在 |
| `page.get_page_item_script_labels` | `asset_graphics` | 返回 label 列表，含测试 label |
| `page.set_page_item_script_label` | `asset_graphics` | 设置后审计能找到 label |
| `page.list_page_items` | `final_audit` | 返回当前页 item 列表 |
| `page.add_item_to_group` | `destructive_scratch` | item 加入 group |
| `page.remove_item_from_group` | `destructive_scratch` | item 从 group 移除 |
| `page.list_groups` | `destructive_scratch` | 返回 group 清单 |

### 5.5 Spread / Master / Layer

| 命令 | 场景 | 验收 |
| ---- | ---- | ---- |
| `spread.list_spreads` | `masters_layers_spreads` | 返回跨页列表 |
| `spread.get_spread_info` | `masters_layers_spreads` | 返回目标 spread 信息 |
| `spread.duplicate_spread` | `destructive_scratch` | scratch spread 复制成功 |
| `spread.move_spread` | `destructive_scratch` | scratch spread 顺序变化 |
| `spread.delete_spread` | `destructive_scratch` | scratch spread 删除成功 |
| `spread.set_spread_properties` | `masters_layers_spreads` | 属性设置后可读取 |
| `spread.create_spread_guides` | `masters_layers_spreads` | guide 数量增加 |
| `spread.place_file_on_spread` | `asset_graphics` | 文件置入 spread 并可审计 |
| `spread.select_spread` | `masters_layers_spreads` | 返回选中 spread |
| `spread.get_spread_content_summary` | `final_audit` | 返回 spread 内容摘要 |
| `master.create_master_spread` | `masters_layers_spreads` | 创建 `A-Cover/B-Content/C-Analysis` |
| `master.delete_master_spread` | `destructive_scratch` | scratch 母版删除 |
| `master.duplicate_master_spread` | `masters_layers_spreads` | 母版复制后可列出 |
| `master.apply_master_spread` | `masters_layers_spreads` | 页面应用母版后可审计 |
| `master.create_master_text_frame` | `masters_layers_spreads` | 母版文本框存在 |
| `master.create_master_rectangle` | `masters_layers_spreads` | 母版矩形存在 |
| `master.create_master_guides` | `masters_layers_spreads` | 母版 guide 存在 |
| `master.get_master_spread_info` | `masters_layers_spreads` | 返回母版详情 |
| `master.detach_master_items` | `destructive_scratch` | scratch 页释放母版对象 |
| `master.remove_master_override` | `destructive_scratch` | scratch override 移除 |
| `layer.create_layer` | `masters_layers_spreads` | 创建测试图层 |
| `layer.set_active_layer` | `masters_layers_spreads` | 激活指定图层 |
| `layer.list_layers` | `masters_layers_spreads` | 返回图层清单 |

### 5.6 Text / Style / Graphics / Object

| 命令 | 场景 | 验收 |
| ---- | ---- | ---- |
| `text.create_text_frame` | `content_text_table` | 创建带 label 的文本框 |
| `text.edit_text_frame` | `content_text_table` | 修改内容后可读回 |
| `text.find_replace_text` | `content_text_table` | 替换计数大于 0 |
| `text.create_table` | `data_content` | 表格存在，行列数符合预期 |
| `text.populate_table` | `data_content` | 表格内容写入并可审计 |
| `text.find_text_in_document` | `content_text_table` | 查找返回目标文本 |
| `style.create_object_style` | `asset_graphics` | 对象样式创建成功 |
| `style.list_object_styles` | `asset_graphics` | 返回对象样式清单 |
| `style.apply_object_style` | `asset_graphics` | 指定对象应用样式 |
| `style.create_paragraph_style` | `content_text_table` | 段落样式创建成功 |
| `style.create_character_style` | `content_text_table` | 字符样式创建成功 |
| `style.apply_paragraph_style` | `content_text_table` | 文本应用段落样式 |
| `style.apply_character_style` | `content_text_table` | 文本应用字符样式 |
| `style.list_styles` | `content_text_table` | 返回段落/字符样式 |
| `style.create_color_swatch` | `asset_graphics` | 色板创建成功 |
| `style.list_color_swatches` | `asset_graphics` | 返回色板清单 |
| `style.apply_color` | `asset_graphics` | 对象填充/描边颜色正确 |
| `graphics.place_image` | `asset_graphics` | 真实图片置入，链接存在 |
| `graphics.create_rectangle` | `asset_graphics` | 矩形 bounds 正确 |
| `graphics.create_ellipse` | `asset_graphics` | 椭圆 bounds 正确 |
| `graphics.create_polygon` | `asset_graphics` | 多边形存在 |
| `graphics.get_image_info` | `asset_graphics` | 返回图片路径、尺寸或链接信息 |
| `object.create_group` | `destructive_scratch` | group 创建成功 |
| `object.create_group_from_items` | `destructive_scratch` | 多 item 成组 |
| `object.ungroup` | `destructive_scratch` | group 解散后 item 仍存在 |
| `object.get_group_info` | `destructive_scratch` | 返回 group item 数量 |
| `object.set_group_properties` | `destructive_scratch` | group 属性设置后可读取 |

### 5.7 Template / Advanced

| 命令 | 场景 | 验收 |
| ---- | ---- | ---- |
| `template.list_template_blueprints` | `template_flow` | 返回测试模板或内置模板清单 |
| `template.inspect_template_blueprint` | `template_flow` | 返回槽位清单 |
| `template.create_page_with_template` | `template_flow` | 第 26 页创建模板页 |
| `template.populate_template_slots` | `template_flow` | 标题、指标、图片槽位填充成功 |
| `template.run_jsx_file` | `script_transport` | 执行高级 JSX 文件，返回审计标记 |

### 5.8 Export

| 命令 | 场景 | 验收 |
| ---- | ---- | ---- |
| `export.export_pdf` | `export_package` | PDF 存在，以 `%PDF` 开头 |
| `export.export_images` | `export_package` | 图片导出目录存在，图片数量符合配置 |
| `export.export_epub` | `export_package` | EPUB 文件存在，或记录明确预期环境限制 |
| `export.package_document` | `export_package` | package 目录含文档、Links 或报告 |
| `export.verify` | `export_package` | 对 PDF/IDML 产物二次验证通过 |

### 5.9 Presentation Hidden Handler

| 命令 | 场景 | 验收 |
| ---- | ---- | ---- |
| `presentation.create_presentation_document` | `presentation_hidden` | 创建 presentation scratch 文档，尺寸/页数正确 |
| `presentation.add_cover_page` | `presentation_hidden` | 封面标题和背景对象存在 |
| `presentation.add_section_page` | `presentation_hidden` | 章节页标题存在 |
| `presentation.add_full_bleed_image` | `presentation_hidden` | 图片铺满页，链接存在 |
| `presentation.add_image_grid` | `presentation_hidden` | 多图网格对象数量符合输入 |
| `presentation.export_presentation_pdf` | `presentation_hidden` | PDF 输出存在并通过 `export.verify` |

### 5.10 Book Hidden Handler

| 命令 | 场景 | 验收 |
| ---- | ---- | ---- |
| `book.create_book` | `book_hidden` | `.indb` 文件创建在 `outputs/book/` |
| `book.open_book` | `book_hidden` | 打开 book 后返回成功信息 |
| `book.add_document_to_book` | `book_hidden` | 加入至少两个 scratch `.indd` |
| `book.get_book_info` | `book_hidden` | 返回文档数量、book 名称、状态 |
| `book.list_books` | `book_hidden` | 返回当前打开 book 清单 |
| `book.synchronize_book` | `book_hidden` | 同步命令执行成功或返回可定位预期限制 |
| `book.repaginate_book` | `book_hidden` | 页码重排执行成功 |
| `book.update_all_cross_references` | `book_hidden` | 无交叉引用时也返回可定位结果 |
| `book.update_all_numbers` | `book_hidden` | 编号更新执行成功 |
| `book.update_chapter_and_paragraph_numbers` | `book_hidden` | 章节/段落编号更新执行成功 |
| `book.set_book_properties` | `book_hidden` | 设置自动页码等属性后 `get_book_info` 可读 |
| `book.preflight_book` | `book_hidden` | 预检报告输出到 `outputs/book/preflight/` |
| `book.export_book` | `book_hidden` | book PDF 输出存在 |
| `book.package_book` | `book_hidden` | book package 目录存在 |
| `book.print_book` | `book_hidden` | 默认不实际发送打印；使用无交互/预期错误策略验证参数和错误 envelope |

## 6. 实施任务

### Task 1：建立真实 E2E 骨架、运行目录和状态恢复

**文件：**
- 创建：`tests/real-e2e/README.md`
- 创建：`tests/real-e2e/run-architecture-presentation.mjs`
- 创建：`tests/real-e2e/lib/run-dir.mjs`
- 创建：`tests/real-e2e/lib/cli.mjs`
- 修改：`.gitignore`

- [ ] 增加 `.indesign-e2e-runs/` 到 `.gitignore`。
- [ ] runner 支持 `--inventory`、`--full`、`--phase <name>`、`--tool <tool_id>`、`--offline`、`--keep-open`、`--run-id <id>`、`--resume-from <phase>`。
- [ ] 每次运行创建 `.indesign-e2e-runs/YYYYMMDD-HHMMSS-arch-presentation/`，包含 `assets/`、`scripts/`、`outputs/`、`reports/`、`logs/`。
- [ ] 在运行目录内额外创建路径压力目录：`assets/路径 测试/`、`outputs/路径 测试/book docs/`、`outputs/路径 测试/package out/`，用于中文、空格和反斜杠路径参数覆盖。
- [ ] 写入 `manifest.json`，记录开始时间、命令参数、仓库路径、Node/Python 版本。
- [ ] 写入 `phase-checkpoint.json`，每个 phase 结束记录 `phase`、`status`、`open_documents_expected`、`main_document_path`、`scratch_paths`、`next_phase`。
- [ ] 所有 CLI 调用写入 `logs/calls.jsonl`，字段包含 `sequence`、`tool_id`、`source`、`backend`、`command`、`args_digest`、`duration_ms`、`ok`、`stdout_path`、`stderr_path`。
- [ ] hidden handler 调用的 `backend` 必须记录为 `hidden_handler_bridge`。
- [ ] 每个 phase 结束强制执行状态检查：只允许主文档和当前 phase 声明的 scratch 文档保持打开；异常时关闭 scratch 文档、book、presentation，并重新打开主文档验证状态。
- [ ] 验证命令：`node tests/real-e2e/run-architecture-presentation.mjs --inventory --offline`。
- [ ] 验收：运行目录创建成功，`manifest.json`、`phase-checkpoint.json` 和 `logs/calls.jsonl` 存在，不启动 InDesign。
- [ ] 提交：`test: scaffold real indesign e2e runner`。

### Task 2：工具目录、schema 和覆盖基线

**文件：**
- 创建：`tests/real-e2e/lib/catalog.mjs`
- 创建：`tests/real-e2e/lib/coverage.mjs`
- 创建：`tests/real-e2e/coverage-overrides.json`
- 创建：`tests/real-e2e/validators/validate-coverage.mjs`

- [ ] runner 执行 CLI preflight：`--version`，但不写入 146 工具覆盖分母。
- [ ] runner 调用 `tool domains`。
- [ ] runner 分别调用 `tool list --source cli`、`script`、`advanced`、`classic`、`hidden_handler`。
- [ ] runner 对 146 个 `callable` 工具逐个调用 `tool schema <tool_id>`。
- [ ] runner 执行 `session.show` 并验证 compact recent calls 结构。
- [ ] runner 执行 `utility.help` 并验证返回非空帮助信息。
- [ ] 写入 `reports/tool-catalog.json`，包含 `tool_id`、`source`、`domain`、`arg_names`、`schema`、`callable`、`side_effects`、`needs_indesign`、`produces_artifacts`。
- [ ] 写入 `reports/tool-catalog-summary.json`，当前应显示 `total=146`、`hidden_handler=21`。
- [ ] 自动从实时目录生成 `reports/coverage-baseline.json`，包含 146 个唯一 `tool_id`；`coverage-overrides.json` 只保存少量人工策略，不复制完整目录。
- [ ] `coverage-overrides.json` 中的 tool id 必须全部存在于实时目录；实时目录中任何 tool 没有默认策略或 override 时，`--full` 直接失败。
- [ ] 验证命令：`node tests/real-e2e/run-architecture-presentation.mjs --inventory --offline`。
- [ ] 验收：`tool-catalog.json` 有 146 项，`coverage-baseline.json` 和实时目录完全一致。
- [ ] 提交：`test: capture full cli tool catalog for e2e`。

### Task 3：素材下载和离线素材生成

**文件：**
- 创建：`tests/real-e2e/deck-brief.json`
- 创建：`tests/real-e2e/asset-manifest.json`
- 使用：`tests/real-e2e/seed-assets/`
- 创建：`tests/real-e2e/lib/assets.mjs`

- [ ] 将 28 页页纲写入 `deck-brief.json`，字段包含 `page`、`title`、`section`、`required_assets`、`required_labels`、`audit_expectations`。
- [ ] 定义建筑外观、城市区位、材料纹理、平面/剖面 SVG、图标 SVG、CSV、XML 素材，并与 `deck-brief.json` 的每页需求对应。
- [ ] 默认 `--full --offline` 优先复制 `tests/real-e2e/seed-assets/` 到本次运行目录，避免每次联网下载。
- [ ] 新增独立 phase `assets_online_smoke`，只验证在线下载/fallback 链路，不作为默认 full 的网络前置条件。
- [ ] `--offline` 生成本地 SVG/PNG/CSV/XML，占位内容必须可被 InDesign 真实置入或读取。
- [ ] 离线生成素材必须带可读标题或图形语义，例如 `东岸区位图`、`总平面`、`首层平面`、`材料-再生木`，避免人工查看时只有无意义色块。
- [ ] 非 offline 模式先下载素材，失败时使用 fallback。
- [ ] 素材全部写入本次 `assets/`，记录 `id`、`type`、`path`、`size`、`sha256`、`source`。
- [ ] 至少复制一份图片到 `assets/路径 测试/滨水 图片.jpg`，供 `graphics.place_image` 路径转义测试。
- [ ] 至少复制 XML 到 `assets/路径 测试/site data 中文.xml`，供 `page.place_xml_on_page` 路径转义测试。
- [ ] 验证命令：`node tests/real-e2e/run-architecture-presentation.mjs --phase assets --offline`。
- [ ] 验收：`assets/` 至少包含 6 张图片、8 个 SVG、1 个 CSV、1 个 XML；`deck-brief.json` 的 28 页都能解析到素材或明确不需要素材；`manifest.json` 记录完整。
- [ ] 提交：`test: add e2e asset manifest and offline assets`。

### Task 4：文档审计 JSX

**文件：**
- 创建：`tests/real-e2e/validators/audit-document.jsx`
- 创建：`tests/real-e2e/validators/expected-error.jsx`

- [ ] `audit-document.jsx` 返回 JSON 字符串，包含 document、pages、spreads、masters、layers、labels、graphics、styles、bounds_violations。
- [ ] 审计每页至少一个测试 label。
- [ ] 审计所有测试素材链接和 SVG 置入对象。
- [ ] 审计样式、色板、图层、母版是否存在并被使用。
- [ ] `expected-error.jsx` 故意抛错，用于验证失败 envelope。
- [ ] 验证命令：通过 `script.run --stdin` 创建临时文档后执行 `script.run validators/audit-document.jsx`。
- [ ] 验收：stdout 是 JSON envelope，`data.parsed.result` 可解析为审计 JSON。
- [ ] 提交：`test: add indesign document audit validators`。

### Task 5：主文档创建、母版、图层、跨页

**文件：**
- 修改：`tests/real-e2e/lib/scenarios.mjs`
- 修改：`tests/real-e2e/coverage-overrides.json`

- [ ] 执行 `session.clear`、`server.health --deep`。
- [ ] 按 `deck-brief.json` 创建 28 页页面骨架，每页写入标题、章节标识和页面级 label。
- [ ] 执行 document 组：`document.create_document`、`document.set_document_preferences`、`document.get_document_preferences`、`document.set_document_layout_preferences`、`document.get_document_layout_preferences`、`document.save_document`、`document.get_document_info`。
- [ ] 执行 layer 组：`layer.create_layer`、`layer.set_active_layer`、`layer.list_layers`。
- [ ] 执行 master 组非破坏性命令：`master.create_master_spread`、`master.duplicate_master_spread`、`master.apply_master_spread`、`master.create_master_text_frame`、`master.create_master_rectangle`、`master.create_master_guides`、`master.get_master_spread_info`。
- [ ] 执行 `document.list_master_spreads`，验证返回刚创建的 `A-Cover/B-Content/C-Analysis`。
- [ ] 执行 spread 组非破坏性命令：`spread.list_spreads`、`spread.get_spread_info`、`spread.set_spread_properties`、`spread.create_spread_guides`、`spread.select_spread`。
- [ ] 执行 page 基础命令：`page.add_page`、`page.navigate_to_page`、`page.get_page_info`、`page.set_page_properties`、`page.adjust_page_layout`、`page.create_page_guides`、`page.select_page`、`page.zoom_to_page`。
- [ ] `page.adjust_page_layout` 后必须审计关键对象 bounds 仍在页面内。
- [ ] 验收：主文档页数为 28；28 个页面标题与 `deck-brief.json` 一致；母版、图层、guide、section label 可审计。
- [ ] 提交：`test: cover document structure e2e commands`。

### Task 6：文本、表格、样式、图形和页面对象

**文件：**
- 修改：`tests/real-e2e/lib/scenarios.mjs`
- 修改：`tests/real-e2e/coverage-overrides.json`

- [ ] 执行 text 组全部命令：`text.create_text_frame`、`text.edit_text_frame`、`text.find_replace_text`、`text.create_table`、`text.populate_table`、`text.find_text_in_document`。
- [ ] 执行 style 组全部命令：`style.create_object_style`、`style.list_object_styles`、`style.apply_object_style`、`style.create_paragraph_style`、`style.create_character_style`、`style.apply_paragraph_style`、`style.apply_character_style`、`style.list_styles`、`style.create_color_swatch`、`style.list_color_swatches`、`style.apply_color`。
- [ ] 执行 graphics 组全部命令：`graphics.place_image`、`graphics.create_rectangle`、`graphics.create_ellipse`、`graphics.create_polygon`、`graphics.get_image_info`。
- [ ] `graphics.place_image` 至少一次使用 `assets/路径 测试/滨水 图片.jpg`。
- [ ] 执行 page item 命令：`page.place_file_on_page`、`page.place_xml_on_page`、`page.set_page_background`、`page.get_page_item_info`、`page.select_page_item`、`page.move_page_item`、`page.resize_page_item`、`page.set_page_item_properties`、`page.duplicate_page_item`、`page.get_page_item_script_labels`、`page.set_page_item_script_label`、`page.list_page_items`。
- [ ] `page.place_xml_on_page` 至少一次使用 `assets/路径 测试/site data 中文.xml`。
- [ ] 执行 document 查询命令：`document.get_document_elements`、`document.get_document_styles`、`document.get_document_colors`、`document.get_document_stories`、`document.get_document_layers`、`document.get_document_hyperlinks`、`document.create_document_hyperlink`、`document.get_document_sections`、`document.create_document_section`、`document.get_document_grid_settings`、`document.set_document_grid_settings`、`document.view_document`。
- [ ] 按 `deck-brief.json` 填充第 3-25 页的建筑汇报内容：区位、现状、策略、体块、总平、功能、平面、剖面、立面、流线、景观、日照、视线、材料、结构、低碳、指标和分期。
- [ ] 验收：文字、表格、图片、SVG、样式、色板、链接、label 都能被 `audit-document.jsx` 找到；人工打开 PDF 时第 3-25 页能看出连续的建筑方案叙事。
- [ ] 提交：`test: cover content and asset e2e commands`。

### Task 7：高级模板和脚本传输

**文件：**
- 修改：`tests/real-e2e/lib/scenarios.mjs`
- 修改：`tests/real-e2e/coverage-overrides.json`
- 创建：`tests/real-e2e/scripts/README.md`

- [ ] 执行 `template.list_template_blueprints`。
- [ ] 执行 `template.inspect_template_blueprint`。
- [ ] 执行 `template.create_page_with_template`。
- [ ] 执行 `template.populate_template_slots`。
- [ ] 执行 `template.run_jsx_file`。
- [ ] 执行 `page.get_page_information`。
- [ ] 执行 `script.run <file>`，文件脚本写入中文、空格路径和引号测试 label。
- [ ] 执行 `script.run --stdin`，stdin 脚本读回同一 label。
- [ ] 执行 `script.execute_indesign_code`，覆盖 classic code 传输。
- [ ] 验收：第 26 页模板槽位存在并被填充，内容符合 `deck-brief.json` 的模板槽位页；四条脚本传输路径都返回有效标记。
- [ ] 提交：`test: cover template and script transport e2e`。

### Task 8：Presentation hidden handler 场景

**文件：**
- 修改：`tests/real-e2e/lib/scenarios.mjs`
- 修改：`tests/real-e2e/coverage-overrides.json`

- [ ] 执行 `presentation.create_presentation_document`，创建 scratch presentation 文档。
- [ ] 执行 `presentation.add_cover_page`，使用本次素材背景图。
- [ ] 执行 `presentation.add_section_page`。
- [ ] 执行 `presentation.add_full_bleed_image`。
- [ ] 执行 `presentation.add_image_grid`。
- [ ] 执行 `presentation.export_presentation_pdf`。
- [ ] 执行 `export.verify` 验证 presentation PDF。
- [ ] phase 结束时关闭 presentation scratch 文档，只保留主文档打开；写入 `phase-checkpoint.json`。
- [ ] 验收：presentation 文档中标题、章节、图片、网格对象存在；PDF 输出在 `outputs/presentation/`。
- [ ] 提交：`test: cover presentation hidden handlers e2e`。

### Task 9：Book hidden handler 场景

**文件：**
- 修改：`tests/real-e2e/lib/scenarios.mjs`
- 修改：`tests/real-e2e/coverage-overrides.json`

- [ ] 准备两个 scratch `.indd`，保存到 `outputs/路径 测试/book docs/`，用于覆盖中文和空格路径。
- [ ] 执行 `book.create_book`。
- [ ] 执行 `book.open_book`。
- [ ] 执行 `book.add_document_to_book` 两次，至少一次使用 `outputs/路径 测试/book docs/` 下的文档路径。
- [ ] 执行 `book.get_book_info`，验证文档数量。
- [ ] 执行 `book.list_books`。
- [ ] 执行 `book.set_book_properties`。
- [ ] 执行 `book.synchronize_book`。
- [ ] 执行 `book.repaginate_book`。
- [ ] 执行 `book.update_all_cross_references`。
- [ ] 执行 `book.update_all_numbers`。
- [ ] 执行 `book.update_chapter_and_paragraph_numbers`。
- [ ] 执行 `book.preflight_book`，输出到 `outputs/book/preflight/`。
- [ ] 执行 `book.export_book`，输出 PDF 到 `outputs/book/book.pdf`。
- [ ] 执行 `book.package_book`，输出到 `outputs/book/package/`。
- [ ] 执行 `book.print_book` 的预期错误或无实际打印策略：不得向真实打印机发送作业；必须验证失败 envelope 或使用安全参数返回。
- [ ] phase 结束时关闭所有 book 和 book scratch 文档，重新打开主文档；写入 `phase-checkpoint.json`。
- [ ] 验收：`.indb`、book PDF、package/preflight 产物存在；所有 book 查询返回有效信息。
- [ ] 提交：`test: cover book hidden handlers e2e`。

### Task 10：破坏性命令和对象分组隔离

**文件：**
- 修改：`tests/real-e2e/lib/scenarios.mjs`
- 修改：`tests/real-e2e/coverage-overrides.json`

- [ ] 新建 scratch 文档，专门执行删除、移动、解组、关闭类命令。
- [ ] 执行 page 破坏性命令：`page.delete_page`、`page.duplicate_page`、`page.move_page`、`page.resize_page`、`page.snapshot_page_layout`、`page.delete_page_layout_snapshot`、`page.delete_all_page_layout_snapshots`、`page.reframe_page`、`page.delete_page_item`、`page.add_item_to_group`、`page.remove_item_from_group`、`page.list_groups`。
- [ ] 执行 spread 破坏性命令：`spread.duplicate_spread`、`spread.move_spread`、`spread.delete_spread`、`spread.place_file_on_spread`、`spread.get_spread_content_summary`。
- [ ] 执行 master 破坏性命令：`master.delete_master_spread`、`master.detach_master_items`、`master.remove_master_override`。
- [ ] 执行 object 组全部命令：`object.create_group`、`object.create_group_from_items`、`object.ungroup`、`object.get_group_info`、`object.set_group_properties`。
- [ ] 执行 `document.organize_document_layers`、`document.clear_session`、`document.get_session_info`。
- [ ] phase 结束时关闭 scratch 文档，重新打开主文档并执行一次轻量审计；写入 `phase-checkpoint.json`。
- [ ] 验收：scratch 操作成功，主文档审计前后关键摘要一致。
- [ ] 提交：`test: isolate destructive e2e command coverage`。

### Task 11：导出、package、重开和最终审计

**文件：**
- 创建：`tests/real-e2e/lib/artifacts.mjs`
- 修改：`tests/real-e2e/lib/scenarios.mjs`
- 修改：`tests/real-e2e/coverage-overrides.json`

- [ ] 执行 `export.export_pdf`。
- [ ] 执行 `export.export_images`。
- [ ] 执行 `export.export_epub`。
- [ ] 执行 `export.package_document`。
- [ ] `export.package_document` 至少一次输出到 `outputs/路径 测试/package out/`。
- [ ] 通过 `script.run` 或 `script.execute_indesign_code` 明确导出 `outputs/architecture-presentation.idml`，并记录该调用复用了脚本传输覆盖而不是新增工具分母。
- [ ] 执行 `export.verify` 验证 PDF 和 IDML。
- [ ] 执行 `document.save_document`、`document.close_document`、`document.open_document`。
- [ ] 执行 `audit-document.jsx`，对比保存前和重开后的页数、label 数量、链接数量、样式和图层。
- [ ] 执行 `page.get_page_content_summary`，验证最终审计页摘要包含文本、图像和对象统计。
- [ ] 执行人工可读性抽检：导出前 3 页、11-15 页、21-24 页、26-28 页图片预览，并在 `final-report.md` 记录这些页的页纲验收结果。
- [ ] 验收：`outputs/architecture-presentation.indd`、`.pdf`、`.idml`、`page-images/`、`package/` 全部存在且通过格式检查；PDF 打开后是一份完整的“东岸文化中心更新方案”建筑汇报。
- [ ] 提交：`test: validate exported indesign e2e artifacts`。

### Task 12：覆盖报告、失败报告和总验收

**文件：**
- 修改：`tests/real-e2e/lib/coverage.mjs`
- 修改：`tests/real-e2e/validators/validate-coverage.mjs`
- 修改：`tests/real-e2e/README.md`
- 修改：`agent-harness/cli_anything/indesign/tests/TEST.md`

- [ ] 写入 `reports/coverage-report.json`，结构必须是 `summary + tools[]`。
- [ ] `summary` 字段包含 `ability_total`、`current_callable_total`、`hidden_handler_total`、`passed`、`failed`、`blocked`、`expected_failure_passed`、`not_callable`。
- [ ] `tools[]` 每项必须包含 `tool_id`、`source`、`backend`、`scenario`、`status`、`call_sequence[]`、`stdout_path`、`stderr_path`、`artifact_paths[]`、`audit_refs[]`；summary 只能由 `tools[]` 按唯一 `tool_id` 去重计算。
- [ ] 写入 `reports/final-report.json`，包含运行目录、最终产物、失败列表、覆盖摘要、审计摘要。
- [ ] 写入 `reports/final-report.md`，固定 4 段：`Summary`、`Failed/Blocked Tools`、`Artifacts`、`Page Audit`。
- [ ] `Page Audit` 只列 28 页 `passed/failed`、preview path、key labels，不复制全文对象清单。
- [ ] `--full` 规则：`failed == 0`、`blocked == 0`、`not_callable == 0`，且 `passed + expected_failure_passed == ability_total`。
- [ ] `--tool <tool_id>` 允许单工具复现，但不更新 full 通过结论。
- [ ] `--phase <name>` 允许阶段复现，但不更新 full 通过结论。
- [ ] `--resume-from <phase>` 从 `phase-checkpoint.json` 恢复；恢复前必须确认主文档路径存在、InDesign 当前状态可控。
- [ ] README 写清楚环境、运行命令、报告解释、失败排查路径。
- [ ] 验证命令：`node tests/real-e2e/run-architecture-presentation.mjs --full --offline`。
- [ ] 验收：full 模式在真实 InDesign 上通过；报告中 146 个工具都有状态。
- [ ] 提交：`test: add final full coverage e2e reporting`。

## 7. 最终验收命令

按顺序执行：

```powershell
node --check tests/real-e2e/run-architecture-presentation.mjs
node --check tests/real-e2e/validators/validate-coverage.mjs
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
node scripts\validate_schemas.js
node scripts\check_duplicates.mjs
node tests/real-e2e/run-architecture-presentation.mjs --inventory --offline
node tests/real-e2e/run-architecture-presentation.mjs --full --offline
```

`--full` 必须在真实 InDesign 可用时运行。没有 InDesign 时只能交付到 `--inventory`，不得宣称全覆盖通过。

## 8. 核对清单

- [ ] `reports/tool-catalog.json` 当前 146 项。
- [ ] `reports/tool-catalog-summary.json` 当前 `hidden_handler == 21`。
- [ ] `coverage-baseline.json` 与实时目录一致，无缺项、无多余项；`coverage-overrides.json` 不含未知工具。
- [ ] 146 个工具都有 `passed` 或 `expected_failure_passed`。
- [ ] `failed == 0`。
- [ ] `blocked == 0`。
- [ ] `not_callable == 0`。
- [ ] 28 页模拟建筑设计汇报页纲全部 `passed`。
- [ ] 主文档可保存、关闭、重开。
- [ ] PDF、IDML、图片、package 产物都在本次运行目录。
- [ ] 参数和日志不记录外部私有路径全文。
- [ ] `final-report.md` 能让人工快速定位失败阶段、失败工具和审计证据。
