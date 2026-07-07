import {
    defineTemplateTool,
    escapeFilePathForJsx,
    escapeJsxString,
    formatErrorResponse,
    formatResponse,
    JSON_HELPERS_SNIPPET,
    LABEL_PARSER_SNIPPET,
    normalizeFsPathForJsx,
    parseTemplateJsonResult,
    runScript,
    SLOT_COLLECTION_SNIPPET,
    templateContract
} from './_shared.js';
import {
    getPageInformationSchema,
    inspectTemplateBlueprintSchema,
    listTemplateBlueprintsSchema
} from './schemas.js';

export async function inspectTemplateBlueprint(args) {
    const { templatePath } = args || {};
    const hasPath = typeof templatePath === 'string' && templatePath.trim().length > 0;
    const normalizedPath = hasPath ? normalizeFsPathForJsx(templatePath) : '';
    const templatePathJsx = hasPath ? escapeFilePathForJsx(templatePath) : '';
    const script = [
        JSON_HELPERS_SNIPPET,
        LABEL_PARSER_SNIPPET,
        SLOT_COLLECTION_SNIPPET,
        `
var useActive = ${hasPath ? 'false' : 'true'};
var templatePathValue = "${templatePathJsx}";
var normalizedPathValue = "${escapeJsxString(normalizedPath)}";
var doc = null;
var __mcpResult = null;

try {
  if (useActive) {
    if (app.documents.length === 0) {
      __mcpResult = { success: false, error: "没有打开的文档，请提供模板路径。" };
    } else {
      doc = app.activeDocument;
      templatePathValue = doc.fullName ? doc.fullName.fsName : "";
      normalizedPathValue = doc.fullName ? doc.fullName.fsName : doc.name;
    }
  } else {
    var templateFile = File(templatePathValue);
    if (!templateFile.exists) {
      __mcpResult = { success: false, error: "模板文件不存在: " + templatePathValue };
    } else {
      doc = app.open(templateFile, false);
      templatePathValue = templateFile.fsName;
      normalizedPathValue = "${escapeJsxString(normalizedPath)}";
    }
  }

  if (!__mcpResult) {
    var mmPerPoint = 25.4 / 72;
    var templatePathJson = normalizedPathValue ? String(normalizedPathValue).replace(/\\\\/g, '/') : "";
    var templateFsPathJson = templatePathValue ? String(templatePathValue).replace(/\\\\/g, '/') : "";
    var data = {
      templatePath: templatePathJson,
      templateFsPath: templateFsPathJson,
      documentName: doc.name,
      pageCount: doc.pages.length,
      pages: [],
      masters: []
    };
    var summaryMap = {};
    var notesLayer = null;
    try {
      notesLayer = doc.layers.itemByName("PageNotes");
      if (!notesLayer || !notesLayer.isValid) {
        notesLayer = null;
      }
    } catch (_notesError) {
      notesLayer = null;
    }

    for (var i = 0; i < doc.pages.length; i++) {
      var page = doc.pages[i];
      var pageEntry = {
        pageIndex: i,
        pageName: page.name,
        notes: "",
        slots: []
      };
      if (notesLayer) {
        var notes = [];
        var noteFrames = notesLayer.textFrames;
        for (var n = 0; n < noteFrames.length; n++) {
          var noteFrame = noteFrames[n];
          if (noteFrame && noteFrame.isValid && noteFrame.parentPage && noteFrame.parentPage.id === page.id) {
            notes.push(noteFrame.contents);
          }
        }
        if (notes.length) {
          pageEntry.notes = notes.join("\\n").replace(/\\s+$/, "");
        }
      }
      __mcpCollectSlotsFromItems(
        page.pageItems,
        pageEntry.slots,
        summaryMap,
        mmPerPoint,
        { type: "page", pageIndex: i, pageName: page.name }
      );
      data.pages.push(pageEntry);
    }

    for (var m = 0; m < doc.masterSpreads.length; m++) {
      var master = doc.masterSpreads[m];
      if (!master || !master.isValid) continue;
      var masterEntry = {
        masterIndex: m,
        masterName: master.name,
        slots: []
      };
      __mcpCollectSlotsFromItems(
        master.pageItems,
        masterEntry.slots,
        summaryMap,
        mmPerPoint,
        { type: "master", masterIndex: m, masterName: master.name }
      );
      data.masters.push(masterEntry);
    }

    data.slotSummary = [];
    for (var key in summaryMap) {
      if (!summaryMap.hasOwnProperty(key)) continue;
      data.slotSummary.push(summaryMap[key]);
    }
    __mcpResult = { success: true, data: data };
  }
} catch (err) {
  __mcpResult = { success: false, error: err.message || String(err) };
} finally {
  if (!useActive && doc && doc.isValid) {
    doc.close(SaveOptions.NO);
  }
  __mcpSerialize(__mcpResult || { success: false, error: "未知错误" });
}
`
    ].join('\n');

    try {
        const rawResult = await runScript(script);
        const data = parseTemplateJsonResult(rawResult, 'Inspect Template Blueprint');
        return formatResponse(data, 'Inspect Template Blueprint');
    } catch (error) {
        return formatErrorResponse(error.message, 'Inspect Template Blueprint');
    }
}

export async function listTemplateBlueprints() {
    const script = [
        JSON_HELPERS_SNIPPET,
        LABEL_PARSER_SNIPPET,
        SLOT_COLLECTION_SNIPPET,
        `
if (app.documents.length === 0) {
  __mcpSerialize({ success: false, error: "没有打开的文档。" });
} else {
  var doc = app.activeDocument;
  var mmPerPoint = 25.4 / 72;
  var results = [];
  for (var m = 0; m < doc.masterSpreads.length; m++) {
    var master = doc.masterSpreads[m];
    if (!master || !master.isValid) continue;
    var slots = [];
    __mcpCollectSlotsFromItems(
      master.pageItems,
      slots,
      null,
      mmPerPoint,
      { type: "master", masterIndex: m, masterName: master.name }
    );
    var slotNames = [];
    for (var s = 0; s < slots.length; s++) {
      var name = slots[s].slotName;
      var exists = false;
      for (var n = 0; n < slotNames.length; n++) {
        if (slotNames[n] === name) { exists = true; break; }
      }
      if (!exists) slotNames.push(name);
    }
    results.push({
      masterIndex: m,
      masterName: master.name,
      slotCount: slots.length,
      slotNames: slotNames
    });
  }
  __mcpSerialize({ success: true, data: results });
}
`
    ].join('\n');

    try {
        const rawResult = await runScript(script);
        const data = parseTemplateJsonResult(rawResult, 'List Template Blueprints');
        return formatResponse(data, 'List Template Blueprints');
    } catch (error) {
        return formatErrorResponse(error.message, 'List Template Blueprints');
    }
}

export async function getPageInformation(args) {
    const { pageIndex } = args || {};
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
        return formatErrorResponse('pageIndex 必须是非负整数。', 'Get Page Information');
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
  if (${pageIndex} >= doc.pages.length) {
    __mcpSerialize({ success: false, error: "页面索引超出范围。" });
  } else {
    var page = doc.pages[${pageIndex}];
    var mmPerPoint = 25.4 / 72;
    var slots = [];
    __mcpCollectSlotsFromItems(
      page.pageItems,
      slots,
      null,
      mmPerPoint,
      { type: "page", pageIndex: page.documentOffset, pageName: page.name }
    );

    var appliedMasterName = "";
    try {
      if (page.appliedMaster && page.appliedMaster.isValid) {
        appliedMasterName = page.appliedMaster.name;
      }
    } catch(_masterErr) {}

    var response = {
      pageIndex: page.documentOffset,
      pageName: page.name,
      appliedMaster: appliedMasterName,
      slotCount: slots.length,
      slots: slots
    };
    __mcpSerialize({ success: true, data: response });
  }
}
`
    ].join('\n');

    try {
        const rawResult = await runScript(script);
        const data = parseTemplateJsonResult(rawResult, 'Get Page Information');
        return formatResponse(data, 'Get Page Information');
    } catch (error) {
        return formatErrorResponse(error.message, 'Get Page Information');
    }
}

export const inspectTemplateBlueprintTool = defineTemplateTool({
    name: 'inspect_template_blueprint',
    description: '读取指定模板的槽位说明、页面备注以及 PageNotes 图层中的说明信息，输出结构化 JSON。',
    contract: templateContract(),
    inputSchema: inspectTemplateBlueprintSchema,
    handler: inspectTemplateBlueprint
});

export const listTemplateBlueprintsTool = defineTemplateTool({
    name: 'list_template_blueprints',
    description: '概览当前文档内所有母版模板，返回每个模板的槽位数量和槽位名称列表，帮助 Agent 快速挑选合适模板。',
    contract: templateContract(),
    inputSchema: listTemplateBlueprintsSchema,
    handler: listTemplateBlueprints
});

export const getPageInformationTool = defineTemplateTool({
    name: 'get_page_information',
    description: '返回指定页面当前套用的母版及脚本标签槽位详情，包含尺寸、文本预览、是否 override 等信息。',
    cliId: 'page.get_page_information',
    contract: templateContract({ requiresActiveDocument: true }),
    inputSchema: getPageInformationSchema,
    handler: getPageInformation
});

export const tools = [
    getPageInformationTool,
    inspectTemplateBlueprintTool,
    listTemplateBlueprintsTool
];
