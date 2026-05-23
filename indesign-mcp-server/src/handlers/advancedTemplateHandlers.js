import fs from 'fs';
import path from 'path';
import { ScriptExecutor } from '../core/scriptExecutor.js';
import {
    escapeFilePathForJsx,
    escapeJsxString,
    normalizeFsPathForJsx,
    formatResponse,
    formatErrorResponse
} from '../utils/stringUtils.js';

const JSON_HELPERS_SNIPPET = `
function __mcpSeenContains(arr, value) {
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] === value) {
      return true;
    }
  }
  return false;
}
function __mcpEscapeJsonString(str) {
  if (str === null || str === undefined) return "";
  var result = "";
  var backslash = String.fromCharCode(92);
  for (var i = 0; i < str.length; i++) {
    var ch = str.charAt(i);
    var code = str.charCodeAt(i);
    if (code === 34) { // "
      result += backslash + '"';
    } else if (code === 92) { // \
      result += backslash + backslash;
    } else if (code === 8) { // \b
      result += backslash + "b";
    } else if (code === 9) { // \t
      result += backslash + "t";
    } else if (code === 10) { // \n
      result += backslash + "n";
    } else if (code === 12) { // \f
      result += backslash + "f";
    } else if (code === 13) { // \r
      result += backslash + "r";
    } else if (code === 0x2028 || code === 0x2029) {
      result += backslash + "u" + code.toString(16);
    } else if (code < 32) {
      var hex = code.toString(16);
      result += backslash + "u" + ("0000" + hex).slice(-4);
    } else {
      result += ch;
    }
  }
  return result;
}
function __mcpSerialize(value) {
  var seen = [];
  function serialize(v) {
    if (v === null) return "null";
    var t = typeof v;
    if (t === "number" || t === "boolean") {
      return String(v);
    }
    if (t === "string") {
      return "\\""+__mcpEscapeJsonString(v)+"\\"";
    }
    if (v instanceof Array) {
      var arr = [];
      for (var i = 0; i < v.length; i++) {
        arr.push(serialize(v[i]));
      }
      return "[" + arr.join(",") + "]";
    }
    if (t === "object") {
      if (__mcpSeenContains(seen, v)) {
        return '"[Circular]"';
      }
      seen.push(v);
      var props = [];
      for (var key in v) {
        if (!v.hasOwnProperty(key)) continue;
        props.push("\\"" + __mcpEscapeJsonString(key) + "\\":" + serialize(v[key]));
      }
      seen.pop();
      return "{" + props.join(",") + "}";
    }
    return "null";
  }
  return serialize(value);
}
`;

const LABEL_PARSER_SNIPPET = `
function __mcpParseSlotLabel(rawLabel) {
  var result = { raw: rawLabel, fields: {}, slotName: "", declaredType: "", description: "" };
  if (!rawLabel) {
    return result;
  }
  var segments = rawLabel.split(/[;；\\n]/);
  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    if (!seg) continue;
    var parts = seg.split(/[:=：]/);
    if (parts.length < 2) continue;
    var key = parts.shift();
    var value = parts.join('=');
    key = key.replace(/^\\s+|\\s+$/g, '');
    value = value.replace(/^\\s+|\\s+$/g, '');
    if (!key) continue;
    result.fields[key] = value;
  }
  result.slotName = result.fields["槽位"] || result.fields["名称"] || result.fields["名字"] || result.fields["slot"] || result.fields["name"] || "";
  result.declaredType = result.fields["类型"] || result.fields["type"] || "";
  result.description = result.fields["说明"] || result.fields["备注"] || result.fields["描述"] || result.fields["desc"] || "";
  return result;
}
`;

const FIT_RESOLVER_SNIPPET = `
function __mcpResolveFitOption(name) {
  if (!name) return FitOptions.PROPORTIONALLY;
  var n = String(name).toUpperCase();
  if (n === "FILL_FRAME" || n === "FILL_PROPORTIONALLY" || n === "填满框架") {
    return FitOptions.FILL_PROPORTIONALLY;
  }
  if (n === "FIT_CONTENT" || n === "CONTENT_TO_FRAME" || n === "内容适应") {
    return FitOptions.CONTENT_TO_FRAME;
  }
  if (n === "FIT_FRAME" || n === "FRAME_TO_CONTENT" || n === "框架适应内容") {
    return FitOptions.FRAME_TO_CONTENT;
  }
  if (n === "CENTER" || n === "CENTER_CONTENT" || n === "居中") {
    return FitOptions.CENTER_CONTENT;
  }
  return FitOptions.PROPORTIONALLY;
}
`;

const SLOT_COLLECTION_SNIPPET = `
function __mcpBuildSlotInfo(item, parsed, mmPerPoint, context) {
  var gb = item.geometricBounds;
  var slotInfo = {
    slotName: parsed.slotName,
    declaredType: parsed.declaredType,
    description: parsed.description,
    frameType: item.constructor ? item.constructor.name : "",
    reflectName: item.reflect ? item.reflect.name : "",
    layer: (item.itemLayer && item.itemLayer.isValid) ? item.itemLayer.name : "",
    label: item.label,
    contextType: context.type || "",
    pageIndex: (typeof context.pageIndex === "number") ? context.pageIndex : null,
    pageName: context.pageName || "",
    masterIndex: (typeof context.masterIndex === "number") ? context.masterIndex : null,
    masterName: context.masterName || "",
    boundsPoints: {
      top: gb[0],
      left: gb[1],
      bottom: gb[2],
      right: gb[3]
    },
    boundsMillimeters: {
      top: gb[0] * mmPerPoint,
      left: gb[1] * mmPerPoint,
      bottom: gb[2] * mmPerPoint,
      right: gb[3] * mmPerPoint,
      width: (gb[3] - gb[1]) * mmPerPoint,
      height: (gb[2] - gb[0]) * mmPerPoint
    },
    hasGraphic: (item.graphics && item.graphics.length > 0),
    textPreview: "",
    isOverride: false,
    childCount: 0
  };
  if (parsed.fields) {
    slotInfo.metadata = parsed.fields;
  }
  try {
    var previewContents = "";
    if (slotInfo.frameType === "TextFrame") {
      previewContents = item.contents;
    } else if (typeof item.contents !== 'undefined') {
      previewContents = item.contents;
    }
    if (!previewContents && item.textFrames && item.textFrames.length) {
      previewContents = item.textFrames[0].contents;
    }
    if (previewContents && previewContents.length > 120) {
      previewContents = previewContents.substr(0, 120);
    }
    slotInfo.textPreview = previewContents || "";
  } catch(_previewErr) {
    slotInfo.textPreview = "";
  }
  try {
    if (item.hasOwnProperty('isOverridden')) {
      slotInfo.isOverride = item.isOverridden === true;
    }
  } catch(_overrideFlagError) {}
  try {
    var children = item.pageItems;
    if (children && children.length) {
      slotInfo.childCount = children.length;
      var childSummary = [];
      for (var ci = 0; ci < children.length; ci++) {
        var child = children[ci];
        childSummary.push({
          label: child.label,
          frameType: child.constructor ? child.constructor.name : "",
          reflectName: child.reflect ? child.reflect.name : ""
        });
      }
      slotInfo.children = childSummary;
    }
  } catch(_childInfoErr) {}
  return slotInfo;
}

function __mcpAddSummary(summaryMap, slotInfo, parsed, context) {
  var entry = summaryMap[slotInfo.slotName];
  if (!entry) {
    entry = {
      slotName: slotInfo.slotName,
      declaredType: parsed.declaredType || "",
      occurrences: 0,
      contexts: []
    };
    summaryMap[slotInfo.slotName] = entry;
  }
  entry.occurrences += 1;
  if (!entry.declaredType && parsed.declaredType) {
    entry.declaredType = parsed.declaredType;
  }
  entry.contexts.push({
    contextType: context.type || "",
    pageIndex: (typeof context.pageIndex === "number") ? context.pageIndex : null,
    pageName: context.pageName || "",
    masterIndex: (typeof context.masterIndex === "number") ? context.masterIndex : null,
    masterName: context.masterName || "",
    frameType: slotInfo.frameType
  });
}

function __mcpCollectSlotsFromItem(item, slotsArray, summaryMap, mmPerPoint, context) {
  if (!item || !item.isValid) return;
  if (item.itemLayer && item.itemLayer.isValid && item.itemLayer.name === "PageNotes") return;
  if (item.label && item.label !== "") {
    var parsed = __mcpParseSlotLabel(item.label);
    if (parsed.slotName) {
      var slotInfo = __mcpBuildSlotInfo(item, parsed, mmPerPoint, context);
      slotsArray.push(slotInfo);
      if (summaryMap) {
        __mcpAddSummary(summaryMap, slotInfo, parsed, context);
      }
    }
  }
  var childItems = null;
  try {
    childItems = item.pageItems;
  } catch (_childErr) {
    childItems = null;
  }
  if (childItems && childItems.length) {
    for (var c = 0; c < childItems.length; c++) {
      __mcpCollectSlotsFromItem(childItems[c], slotsArray, summaryMap, mmPerPoint, context);
    }
  }
}

function __mcpCollectSlotsFromItems(items, slotsArray, summaryMap, mmPerPoint, context) {
  if (!items || !items.length) return;
  for (var idx = 0; idx < items.length; idx++) {
    __mcpCollectSlotsFromItem(items[idx], slotsArray, summaryMap, mmPerPoint, context);
  }
}
`;

function parseJsonResult(raw, operationName) {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) {
        throw new Error('InDesign 未返回任何数据。');
    }
    if (trimmed.startsWith('Error:')) {
        const message = trimmed.slice(6).trim();
        throw new Error(message || `InDesign 执行失败: ${trimmed}`);
    }
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    } catch (error) {
        const preview = trimmed.length > 500 ? trimmed.substring(0, 500) + '...[truncated]' : trimmed;
        throw new Error(`无法解析 InDesign 返回结果（${operationName}）: ${preview}\n解析错误: ${error.message}`);
    }
    if (parsed && typeof parsed === 'object' && parsed.success === false) {
        throw new Error(parsed.error || `${operationName} 在 InDesign 中执行失败`);
    }
    return (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'data'))
        ? parsed.data
        : parsed;
}

function buildSlotValuesScript(slotValues) {
    const lines = ['var slotValues = {};'];
    if (!slotValues || typeof slotValues !== 'object') {
        return lines.join('\n');
    }
    for (const [slotName, rawValue] of Object.entries(slotValues)) {
        if (rawValue === undefined || rawValue === null) continue;
        const slotKey = escapeJsxString(slotName);
        let value = rawValue;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            value = { text: String(value) };
        }
        if (typeof value !== 'object') continue;

        const props = [];
        if (value.text !== undefined && value.text !== null) {
            props.push(`text: "${escapeJsxString(String(value.text))}"`);
        }
        if (value.imagePath !== undefined && value.imagePath !== null) {
            props.push(`imagePath: "${escapeFilePathForJsx(String(value.imagePath))}"`);
        }
        if (value.fit !== undefined && value.fit !== null) {
            props.push(`fit: "${escapeJsxString(String(value.fit).toUpperCase())}"`);
        }
        if (value.clearExisting !== undefined) {
            props.push(`clearExisting: ${value.clearExisting ? 'true' : 'false'}`);
        }
        if (value.declaredType !== undefined && value.declaredType !== null) {
            props.push(`declaredType: "${escapeJsxString(String(value.declaredType))}"`);
        }
        if (!props.length) continue;
        lines.push(`slotValues["${slotKey}"] = { ${props.join(', ')} };`);
    }
    return lines.join('\n');
}

export class AdvancedTemplateHandlers {
    static async runJsxFile(args) {
        const { filePath } = args || {};
        if (!filePath || typeof filePath !== 'string' || !filePath.trim()) {
            return formatErrorResponse('filePath 必须是 JSX 文件的有效路径。', 'Run JSX File');
        }

        const resolvedPath = path.resolve(filePath);
        const ext = path.extname(resolvedPath).toLowerCase();
        if (ext && ext !== '.jsx') {
            return formatErrorResponse('filePath 需要指向 .jsx 文件。', 'Run JSX File');
        }

        try {
            const stats = fs.statSync(resolvedPath);
            if (!stats.isFile()) {
                return formatErrorResponse(`指定路径不是文件：${resolvedPath}`, 'Run JSX File');
            }
            if (stats.size === 0) {
                return formatErrorResponse('JSX 文件为空，无法执行。', 'Run JSX File');
            }
        } catch (error) {
            return formatErrorResponse(`无法访问 JSX 文件：${error.message}`, 'Run JSX File');
        }

        try {
            // 执行文件本身，保留 $.fileName 与相对路径环境
            const result = await ScriptExecutor.executeInDesignScriptFile(resolvedPath);
            if (typeof result === 'string' && result.trim().startsWith('Error:')) {
                return formatErrorResponse(result, 'Run JSX File');
            }
            return formatResponse(result, 'Run JSX File');
        } catch (error) {
            return formatErrorResponse(error.message, 'Run JSX File');
        }
    }

    static async inspectTemplate(args) {
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
            const rawResult = await ScriptExecutor.executeInDesignScript(script);
            const data = parseJsonResult(rawResult, 'Inspect Template Blueprint');
            return formatResponse(data, 'Inspect Template Blueprint');
        } catch (error) {
            return formatErrorResponse(error.message, 'Inspect Template Blueprint');
        }
    }

    static async listTemplateBlueprints() {
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
            const rawResult = await ScriptExecutor.executeInDesignScript(script);
            const data = parseJsonResult(rawResult, 'List Template Blueprints');
            return formatResponse(data, 'List Template Blueprints');
        } catch (error) {
            return formatErrorResponse(error.message, 'List Template Blueprints');
        }
    }

    static async createPageWithTemplate(args) {
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
            const rawResult = await ScriptExecutor.executeInDesignScript(script);
            const data = parseJsonResult(rawResult, 'Create Page With Template');
            return formatResponse(data, 'Create Page With Template');
        } catch (error) {
            return formatErrorResponse(error.message, 'Create Page With Template');
        }
    }

    static async getPageInformation(args) {
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
            const rawResult = await ScriptExecutor.executeInDesignScript(script);
            const data = parseJsonResult(rawResult, 'Get Page Information');
            return formatResponse(data, 'Get Page Information');
        } catch (error) {
            return formatErrorResponse(error.message, 'Get Page Information');
        }
    }

    static async fillTemplateFromSlots(args) {
        const { templatePath, outputPath, values, pageIndex } = args || {};
        if (!values || typeof values !== 'object' || !Object.keys(values).length) {
            return formatErrorResponse('values 必须是包含至少一个槽位的对象。', 'Populate Template Slots');
        }

        const hasPath = typeof templatePath === 'string' && templatePath.trim().length > 0;
        const templatePathJsx = hasPath ? escapeFilePathForJsx(templatePath) : '';
        const normalizedTemplatePath = hasPath ? normalizeFsPathForJsx(templatePath) : '';
        const slotValuesScript = buildSlotValuesScript(values);
        const outputPathProvided = outputPath && typeof outputPath === 'string' && outputPath.trim().length;
        const outputPathJsx = outputPathProvided ? escapeFilePathForJsx(outputPath) : '';

        const scriptParts = [
            JSON_HELPERS_SNIPPET,
            LABEL_PARSER_SNIPPET,
            SLOT_COLLECTION_SNIPPET,
            FIT_RESOLVER_SNIPPET,
            slotValuesScript,
            `
var templatePath = "${templatePathJsx}";
var useActive = ${hasPath ? 'false' : 'true'};
var doc = null;
var templateFsPath = "";
var templateDisplayPath = "${escapeJsxString(normalizedTemplatePath)}";
var __mcpResult = null;
var targetPageIndex = ${Number.isInteger(pageIndex) ? pageIndex : 'null'};

function __mcpCollectSlotTargetsFromItem(item, slotTargets, context) {
  if (!item || !item.isValid) return;
  if (item.itemLayer && item.itemLayer.isValid && item.itemLayer.name === "PageNotes") return;
  if (item.label && item.label !== "") {
    var parsed = __mcpParseSlotLabel(item.label);
    if (parsed.slotName) {
      if (!slotTargets[parsed.slotName]) {
        slotTargets[parsed.slotName] = [];
      }
      slotTargets[parsed.slotName].push({
        item: item,
        parsed: parsed,
        context: context
      });
    }
  }
  var childItems = null;
  try {
    childItems = item.pageItems;
  } catch (_childErr) {
    childItems = null;
  }
  if (childItems && childItems.length) {
    for (var c = 0; c < childItems.length; c++) {
      __mcpCollectSlotTargetsFromItem(childItems[c], slotTargets, context);
    }
  }
}

function __mcpCollectSlotTargetsFromItems(items, slotTargets, context) {
  if (!items || !items.length) return;
  for (var idx = 0; idx < items.length; idx++) {
    __mcpCollectSlotTargetsFromItem(items[idx], slotTargets, context);
  }
}

if (useActive) {
  if (app.documents.length === 0) {
    __mcpResult = { success: false, error: "没有打开的文档，请提供模板路径或先打开文档。" };
  } else {
    doc = app.activeDocument;
    templateFsPath = doc.fullName ? doc.fullName.fsName : "";
    templateDisplayPath = templateFsPath || doc.name;
  }
} else {
  var templateFile = File(templatePath);
  if (!templateFile.exists) {
    __mcpResult = { success: false, error: "模板文件不存在: " + templatePath };
  } else {
    doc = app.open(templateFile, false);
    templateFsPath = templateFile.fsName;
    templateDisplayPath = "${escapeJsxString(normalizedTemplatePath)}";
  }
}

var templatePathJson = templateDisplayPath ? String(templateDisplayPath).replace(/\\\\/g, '/') : "";
var templateFsPathJson = templateFsPath ? String(templateFsPath).replace(/\\\\/g, '/') : "";

var report = {
  templatePath: templatePathJson,
  templateFsPath: templateFsPathJson,
  applied: [],
  warnings: [],
  missingSlots: [],
  savedPath: ""
};

try {
  if (!__mcpResult) {
    var slotTargets = {};
    for (var p = 0; p < doc.pages.length; p++) {
      var page = doc.pages[p];
      if (targetPageIndex !== null && p !== targetPageIndex) {
        continue;
      }
      __mcpCollectSlotTargetsFromItems(
        page.pageItems,
        slotTargets,
        { type: "page", pageIndex: p, pageName: page.name }
      );
    }

    for (var key in slotValues) {
      if (!slotValues.hasOwnProperty(key)) continue;
      var value = slotValues[key];
      var targets = slotTargets[key];
      if (!targets || !targets.length) {
        report.missingSlots.push(key);
        continue;
      }
      var filteredTargets = [];
      for (var tIndex = 0; tIndex < targets.length; tIndex++) {
        var ctx = targets[tIndex].context || {};
        if (targetPageIndex !== null && ctx.pageIndex !== targetPageIndex) {
          continue;
        }
        filteredTargets.push(targets[tIndex]);
      }
      if (targetPageIndex !== null) {
        targets = filteredTargets;
      }
      if (!targets.length) {
        report.missingSlots.push(key + "(页面 " + targetPageIndex + ")");
        continue;
      }
      for (var t = 0; t < targets.length; t++) {
        var target = targets[t];
        var frame = target.item;
        if (!frame || !frame.isValid) continue;
        var frameType = frame.constructor ? frame.constructor.name : "";
        var appliedDetail = {
          slotName: key,
          pageIndex: target.context ? target.context.pageIndex : null,
          pageName: target.context ? target.context.pageName : "",
          frameType: frameType,
          actions: []
        };

        if (value.text !== undefined) {
          var applyTextResult = (function() {
            var queue = [frame];
            var visited = {};
            while (queue.length) {
              var current = queue.shift();
              if (!current || !current.isValid) continue;
              var idKey = "";
              try { idKey = String(current.id); } catch(_idErr) {}
              if (idKey && visited[idKey]) continue;
              if (idKey) visited[idKey] = true;

              try {
                current.contents = value.text;
                if (current.contents === value.text) {
                  return { success: true, targetType: current.constructor ? current.constructor.name : frameType };
                }
              } catch(_tryText) {}

              try {
                var texts = current.texts;
                if (texts && texts.length) {
                  texts[0].contents = value.text;
                  return { success: true, targetType: current.constructor ? current.constructor.name : frameType };
                }
              } catch(_textsErr) {}

              try {
                var tf = current.textFrames;
                if (tf && tf.length) {
                  for (var ti = 0; ti < tf.length; ti++) {
                    try {
                      tf[ti].contents = value.text;
                      if (tf[ti].contents === value.text) {
                        return { success: true, targetType: tf[ti].constructor ? tf[ti].constructor.name : frameType };
                      }
                    } catch(_textFrameErr) {}
                  }
                }
              } catch(_tfErr) {}

              try {
                var elements = current.getElements();
                if (elements && elements.length) {
                  for (var ei = 0; ei < elements.length; ei++) {
                    var el = elements[ei];
                    try {
                      if (typeof el.contents !== 'undefined') {
                        el.contents = value.text;
                        if (el.contents === value.text) {
                          return { success: true, targetType: el.constructor ? el.constructor.name : frameType };
                        }
                      }
                    } catch(_elementsErr) {}
                  }
                }
              } catch(_getElementsErr) {}

              try {
                var children = current.pageItems;
                if (children && children.length) {
                  for (var ci = 0; ci < children.length; ci++) {
                    queue.push(children[ci]);
                  }
                }
              } catch(_childErr) {}
            }
            return { success: false };
          })();

          if (applyTextResult.success) {
            appliedDetail.actions.push("text(" + applyTextResult.targetType + ")");
          } else {
            report.warnings.push("槽位 " + key + " 文本填充失败：未找到可写入的文本对象");
          }
        }

        if (value.imagePath !== undefined) {
          var imgFile = File(value.imagePath);
          if (!imgFile.exists) {
            report.warnings.push("槽位 " + key + " 图片不存在: " + value.imagePath);
          } else {
            var applyImageResult = (function() {
              var queueImg = [frame];
              var visitedImg = {};
              while (queueImg.length) {
                var currentImg = queueImg.shift();
                if (!currentImg || !currentImg.isValid) continue;
                var idKeyImg = "";
                try { idKeyImg = String(currentImg.id); } catch(_imgIdErr) {}
                if (idKeyImg && visitedImg[idKeyImg]) continue;
                if (idKeyImg) visitedImg[idKeyImg] = true;

                try {
                  if (value.clearExisting === true && currentImg.graphics && currentImg.graphics.length) {
                    for (var g = currentImg.graphics.length - 1; g >= 0; g--) {
                      try { currentImg.graphics[g].remove(); } catch (_removeErr) {}
                    }
                  }
                } catch(_clearErr) {}

                try {
                  var placed = currentImg.place(imgFile);
                  if (placed) {
                    var fitName = value.fit || "PROPORTIONALLY";
                    try {
                      var fitOption = __mcpResolveFitOption(fitName);
                      if (fitOption) {
                        currentImg.fit(fitOption);
                      }
                    } catch(_fitErr) {}
                    return { success: true, targetType: currentImg.constructor ? currentImg.constructor.name : frameType };
                  }
                } catch(placeErr) {}

                try {
                  var childItemsImg = currentImg.pageItems;
                  if (childItemsImg && childItemsImg.length) {
                    for (var cj = 0; cj < childItemsImg.length; cj++) {
                      queueImg.push(childItemsImg[cj]);
                    }
                  }
                } catch(_imgChildErr) {}
              }
              return { success: false };
            })();

            if (applyImageResult.success) {
              appliedDetail.actions.push("image(" + applyImageResult.targetType + ")");
            } else {
              report.warnings.push("槽位 " + key + " 图片填充失败：未找到可放置的图形对象");
            }
          }
        }

        if (appliedDetail.actions.length) {
          report.applied.push(appliedDetail);
        }
      }
    }

    for (var targetSlot in slotTargets) {
      if (!slotTargets.hasOwnProperty(targetSlot)) continue;
      if (!slotValues.hasOwnProperty(targetSlot)) {
        report.warnings.push("模板槽位 " + targetSlot + " 未提供填充数据");
      }
    }

    ${outputPathProvided ? `
    var outputFile = File("${outputPathJsx}");
    try {
      if (outputFile.parent && !outputFile.parent.exists) {
        outputFile.parent.create();
      }
    } catch (_mkdirErr) {}
    doc.save(outputFile);
    report.savedPath = outputFile.fsName ? String(outputFile.fsName).replace(/\\\\/g, '/') : "";
    ` : ''}

    __mcpResult = { success: true, data: report };
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
        ];

        const script = scriptParts.join('\n');

        try {
            const rawResult = await ScriptExecutor.executeInDesignScript(script);
            const data = parseJsonResult(rawResult, 'Populate Template Slots');
            return formatResponse(data, 'Populate Template Slots');
        } catch (error) {
            return formatErrorResponse(error.message, 'Populate Template Slots');
        }
    }
}
