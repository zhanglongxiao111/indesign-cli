# HTML 创作与转换

## 从零制作

`<skill-dir>` 是本 Skill 的目录，`<author-root>` 是本次作品目录，`<agent-exe>` 是 CLI 可执行文件绝对路径（见 `references/installation-and-update.md`）。

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

`AUTHOR_GENERATED_ENTRY_DIRTY` 就是在提示这一步没做或没做完；该错误的 `hint` 里带着可直接复制的组装命令，照它重跑即可，不要另找入口。

组装同时处理 `presentation.html`（reveal.js 预览）：包里已经有它就按当前页面重写，重写失败就删掉；没有就不新建。组装输出会说明它被重写还是被删除。转换和检查一律以 `deck.html` 为准，不要把 `presentation.html` 当作页面真相。

组装报 `AUTHOR_ENTRY_WRITE_BUSY`：`deck.html` 或 `presentation.html` 被占用（常见于预览窗口或 NAS 锁），组装器已自动重试约 3 秒。关闭占用该文件的预览后重跑组装，或换一个 outDir。**严禁改 entry 文件名、另存副本或结束无关进程来绕过**，否则会留下陈旧副本，出现两份页面真相。

组装入口按你所处的环境二选一，不要混用：

| 你在哪 | 用什么 |
| --- | --- |
| 已安装 runtime（日常使用） | `prepare-author-package.ps1 -Package <deck.config.json>`（底层为 `assemble-author-package.cjs <pluginRoot> <deck.config.json>`） |
| html-indesign 仓库开发 | `npm run assemble:authoring -- -- --package <deck.config.json>` |

3. 只交付 HTML 时，或创作过程中想提前发现问题，运行作者检查。先把参数写入 `lint.args.json`：

```json
{"package":"<author-root>/deck.config.json","strict":true}
```

```powershell
& "<agent-exe>" tool call html.authoring_lint --args-file lint.args.json
```

lint 和 build 默认只返回摘要（`format:"summary"`）：`ok`、`errorCount`、`warningCount`、`topCodes`（最多 5 类）、`firstErrors`（最多 3 条，带页面、对象和修法）、`normalizedCount`、`gridIgnoredCount`、`gridObservedDowngradedCount`、`compatibility.summary`（只有计数），以及 `reportPath` 和 `runId`。逐条明细（全部 errors/warnings、`compatibility.messages`、`edgeOffsets` 等）在 `reportPath` 指向的报告文件里，需要时读文件，不要为了看全文改传 `format:"full"` 把几十 KB 塞进上下文。报告写不出来时会自动退回完整返回，并带 `formatFallback` 说明原因。

4. 需要 InDesign 时，直接执行正式构建。正式构建会再次严格检查作者包，生成真实 InDesign 文档，并把文档里的页面、对象、文字、资源和协议事实与原 HTML 核对；核对通过后才导出成品。

把参数写入 `build.args.json`：

```json
{"package":"<author-root>/deck.config.json","outDir":"<output-dir>","outputBaseName":"presentation","mode":"final"}
```

```powershell
& "<agent-exe>" tool call html.build_indesign --args-file build.args.json --timeout-ms 900000
```

`outDir` 必须位于当前工作目录之内：先 `cd` 到项目目录再调用 CLI，不要从个人主目录或临时目录发起构建。同一位置的 UNC 写法和映射盘写法视为等价。

构建被核对拦下时不产出成品：返回体的 `artifactsExported` 为 `false`，`intermediateDir` 指向保留下来的中间产物（instructions、读回快照、保真报告）。不要去那里找 INDD，它没有被导出。上一轮成功构建的成品如果还需要，到 outDir 下的 `previous-output/` 里找（见 failure-handling.md）。

只有结果中的 `verified` 为 `true`，才能把 INDD/PDF/IDML 作为正式成品交付。失败时按返回的页面、对象、字段或文件修改作者源码，重新组装后再构建；不要用未修改的输入反复重试，也不要自行追加二次回环。

`mode: "draft"` 会跳过真实文档核对，结果始终是未验证草稿，不能作为正式成品。只需要 HTML 时，在严格检查通过后交付 `deck.html` 和完整作者包，不执行第 4 步。

## 先写正常 HTML，再看兼容反馈

优先按浏览器和 HTML 的正常习惯创作，不要给每个元素机械补一遍 `data-id-*`：

- 标题、`p`、列表、`figure + img + figcaption`、原生 `table` 直接使用。
- CSS Grid、Flex、padding、普通流式布局和 `object-fit` 直接使用；转换层读取浏览器最终几何。
- `img[src]` 是图片资源，`object[data]` 是 PDF/AI 等资源；资源后缀已经明确时不必重复写类型。
- `object` 内只有一个普通 `img` 时，它是标准浏览器 fallback，转换层不会把它编译成第二份资源。
- 普通 `div/figure` 只包含一个真实 `img/object/svg` 时，可以继续作为视觉图框；边框、背景、padding 和图框样式留在 wrapper。
- 纯文字 `div` 可以直接写，转换层会把它识别为文字对象；布局容器里的裸 `<span>` 文本同样会被当作文本叶子捕获（`HTML_ROLE_INFERRED`），不用套一层 `p`。只有直接文本和块级子元素混排在同一个容器里时才阻断。
- `::before`/`::after` 里的纯字符串 `content` 可以直接写，转换层会把它物化成真实文本并并入宿主文字（`HTML_PSEUDO_CONTENT_MATERIALIZED`）；`counter()`、`attr()`、`url()` 这类动态 content 仍要改成真实元素。
- 简单内联 SVG 可以直接写 `path`、`circle`、`ellipse`、`rect`、`line`、`polyline` 和 `polygon`，转换层会生成可编辑的 InDesign 原生矢量；`cx="50%"`、`r="25%"`、`width="100%"` 等常见长度也可以直接写，不需要改成协议专用 `div`。
- 空 `div` 使用 `background`、`border` 和 `border-radius: 50%` 或 `100%` 画圆或椭圆也可直接使用；方形大圆角圆点会生成 Oval，非方形胶囊保留圆角矩形。

常见位置圆点直接这样写；`viewBox` 可写可不写：

```html
<svg id="site-marker" viewBox="0 0 100 100" role="img" aria-label="建筑位置标记">
  <circle cx="50" cy="50" r="23" fill="#c00000" stroke="#ffffff" stroke-width="8"></circle>
</svg>
```

每次重新组装后都先调用 `html.authoring_lint`，即使用户催着直接 build 也不能省略。先看摘要里的 `compatibility.summary` 计数；有需要处理的条目时，到 `reportPath` 报告里读全部 `compatibility.messages`：

- `action: "normalized"` 表示写法含义唯一，CLI 已在本次转换中安全理解；可以继续 compile/build。
- 计数口径：`warningCount` 只统计需要你判断的真警告；`action:"normalized"` 的条目单列在 `normalized`/`normalizedCount`（按 code 折叠见 `normalizedSummary`）。归一化数量大不代表有事要做，不要为清零 `normalizedCount` 去逐个补显式属性。
- `suggestedFix` 表示推荐的显式写法。需要长期维护或承诺作者源码回环零漂移时，把建议写回 `pages/*.html` 或 CSS，重新组装并 lint。
- `blocked > 0` 或 lint error 表示系统不能可靠判断。按消息中的页面、对象、`suggestedFix` 和 `ruleRef` 修改；不得原样重试。

常见视觉阻断消息：

| code | 修改作者源码 |
| ---- | ------------ |
| `HTML_INLINE_SVG_UNSUPPORTED` | 先修正缺失/无效的尺寸和坐标；再把 `use`、SVG text/image、transform、clip/mask/filter、paint server 或复杂 path 改成基础图元，或者保存为外部 `.svg` 资源。transform 只拦真正起作用的变换：`rotate(0deg)`、单位矩阵这类等于没变换的写法放行；独立的 `rotate`/`translate`/`scale` 属性也算变换，要把旋转直接画进 path 坐标 |
| `HTML_PSEUDO_ELEMENT_UNSUPPORTED` | 只在动态 content（`counter()`/`attr()`/`url()`）或纯装饰 paint 伪元素上出现：把动态 content 改成写死静态文字的真实 HTML 元素，装饰几何改成基础 SVG。静态字符串 content 已自动物化，不会报这个码 |
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
- lint 会用 build 编译阶段同一套转换和校验把作者包预跑一遍，所以作者包本身的问题（同页重复 id、资源文件找不到等）不论 strict 与否都在 lint 阶段报 error，条目的 `stage` 为 `semantic-model` 或 `instructions`。只取决于 build 参数的问题（例如 `targetSize` 比例和源页面不符）lint 管不到，仍到 build 才报。
  - `ITEM_ID_DUPLICATED`：同一页里元素 id 必须唯一，跨页同名不拦。看条目的 `occurrences`（每处的 `sourceFile`、`sourcePath`）和 `suggestedFix`，到 `pages/*.html` 改名，连同 CSS 里的 `#id` 选择器一起改，重新组装后再 lint。
  - `ASSET_FILE_NOT_FOUND`：条目带页面里写的原始引用和解析后的路径。资源路径相对入口 `deck.html` 解析；复制作者包时，包外的共享素材目录要一起复制。
- 每页声明 `data-page`、`data-id-layout`、`data-id-margin` 和 `data-id-grid`；这四个属性只在页面根元素（`<section class="page">` 自身）上生效，写在子元素上不会被读取。`data-id-grid` 声明的是网格本身（列数/行数，配合 `data-id-margin`、`data-id-column-gutter`/`data-id-row-gutter` 反推整页网格线），和下面 `.grid-item` 用的 `--grid-col` 等 CSS 变量不是同一层——后者只决定某个元素落在网格的哪一格，不影响网格线怎么算，两者作用域不同、不能互相替代。
- `.grid-item` 声明 `--grid-col`、`--grid-span`、`--grid-row` 和 `--grid-row-span` 让元素在页面 CSS Grid 里就位。网格对齐校验（`GRID_ALIGNMENT_OFF`，`strict:true` 下升级为 error）的规则是：**承担网格放置的块负责对齐，块内的内容不参与网格校验**。带 `--grid-col`/`--grid-row`、`grid-item` 类名或显式 `grid-column`/`grid-row` 的元素就是"块"——卡片、栏、页眉条带；块本身哪怕只是个无边框的包裹 `div` 也会被量（条目带 `block: true`、`blockOf` 列出块内元素、`itemId` 是块的 id 或 CSS 路径），核对 left/top/right 三条边；块内的段落、小标题、条形图该有内边距就有内边距，不会因为离格线一个 padding 而报错；块套块时只量最外层。没有放置祖先的元素仍逐条量（文字、表格和 `data-id-role="container"` 只核对 left/top/right；自动宽度文字连 right 也不核对）。容差默认 1mm，`gridTolerance` 只用于确认版式正确后的取整误差，不要用它盖住真实偏差。每条 `GRID_ALIGNMENT_OFF` 都带 `edgeOffsets`（每条边偏了多少毫米、最近的格线在哪）和 `suggestedFix`（该往哪挪多少；块级条目会指出成因是块自身的 margin/transform 或 `data-id-grid` 声明与 CSS 网格不符），首条消息会列出前三条 `Fix examples`；按数字改块的位置或 `--grid-*` 声明，不要逐个改块内元素。lint 结果顶层的 `gridCheckedCount`/`gridShieldedCount`/`gridBlockCheckedCount`/`gridBlockSkippedCount` 说明量了多少、遮蔽了多少、有多少块没量到——`0 错误` 只有在 `gridBlockCheckedCount` 或 `gridCheckedCount` 大于 0 时才说明"对齐了"。正常写法很容易因为子像素取整偏出 1mm，写完就跑一次 strict lint 核实。
- 元素确实需要故意偏离网格（出血图、贴边色块、跨格大标题）时，在该元素或其祖先上加 `data-id-grid-ignore`，跳过整棵子树的对齐校验。它不影响后面的保真门禁，但**不是给卡片内容用的**——块内内容本来就不校验；整包给段落贴豁免只会让 lint 结果里的 `gridIgnoredCount`（被豁免的元素数，含继承；遥测同名上报，首条消息也会点明 `Grid exemptions already in this package`）变得难看，人会据此要求返工。报 `GRID_ALIGNMENT_OFF` 时先分清三种情况：网格声明本身（`data-id-grid`、gutter）跟 CSS 布局对不上——改声明；块没坐在格线上——按 `edgeOffsets` 挪块或去掉它自己的 margin/transform；块本来就该越线——豁免。
- 从人做的 INDD 反向导出的作者包，lint 和 build 都传 `lintProfile: "reverse-export"`。观察态对象（反向导出原样带出的对象）的网格偏移会降为提示，列在 `notices[]`，数量见 `gridObservedDowngradedCount`，摘要里还会单列 `gridObservedDowngraded`。不要再给这些对象批量贴 `data-id-grid-ignore`。你新增或改写的对象照常检查：改写时去掉它身上的观察态标记（`observed-text`、`id-object` 类名和 `data-id-observed*` 属性），也不要照抄这些标记到新对象上。`lintProfile` 和 `deck.config.json` 里的语义 `profile` 是两回事。反向导出作者包里的矢量线条和形状，外框位置、尺寸写在 `styles/reverse-overrides.css` 的 `[id="…"]` 规则里，path 已经是最终几何（旋转已画进坐标）。要挪动或改尺寸，就改那条规则或改 path，不要在 svg 上加 `transform`、`left`/`top`。卡片、图例框、标注框这类带内容的容器写成普通 div：底色和描边内联在 div 上，里面的文字、色块按读回位置绝对定位。要挪整张卡片，就改容器的位置或网格，不要逐个改里面的子对象。反向导出返回体的 `warningsByCode` 里如果出现 `REVERSE_AUTHOR_ITEM_DROPPED`，说明作者包丢了内容，先把缺的补回来或上报，不要直接拿去修改后再正向构建；`REVERSE_VECTOR_CONTAINER_SHAPE_APPROXIMATED` 表示某个非矩形容器被近似成了矩形盒子，外形要人工核对。
- 反向导出的作者包不用任何人工修改，就能直接通过 lint 并构建回 InDesign。改的时候守住以下几条：
  - **包内语义库别删**：作者包自带 `semantic-preset.json`，`deck.config.json` 已经指向它，读回的样式名和图层名都登记在里面。新增样式要么用已登记的 token，要么自己登记进这份文件。
  - **图层名**：`data-id-layer` 写语义键（`text`、`content` 等）。「图层 1」这类人工图层名是已登记的合法值，整段照写，不要拆开，也不要改成语义键，否则构建后对象会换到别的图层。
  - **页面根上的占位值**：`data-id-layout="observed"` 和 `data-id-grid="1x1"` 是占位，语义化时换成真正的布局和网格。如果希望构建按新网格生成参考线，要同时删掉页面根上的 `data-id-guides`，它会把参考线锁定。
  - **带 `sourceRoot` 的 observation 导出**：写法上的差异只报警告，不会让导出失败。如果仍然报 `REVERSE_AUTHOR_AUDIT_FAILED`，说明内容真的丢了，要查。
  - **样式定义**：段落、字符、对象样式的定义只看 `.pstyle-*`、`.cstyle-*`、`.ostyle-*` 这三类规则。元素上其余的 CSS 差异按局部覆盖处理。要改整个样式就改对应的规则；只改一处，就在元素上写局部样式。
  - **颜色**：反向导出后，色板一律重建为 RGB 色板，CMYK 色板和淡色色板的颜色空间不保留。送印前要告诉用户这一点。
- 多段文字框写成带 `data-id-role="text"` 的 `div`，每段一个 `<p>`，不要用 `<br>` 分段，否则会被当成段内换行。对齐方式：`text-align: justify` 对应 InDesign 的「左对齐两端」；全部两端、居中两端、右对齐两端，分别再加 `text-align-last: justify`、`center`、`right`。表格列宽写在 `<colgroup><col style="width:…">` 上，每一列都写了宽度时，构建就按写的宽度建列。
- 交付内容必须静态可见；不得依赖可执行脚本、远程运行时、远程样式、动画或异步数据。
- Canvas 图表转成 SVG；图片、PDF、PSD、AI 和 SVG 保留真实资源引用。
- 图形协议字段写在实际资源元素上：图片用带 `src` 的 `img`，PDF/AI 等用带 `data` 的 `object`。普通单资源 wrapper 可以保留图框样式；资源专用的路径、页码、画板和手工裁切事实仍属于实际资源元素。多个候选资源时不得让转换层猜。
- `data-id-fit` 可用 `cover`、`contain`、`fill`、`none`；只有从 InDesign 回读并明确保留既有内容 bounds 时使用 `manual`，且必须同时保留 `data-id-content-x/y/width/height`，不能用空 `manual` 猜裁切。
- AI 画板在实际 `object` 上写 `data-id-asset-kind="ai"` 和 `data-id-artboard`；`object` 内唯一的普通 `img` 可直接作为标准 fallback。只有预览图位于 object 外部、存在多个候选图片或不是标准 fallback 结构时，才用 `data-id-ignore` 明确排除；原始 AI 的 `data` 仍是置入事实。
- 带填充的祖先容器不得位于嵌套资源元素之上的 InDesign 图层，例如 `content` 层白色面板嵌套 `image` 层总图；这会触发 `NESTED_LAYER_PAINT_ORDER_UNSUPPORTED`。把背景改成同层或更低层的独立兄弟对象，或降低祖先图层。**这条规则只在生成 InDesign 指令时检查**（`html.compile_instructions`、`html.build_indesign` 都会跑），`html.authoring_lint` 查不到它——lint 全绿不代表这条已经通过。写嵌套资源且祖先容器带填充/背景时手动核对图层顺序；不确定就先跑一次成本更低的 `html.compile_instructions`，不要留到跑完整个 `html.build_indesign` 才发现。
- 外层卡片、栏、图例只要包含带 `data-id-paragraph-style` 的 `p`、标题或 `span`，外层就写 `data-id-role="container"`，不要写 `text`；HTML/CSS 结构不用改，文字样式留在子元素上。
- 简单内联 SVG 使用 `path/circle/ellipse/rect/line/polyline/polygon`；其中 path 只用 `M/L/C/Z`（可用相对命令）。复杂 SVG 使用外部 SVG 资源；不要用 `clip-path`、透明边框技巧或纯装饰伪元素替代基础 SVG 图元（`::before`/`::after` 的静态字符串 content 是文字，不受这条限制，会被物化成真实文本）。
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
| `structured` | 结构化回读并重建白名单语义 | 需要能解析出语义 profile，见下 |

`structured`（默认值）取不到语义 profile 时直接返回 `SEMANTIC_PRESET_LOAD_FAILED:profile-required`。

**profile 不是本工具的参数，不要直接传 `profile` 或 `semanticPreset`**——`html.reverse_export` 的 schema 是 `additionalProperties: false`，传了会被 `ARGS_UNKNOWN_KEY` 挡下。两条合法出路：

- 传 `sourceRoot` 指向一个 `deck.config.json` 里配置了 `semanticPreset` 的作者包目录，profile 从那里解析；
- 源 INDD 本来就是由带 profile 的正向构建产生的，此时无需额外参数。

两者都不成立时改用 `mode: "observation"`，放弃白名单语义重建。用相同参数反复重试不会有不同结果。

`reconstructionProfile` 是另一个参数，控制语义重建算法强度，取值 `safe`（默认）、`none`（仅观察诊断）、`experimental`（必须同时列出算法）。

把 INDD 和输出目录写入 `reverse.args.json`：

```json
{"indd":"<input.indd>","outDir":"<reverse-dir>","mode":"observation","assetPolicy":"reference"}
```

```powershell
& "<agent-exe>" tool call html.reverse_export --args-file reverse.args.json --timeout-ms 900000
```

编辑返回的作者包后，按“重新组装 → 严格检查 → 构建 InDesign”继续。只报告工具实际返回的结果，不自行宣称无损。

**从现有 INDD 取内容重做**：用 `mode: "observation"` 反向导出成功后，只读返回体里 `data.contentManifestPath` 指向的 `content-manifest.json`。不要为了取内容逐页读 `deck.visual.html` 或 `author/pages/*.html`，那些文件大部分是坐标和层级，体积是清单的好几倍。

- 读之前，先核对清单顶层的 `runId` 和返回体的 `data.runId` 是否一致。
- 建议的阅读顺序：每页把 `textBlocks` 和 `images` 合在一起，按 `order` 从小到大排。这个顺序是按几何位置推算的，版面复杂时以视觉判断为准。表格读 `rows` 二维数组，`null` 表示这一格被合并单元格覆盖。
- 坐标单位是 mm，即 InDesign 里的物理尺寸。只用来判断相对位置和大小比例，新的 HTML 按作者规范的网格重新排版，不要照抄坐标。
- 图片引用用 `linkPath`（原始链接）。有 `packagePath` 时，它是作者包里的拷贝。`kind: "vector"` 的 PDF、AI、SVG 保持矢量置入。
- 栅格图看 `effectivePpi`：印刷一般要 ≥300，屏幕汇报 ≥150 可以接受。`ppiBasis: "frame-bounds"` 表示这是近似值。想放大重排时，可用宽度（mm）≈ `pixelWidth` ÷ 目标 PPI × 25.4。
- `pixelError` 不为 null，说明这张图的文件读不到：`share-unreachable`、`file-not-found` 要请人确认 NAS 路径；`unsupported-format` 可以照常置入，只是没有像素信息。`linkStatus` 为 `missing` 或 `modified` 时，提醒人在 InDesign 里更新链接。

想用 InDesign 的默认样式，就不要写 `data-id-*-style`。写 `[基本段落]`、`[无]`、`[Basic Paragraph]` 这类内置样式名，效果等于没写，不会新建样式。
