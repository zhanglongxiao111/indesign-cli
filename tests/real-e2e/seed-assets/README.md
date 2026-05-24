# 真实 E2E 测试素材

本目录为真实 Adobe InDesign E2E 测试准备小型素材，用于模拟建筑设计汇报 deck 的图片置入、SVG 置入、CSV 指标表和 XML 数据导入。

## 目录

- `photos/`：来自 Wikimedia Commons 的小尺寸 JPEG 缩略图。
- `svg/`：本地生成的建筑汇报示意图，覆盖地图、总平、平面、剖面、日照、流线和材料图例。
- `data/`：本地生成的 `metrics.csv` 和 `site-data.xml`。
- `manifest.json`：素材清单、来源、许可和建议使用页码。

## 来源与版权

图片优先选用 Wikimedia Commons 上标注为 `CC0`、`Public domain`、`CC BY` 或 `CC BY-SA` 的素材，并下载缩略图版本，避免把大图放入仓库。具体来源和许可见 `manifest.json`。

注意：

- `CC BY` 和 `CC BY-SA` 图片在正式发布、演示或对外材料中需要按对应许可做署名和保留许可说明。
- 本目录素材只面向测试，不代表可直接用于客户项目或商业交付。
- 如果后续新增图片但无法确认许可，必须在 `manifest.json` 的 `license` 写 `unknown`，不要猜测。
- 不要放入客户文档、客户名称、私有资产路径或不可公开的项目图片。

## 更新方法

1. 新素材只放在本目录及其子目录内。
2. 图片文件名使用 ASCII，例如 `hero-waterfront.jpg`。
3. 优先下载小尺寸缩略图，单文件尽量保持在 2MB 以下。
4. 每次新增、删除或替换素材，都同步更新 `manifest.json`。
5. SVG 应保留可读 `<title>`、基础图形、颜色、线条、文字和图例，方便覆盖 InDesign 真实置入场景。
6. 更新后检查文件大小、JSON 语法，以及 `manifest.json` 中每个 `relativePath` 是否真实存在。

## 当前用途

这些素材主要用于验证：

- InDesign 能否真实置入 JPEG、SVG、CSV、XML。
- 模板槽位能否处理中文路径上层目录、空格风险、相对路径和不同素材类型。
- 建筑汇报场景下常见页面是否能被测试覆盖，包括封面、区位、指标、总平、平面、剖面、材料和可持续页面。
