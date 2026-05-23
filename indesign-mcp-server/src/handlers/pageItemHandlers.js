/**
 * PageItem management handlers
 */
import { ScriptExecutor } from '../core/scriptExecutor.js';
import { formatResponse, formatErrorResponse, escapeJsxString } from '../utils/stringUtils.js';

const JSON_SERIALIZER_SNIPPET = `
function __mcpEscapeJsonString(str) {
  if (str === null || str === undefined) return "";
  var result = "";
  for (var i = 0; i < str.length; i++) {
    var ch = str.charAt(i);
    var code = str.charCodeAt(i);
    if (ch === '"' || ch === '\\\\') {
      result += '\\\\' + ch;
    } else if (code === 8) {
      result += '\\\\b';
    } else if (code === 9) {
      result += '\\\\t';
    } else if (code === 10) {
      result += '\\\\n';
    } else if (code === 12) {
      result += '\\\\f';
    } else if (code === 13) {
      result += '\\\\r';
    } else if (code < 32) {
      var hex = code.toString(16);
      result += '\\\\u' + ('0000' + hex).slice(-4);
    } else {
      result += ch;
    }
  }
  return result;
}
function __mcpSerializeValue(value) {
  if (value === null || value === undefined) return "null";
  var type = typeof value;
  if (type === "number" || type === "boolean") {
    return String(value);
  }
  if (type === "string") {
    return "\\""+__mcpEscapeJsonString(value)+"\\"";
  }
  if (value instanceof Array) {
    var arr = [];
    for (var i = 0; i < value.length; i++) {
      arr.push(__mcpSerializeValue(value[i]));
    }
    return "[" + arr.join(",") + "]";
  }
  if (type === "object") {
    var props = [];
    for (var key in value) {
      if (!value.hasOwnProperty(key)) continue;
      var propertyValue = value[key];
      if (propertyValue === undefined) continue;
      props.push("\\"" + __mcpEscapeJsonString(key) + "\\":" + __mcpSerializeValue(propertyValue));
    }
    return "{" + props.join(",") + "}";
  }
  return "null";
}
function __mcpSerializeResponse(success, payload, errorMessage) {
  var response = { success: success ? true : false };
  if (response.success) {
    response.data = (payload === undefined) ? [] : payload;
  } else {
    response.error = errorMessage || "";
  }
  return __mcpSerializeValue(response);
}
`;

const PAGE_ITEM_LABEL_HELPERS_SNIPPET = `
function __mcpFindPageByNumber(doc, pageNumber) {
  if (!doc || !doc.isValid) return null;
  for (var i = 0; i < doc.pages.length; i++) {
    var page = doc.pages[i];
    try {
      if ((page.documentOffset + 1) === pageNumber) {
        return page;
      }
    } catch (_offsetErr) {}
  }
  return null;
}
function __mcpFindItemIndexOnPage(page, itemId) {
  if (!page || !page.isValid) return -1;
  var items = page.allPageItems;
  for (var i = 0; i < items.length; i++) {
    if (items[i].id === itemId) {
      return i;
    }
  }
  return -1;
}
function __mcpFindItemById(page, objectId) {
  if (!page || !page.isValid) return null;
  var items = page.allPageItems;
  for (var i = 0; i < items.length; i++) {
    if (items[i].id === objectId) {
      return items[i];
    }
  }
  return null;
}
`;

function parseJsonResult(raw, operationName) {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) {
        return { success: true, data: [] };
    }
    if (trimmed.startsWith('Error:')) {
        const message = trimmed.slice(6).trim() || `${operationName} failed inside InDesign`;
        return { success: false, error: message };
    }
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    } catch (error) {
        return { success: false, error: `Unable to parse InDesign response for ${operationName}: ${error.message}` };
    }
    if (!parsed || typeof parsed !== 'object') {
        return { success: false, error: `${operationName} returned an unexpected result` };
    }
    if (parsed.success === false) {
        return { success: false, error: parsed.error || `${operationName} failed` };
    }
    return { success: true, data: parsed.data ?? [] };
}


export class PageItemHandlers {
    /**
     * Get information about a page item
     */
    static async getPageItemInfo(args) {
        const { pageIndex, itemIndex } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${pageIndex} >= doc.pages.length) {`,
            '    "Page index out of range";',
            '  } else {',
            `    var page = doc.pages[${pageIndex}];`,
            `    if (${itemIndex} >= page.allPageItems.length) {`,
            '      "Page item index out of range";',
            '    } else {',
            `      var item = page.allPageItems[${itemIndex}];`,
            '      var info = "=== PAGE ITEM INFO ===\\n";',
            '      info += "Type: " + item.constructor.name + "\\n";',
            '      info += "Name: " + (item.name || "Unnamed") + "\\n";',
            '      info += "ID: " + item.id + "\\n";',
            '      info += "Visible: " + item.visible + "\\n";',
            '      info += "Locked: " + item.locked + "\\n";',
            '      info += "Bounds: " + item.geometricBounds.join(", ") + "\\n";',
            '      info += "Fill Color: " + (item.fillColor ? item.fillColor.name : "None") + "\\n";',
            '      info += "Stroke Color: " + (item.strokeColor ? item.strokeColor.name : "None") + "\\n";',
            '      info += "Stroke Weight: " + item.strokeWeight + "\\n";',
            '      info;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Get Page Item Info");
    }

    /**
     * Select a page item
     */
    static async selectPageItem(args) {
        const { pageIndex, itemIndex, existingSelection = 'REPLACE_WITH' } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${pageIndex} >= doc.pages.length) {`,
            '    "Page index out of range";',
            '  } else {',
            `    var page = doc.pages[${pageIndex}];`,
            `    if (${itemIndex} >= page.allPageItems.length) {`,
            '      "Page item index out of range";',
            '    } else {',
            `      var item = page.allPageItems[${itemIndex}];`,
            `      item.select(SelectionOptions.${existingSelection});`,
            '      "Page item selected successfully";',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Select Page Item");
    }

    /**
     * Move a page item
     */
    static async movePageItem(args) {
        const { pageIndex, itemIndex, x, y } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${pageIndex} >= doc.pages.length) {`,
            '    "Page index out of range";',
            '  } else {',
            `    var page = doc.pages[${pageIndex}];`,
            `    if (${itemIndex} >= page.allPageItems.length) {`,
            '      "Page item index out of range";',
            '    } else {',
            `      var item = page.allPageItems[${itemIndex}];`,
            `      item.move([${x}, ${y}]);`,
            '      "Page item moved successfully";',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Move Page Item");
    }

    /**
     * Resize a page item
     */
    static async resizePageItem(args) {
        const { pageIndex, itemIndex, width, height, anchorPoint = 'CENTER_ANCHOR' } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${pageIndex} >= doc.pages.length) {`,
            '    "Page index out of range";',
            '  } else {',
            `    var page = doc.pages[${pageIndex}];`,
            `    if (${itemIndex} >= page.allPageItems.length) {`,
            '      "Page item index out of range";',
            '    } else {',
            `      var item = page.allPageItems[${itemIndex}];`,
            '      var bounds = item.geometricBounds;',
            `      item.geometricBounds = [bounds[0], bounds[1], bounds[0] + ${height}, bounds[1] + ${width}];`,
            '      "Page item resized successfully";',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Resize Page Item");
    }

    /**
     * Set page item properties
     */
    static async setPageItemProperties(args) {
        const { pageIndex, itemIndex, fillColor, strokeColor, strokeWeight, visible, locked } = args;

        const fillColorLiteral = typeof fillColor === 'string' && fillColor !== ''
            ? JSON.stringify(escapeJsxString(fillColor))
            : 'null';
        const strokeColorLiteral = typeof strokeColor === 'string' && strokeColor !== ''
            ? JSON.stringify(escapeJsxString(strokeColor))
            : 'null';
        const strokeWeightLiteral = typeof strokeWeight === 'number' && !Number.isNaN(strokeWeight)
            ? strokeWeight
            : 'null';
        const visibleLiteral = typeof visible === 'boolean' ? visible : 'null';
        const lockedLiteral = typeof locked === 'boolean' ? locked : 'null';

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${pageIndex} < 0 || ${pageIndex} >= doc.pages.length) {`,
            '    "Page index out of range";',
            '  } else {',
            `    var page = doc.pages[${pageIndex}];`,
            `    if (${itemIndex} < 0 || ${itemIndex} >= page.allPageItems.length) {`,
            '      "Page item index out of range";',
            '    } else {',
            `      var item = page.allPageItems[${itemIndex}];`,
            '      try {',
            `        var fillColorName = ${fillColorLiteral};`,
            `        var strokeColorName = ${strokeColorLiteral};`,
            `        var strokeWeightValue = ${strokeWeightLiteral};`,
            `        var visibleSetting = ${visibleLiteral};`,
            `        var lockedSetting = ${lockedLiteral};`,
            '',
            '        if (fillColorName !== null) {',
            '          try {',
            '            var fillSwatch = doc.colors.itemByName(fillColorName);',
            '            if (!fillSwatch || !fillSwatch.isValid) {',
            '              throw new Error("Fill color not found: " + fillColorName);',
            '            }',
            '            item.fillColor = fillSwatch;',
            '          } catch (fillError) {',
            '            throw new Error("Unable to apply fill color: " + fillError.message);',
            '          }',
            '        }',
            '',
            '        if (strokeColorName !== null) {',
            '          try {',
            '            var strokeSwatch = doc.colors.itemByName(strokeColorName);',
            '            if (!strokeSwatch || !strokeSwatch.isValid) {',
            '              throw new Error("Stroke color not found: " + strokeColorName);',
            '            }',
            '            item.strokeColor = strokeSwatch;',
            '          } catch (strokeError) {',
            '            throw new Error("Unable to apply stroke color: " + strokeError.message);',
            '          }',
            '        }',
            '',
            '        if (strokeWeightValue !== null) {',
            '          item.strokeWeight = strokeWeightValue;',
            '        }',
            '',
            '        if (visibleSetting !== null) {',
            '          item.visible = visibleSetting;',
            '        }',
            '',
            '        if (lockedSetting !== null) {',
            '          item.locked = lockedSetting;',
            '        }',
            '',
            '        "Page item properties updated successfully";',
            '      } catch (error) {',
            '        "Error updating page item properties: " + error.message;',
            '      }',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Set Page Item Properties");
    }

    /**
     * Duplicate a page item
     */
    static async duplicatePageItem(args) {
        const { pageIndex, itemIndex, x, y } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${pageIndex} >= doc.pages.length) {`,
            '    "Page index out of range";',
            '  } else {',
            `    var page = doc.pages[${pageIndex}];`,
            `    if (${itemIndex} >= page.allPageItems.length) {`,
            '      "Page item index out of range";',
            '    } else {',
            `      var item = page.allPageItems[${itemIndex}];`,
            `      var newItem = item.duplicate();`,
            `      newItem.move([${x}, ${y}]);`,
            '      "Page item duplicated successfully";',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Duplicate Page Item");
    }

    /**
     * Delete a page item
     */
    static async deletePageItem(args) {
        const { pageIndex, itemIndex } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${pageIndex} >= doc.pages.length) {`,
            '    "Page index out of range";',
            '  } else {',
            `    var page = doc.pages[${pageIndex}];`,
            `    if (${itemIndex} >= page.allPageItems.length) {`,
            '      "Page item index out of range";',
            '    } else {',
            `      var item = page.allPageItems[${itemIndex}];`,
            '      item.remove();',
            '      "Page item deleted successfully";',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Delete Page Item");
    }

    /**
     * Read script labels from page items using different targeting strategies.
     */
    static async getPageItemScriptLabels(args) {
        const {
            mode = 'CURRENT_SELECTION',
            pageIndex,
            itemIndex,
            pageNumber,
            objectId
        } = args;

        const normalizedMode = String(mode || 'CURRENT_SELECTION').toUpperCase();
        const safeMode = escapeJsxString(normalizedMode);
        const hasPageIndex = Number.isInteger(pageIndex);
        const hasItemIndex = Number.isInteger(itemIndex);
        const hasPageNumber = Number.isInteger(pageNumber);
        const hasObjectId = Number.isInteger(objectId);

        const script = [
            JSON_SERIALIZER_SNIPPET,
            PAGE_ITEM_LABEL_HELPERS_SNIPPET,
            'function __mcpCollectLabelEntry(item, store) {',
            '  if (!item || !item.isValid) return;',
            '  var labelValue = "";',
            '  try { labelValue = item.label; } catch (_labelErr) { labelValue = ""; }',
            '  if (!labelValue) return;',
            '  var page = null;',
            '  try { page = item.parentPage; } catch (_pageErr) { page = null; }',
            '  var pageIndexValue = null;',
            '  var pageNumberValue = null;',
            '  var pageNameValue = "";',
            '  if (page && page.isValid) {',
            '    try { pageIndexValue = page.documentOffset; pageNumberValue = pageIndexValue + 1; } catch (_offsetErr) {}',
            '    try { pageNameValue = page.name || ""; } catch (_nameErr) {}',
            '  }',
            '  var layerNameValue = "";',
            '  try { layerNameValue = (item.itemLayer && item.itemLayer.isValid) ? item.itemLayer.name : ""; } catch (_layerErr) {}',
            '  var itemTypeValue = "";',
            '  try { itemTypeValue = item.constructor ? item.constructor.name : ""; } catch (_typeErr) {}',
            '  var indexOnPage = -1;',
            '  if (page && page.isValid) {',
            '    indexOnPage = __mcpFindItemIndexOnPage(page, item.id);',
            '  }',
            '  store.push({',
            '    pageIndex: pageIndexValue,',
            '    pageNumber: pageNumberValue,',
            '    pageName: pageNameValue,',
            '    itemIndex: indexOnPage,',
            '    objectId: item.id,',
            '    itemType: itemTypeValue,',
            '    layerName: layerNameValue,',
            '    label: labelValue',
            '  });',
            '}',
            `var __mode = "${safeMode}";`,
            `var __hasPageIndex = ${hasPageIndex ? 'true' : 'false'};`,
            `var __pageIndex = ${hasPageIndex ? pageIndex : '-1'};`,
            `var __hasItemIndex = ${hasItemIndex ? 'true' : 'false'};`,
            `var __itemIndex = ${hasItemIndex ? itemIndex : '-1'};`,
            `var __hasPageNumber = ${hasPageNumber ? 'true' : 'false'};`,
            `var __pageNumber = ${hasPageNumber ? pageNumber : '-1'};`,
            `var __hasObjectId = ${hasObjectId ? 'true' : 'false'};`,
            `var __objectId = ${hasObjectId ? objectId : '-1'};`,
            'var __response;',
            'if (app.documents.length === 0) {',
            '  __response = __mcpSerializeResponse(false, null, "No document open");',
            '} else {',
            '  try {',
            '    var doc = app.activeDocument;',
            '    var result = [];',
            '    if (__mode === "CURRENT_SELECTION") {',
            '      var seen = {};',
            '      var selection = app.selection;',
            '      if (selection && selection.length) {',
            '        for (var i = 0; i < selection.length; i++) {',
            '          var candidate = selection[i];',
            '          try { if (!candidate || !candidate.isValid) continue; } catch (_selErr) { continue; }',
            '          var key = "selection-" + i;',
            '          try { key = "id-" + candidate.id; } catch (_idErr) {}',
            '          if (seen[key]) continue;',
            '          seen[key] = true;',
            '          __mcpCollectLabelEntry(candidate, result);',
            '        }',
            '      }',
            '    } else if (__mode === "PAGE_ITEM") {',
            '      if (!__hasPageIndex || !__hasItemIndex) {',
            '        throw new Error("pageIndex and itemIndex are required for PAGE_ITEM mode");',
            '      }',
            '      if (__pageIndex < 0 || __pageIndex >= doc.pages.length) {',
            '        throw new Error("Page index out of range");',
            '      }',
            '      var page = doc.pages[__pageIndex];',
            '      var items = page.allPageItems;',
            '      if (__itemIndex < 0 || __itemIndex >= items.length) {',
            '        throw new Error("Page item index out of range");',
            '      }',
            '      __mcpCollectLabelEntry(items[__itemIndex], result);',
            '    } else if (__mode === "PAGE_NUMBER_AND_OBJECT_ID") {',
            '      if (!__hasPageNumber || !__hasObjectId) {',
            '        throw new Error("pageNumber and objectId are required for PAGE_NUMBER_AND_OBJECT_ID mode");',
            '      }',
            '      var pageByNumber = __mcpFindPageByNumber(doc, __pageNumber);',
            '      if (!pageByNumber) {',
            '        throw new Error("Page number out of range");',
            '      }',
            '      var itemById = __mcpFindItemById(pageByNumber, __objectId);',
            '      if (!itemById) {',
            '        throw new Error("No page item with objectId " + __objectId + " on page " + __pageNumber);',
            '      }',
            '      __mcpCollectLabelEntry(itemById, result);',
            '    } else if (__mode === "ALL_WITH_LABELS") {',
            '      for (var p = 0; p < doc.pages.length; p++) {',
            '        var eachPage = doc.pages[p];',
            '        var pageItems = eachPage.allPageItems;',
            '        for (var j = 0; j < pageItems.length; j++) {',
            '          __mcpCollectLabelEntry(pageItems[j], result);',
            '        }',
            '      }',
            '    } else {',
            '      throw new Error("Unsupported mode: " + __mode);',
            '    }',
            '    __response = __mcpSerializeResponse(true, result);',
            '  } catch (__err) {',
            '    __response = __mcpSerializeResponse(false, null, __err.message || String(__err));',
            '  }',
            '}',
            '__response;'
        ].join('\n');

        try {
            const raw = await ScriptExecutor.executeInDesignScript(script);
            const parsed = parseJsonResult(raw, 'Get Page Item Script Labels');
            if (!parsed.success) {
                return formatErrorResponse(parsed.error, 'Get Page Item Script Labels');
            }
            return formatResponse(parsed.data, 'Get Page Item Script Labels');
        } catch (error) {
            return formatErrorResponse(error.message, 'Get Page Item Script Labels');
        }
    }

    /**
     * Overwrite script labels for targeted page items.
     */
    static async setPageItemScriptLabel(args) {
        const {
            mode = 'CURRENT_SELECTION',
            pageIndex,
            itemIndex,
            pageNumber,
            objectId,
            label = ''
        } = args;

        const normalizedMode = String(mode || 'CURRENT_SELECTION').toUpperCase();
        const safeMode = escapeJsxString(normalizedMode);
        const labelValue = escapeJsxString(String(label ?? ''));
        const hasPageIndex = Number.isInteger(pageIndex);
        const hasItemIndex = Number.isInteger(itemIndex);
        const hasPageNumber = Number.isInteger(pageNumber);
        const hasObjectId = Number.isInteger(objectId);

        const script = [
            JSON_SERIALIZER_SNIPPET,
            PAGE_ITEM_LABEL_HELPERS_SNIPPET,
            'function __mcpApplyLabel(item, newLabel, tracker) {',
            '  if (!item || !item.isValid) return;',
            '  try { item.label = ""; } catch (_clearErr) {}',
            '  try { item.label = newLabel; } catch (_assignErr) { throw _assignErr; }',
            '  tracker.updatedCount += 1;',
            '  try { tracker.objectIds.push(item.id); } catch (_idErr) {}',
            '}',
            `var __mode = "${safeMode}";`,
            `var __labelValue = "${labelValue}";`,
            `var __hasPageIndex = ${hasPageIndex ? 'true' : 'false'};`,
            `var __pageIndex = ${hasPageIndex ? pageIndex : '-1'};`,
            `var __hasItemIndex = ${hasItemIndex ? 'true' : 'false'};`,
            `var __itemIndex = ${hasItemIndex ? itemIndex : '-1'};`,
            `var __hasPageNumber = ${hasPageNumber ? 'true' : 'false'};`,
            `var __pageNumber = ${hasPageNumber ? pageNumber : '-1'};`,
            `var __hasObjectId = ${hasObjectId ? 'true' : 'false'};`,
            `var __objectId = ${hasObjectId ? objectId : '-1'};`,
            'var __response;',
            'if (app.documents.length === 0) {',
            '  __response = __mcpSerializeResponse(false, null, "No document open");',
            '} else {',
            '  try {',
            '    var doc = app.activeDocument;',
            '    var tracker = { updatedCount: 0, objectIds: [], appliedLabel: __labelValue };',
            '    if (__mode === "CURRENT_SELECTION") {',
            '      var seen = {};',
            '      var selection = app.selection;',
            '      if (selection && selection.length) {',
            '        for (var i = 0; i < selection.length; i++) {',
            '          var candidate = selection[i];',
            '          try { if (!candidate || !candidate.isValid) continue; } catch (_selErr) { continue; }',
            '          var key = "selection-" + i;',
            '          try { key = "id-" + candidate.id; } catch (_idErr) {}',
            '          if (seen[key]) continue;',
            '          seen[key] = true;',
            '          __mcpApplyLabel(candidate, __labelValue, tracker);',
            '        }',
            '      }',
            '    } else if (__mode === "PAGE_ITEM") {',
            '      if (!__hasPageIndex || !__hasItemIndex) {',
            '        throw new Error("pageIndex and itemIndex are required for PAGE_ITEM mode");',
            '      }',
            '      if (__pageIndex < 0 || __pageIndex >= doc.pages.length) {',
            '        throw new Error("Page index out of range");',
            '      }',
            '      var page = doc.pages[__pageIndex];',
            '      var items = page.allPageItems;',
            '      if (__itemIndex < 0 || __itemIndex >= items.length) {',
            '        throw new Error("Page item index out of range");',
            '      }',
            '      __mcpApplyLabel(items[__itemIndex], __labelValue, tracker);',
            '    } else if (__mode === "PAGE_NUMBER_AND_OBJECT_ID") {',
            '      if (!__hasPageNumber || !__hasObjectId) {',
            '        throw new Error("pageNumber and objectId are required for PAGE_NUMBER_AND_OBJECT_ID mode");',
            '      }',
            '      var pageByNumber = __mcpFindPageByNumber(doc, __pageNumber);',
            '      if (!pageByNumber) {',
            '        throw new Error("Page number out of range");',
            '      }',
            '      var itemById = __mcpFindItemById(pageByNumber, __objectId);',
            '      if (!itemById) {',
            '        throw new Error("No page item with objectId " + __objectId + " on page " + __pageNumber);',
            '      }',
            '      __mcpApplyLabel(itemById, __labelValue, tracker);',
            '    } else {',
            '      throw new Error("Unsupported mode: " + __mode);',
            '    }',
            '    __response = __mcpSerializeResponse(true, tracker);',
            '  } catch (__err) {',
            '    __response = __mcpSerializeResponse(false, null, __err.message || String(__err));',
            '  }',
            '}',
            '__response;'
        ].join('\n');

        try {
            const raw = await ScriptExecutor.executeInDesignScript(script);
            const parsed = parseJsonResult(raw, 'Set Page Item Script Label');
            if (!parsed.success) {
                return formatErrorResponse(parsed.error, 'Set Page Item Script Label');
            }
            return formatResponse(parsed.data, 'Set Page Item Script Label');
        } catch (error) {
            return formatErrorResponse(error.message, 'Set Page Item Script Label');
        }
    }

    /**
     * List all page items on a page
     */
    static async listPageItems(args) {
        const { pageIndex } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${pageIndex} >= doc.pages.length) {`,
            '    "Page index out of range";',
            '  } else {',
            `    var page = doc.pages[${pageIndex}];`,
            '    var items = page.allPageItems;',
            '    var result = "=== PAGE ITEMS ===\\n";',
            '',
            '    for (var i = 0; i < items.length; i++) {',
            '      var item = items[i];',
            '      result += "Index: " + i + "\\n";',
            '      result += "Type: " + item.constructor.name + "\\n";',
            '      result += "Name: " + (item.name || "Unnamed") + "\\n";',
            '      result += "ID: " + item.id + "\\n";',
            '      result += "Visible: " + item.visible + "\\n";',
            '      result += "Locked: " + item.locked + "\\n";',
            '      result += "Bounds: " + item.geometricBounds.join(", ") + "\\n";',
            '      result += "---\\n";',
            '    }',
            '',
            '    result;',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "List Page Items");
    }
} 
