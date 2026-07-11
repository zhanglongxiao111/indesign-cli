# HTML InDesign 作者规则

## 目录

- [核心规则](#核心规则)
- [规则级别](#规则级别)
- [作者包结构](#作者包结构)
- [页面与网格](#页面与网格)
- [语义字段](#语义字段)
- [静态化边界](#静态化边界)
- [必跑自检](#必跑自检)
- [互转与回环](#互转与回环)

## 核心规则

写作者源码包，不要写一次性的巨大 HTML 文件。HTML 必须能自然浏览器预览，同时用稳定语义和网格规则让翻译层生成高质量 InDesign 文档。

## 规则级别

- **硬要求**：作者包结构、协议字段、真实资源、静态交付和严格检查必须满足。`lint:authoring --strict` 的错误不能带病交付。
- **条件硬要求**：普通单次转换只要求静态页面可编译；只有要作出无损回环声明时，才必须运行真实 InDesign 双回环并满足零漂移门禁。
- **建议**：组件拆分、CSS 组织和创作工具由页面复杂度决定，只要最终作者包自然、清楚、可维护即可。

## 作者包结构

```text
deck.config.json
pages/*.html
styles/tokens.css
styles/layout.css
styles/components.css
styles/pages.css
assets/
deck.html
```

只编辑 `pages/*.html` 和 `styles/*.css`。`deck.html` 是组装产物，不要手改。

## 页面与网格

每个页面片段只能有一个 `<section class="page">`。不要在 `pages/*.html` 里写 `<!doctype>`、`<html>`、`<head>` 或 `<body>`。

每页必须声明页面身份、布局意图、边距和主网格。母版页和 baseline 按需要声明：

```html
data-page="stable-page-id"
data-id-layout="stable-layout-token"
data-id-margin="top right bottom left"
data-id-grid="columns 或 columnsxrows"
data-id-column-gutter="可选栏间距"
data-id-row-gutter="可选行间距"
data-id-baseline="可选 baseline"
data-id-parent-page="可选母版稳定 ID"
```

网格是版面契约，不是死模板。`12x8` 只是建筑汇报常用默认，也可以使用 `6x6`、`12x6`、`16x9`、单独列数或可解析的 CSS Grid。

使用 `.grid-item` 时必须声明四个网格变量：

```html
style="--grid-col:1;--grid-span:4;--grid-row:2;--grid-row-span:1"
```

不使用 `.grid-item` 时，仍要保证关键边缘服从主网格并通过严格检查。

## 语义字段

字段名是协议，token 值是项目稳定标识。固定字段包括：

- 文字：`data-id-paragraph-style`、`data-id-character-style`
- 对象：`data-id-object`、`data-id-object-style`、`data-id-frame-style`
- 图层：`data-id-layer`
- 表格：`data-id-table-style`、`data-id-cell-style`
- 资源：`data-id-asset-kind`、`data-id-fit`、`data-id-pdf-page`、`data-id-crop`

token 来自当前激活的语义库。需要扩展项目 token 时先初始化项目副本：

```powershell
npm run preset:init -- -- --package <deck.config.json>
```

样式优先放在 CSS 类中；内联 style 主要用于网格定位变量或确实局部的几何信息。图片、SVG、PDF、AI、PSD 使用真实资源元素和原位或相对引用，不要用装饰截图替代可置入资源。

## 静态化边界

React、Vue 和图表库可以用于创作阶段，但交付前必须导出不依赖浏览器运行时的静态作者包。

- 交付版不得包含可执行脚本，也不得依赖远程运行时脚本或远程样式。
- `<canvas>` 必须转换成可回读 SVG 或原生 HTML/InDesign 结构。
- 动画必须固定到明确帧或最终状态。
- 异步数据必须固定为作者包内的确定内容。
- `application/json` 协议载荷允许保留。

严格检查的稳定错误码包括 `AUTHOR_EXECUTABLE_SCRIPT_FORBIDDEN`、`AUTHOR_CANVAS_FORBIDDEN`、`AUTHOR_REMOTE_RUNTIME_SCRIPT_FORBIDDEN` 和 `AUTHOR_REMOTE_STYLESHEET_FORBIDDEN`。

## 必跑自检

```powershell
npm run assemble:authoring -- -- --package <deck.config.json>
npm run lint:authoring -- -- --package <deck.config.json> --strict
```

需要机器可读结果时追加 `--json`。检查覆盖源码格式、静态化边界、`deck.html` 同步、浏览器快照、网格对齐和语义 token。

## 互转与回环

仅生成 InDesign：

```powershell
npm run e2e:indesign -- -- --html <deck.html>
```

需要回读时：

```powershell
npm run e2e:indesign -- -- --html <deck.html> --reverse-roundtrip
```

声明稳定无损回环前：

```powershell
npm run e2e:indesign -- -- --html <deck.html> --reverse-roundtrip --second-pass-roundtrip
```

判断结果时检查溢出文字、缺失资源、PDF 验证、可信结构保护和二轮作者源码漂移。反向作者入口是 `reverse-html/author/deck.html`。

已有 InDesign snapshot 转作者包：

```powershell
npm run reverse:indesign -- -- --snapshot <reverse-snapshot.json> --out <out-dir> --source-root <author-root>
```

知道原始作者包目录时必须传 `--source-root`，以保留资源、配置元数据和源码结构。
