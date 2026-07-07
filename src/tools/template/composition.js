import {
    defineTemplateTool,
    escapeJsxString,
    formatErrorResponse,
    formatResponse,
    JSON_HELPERS_SNIPPET,
    LABEL_PARSER_SNIPPET,
    parseTemplateJsonResult,
    runScript,
    SLOT_COLLECTION_SNIPPET,
    templateContract
} from './_shared.js';
import { createPageWithTemplateSchema } from './schemas.js';

export async function createPageWithTemplate(args) {
    const {
        templateName,
        position = 'AT_END',
        referencePageIndex,
        label = ''
    } = args || {};

    if (!templateName || typeof templateName !== 'string') {
        return formatErrorResponse('templateName 必须是母版名称字符串。', 'Create Page With Template');
    }

    const script = [
        JSON_HELPERS_SNIPPET,
        LABEL_PARSER_SNIPPET,
        SLOT_COLLECTION_SNIPPET,
        `
if (app.documents.length === 0) {
  __mcpSerialize({ success: false, error: "没有打开的文档。" });
} else {
  var doc = app.activeDocument;
  var master = doc.masterSpreads.itemByName("${escapeJsxString(templateName)}");
  if (!master || !master.isValid) {
    __mcpSerialize({ success: false, error: "未找到母版：" + "${escapeJsxString(templateName)}" });
  } else {
    var pos = "${escapeJsxString(position || '')}";
    var refIndex = ${Number.isInteger(referencePageIndex) ? referencePageIndex : 'null'};
    var resultObj = null;
    var newPage = null;
    try {
    if (pos === "AT_BEGINNING") {
        newPage = doc.pages.add(LocationOptions.AT_BEGINNING);
      } else if (pos === "BEFORE" && refIndex !== null && refIndex >= 0 && refIndex < doc.pages.length) {
        newPage = doc.pages.add(LocationOptions.BEFORE, doc.pages[refIndex]);
      } else if (pos === "AFTER" && refIndex !== null && refIndex >= 0 && refIndex < doc.pages.length) {
        newPage = doc.pages.add(LocationOptions.AFTER, doc.pages[refIndex]);
      } else {
        newPage = doc.pages.add();
      }
      newPage.appliedMaster = master;
      if ("${escapeJsxString(label)}" !== "") {
        try { newPage.label = "${escapeJsxString(label)}"; } catch(_labelErr) {}
      }
      var overrideCount = 0;
      try {
        var masterItems = master.pageItems;
        for (var i = 0; i < masterItems.length; i++) {
          var item = masterItems[i];
          try {
            item.override(newPage);
            overrideCount++;
          } catch (_overrideErr) {}
        }
      } catch (_missingMasterItems) {}
      try {
        var mx = newPage.masterPageTransform;
        if (mx && (mx.horizontalTranslation !== 0 || mx.verticalTranslation !== 0)) {
          newPage.transform(
            CoordinateSpaces.INNER_COORDINATES,
            AnchorPoint.CENTER_ANCHOR,
            mx.invertMatrix()
          );
        }
      } catch(_transformErr) {}

      var mmPerPoint = 25.4 / 72;
      var collectedSlots = [];
      var slotSummaryMap = {};
      try {
        __mcpCollectSlotsFromItems(
          newPage.pageItems,
          collectedSlots,
          slotSummaryMap,
          mmPerPoint,
          { type: "page", pageIndex: newPage.documentOffset, pageName: newPage.name }
        );
      } catch(_collectErr) {}

      var slotSummaries = [];
      for (var s = 0; s < collectedSlots.length; s++) {
        var slot = collectedSlots[s];
        if (!slot) continue;
        var summary = {
          slotName: slot.slotName || "",
          declaredType: slot.declaredType || "",
          description: slot.description || ""
        };
        if (slot.metadata && typeof slot.metadata === "object") {
          summary.metadata = slot.metadata;
        }
        slotSummaries.push(summary);
      }

      resultObj = {
        success: true,
        data: {
          pageIndex: newPage.documentOffset,
          pageName: newPage.name,
          appliedMaster: master.name,
          overrideCount: overrideCount,
          totalMasterItems: master.pageItems.length,
          slotCount: slotSummaries.length,
          slots: slotSummaries
        }
      };
    } catch (pageErr) {
      resultObj = { success: false, error: "新增页面失败：" + pageErr.message };
    }

    if (!resultObj) {
      resultObj = { success: false, error: "未知错误" };
    }
    __mcpSerialize(resultObj);
  }
}
`
    ].join('\n');

    try {
        const rawResult = await runScript(script);
        const data = parseTemplateJsonResult(rawResult, 'Create Page With Template');
        return formatResponse(data, 'Create Page With Template');
    } catch (error) {
        return formatErrorResponse(error.message, 'Create Page With Template');
    }
}

export const createPageWithTemplateTool = defineTemplateTool({
    name: 'create_page_with_template',
    description: '新建页面并套用指定母版模板，随后自动 override 母版上的脚本标签元素，返回页面索引等信息。',
    contract: templateContract({ requiresActiveDocument: true, mutatesDocument: true }),
    inputSchema: createPageWithTemplateSchema,
    handler: createPageWithTemplate
});

export const tools = [createPageWithTemplateTool];
