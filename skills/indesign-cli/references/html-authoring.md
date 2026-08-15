# HTML 创作与转换

## 从零制作

`<skill-dir>` 是本 Skill 的目录，`<author-root>` 是本次作品目录，`<agent-exe>` 是 CLI 可执行文件绝对路径（见 `references/installation-and-update.md`）。

1. 从内置起步模板创建作者包：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<skill-dir>\scripts\prepare-author-package.ps1" -Destination "<author-root>" -Title "汇报标题"
```

2. 编辑以下内容：

- 页面：`pages/*.html`
- 样式：`styles/*.css`
- 素材：`assets/` 或可访问的 UNC 原路径
- 页面顺序和标题：`deck.config.json`

不要手改 `deck.html`。每次修改页面、样式或配置后重新组装：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<skill-dir>\scripts\prepare-author-package.ps1" -Package "<author-root>\deck.config.json"
```

`AUTHOR_GENERATED_ENTRY_DIRTY` 就是在提示这一步没做或没做完；该错误的 `hint` 里带着可直接复制的组装命令，照它重跑即可，不要另找入口。

3. 只交付 HTML 时，或创作过程中想提前发现问题，运行作者检查。先把参数写入 `lint.args.json`：

```json
{"package":"<author-root>/deck.config.json","strict":true}
```

```powershell
& "<agent-exe>" tool call html.authoring_lint --args-file lint.args.json
```

4. 需要 InDesign 时，直接执行正式构建。正式构建会再次严格检查作者包，生成真实 InDesign 文档，并把文档里的页面、对象、文字、资源和协议事实与原 HTML 核对；核对通过后才导出成品。

把参数写入 `build.args.json`：

```json
{"package":"<author-root>/deck.config.json","outDir":"<output-dir>","outputBaseName":"presentation","mode":"final"}
```

```powershell
& "<agent-exe>" tool call html.build_indesign --args-file build.args.json --timeout-ms 900000
```

`outDir` 必须位于当前工作目录之内：先 `cd` 到项目目录再调用 CLI，不要从个人主目录或临时目录发起构建。同一位置的 UNC 写法和映射盘写法视为等价。

构建被核对拦下时不产出成品：返回体的 `artifactsExported` 为 `false`，`intermediateDir` 指向保留下来的中间产物（instructions、读回快照、保真报告）。不要去那里找 INDD，它没有被导出。

只有结果中的 `verified` 为 `true`，才能把 INDD/PDF/IDML 作为正式成品交付。失败时按返回的页面、对象、字段或文件修改作者源码，重新组装后再构建；不要用未修改的输入反复重试，也不要自行追加二次回环。

`mode: "draft"` 会跳过真实文档核对，结果始终是未验证草稿，不能作为正式成品。只需要 HTML 时，在严格检查通过后交付 `deck.html` 和完整作者包，不执行第 4 步。

## 先写正常 HTML，再看兼容反馈

优先按浏览器和 HTML 的正常习惯创作，不要给每个元素机械补一遍 `data-id-*`：

- 标题、`p`、列表、`figure + img + figcaption`、原生 `table` 直接使用。
- CSS Grid、Flex、padding、普通流式布局和 `object-fit` 直接使用；转换层读取浏览器最终几何。
- `img[src]` 是图片资源，`object[data]` 是 PDF/AI 等资源；资源后缀已经明确时不必重复写类型。
- `object` 内只有一个普通 `img` 时，它是标准浏览器 fallback，转换层不会把它编译成第二份资源。
- 普通 `div/figure` 只包含一个真实 `img/object/svg` 时，可以继续作为视觉图框；边框、背景、padding 和图框样式留在 wrapper。
- 纯文字 `div` 可以直接写，转换层会把它识别为文字对象。
- 简单内联 SVG 可以直接写 `path`、`circle`、`ellipse`、`rect`、`line`、`polyline` 和 `polygon`，转换层会生成可编辑的 InDesign 原生矢量；`cx="50%"`、`r="25%"`、`width="100%"` 等常见长度也可以直接写，不需要改成协议专用 `div`。
- 空 `div` 使用 `background`、`border` 和 `border-radius: 50%` 或 `100%` 画圆或椭圆也可直接使用；方形大圆角圆点会生成 Oval，非方形胶囊保留圆角矩形。

常见位置圆点直接这样写；`viewBox` 可写可不写：

```html
<svg id="site-marker" viewBox="0 0 100 100" role="img" aria-label="建筑位置标记">
  <circle cx="50" cy="50" r="23" fill="#c00000" stroke="#ffffff" stroke-width="8"></circle>
</svg>
```

每次重新组装后都先调用 `html.authoring_lint`，即使用户催着直接 build 也不能省略。读取返回的 `compatibility.summary` 和全部 `compatibility.messages`：

- `action: "normalized"` 表示写法含义唯一，CLI 已在本次转换中安全理解；可以继续 compile/build。
- `suggestedFix` 表示推荐的显式写法。需要长期维护或承诺作者源码回环零漂移时，把建议写回 `pages/*.html` 或 CSS，重新组装并 lint。
- `blocked > 0` 或 lint error 表示系统不能可靠判断。按消息中的页面、对象、`suggestedFix` 和 `ruleRef` 修改；不得原样重试。

常见视觉阻断消息：

| code | 修改作者源码 |
| ---- | ------------ |
| `HTML_INLINE_SVG_UNSUPPORTED` | 先修正缺失/无效的尺寸和坐标；再把 `use`、SVG text/image、transform、clip/mask/filter、paint server 或复杂 path 改成基础图元，或者保存为外部 `.svg` 资源 |
| `HTML_PSEUDO_ELEMENT_UNSUPPORTED` | 把 `::before` / `::after` 的可见内容改成真实 HTML 元素；装饰几何可改成基础 SVG |
| `HTML_CLIP_PATH_UNSUPPORTED` | 改用 SVG `polygon/path`，或外部 SVG |
| `HTML_GRADIENT_UNSUPPORTED` | 单色透明度渐变可保留；多色渐变改成外部资源 |
| `HTML_CSS_BORDER_SHAPE_UNSUPPORTED` | 把透明边框拼出的三角形等轮廓改成 SVG `polygon/path` |
| `HTML_CSS_EFFECT_UNSUPPORTED` | 去掉未支持的 shadow/filter/mask，或把完整视觉保存为外部资源 |

如果直接调用 `html.compile_instructions`，`blocked > 0` 会返回 `HTML_COMPATIBILITY_BLOCKED`，不会写出已经丢图的 instructions。`html.build_indesign` 在构建前执行同一组严格检查。

多资源 wrapper、缺少稳定 ID、manual 裁切几何不完整、不可归属文字、画板/页码冲突和跨层遮挡不能自动猜。比如一个 `figure` 中有两个候选 `img`，必须明确哪个是正式资源；只有确定是预览的额外图片才使用 `data-id-ignore`。

## 作者规则

硬要求：

- 每个 `pages/*.html` 只包含一个 `<section class="page">`。
- 检查的严格程度由 `strict` 决定：`html.authoring_lint` 默认 `strict:false`；`html.build_indesign` 编译前会用固定 `strict:true` 重新跑一次同样的检查，不受 `mode:final/draft` 影响。默认参数 lint 通过不代表 build 会通过——网格对齐、语义 token 等规则只在 `strict:true` 下才会从 warning 升级成拦截 error。创作阶段就按第 3 步用 `strict:true` 跑 lint，不要等 build 才发现。
- 每页声明 `data-page`、`data-id-layout`、`data-id-margin` 和 `data-id-grid`；这四个属性只在页面根元素（`<section class="page">` 自身）上生效，写在子元素上不会被读取。`data-id-grid` 声明的是网格本身（列数/行数，配合 `data-id-margin`、`data-id-column-gutter`/`data-id-row-gutter` 反推整页网格线），和下面 `.grid-item` 用的 `--grid-col` 等 CSS 变量不是同一层——后者只决定某个元素落在网格的哪一格，不影响网格线怎么算，两者作用域不同、不能互相替代。
- `.grid-item` 声明 `--grid-col`、`--grid-span`、`--grid-row` 和 `--grid-row-span` 让元素在页面 CSS Grid 里就位；但元素实际渲染出的几何边界仍要落在反推网格线的容差内才算对齐，超出报 `GRID_ALIGNMENT_OFF`（`strict:true` 下升级为 error）。容差默认 1mm，可以用 `html.authoring_lint`/`html.build_indesign` 的 `gridTolerance` 参数放宽（单位 mm）。但放宽容差只该用于确认过版式本身没问题、纯粹是渲染取整导致的越界；成片报错时先改作者源码或用 `data-id-grid-ignore` 豁免，不要靠调大容差把真实的版式偏差盖过去。四边分别核对：文字、表格和 `data-id-role="container"` 的元素只核对 left/top/right，不核对 bottom；其余角色四边都核对。正常写法很容易因为子像素取整或 CSS 计算偏出 1mm，不能凭视觉判断对齐，写完就该跑一次 strict lint 核实。大量报错且集中在同一个 code 时，先怀疑是网格声明（`data-id-grid`、gutter 值）跟实际 CSS 布局对不上这一个系统性原因，不要逐个元素改坐标。
- 元素确实需要故意偏离网格（跨网格、贴边出血等设计意图）时，在该元素或其祖先上加 `data-id-grid-ignore`，跳过它的对齐校验——这是合法逃生舱，但它是元素级豁免，跟页面级的 `data-id-grid` 声明不是同一件事：报 `GRID_ALIGNMENT_OFF` 时，先分清是「网格声明本身错了」还是「这个元素本就该豁免」，对症下药；同一个元素上把两者都改一遍不会让网格声明的错误消失。
- 交付内容必须静态可见；不得依赖可执行脚本、远程运行时、远程样式、动画或异步数据。
- Canvas 图表转成 SVG；图片、PDF、PSD、AI 和 SVG 保留真实资源引用。
- 图形协议字段写在实际资源元素上：图片用带 `src` 的 `img`，PDF/AI 等用带 `data` 的 `object`。普通单资源 wrapper 可以保留图框样式；资源专用的路径、页码、画板和手工裁切事实仍属于实际资源元素。多个候选资源时不得让转换层猜。
- `data-id-fit` 可用 `cover`、`contain`、`fill`、`none`；只有从 InDesign 回读并明确保留既有内容 bounds 时使用 `manual`，且必须同时保留 `data-id-content-x/y/width/height`，不能用空 `manual` 猜裁切。
- AI 画板在实际 `object` 上写 `data-id-asset-kind="ai"` 和 `data-id-artboard`；`object` 内唯一的普通 `img` 可直接作为标准 fallback。只有预览图位于 object 外部、存在多个候选图片或不是标准 fallback 结构时，才用 `data-id-ignore` 明确排除；原始 AI 的 `data` 仍是置入事实。
- 带填充的祖先容器不得位于嵌套资源元素之上的 InDesign 图层，例如 `content` 层白色面板嵌套 `image` 层总图；这会触发 `NESTED_LAYER_PAINT_ORDER_UNSUPPORTED`。把背景改成同层或更低层的独立兄弟对象，或降低祖先图层。**这条规则只在生成 InDesign 指令时检查**（`html.compile_instructions`、`html.build_indesign` 都会跑），`html.authoring_lint` 查不到它——lint 全绿不代表这条已经通过。写嵌套资源且祖先容器带填充/背景时手动核对图层顺序；不确定就先跑一次成本更低的 `html.compile_instructions`，不要留到跑完整个 `html.build_indesign` 才发现。
- 外层卡片、栏、图例只要包含带 `data-id-paragraph-style` 的 `p`、标题或 `span`，外层就写 `data-id-role="container"`，不要写 `text`；HTML/CSS 结构不用改，文字样式留在子元素上。
- 简单内联 SVG 使用 `path/circle/ellipse/rect/line/polyline/polygon`；其中 path 只用 `M/L/C/Z`（可用相对命令）。复杂 SVG 使用外部 SVG 资源；不要用伪元素、`clip-path` 或透明边框技巧替代基础 SVG 图元。
- `data-id-paragraph-style`/`character-style`/`object-style`/`frame-style`/`table-style`/`cell-style`/`layer`/`semantic`/`asset-kind`/`fit`/`crop` 的取值都是封闭词表，不能自己起名。前 8 个（到 `semantic` 为止）用了词表外的值报 `SEMANTIC_TOKEN_UNKNOWN`，只有 `strict:true` 时才是 error，否则是 warning；后 3 个资源属性（`asset-kind`/`fit`/`crop`）用了词表外的值报 `SEMANTIC_ASSET_KIND_UNKNOWN`/`_FIT_UNKNOWN`/`_CROP_UNKNOWN`，不分是否 strict 恒为 error。默认词表文件是 html-indesign 安装目录下的 `presets/architecture-report/semantic-preset.json`：前 7 个样式类属性的合法值是该文件 `styleNameMap.<对应 kind>`（如 `paragraphStyles`）里的 key，`semantic`/`asset-kind`/`fit`/`crop` 的合法值是 `tokens.<kind>`（如 `semantic`/`assets`/`fits`/`crops`）数组里的项。项目在 `deck.config.json` 里声明了 `semanticPreset`（包内相对路径）或 `profile`（标准语义库名）时以那份文件为准；两者都没声明就静默回退到上面的默认文件——不确定当前项目在用哪份词表，直接打开对应文件确认，不要凭经验猜。**不确定某个值是否登记过，就不写这个属性**：转换层会从标签名或内容安全推断角色，只触发 `SEMANTIC_TOKEN_MISSING` 告警——这条告警和上面的 `*_UNKNOWN` 不是一回事，它标了不参与 strict 升级，永远不会变成 error，比自己编一个词表外的值安全得多。
- 固定高度的文本对象必须让文字真正排得进内框：`height ≥ 行高 × 行数 + padding-top + padding-bottom`。浏览器允许行盒溢出内容盒照常显示，InDesign 的 inset 是硬边界，排不下的整行会溢出隐藏，成品里该对象就是空的；构建核对会以 `content.text` 差异拦下。宁可加高度或去掉上下 padding，不要依赖浏览器的溢出宽容。

建议：

- 用 CSS class 管理重复样式，内联样式只放单个对象的网格位置或局部几何值。
- React、Vue 和图表库可以用于创作，但进入作者包前必须输出静态 HTML、CSS 和 SVG。

## 从现有 INDD 重建

先选 `mode`：

| mode | 用途 | 必需参数 |
| ---- | ---- | -------- |
| `observation` | 只观察现有版面，不做白名单语义重建；人工制作、语义混乱或来源不明的 INDD 先用它 | 无 |
| `structured` | 结构化回读并重建白名单语义 | 必须显式给出 `semanticPreset`（对象）或 `profile`（标准语义库名） |

`structured` 缺少这两者会直接返回 `SEMANTIC_PRESET_LOAD_FAILED:profile-required`。不要靠反复重试，补参数即可。

`reconstructionProfile` 是另一个参数，控制语义重建算法强度，取值 `safe`（默认）、`none`（仅观察诊断）、`experimental`（必须同时列出算法）。

把 INDD 和输出目录写入 `reverse.args.json`：

```json
{"indd":"<input.indd>","outDir":"<reverse-dir>","mode":"observation","assetPolicy":"reference"}
```

```powershell
& "<agent-exe>" tool call html.reverse_export --args-file reverse.args.json --timeout-ms 900000
```

编辑返回的作者包后，按“重新组装 → 严格检查 → 构建 InDesign”继续。只报告工具实际返回的结果，不自行宣称无损。
