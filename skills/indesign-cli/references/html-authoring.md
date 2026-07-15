# HTML 创作与转换

## 从零制作

`<skill-dir>` 是本 Skill 的目录，`<author-root>` 是本次作品目录。

1. 从内置起步模板创建作者包：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File "<skill-dir>\scripts\prepare-author-package.ps1" -Destination "<author-root>" -Title "汇报标题"
```

2. 编辑以下内容：

- 页面：`pages/*.html`
- 样式：`styles/*.css`
- 素材：`assets/` 或可访问的 UNC 原路径
- 页面顺序和标题：`deck.config.json`

不要手改 `deck.html`。每次修改页面、样式或配置后重新组装：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File "<skill-dir>\scripts\prepare-author-package.ps1" -Package "<author-root>\deck.config.json"
```

3. 只交付 HTML 时，或创作过程中想提前发现问题，运行作者检查。先把参数写入 `lint.args.json`：

```json
{"package":"<author-root>/deck.config.json","strict":true}
```

```powershell
indesign-cli-agent tool call html.authoring_lint --args-file lint.args.json
```

4. 需要 InDesign 时，直接执行正式构建。正式构建会再次严格检查作者包，生成真实 InDesign 文档，并把文档里的页面、对象、文字、资源和协议事实与原 HTML 核对；核对通过后才导出成品。

把参数写入 `build.args.json`：

```json
{"package":"<author-root>/deck.config.json","outDir":"<output-dir>","outputBaseName":"presentation","mode":"final"}
```

```powershell
indesign-cli-agent tool call html.build_indesign --args-file build.args.json --timeout-ms 900000
```

只有结果中的 `verified` 为 `true`，才能把 INDD/PDF/IDML 作为正式成品交付。失败时按返回的页面、对象、字段或文件修改作者源码，重新组装后再构建；不要用未修改的输入反复重试，也不要自行追加二次回环。

`mode: "draft"` 会跳过真实文档核对，结果始终是未验证草稿，不能作为正式成品。只需要 HTML 时，在严格检查通过后交付 `deck.html` 和完整作者包，不执行第 4 步。

## 作者规则

硬要求：

- 每个 `pages/*.html` 只包含一个 `<section class="page">`。
- 每页声明 `data-page`、`data-id-layout`、`data-id-margin` 和 `data-id-grid`。
- `.grid-item` 声明 `--grid-col`、`--grid-span`、`--grid-row` 和 `--grid-row-span`。
- 交付内容必须静态可见；不得依赖可执行脚本、远程运行时、远程样式、动画或异步数据。
- Canvas 图表转成 SVG；图片、PDF、PSD、AI 和 SVG 保留真实资源引用。
- 图形协议字段写在实际资源元素上：图片用带 `src` 的 `img`，PDF/AI 等用带 `data` 的 `object`，不要只标记外层容器。
- 含独立文字子对象的布局容器使用 `data-id-role="container"`，不要写 `text`；文字角色和段落样式只写在实际文字元素上。
- 复杂图表使用外部 SVG；内联 SVG 路径只用 `M/L/C/Z`，其他路径命令改成外部 SVG 资源。
- 语义和样式 token 使用项目已登记值；检查报未知 token 时先改正，不自行发明近义字段。

建议：

- 用 CSS class 管理重复样式，内联样式只放单个对象的网格位置或局部几何值。
- React、Vue 和图表库可以用于创作，但进入作者包前必须输出静态 HTML、CSS 和 SVG。

## 从现有 INDD 重建

把 INDD 和输出目录写入 `reverse.args.json`：

```json
{"indd":"<input.indd>","outDir":"<reverse-dir>","mode":"structured","assetPolicy":"reference"}
```

```powershell
indesign-cli-agent tool call html.reverse_export --args-file reverse.args.json --timeout-ms 900000
```

编辑返回的作者包后，按“重新组装 → 严格检查 → 构建 InDesign”继续。只报告工具实际返回的结果，不自行宣称无损。
