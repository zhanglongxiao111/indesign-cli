import {
    JSON_SERIALIZER_SNIPPET,
    PAGE_ITEM_LABEL_HELPERS_SNIPPET,
    definePageItemTool,
    pageItemContract,
    runScript,
    formatResponse,
    formatErrorResponse,
    escapeJsxString,
    parsePageItemJsonResult
} from './_shared.js';

export const getPageItemScriptLabels = definePageItemTool({
    name: 'get_page_item_script_labels',
    description: 'Read script labels from page items using selection or explicit identifiers',
    contract: pageItemContract({
        requiresActiveDocument: true,
        mutatesDocument: false
    }),
    inputSchema: {
        additionalProperties: false,
        properties: {
            itemIndex: {
                description: 'When mode=PAGE_ITEM, index of the page item (zero-based)',
                type: 'integer'
            },
            mode: {
                default: 'CURRENT_SELECTION',
                description: 'Selection mode: current selection, page/item indices, page number and object id, or sweep all labelled items',
                enum: ['CURRENT_SELECTION', 'PAGE_ITEM', 'PAGE_NUMBER_AND_OBJECT_ID', 'ALL_WITH_LABELS'],
                type: 'string'
            },
            objectId: {
                description: 'When mode=PAGE_NUMBER_AND_OBJECT_ID, InDesign object id of the page item',
                type: 'integer'
            },
            pageIndex: {
                description: 'When mode=PAGE_ITEM, index of the page containing the item (zero-based)',
                type: 'integer'
            },
            pageNumber: {
                description: 'When mode=PAGE_NUMBER_AND_OBJECT_ID, page number using documentOffset+1',
                type: 'integer'
            }
        },
        type: 'object'
    },
    handler: async (args) => {
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
            const raw = await runScript(script);
            const parsed = parsePageItemJsonResult(raw, 'Get Page Item Script Labels');
            if (!parsed.success) {
                return formatErrorResponse(parsed.error, 'Get Page Item Script Labels');
            }
            return formatResponse(parsed.data, 'Get Page Item Script Labels');
        } catch (error) {
            return formatErrorResponse(error.message, 'Get Page Item Script Labels');
        }
    }
});

export const setPageItemScriptLabel = definePageItemTool({
    name: 'set_page_item_script_label',
    description: 'Overwrite the script label for targeted page items',
    contract: pageItemContract(),
    inputSchema: {
        additionalProperties: false,
        properties: {
            itemIndex: {
                description: 'When mode=PAGE_ITEM, index of the page item (zero-based)',
                type: 'integer'
            },
            label: {
                default: '',
                description: 'Script label to assign; use empty string to clear',
                type: 'string'
            },
            mode: {
                default: 'CURRENT_SELECTION',
                description: 'Selection mode: current selection, page/item indices, or page number plus object id',
                enum: ['CURRENT_SELECTION', 'PAGE_ITEM', 'PAGE_NUMBER_AND_OBJECT_ID'],
                type: 'string'
            },
            objectId: {
                description: 'When mode=PAGE_NUMBER_AND_OBJECT_ID, InDesign object id of the page item',
                type: 'integer'
            },
            pageIndex: {
                description: 'When mode=PAGE_ITEM, index of the page containing the item (zero-based)',
                type: 'integer'
            },
            pageNumber: {
                description: 'When mode=PAGE_NUMBER_AND_OBJECT_ID, page number using documentOffset+1',
                type: 'integer'
            }
        },
        required: ['label'],
        type: 'object'
    },
    handler: async (args) => {
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
            const raw = await runScript(script);
            const parsed = parsePageItemJsonResult(raw, 'Set Page Item Script Label');
            if (!parsed.success) {
                return formatErrorResponse(parsed.error, 'Set Page Item Script Label');
            }
            return formatResponse(parsed.data, 'Set Page Item Script Label');
        } catch (error) {
            return formatErrorResponse(error.message, 'Set Page Item Script Label');
        }
    }
});

export const tools = [getPageItemScriptLabels, setPageItemScriptLabel];
