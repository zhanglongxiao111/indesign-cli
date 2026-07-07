import { runScript, runScriptFile, formatResponse, formatErrorResponse } from '../../core/runtime.js';
import {
    escapeFilePathForJsx,
    escapeJsxString,
    normalizeFsPathForJsx
} from '../../utils/stringUtils.js';
import { defineTool } from '../_contract.js';

export {
    runScript,
    runScriptFile,
    formatResponse,
    formatErrorResponse,
    escapeFilePathForJsx,
    escapeJsxString,
    normalizeFsPathForJsx
};

export const JSON_HELPERS_SNIPPET = `
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

export const LABEL_PARSER_SNIPPET = `
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

export const FIT_RESOLVER_SNIPPET = `
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

export const SLOT_COLLECTION_SNIPPET = `
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

export function parseTemplateJsonResult(raw, operationName) {
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

export function buildSlotValuesScript(slotValues) {
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

export function templateContract({
    requiresActiveDocument = false,
    mutatesDocument = false,
    writesFilesystem = false,
    producesArtifacts = false
} = {}) {
    return {
        needsInDesign: true,
        requiresActiveDocument,
        mutatesDocument,
        writesFilesystem,
        producesArtifacts,
        destructive: false
    };
}

export function defineTemplateTool(tool) {
    return defineTool({
        ...tool,
        domain: 'template',
        profiles: ['advanced'],
        cli: { id: `template.${tool.name}`, aliases: [] }
    });
}
