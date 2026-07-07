# InDesign 工具语义全面提升方案

日期：2026-07-03

状态：领域设计（角色表、warning 语义、selector 两阶段、coverage matrix、输出体量控制）仍然有效。"语义层模块架构"一节中 `toolSemantics.js` 按 tool name 集中追加的落点已被终态架构取代：per-tool 语义改为 tool-module 的 `semantics` 字段共置，见 `docs/superpowers/specs/2026-07-06-indesign-terminal-architecture-design.md` §14 与 `docs/superpowers/plans/2026-07-06-indesign-tool-semantics-plan.md` 的落点规则。

## 背景

当前 CLI/MCP 工具可以控制 InDesign，但多数工具只暴露了底层对象名、短动作名和少量文本结果。Agent 能调用成功，不等于理解了 InDesign 的对象模型。

这次图片偏移问题只是一个表层案例：`Image` 在 InDesign 中通常是图框里的置入内容，`Rectangle` 才是页面上的图框。移动 `Image` 会改变裁切/取景，移动 `Rectangle` 才会移动版面中的图片对象。

推而广之，InDesign 里有大量类似歧义：

- `TextFrame` 是文本容器，真正的文本流是 `Story`。
- `Page`、`Spread`、`MasterSpread` 是不同作用域，坐标和对象继承关系不同。
- `ParagraphStyle`、`CharacterStyle`、`ObjectStyle` 是文档资源，不是对象上的普通属性。
- `Layer` 的锁定/隐藏会影响页面对象，但页面对象本身也有锁定/可见状态。
- `geometricBounds`、`visibleBounds`、`x/y/width/height` 的语义不同。
- `itemIndex` 是当前枚举顺序，不是稳定身份。
- 书册、母版、链接资产、导出预设、模板槽位都各有 InDesign 原生概念。

因此，本方案不是“修图片工具说明”，而是建立一层面向 Agent 的 InDesign 语义契约：保留 InDesign 原生命名，同时补充角色、层级、作用域、操作意图和风险提示，让 Agent 一眼知道对象是什么、归谁管、能做什么、做了意味着什么。

## 目标

- 让工具输出符合 InDesign 原生对象直觉，而不是只给模糊文本。
- 明确表达对象身份、作用域、父子层级、版面角色和操作语义。
- 把“容器”和“内容”分开，例如 frame/content、text frame/story、style/local override。
- 让 Agent 优先使用稳定目标定位，而不是脆弱的 `itemIndex`。
- 为高频任务提供更窄、更符合用户意图的工具，例如 `frame.move`、`story.replace_text`、`link.relink`。
- 保持已有 CLI/MCP 工具兼容，逐步迁移 Agent Skill 和文档。
- 为后续固定语义 HTML 转 InDesign 提供统一对象模型。

## 非目标

- 不重写 InDesign 自动化执行层。
- 不删除已有工具名。
- 不把完整 InDesign DOM 原样暴露成无边界工具集。
- 不在 ExtendScript 里实现复杂版面推理和 HTML 编译。

## 总体设计

每个工具都应围绕三层信息组织：

1. **Native Identity**：InDesign 原生身份。包括 `constructorName`、`objectId`、`toSpecifier`、`itemIndex`、`pageIndex`、`spreadIndex`、`masterName` 等。
2. **Semantic Role**：Agent 决策角色。包括 `graphic_frame`、`placed_graphic_content`、`text_frame`、`story`、`paragraph_style`、`master_page_item` 等。
3. **Operation Affordance**：这个对象适合执行什么操作。包括 `frame.move`、`image.pan_content`、`story.replace_text`、`style.apply`、`master.override_item` 等。

推荐统一返回结构：

```json
{
  "semanticContractVersion": "indesign-semantics/v1",
  "native": {
    "constructorName": "Rectangle",
    "objectId": 40718,
    "specifier": "/document[1]/page[5]/rectangle[1]",
    "itemIndex": 0
  },
  "semantic": {
    "role": "graphic_frame",
    "roleReasonCode": "contains_placed_graphic",
    "confidence": 1,
    "description": "Placed graphic frame/container on the page"
  },
  "scope": {
    "documentName": "example.indd",
    "pageIndex": 4,
    "physicalPageNumber": 5,
    "displayPageLabel": "5",
    "spreadIndex": 4,
    "parentKind": "Page"
  },
  "hierarchy": {
    "parent": null,
    "children": [
      {
        "objectId": 40724,
        "constructorName": "Image",
        "semantic": {
          "role": "placed_graphic_content"
        }
      }
    ]
  },
  "geometry": {
    "coordinateSpace": "page",
    "unit": "pt",
    "geometricBounds": {
      "top": 20,
      "left": -39,
      "bottom": 287,
      "right": 459,
      "width": 498,
      "height": 267
    },
    "visibleBounds": null
  },
  "state": {
    "locked": false,
    "visible": true,
    "layer": {
      "name": "Layer 1",
      "locked": false,
      "visible": true
    }
  },
  "affordances": [
    "frame.move",
    "frame.resize",
    "frame.fit_content"
  ],
  "operationHint": "Move this frame to reposition the placed image in the layout. Move child Image only to change crop/pan."
}
```

字段命名规则：

- 完整语义对象统一使用 `semantic.role`、`semantic.roleReasonCode`、`semantic.confidence`。
- 紧凑列表如确需兼容旧调用，可以临时提供 `semanticRole`，但必须标为 alias，并由 normalizer 统一转回 `semantic.role`。
- `roleReasonCode`、`warning.code`、`affordances[]` 必须是稳定枚举；`description`、`operationHint` 只作为展示文本。

语义对象必须嵌入现有 MCP/CLI envelope，而不是替换 envelope。MCP 工具返回的文本 JSON 形态应保持：

```json
{
  "success": true,
  "operation": "List Page Items",
  "data": {
    "semanticContractVersion": "indesign-semantics/v1",
    "items": []
  },
  "warnings": []
}
```

CLI wrapper 继续保留现有外层：

```json
{
  "schema_version": 2,
  "ok": true,
  "tool_success": true,
  "data": {
    "parsed": {
      "success": true,
      "data": {
        "semanticContractVersion": "indesign-semantics/v1"
      }
    }
  },
  "warnings": []
}
```

也就是说，CLI 的 `schema_version` 表示 CLI envelope 版本，当前应继续使用现有 CLI v2；`semanticContractVersion` 表示 InDesign 语义 payload 版本。两者必须分别演进。

## 语义层模块架构

语义提升不应靠在每个 tool description 里手动复制一大段说明，也不应维护一个超大静态字典。正确架构是建立共享语义层：canonical tool registry 的语义扩展 + ExtendScript 运行时推断 + Node 侧 normalizer + 统一 contract。

关键约束：InDesign DOM 只存在 ExtendScript/COM 执行上下文里。`src/semantics/` 的 Node 代码不能假设自己可以直接拿到 `Rectangle`、`Image`、`Story` 等 DOM 对象。语义层必须拆成两部分：

- **Host side**：注册表、JSON schema、工具说明生成、warning schema、结果 normalizer。
- **ExtendScript runtime snippets**：真正读取 InDesign DOM、推断父子关系、序列化对象、返回 JSON。

handler 的职责是：解析参数、选择目标、注入共享 JSX snippet、执行动作、把返回 JSON 交给 normalizer，不在每个 handler 里重写语义判断。

推荐新增目录：

```text
src/semantics/
  contract.js          # semanticContractVersion、payload shape、字段命名约束
  schemas.js           # JSON Schema / validator，供测试和 docgen 复用
  warnings.js          # 通用 warning 枚举、severity、recommendedAction
  normalizers.js       # Node 侧清洗 ExtendScript 返回，补 envelope、alias、默认值
  nativeTypes.js       # 稳定 InDesign 原生类型、role、说明、推荐操作
  toolSemantics.js     # 按 canonical tool name 追加语义扩展，不声明 CLI id/domain
  toolDescriptions.js  # 从 canonical registry + semantic extension 生成说明片段
  jsxRuntime.js        # 共享 ExtendScript runtime snippet 字符串
```

最小第一版可以先实现：

```text
src/semantics/
  contract.js
  warnings.js
  nativeTypes.js
  toolSemantics.js
  index.js
```

测试 fixture 不放进 `src/semantics/`，统一放：

```text
tests/fixtures/semantics/
```

但不要把语义判断塞进某个 handler。`src/semantics/` 应与 `core/`、`handlers/`、`types/`、`utils/` 平级，作为 MCP handler、CLI 工具目录、Agent Skill 文档和后续 HTML 转 InDesign 编译链路共同复用的语义基础。

各文件职责：

| 文件 | 职责 |
| --- | --- |
| `nativeTypes.js` | 手写少量 InDesign 原生类型与语义角色映射，例如 `Rectangle`、`Image`、`TextFrame`、`Story`、`ParagraphStyle` |
| `toolSemantics.js` | 按 canonical tool name 追加语义扩展，例如推荐操作、warning 触发条件、docsKey；不声明 CLI id、domain、alias 或 source |
| `contract.js` / `schemas.js` | 定义语义 payload、warning、selector、pagination、verbosity 的 schema |
| `jsxRuntime.js` | 输出 ExtendScript helper 字符串，包含 DOM 推断、几何序列化、父子关系序列化 |
| `normalizers.js` | Node 侧解析、补默认字段、把旧 alias 转成新 contract |
| `warnings.js` | 根据对象角色和操作意图生成统一 warning |
| `toolDescriptions.js` | 从 canonical registry、语义扩展和 contract 生成工具说明片段，避免文档漂移 |

这层应遵守：

- 静态表只记录稳定知识，不记录具体文档对象。
- 动态推断必须来自 InDesign DOM，不凭名称硬猜。
- 工具说明、warning、`operationHint` 和 `affordances` 尽量从 canonical registry + semantic extension 派生。
- handler 只负责取对象、调用语义层、执行动作和包装响应。
- CLI 工具目录和 Agent Skill 不手写另一套语义解释，避免漂移。
- Python CLI catalog 当前在 `agent-harness/cli_anything/indesign/core/catalog.py` 侧生成 agent contract。语义层落地时，Python catalog 读取或校验 canonical registry artifact，而不是读取单独的 `src/semantics/registry.js` artifact，也不是在 Python 里复制一套 role、affordance、warning 枚举。
- canonical registry artifact 不只输出 role 和 warning，还必须输出 MCP name、CLI id、CLI domain、alias 和 source tool 映射。Python CLI 不能再通过前缀或 snake_case 名称自行推断 `frame.move`、`selector.query_items` 这类展示 id。
- CLI 读取 canonical registry artifact 时应优先使用当前 active server root 下的 artifact；Python 包内 server root artifact 只能作为 fallback。artifact 必须带 `semanticContractVersion`、registry version/hash 和生成来源，发现 active server root 与包内 artifact 不一致时返回 warning 或降级，而不是静默混用。

## 输出体量控制

语义化不能变成每次返回超大字典。所有 inspector 和 selector 必须支持输出控制：

```json
{
  "verbosity": "summary",
  "include": ["native", "semantic", "geometry", "state"],
  "maxItems": 100,
  "maxDepth": 2,
  "pageSize": 50,
  "cursor": null
}
```

字段语义：

| 字段 | 作用 |
| --- | --- |
| `verbosity` | `summary` 只返回选择对象必需字段；`normal` 返回常用语义；`full` 仅用于单对象 inspector |
| `include` | 显式选择返回域，例如 `hierarchy`、`links`、`styles`、`textPreview` |
| `maxItems` | 单次最大对象数，超过时返回 `truncated: true` |
| `maxDepth` | 父子层级深度，防止 group/story/table 展开过深 |
| `pageSize` / `cursor` | 大文档分页扫描 |

写工具返回应更克制：只返回 `target`、`before`、`after`、`changedFields`、`warnings`，不返回整页语义树。完整语义只由 `item.inspect`、`page.list_page_items`、`selector.query_items` 等 inspector 提供。

## 需要语义化的对象域

### 1. 文档、窗口和活动状态

InDesign 工具经常默认使用 `app.activeDocument`、`app.activeWindow.activePage`。这对人类可见，对 Agent 不透明。

所有读写工具应返回或接受：

- `documentName`
- `documentPathKnown`
- `modified`
- `activeDocumentUsed`
- `activePageUsed`
- `targetWasExplicit`
- `stateUncertain`

规则：

- 修改类工具优先要求显式目标。
- 使用活动文档/活动页时，返回 warning：`TARGET_IMPLICIT_ACTIVE_CONTEXT`。
- 涉及保存、导出、关闭时必须返回文档状态。

### 2. Page、Spread、MasterSpread

`Page` 是页面，`Spread` 是跨页，`MasterSpread` 是母版跨页。面对页文档里，页面坐标和跨页坐标容易混淆。

语义字段：

- `pageIndex`：零基 `doc.pages` 顺序。
- `physicalPageNumber`：`documentOffset + 1`，物理页序，不等同于用户可见页码。
- `pageName`：InDesign 页面名，可能受章节编号影响。
- `displayPageLabel`：面向用户展示的页码标签，优先使用 `page.name`。
- `spreadIndex`：零基 `doc.spreads` 顺序。
- `pageSide`：`left`、`right`、`single`。
- `appliedMasterName`
- `isMasterPageItem`
- `isOverriddenMasterItem`
- `parentPage`、`parentSpread`

推荐工具：

| 工具 | 语义 |
| --- | --- |
| `page.inspect` | 返回页面尺寸、边距、出血、母版、页面侧、页面对象摘要 |
| `spread.inspect` | 返回跨页页面组成、跨页坐标范围和内容摘要 |
| `master.inspect` | 返回母版项、槽位、可覆盖项 |
| `master.override_item` | 覆盖母版对象到文档页 |
| `master.detach_item` | 解除母版继承 |

### 3. 坐标、bounds 和单位

当前工具混用 `x/y/width/height` 和 `geometricBounds`。Agent 必须知道坐标空间和单位。

统一字段：

- `coordinateSpace`：`page`、`spread`、`pasteboard`、`parent`。
- `unit`：明确输出单位，第一版统一返回 `pt`。
- `geometricBounds`：对象布局边界，`top/left/bottom/right/width/height`。
- `visibleBounds`：包含描边等视觉影响。
- `innerContentBounds`：容器内部内容边界，仅对图框/文本框等返回。
- `rulerOrigin`：文档当前标尺原点。
- `transform`：旋转、缩放、剪切等变换信息。

规则：

- 对外 JSON 不只返回数组，必须同时返回命名字段。
- 工具参数中的 `x/y` 必须说明是目标左上角，还是偏移量。
- `move` 类工具应区分 `to` 和 `by`：绝对移动与相对移动不能混用。

### 4. PageItem、Frame 和 Content

这是最关键的对象域。InDesign 中很多页面对象既是容器又可能有内容。

语义角色：

| InDesign 类型 | 条件 | `semantic.role` | 直觉解释 |
| --- | --- | --- | --- |
| `Rectangle` / `Oval` / `Polygon` | 含 `graphics` | `graphic_frame` | 置入图像/PDF/EPS 的图框 |
| `Rectangle` / `Oval` / `Polygon` | 无内容 | `shape_frame` | 普通形状或占位框 |
| `Image` / `PDF` / `EPS` | 父级是图框 | `placed_graphic_content` | 图框内部置入内容 |
| `TextFrame` | 有 `parentStory` | `text_frame` | 文本框容器 |
| `Story` | 文本流 | `story` | 可跨多个文本框流动的文本内容 |
| `Table` | 位于 story 内 | `table` | 文本流中的表格 |
| `Cell` | 位于 table 内 | `table_cell` | 表格单元格 |
| `Group` | 含 page items | `group` | 组合对象 |
| `GraphicLine` | 线段 | `line` | 线条对象 |
| `Guide` | 参考线 | `guide` | 页面/跨页参考线 |
| Anchored object | 作为文本锚定对象 | `anchored_object` | 随文本流动的页面对象 |

规则：

- 版面移动优先操作 frame/group/text frame，不直接操作 placed content。
- 内容裁切/取景才操作 `placed_graphic_content`。
- 文本内容修改优先操作 `story` 或明确的 text range，不把 `TextFrame` 当纯字符串。
- Group 内对象必须返回 group 层级，避免误改单个子项。

### 5. 文本模型

InDesign 文本不是简单的“某个文本框里的字符串”。文本框可能串联，共享同一个 `Story`；表格、脚注、锚定对象也在 story 里。

语义字段：

- `textFrameId`
- `storyId`
- `threadIndex`
- `previousTextFrame`
- `nextTextFrame`
- `contentsPreview`，由 `include` 和 `verbosity` 控制是否返回。
- `charactersCount`
- `paragraphsCount`
- `overset`
- `appliedParagraphStyle`
- `appliedCharacterStyle`
- `localOverrides`
- `tables`
- `anchoredObjects`

推荐工具：

| 工具 | 语义 |
| --- | --- |
| `text_frame.inspect` | 看文本框容器、串联关系、overset |
| `story.inspect` | 看文本流、段落数、表格数、样式摘要 |
| `story.replace_text` | 替换 story 或指定 range 内容 |
| `text_range.apply_style` | 给段落/字符范围应用样式 |
| `table.inspect` | 查看表格结构和单元格范围 |

危险提示：

- 修改 `TextFrame.contents` 可能影响整个 story。
- 对串联文本框做内容替换前，应返回 `THREAD_SHARED_STORY` warning。
- 文本预览属于 inspector 输出，应只在调用方明确请求 `include: ["textPreview"]` 时返回。

### 6. 样式、字体和色板

InDesign 样式是文档资源，不是普通字符串属性。Agent 需要知道“应用样式”和“直接改局部格式”是两种行为。

语义角色：

- `paragraph_style`
- `character_style`
- `object_style`
- `table_style`
- `cell_style`
- `swatch`
- `font`

统一字段：

- `resourceName`
- `resourceKind`
- `exists`
- `basedOn`
- `isImported`
- `isDefault`
- `appliedTo`
- `localOverrides`
- `missingFont`
- `swatchColorSpace`
- `swatchColorValue`
- `tint`

推荐工具：

| 工具 | 语义 |
| --- | --- |
| `style.inspect` | 查询样式资源和依赖 |
| `style.apply` | 应用段落/字符/对象/表格/单元格样式 |
| `style.clear_overrides` | 清除局部覆盖 |
| `swatch.inspect` | 查询色板、颜色空间、色值 |
| `font.inspect` | 查询字体可用性和缺失字体 |

规则：

- 工具输出必须区分 `appliedStyle` 和 `localOverrides`。
- 修改样式资源会影响所有引用对象，必须 warning：`STYLE_RESOURCE_CHANGE_GLOBAL_EFFECT`。
- 直接改对象颜色/字体属于局部覆盖，应 warning：`LOCAL_FORMAT_OVERRIDE_CREATED`。

### 7. 链接资产和置入内容

图片、PDF、AI、EPS 等置入内容通过 `Link` 管理。Agent 需要知道改的是链接资产、图框，还是框内内容。

语义字段：

- `linkId`
- `linkName`
- `linkStatus`
- `assetKind`
- `fileName`
- `filePathKnown`
- `filePath`
- `actualPpi`
- `effectivePpi`
- `horizontalScale`
- `verticalScale`
- `rotationAngle`
- `parentFrame`
- `fitState`

推荐工具：

| 工具 | 语义 |
| --- | --- |
| `link.list` | 列出链接资产状态 |
| `link.relink` | 重链资产 |
| `link.update` | 更新已修改链接 |
| `frame.place_content` | 向图框置入内容 |
| `frame.replace_content` | 替换图框内内容 |
| `frame.fit_content` | 执行 `FitOptions` |
| `image.pan_content` | 移动框内内容 |
| `image.scale_content` | 缩放框内内容 |

规则：

- `missing`、`modified`、`embedded` 链接状态必须结构化。
- `fitMode` 应映射到 InDesign `FitOptions` 原名，同时给中文解释。

### 8. 图层、锁定、可见性和堆叠顺序

对象可见与否不仅取决于 item，还取决于 layer。Agent 修改失败时，需要知道是对象锁了、图层锁了，还是母版继承导致不可改。

语义字段：

- `itemLocked`
- `layerLocked`
- `layerVisible`
- `layerPrintable`
- `effectiveEditable`
- `effectiveVisible`
- `zOrderPosition`
- `parentGroupLocked`
- `masterInherited`

推荐工具：

| 工具 | 语义 |
| --- | --- |
| `layer.inspect` | 返回图层状态和对象数量 |
| `item.preflight_editability` | 判断目标是否可编辑 |
| `item.bring_to_front` / `item.send_to_back` | 明确 z-order 语义 |

### 9. 选择器和稳定定位

`pageIndex + itemIndex` 适合临时手测，不适合 Agent 长流程。页面结构变化后，index 会漂移。

目标选择器分为两类：

- **Session target**：同一 InDesign 会话内的快速定位，例如 `objectId` + scope。适合一次 resolve 后紧接着写操作。
- **Persistent selector**：跨步骤、跨会话或页面结构可能变化时使用，例如 `slotKey`、`label`、页面标签、角色、样式、链接和 bounds proximity 组合。

示例：

```json
{
  "target": {
    "objectId": 40718
  }
}
```

```json
{
  "target": {
    "displayPageLabel": "5",
    "semantic": {
      "role": "graphic_frame"
    },
    "label": "plan_image"
  }
}
```

```json
{
  "target": {
    "scope": {
      "pageIndex": 4
    },
    "where": {
      "constructorName": "Rectangle",
      "semantic": {
        "role": "graphic_frame"
      },
      "nearestBounds": {
        "top": 20,
        "left": -39,
        "bottom": 287,
        "right": 459
      }
    }
  }
}
```

选择优先级：

1. 同一会话内：`objectId` + scope 校验。
2. 模板和长流程：`slotKey`。
3. `script label` / `label`。
4. `displayPageLabel` 或 `physicalPageNumber` + `semantic.role` + style/name/layer/link/bounds proximity。
5. 临时手测：`pageIndex` + `itemIndex`。

当匹配多个对象时，修改工具必须返回候选列表，不自动执行。

selector 必须分成两个阶段：

1. **Resolve**：按 selector 找候选，返回 `candidateCount`、`confidence`、`matchReasons`。
2. **Revalidate**：执行写操作前再次校验目标仍在同一文档、同一 scope、同一角色，并检查锁定/隐藏/母版继承状态。

Resolve 结果必须返回可回传的 target carrier。写工具接受统一 `target` union，旧参数如 `pageIndex + itemIndex` 只作为兼容 alias。这样 `selector.query_items`、旧写工具和新窄语义工具才能复用同一套 revalidate 逻辑，而不是各 handler 自己再解析一遍目标。

重验证字段：

- `documentFingerprint`：文档名称、保存路径、页数、修改状态摘要。
- `scopeFingerprint`：page/spread/master 的稳定摘要。
- `specifier`：InDesign `toSpecifier()`，用于同一会话内重找对象。
- `objectId`：快速定位，但不能单独视为长期稳定 ID。
- `labelCollisionCount`：同 label 命中数量。
- `boundsTolerance`：bounds proximity 容差。
- `roleConfidence`：语义推断置信度。
- `resolvedAt`：解析时间，仅用于诊断。

如果 revalidate 失败，写工具必须停止并返回 `TARGET_REVALIDATION_FAILED`。

### 10. 母版、模板槽位和脚本标签

本项目后续要做固定语义 HTML 到 InDesign。模板槽位、母版项和脚本标签必须成为一等语义。

语义字段：

- `slotKey`
- `slotRole`
- `slotSource`
- `labelRaw`
- `labelJson`
- `masterName`
- `fromMaster`
- `overrideState`
- `templateBlueprintId`
- `expectedContentKind`
- `filledContentKind`

规则：

- 除非工具明确负责覆盖标签，否则不得破坏脚本标签。
- 槽位选择优先用 `slotKey`，再用 bounds/name/style 推断。
- 母版项需要明确是继承、已覆盖还是已分离。

### 11. Book、导出和产物

Book 工具和导出工具也需要语义化。Agent 需要知道操作的是单文档、书册，还是导出产物。

语义角色：

- `book`
- `book_content`
- `export_preset`
- `artifact`
- `preflight_issue`

字段：

- `bookPath`
- `bookContentPath`
- `styleSourceDocument`
- `synchronizeOptions`
- `exportFormat`
- `pageRange`
- `outputPath`
- `artifactExists`
- `verifyResult`

规则：

- 导出后必须返回 artifact 列表和验证状态。
- Book 同步样式是全局影响，必须 warning。
- PDF/IDML 等产物应能被 `export.verify` 串接。

## 工具层改造

### 1. 先加语义 inspector，不先大改所有写工具

推荐优先新增或增强：

| 工具 | 作用 |
| --- | --- |
| `document.inspect` | 文档状态、单位、页面/跨页/母版摘要 |
| `page.list_page_items` | 兼容旧工具，新增结构化语义树 |
| `item.inspect` | 单个 page item 的完整语义解释 |
| `selector.query_items` | 按角色、标签、样式、bounds、链接等查询 |
| `style.inspect` | 样式/色板/字体资源解释 |
| `link.list` | 链接资产解释 |

原因：Agent 先读懂对象，再决定写操作。没有 inspector，所有写工具都会继续靠猜。

### 2. 再加窄语义写工具

推荐新增：

| 工具 | 替代或包装 |
| --- | --- |
| `frame.move` | `page.move_page_item`，但只接受 frame/group/text frame |
| `frame.resize` | `page.resize_page_item`，但只改容器 bounds |
| `frame.fit_content` | `FitOptions.*` |
| `image.pan_content` | 移动 `Image/PDF/EPS` 内容 |
| `image.scale_content` | 缩放置入内容 |
| `story.replace_text` | 替代直接改 `TextFrame.contents` |
| `style.apply` | 统一应用段落/字符/对象/表格/单元格样式 |
| `link.relink` | 明确改链接资产 |
| `master.override_item` | 明确处理母版对象 |

### 3. 通用工具保留，但返回语义 warning

保留：

- `page.move_page_item`
- `page.resize_page_item`
- `page.list_page_items`
- `graphics.get_image_info`
- `set_page_item_properties`

但当目标角色和常见意图冲突时，返回 warning：

```json
{
  "warnings": [
    {
      "code": "MOVING_PLACED_CONTENT_NOT_FRAME",
      "severity": "important",
      "target": {
        "native": {
          "objectId": 40724,
          "constructorName": "Image"
        },
        "semantic": {
          "role": "placed_graphic_content"
        }
      },
      "operation": "page.move_page_item",
      "message": "Target is Image content inside a frame. This changes crop/pan, not frame position.",
      "recommendedAction": "Use frame.move on parent objectId 40718 for layout positioning.",
      "docsKey": "placed-content-vs-frame"
    }
  ]
}
```

warning 标准结构：

```json
{
  "code": "TARGET_ON_LOCKED_LAYER",
  "severity": "critical",
  "target": {},
  "operation": "frame.move",
  "message": "Target is on a locked layer.",
  "recommendedAction": "Unlock the layer or choose a different target.",
  "docsKey": "locked-layer-editability"
}
```

字段规则：

- `code` 必须来自 `src/semantics/warnings.js` 枚举。
- `severity` 使用 `critical`、`important`、`minor`。
- `target` 使用同一语义对象的紧凑形态。
- `operation` 使用当前工具 id。
- `recommendedAction` 必须可执行，不写泛泛建议。
- `docsKey` 用于生成 Agent Skill 和详细文档链接。

当前 CLI envelope 使用 `schema_version: 2`，顶层 `warnings` 保持 transport/runtime warning 的字符串数组，不改变为结构化对象。工具 payload 内的 `warnings` 承载语义 warning，必须保持结构化对象数组。CLI wrapper 可以在 `data` 内额外汇总 `semantic_warnings`，但不能改变顶层 `warnings` 的 v2 形态；如果未来要把顶层 `warnings` 改成结构化对象，必须升级 CLI envelope 到 `schema_version: 3`。

语义 warning 去重 key 为 `code + target.native.objectId + operation`。CLI 可额外增加 transport/runtime warning，但不能丢失工具 payload 内的语义 warning。

其他典型 warning：

- `TARGET_IMPLICIT_ACTIVE_CONTEXT`
- `TARGET_INDEX_IS_VOLATILE`
- `MULTIPLE_TARGETS_MATCHED`
- `TARGET_LOCKED`
- `TARGET_ON_LOCKED_LAYER`
- `TARGET_ON_HIDDEN_LAYER`
- `MASTER_ITEM_NOT_OVERRIDDEN`
- `THREAD_SHARED_STORY`
- `STYLE_RESOURCE_CHANGE_GLOBAL_EFFECT`
- `LOCAL_FORMAT_OVERRIDE_CREATED`
- `BOUNDS_UNIT_AMBIGUOUS`
- `LINK_MISSING`

## 命名规则

工具名应区分 MCP 内部名和 CLI 展示 id。

规则：

- MCP tool `name` 继续使用 snake_case，符合现有工具定义习惯，例如 `frame_move`。
- CLI 工具目录展示为 `domain.name`，例如 `frame.move`。
- Agent Skill 和文档优先写 CLI 展示 id，但必须能映射回 MCP name。
- 旧工具保留 alias，例如 `page.move_page_item` 继续映射到 MCP `move_page_item`。
- 新窄语义工具不能只靠 alias；必须有独立 schema、warning 和 target contract。
- CLI 展示 id、domain 和 alias 必须来自 canonical registry artifact 的显式投影，不由 Python CLI 按 MCP name 前缀猜测。

推荐 CLI 展示 id：

- `frame.move`
- `frame.resize`
- `frame.fit_content`
- `image.pan_content`
- `story.replace_text`
- `style.apply`
- `link.relink`
- `master.override_item`
- `selector.query_items`

对应 MCP name：

| CLI id | MCP name |
| --- | --- |
| `frame.move` | `frame_move` |
| `frame.resize` | `frame_resize` |
| `frame.fit_content` | `frame_fit_content` |
| `image.pan_content` | `image_pan_content` |
| `image.scale_content` | `image_scale_content` |
| `story.replace_text` | `story_replace_text` |
| `style.apply` | `style_apply` |
| `link.relink` | `link_relink` |
| `master.override_item` | `master_override_item` |
| `selector.query_items` | `selector_query_items` |

描述中保留 InDesign 原生名：

```text
Rectangle/Oval/Polygon with graphics is a graphic frame.
Image/PDF/EPS is placed graphic content inside a parent frame.
TextFrame is a layout container; Story is the flowing text content.
```

返回中同时保留：

- `constructorName`：InDesign 原生类型。
- `semantic.role`：Agent 判断角色。
- `operationHint`：应该怎么操作。

## 文档和 Agent Skill 改造

需要同步更新：

- `src/types/*` 中工具 description 和 schema description。
- `agent-harness/cli_anything/indesign/README.md`。
- `skills/indesign-cli/SKILL.md`。
- `docs/MCP_INSTRUCTIONS.md`。
- `docs/LLM_PROMPT.md`。

文档必须给 Agent 明确规则：

- 要移动版面中的图，移动 `graphic_frame`，不要移动 `Image`。
- 要裁切/取景图片，才移动或缩放 `placed_graphic_content`。
- 要改文本内容，先查 `Story` 和串联关系。
- 要改样式，区分全局样式资源和局部覆盖。
- 要改母版内容，先确认 override/detach 状态。
- 修改工具优先使用稳定 selector，不优先使用 `itemIndex`。

## 兼容策略

第一阶段：增强 inspector 和结构化返回，不改变旧输入。

第二阶段：给旧工具增加 warning、`targetWasExplicit`、`semantic.role`、`operationHint`。

第三阶段：新增窄语义工具域，如 `frame`、`image`、`story`、`style`、`link`、`selector`。

第四阶段：更新 Agent Skill 和示例，让 Agent 优先用新工具，旧工具作为底层兼容入口。

旧工具不删除，除非后续有明确废弃周期、迁移检查和真实 E2E 覆盖。

## 测试要求

新增或修改工具时至少覆盖：

- `Rectangle` 图框包含 `Image` 时，返回 `graphic_frame` 和 child `placed_graphic_content`。
- 移动 `graphic_frame` 后，图框和内部内容在版面上一起移动。
- 移动 `placed_graphic_content` 后，返回裁切/取景 warning。
- 串联 `TextFrame` 返回共享 `Story` 和 `overset` 状态。
- 修改文本前能识别 `THREAD_SHARED_STORY`。
- 应用样式能区分 `appliedStyle` 和 `localOverrides`。
- 对锁定对象、锁定图层、隐藏图层返回有效可编辑性。
- 母版项返回继承、覆盖、分离状态。
- `selector.query_items` 多候选时不自动修改。
- 链接资产返回状态，并结构化区分 `missing`、`modified`、`embedded`。
- CLI 单元测试覆盖 schema、envelope 和 warning。
- 真实 InDesign E2E 覆盖至少：图片图框、串联文本、样式应用、母版覆盖、链接状态。

## 验收标准

- Agent 通过 inspector 可以判断对象的 InDesign 原生类型、语义角色、父子关系和可执行动作。
- Agent 不需要猜 `Image`、`TextFrame`、`Story`、`Rectangle`、`MasterSpread` 的实际含义。
- 常见排版任务能用窄语义工具完成，不需要直接写 JSX。
- 旧工具调用仍能运行，并在目标语义不清时给出 warning。
- 工具输出足以支持固定语义 HTML 到 InDesign 的对象映射。

## Coverage Matrix

语义化范围需要分层推进。不是所有 InDesign 能力第一版都做写工具，但必须给每个已知对象域一个语义落点，避免后续继续散落特例。

| 对象域 | 阶段 | 语义角色 / 关键字段 | 典型 warning | 测试策略 |
| --- | --- | --- | --- | --- |
| Document / Window / Active Context | core v1 | `document`、`activeContext`、`targetWasExplicit` | `TARGET_IMPLICIT_ACTIVE_CONTEXT` | 单元 + 无文档/多文档真实检查 |
| Page / Spread / MasterSpread | core v1 | `page`、`spread`、`master_spread`、`displayPageLabel` | `MASTER_ITEM_NOT_OVERRIDDEN` | 真实 E2E |
| PageItem / Frame / Content | core v1 | `graphic_frame`、`placed_graphic_content`、`shape_frame` | `MOVING_PLACED_CONTENT_NOT_FRAME` | 真实 E2E |
| TextFrame / Story / Table | core v1 | `text_frame`、`story`、`table`、`overset` | `THREAD_SHARED_STORY` | fixture + 真实 E2E |
| Styles / Swatches / Fonts | core v1 | `paragraph_style`、`object_style`、`swatch`、`font` | `STYLE_RESOURCE_CHANGE_GLOBAL_EFFECT` | 单元 + 真实 E2E |
| Links / Placed Assets | core v1 | `link`、`assetKind`、`linkStatus`、`parentFrame` | `LINK_MISSING`、`LINK_MODIFIED` | fixture + 真实 E2E |
| Layers / Lock / Visibility | core v1 | `layer`、`effectiveEditable`、`effectiveVisible` | `TARGET_ON_LOCKED_LAYER` | 单元 + 真实 E2E |
| Selector / Script Labels / Slots | core v1 | `selector`、`slotKey`、`labelRaw`、`labelJson` | `MULTIPLE_TARGETS_MATCHED` | contract + fixture |
| XML / Structure Tree | known-deferred | `xml_element`、`xml_attribute`、`storyBinding` | `XML_STRUCTURE_MUTATION_GLOBAL_EFFECT` | 后续 fixture |
| Hyperlinks / Cross References | known-deferred | `hyperlink`、`cross_reference`、`destination` | `BROKEN_REFERENCE` | 后续 fixture |
| Footnotes / Endnotes | known-deferred | `footnote`、`endnote`、`parentStory` | `TEXT_FLOW_SIDE_EFFECT` | 后续 fixture |
| Conditional Text | known-deferred | `condition`、`conditional_text_range` | `CONDITION_VISIBILITY_SIDE_EFFECT` | 后续 fixture |
| Text Variables / Sections / Numbering | known-deferred | `text_variable`、`section`、`numbering` | `DISPLAY_PAGE_LABEL_CHANGED` | 后续 fixture |
| TOC / Index | known-deferred | `toc_style`、`index_topic`、`generated_story` | `GENERATED_CONTENT_OVERWRITE` | 后续 fixture |
| Interactive Objects | known-deferred | `button`、`form_field`、`media`、`animation` | `EXPORT_FORMAT_DEPENDENT` | 后续 fixture |
| Libraries / Snippets | known-deferred | `library_asset`、`snippet` | `EXTERNAL_LIBRARY_DEPENDENCY` | 后续 fixture |
| Place / Import Options | core v1 for images, deferred for full matrix | `place_options`、`import_options` | `IMPORT_OPTION_IGNORED` | unit + selected E2E |
| Color Management / Profiles | known-deferred | `color_profile`、`intent` | `COLOR_PROFILE_MISMATCH` | 后续 fixture |
| Preflight Profiles / Issues | core v1 read-only | `preflight_profile`、`preflight_issue` | `PREFLIGHT_FAILED` | fixture + export verify |
| Book / Export Artifacts | core v1 | `book`、`book_content`、`artifact`、`verifyResult` | `BOOK_SYNC_GLOBAL_EFFECT` | CLI + artifact verify |

`known-deferred` 表示语义扩展表先占位并记录边界，第一版可只读或不暴露写工具。`unsupported` 只能用于明确不打算支持的能力，并必须写明替代路径。

## 推荐实施顺序

1. 新增 `src/semantics/contract.js`、`schemas.js`、`nativeTypes.js`、`toolSemantics.js`，先固定 `semanticContractVersion`、payload schema、warning schema 和语义扩展形状。
2. 建立 `tests/fixtures/semantics/` golden fixtures 和 contract tests，先测 schema、normalizer、warning 合并。
3. 新增 `src/semantics/warnings.js`、`normalizers.js`，并接入 CLI envelope 的解析路径；CLI v2 顶层 `warnings` 仍保持字符串数组。
4. 增加 canonical registry artifact 的语义扩展字段和校验，让 Python CLI catalog 复用同一 artifact。
5. 新增 `src/semantics/jsxRuntime.js`，把 ExtendScript DOM 推断、父子关系、bounds 序列化集中成共享 snippet。
6. 增强 `page.list_page_items` 和 `get_page_item_info` 为结构化 inspector，并支持 `verbosity/include/maxItems/pageSize/cursor`。
7. 新增 `selector.query_items`，先解决“找对象”和“重验证”。
8. 给现有通用写工具加 warning、`semanticContractVersion`、`targetWasExplicit` 和 before/after diff。
9. 新增 `frame.*`、`image.*`、`story.*`、`style.*`、`link.*` 等窄语义工具。
10. 更新 CLI 文档、Agent Skill、MCP prompt，让说明复用 canonical registry + `src/semantics/` 语义扩展。
11. 每阶段运行 schema tests、CLI 单元测试；触及真实 InDesign 行为时补真实 E2E 和性能验收。

## 自检结论

本方案已经从单个图片图框问题扩展到 InDesign 全工具语义层。核心不是给每个工具多写几句说明，而是统一建立 `native identity + semantic role + scope/hierarchy + geometry/state + affordances/warnings` 的返回契约。这样 Agent 既能看到 InDesign 原生对象名，又能直接理解这些对象在排版任务里的真实作用。
