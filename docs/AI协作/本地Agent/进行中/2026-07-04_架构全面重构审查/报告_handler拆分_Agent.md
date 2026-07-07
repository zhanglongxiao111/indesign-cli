# 报告：handler 拆分审查

只读审查，未修改文件，未启动长期服务。
已对相关当前文件做过 `node --check`，未见语法问题。

## 结论摘要

当前代码的真实形态是“domain facade + 重复执行模板”，不是一个已经可随意横切抽象的统一层。`scriptExecutor.js:180-244` 已经负责执行，`stringUtils.js:26-119` 已经负责通用结果归一化，所以 `src/handlers/runtime.js` 只能做薄组合层，不应再吞掉 `sessionManager`、定位、slot 解析、标签解析或文档状态逻辑。

`documentHandlers.js` 是最重的混合点，且已经用分段标题把自然边界写出来了，见 `documentHandlers.js:304/398/551/783/866/941/1008/1069/1133/1185/1417`。
`pageItemHandlers.js` 和 `advancedTemplateHandlers.js` 是当前最明显的“JSON 结果语义重复”来源，前者在 `pageItemHandlers.js:109-130`，后者在 `advancedTemplateHandlers.js:274-295`。
因此，拆分顺序应该按耦合和语义风险排，不应按“谁行数更大”排。

## handler 职责切分表

| 文件 | 当前混合职责 | 建议拆分 |
| --- | --- | --- |
| `src/handlers/documentHandlers.js` | 生命周期、信息查询、偏好、结构/XML、云协作、网格/布局、校验/清理，且会写 `sessionManager` | `document/lifecycle.js`、`inspection.js`、`preferences.js`、`structure.js`、`cloud.js`、`layout.js`、`validation.js`，旧 `DocumentHandlers` 保留 facade |
| `src/handlers/pageHandlers.js` | 页面生命周期、属性、布局/缩放、放置、快照、引导线、选中、背景 | `page/lifecycle.js`、`properties.js`、`layout.js`、`placement.js`、`snapshot.js`、`guides.js`、`background.js` |
| `src/handlers/graphicsHandlers.js` | 几何图形创建、图片放置、对象样式、图片检查，且写 `sessionManager` | `graphics/shapes.js`、`images.js`、`objectStyles.js`、`inspection.js` |
| `src/handlers/pageItemHandlers.js` | page item CRUD/变换/属性 + script label 读写 + 自定义 JSON 序列化/解析 | `pageItem/basic.js`、`scriptLabels.js`、`listing.js` |
| `src/handlers/advancedTemplateHandlers.js` | JSX 文件执行、模板盘点/检查、按模板建页、页面信息、slot 填充 | `template/fileRunner.js`、`inspection.js`、`composition.js`、`population.js` |
| `src/handlers/bookHandlers.js` | book 生命周期、同步/重分页/编号维护、导出/打包/打印、信息、属性 | `book/lifecycle.js`、`maintenance.js`、`output.js`、`inspection.js`、`properties.js` |
| `src/handlers/spreadHandlers.js` | spread 生命周期、属性、引导线、放置、选择、摘要 | `spread/lifecycle.js`、`inspection.js`、`placement.js`、`guides.js`、`properties.js` |
| `src/handlers/exportHandlers.js` | PDF、图片、打包、EPUB 四种输出路径 | 可按格式拆 `pdf.js`、`images.js`、`package.js`、`epub.js`，但优先级低于上面几类 |
| `src/handlers/utilityHandlers.js` | 原始代码执行、文档视图、session 信息、清理 session | `utility/execution.js`、`inspection.js`、`session.js` |

## runtime helper 候选能力

`runtime.js` 应该是薄层，复用 `ScriptExecutor` 和 `formatResponse`，而不是替代它们。

| 候选能力 | 适用位置 | 建议 |
| --- | --- | --- |
| `runScript(operation, script)` | 所有只返回字符串或普通对象的工具，主要是 `document/page/graphics/book/spread/export/utility` 里的简单方法 | 只做 `executeInDesignScript` + `formatResponse`，不要再塞业务校验 |
| `runJsonScript(operation, script, opts)` | `advancedTemplateHandlers.inspectTemplate`、`listTemplateBlueprints`、`createPageWithTemplate`、`getPageInformation`、`fillTemplateFromSlots`，以及 `pageItemHandlers.getPageItemScriptLabels`、`setPageItemScriptLabel` | 只负责执行 + 解析 + 包装，`opts.strict` 决定遇错是抛出还是返回结构化错误 |
| `runScriptFile(operation, filePath)` | `advancedTemplateHandlers.runJsxFile` | 复用 `executeInDesignScriptFile`，文件存在性和扩展名校验仍留在 handler |
| `parseJsonResult(raw, operation, opts)` | `advancedTemplateHandlers` 和 `pageItemHandlers` 当前重复的 parse 逻辑 | 做成低层共享函数，但要允许不同失败策略，不能强行统一成一种语义 |

`advancedTemplateHandlers.js` 现在的 `parseJsonResult` 是“失败就抛”，`pageItemHandlers.js` 的 `parseJsonResult` 是“失败就返回 `{ success:false }`”。这说明 runtime 不能只塞一个固定政策，应该保留 policy 参数。

## 不应抽象的能力

- `sessionManager` 相关写入和读取，不要进 runtime。`documentHandlers.js:104-105,174-182`、`graphicsHandlers.js:25-35,95,122-132,179,251,369`、`utilityHandlers.js:72-80` 都是 domain 状态，不是通用执行层。
- `No document open`、`pageIndex/itemIndex/spreadIndex/masterIndex` 等目标校验，不要进 runtime。那是每个 domain 的边界语义。
- `JSON_HELPERS_SNIPPET`、`LABEL_PARSER_SNIPPET`、`SLOT_COLLECTION_SNIPPET`、`JSON_SERIALIZER_SNIPPET`、`buildSlotValuesScript` 这类 JSX 内容生成器，不是 Node runtime 能力。
- `documentState`、`allowDiscard`、`expectedDocumentName`、`fitMode`、`preset`、`pageRange`、`ExportFormat` 映射这类业务规则，不要被 runtime 吃掉。
- `createDocument`、`closeDocument`、`setPageBackground`、`placeImage` 这类带状态副作用的操作，应该继续留在领域 handler 里，而不是抽到一层“通用动作”。

## 风险列表：P0/P1/P2

| 级别 | 风险 | 证据 / 触发点 |
| --- | --- | --- |
| P0 | 如果先改内部拆分、却没有保住 facade 和类名，`InDesignMCPServer` 和 `advanced/index.js` 会立刻断 import | `src/handlers/index.js:9-33`，`src/core/InDesignMCPServer.js:8-25`，`src/advanced/index.js:5-14` |
| P1 | `runtime.js` 过度抽象，把 session 或 target resolution 一起吞掉，会把 `documentHandlers` 和 `graphicsHandlers` 的隐式行为改坏 | `documentHandlers.js:104-105,174-182`，`graphicsHandlers.js:25-35,95,122-132,179,251,369` |
| P1 | `advancedTemplateHandlers` 和 `pageItemHandlers` 的 JSON 语义当前并不一致，强行统一会改变失败行为 | `advancedTemplateHandlers.js:274-295`，`pageItemHandlers.js:109-130` |
| P2 | 先拆 `bookHandlers`、`spreadHandlers`、`exportHandlers`、`utilityHandlers` 这类薄 facade，收益小于风险控制收益 | 它们大多只是 `ScriptExecutor.executeInDesignScript` + `formatResponse` 的重复壳 |

## 对正式 spec 的修改建议

1. 把 `runtime` 的职责写死为“执行 + 结果归一化 + JSON 结果解析”，明确禁止把 `sessionManager`、slot 解析、标签解析、目标定位塞进去。
2. 调整拆分顺序。更低风险顺序是：先 `layerHandlers`、`utilityHandlers`、`exportHandlers`、`spreadHandlers`、`bookHandlers` 这类薄边界，再 `pageItemHandlers`，再 `advancedTemplateHandlers`，再 `pageHandlers` / `graphicsHandlers`，`documentHandlers` 放最后。
3. 在 spec 里明确保留兼容 facade。`src/handlers/index.js`、`src/advanced/index.js`、以及当前顶层 `*Handlers` 类名，在 `InDesignMCPServer` 和测试索引迁移完成前都不能断。
4. 加硬性验收条件。拆分后不应再出现新的 `JSON.parse` 私有实现、`ScriptExecutor.executeInDesignScript` 重复包装、或 `runtime` 里的 session 写入。`documentHandlers` 的分段标题可以直接作为切分线。

## 建议的验证命令

```powershell
node --check src\core\scriptExecutor.js
node --check src\core\InDesignMCPServer.js
node --check src\handlers\documentHandlers.js
node --check src\handlers\pageHandlers.js
node --check src\handlers\graphicsHandlers.js
node --check src\handlers\bookHandlers.js
node --check src\handlers\spreadHandlers.js
node --check src\handlers\exportHandlers.js
node --check src\handlers\utilityHandlers.js
node --check src\handlers\pageItemHandlers.js
node --check src\handlers\advancedTemplateHandlers.js
node scripts\validate_schemas.js
node scripts\check_duplicates.mjs
node scripts\quick_check.mjs
node tests\index.js --required
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
```

触及真实 InDesign 行为时，再补：

```powershell
node tests\real-e2e\run-architecture-presentation.mjs --full --offline
```

