import { definePageItemTool, pageItemContract, runScript, formatResponse, escapeJsxString } from './_shared.js';

export const getPageItemInfo = definePageItemTool({
    name: 'get_page_item_info',
    description: 'Get detailed information about a specific page item',
    contract: pageItemContract({
        requiresActiveDocument: true,
        mutatesDocument: false
    }),
    inputSchema: {
        additionalProperties: false,
        properties: {
            itemIndex: { description: 'Index of the page item to get info for', type: 'integer' },
            pageIndex: { description: 'Index of the page containing the item', type: 'integer' }
        },
        required: ['pageIndex', 'itemIndex'],
        type: 'object'
    },
    handler: async (args) => {
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

        const result = await runScript(script);
        return formatResponse(result, "Get Page Item Info");
    }
});

export const selectPageItem = definePageItemTool({
    name: 'select_page_item',
    description: 'Select a specific page item',
    contract: pageItemContract(),
    inputSchema: {
        additionalProperties: false,
        properties: {
            existingSelection: {
                default: 'REPLACE_WITH',
                description: 'How to handle existing selection',
                enum: ['REPLACE_WITH', 'ADD_TO', 'REMOVE_FROM'],
                type: 'string'
            },
            itemIndex: { description: 'Index of the page item to select', type: 'integer' },
            pageIndex: { description: 'Index of the page containing the item', type: 'integer' }
        },
        required: ['pageIndex', 'itemIndex'],
        type: 'object'
    },
    handler: async (args) => {
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

        const result = await runScript(script);
        return formatResponse(result, "Select Page Item");
    }
});

export const movePageItem = definePageItemTool({
    name: 'move_page_item',
    description: 'Move a page item to a new position',
    contract: pageItemContract(),
    inputSchema: {
        additionalProperties: false,
        properties: {
            itemIndex: { description: 'Index of the page item to move', type: 'integer' },
            pageIndex: { description: 'Index of the page containing the item', type: 'integer' },
            x: { description: 'New X coordinate', type: 'number' },
            y: { description: 'New Y coordinate', type: 'number' }
        },
        required: ['pageIndex', 'itemIndex', 'x', 'y'],
        type: 'object'
    },
    handler: async (args) => {
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

        const result = await runScript(script);
        return formatResponse(result, "Move Page Item");
    }
});

export const resizePageItem = definePageItemTool({
    name: 'resize_page_item',
    description: 'Resize a page item',
    contract: pageItemContract(),
    inputSchema: {
        additionalProperties: false,
        properties: {
            anchorPoint: {
                default: 'CENTER_ANCHOR',
                description: 'Anchor point for resizing',
                enum: ['CENTER_ANCHOR', 'TOP_LEFT_ANCHOR', 'TOP_CENTER_ANCHOR', 'TOP_RIGHT_ANCHOR', 'LEFT_CENTER_ANCHOR', 'RIGHT_CENTER_ANCHOR', 'BOTTOM_LEFT_ANCHOR', 'BOTTOM_CENTER_ANCHOR', 'BOTTOM_RIGHT_ANCHOR'],
                type: 'string'
            },
            height: { description: 'New height', type: 'number' },
            itemIndex: { description: 'Index of the page item to resize', type: 'integer' },
            pageIndex: { description: 'Index of the page containing the item', type: 'integer' },
            width: { description: 'New width', type: 'number' }
        },
        required: ['pageIndex', 'itemIndex', 'width', 'height'],
        type: 'object'
    },
    handler: async (args) => {
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

        const result = await runScript(script);
        return formatResponse(result, "Resize Page Item");
    }
});

export const setPageItemProperties = definePageItemTool({
    name: 'set_page_item_properties',
    description: 'Set properties of a page item',
    contract: pageItemContract(),
    inputSchema: {
        additionalProperties: false,
        properties: {
            fillColor: { description: 'Fill color name', type: 'string' },
            itemIndex: { description: 'Index of the page item to modify', type: 'integer' },
            locked: { description: 'Whether the item is locked', type: 'boolean' },
            pageIndex: { description: 'Index of the page containing the item', type: 'integer' },
            strokeColor: { description: 'Stroke color name', type: 'string' },
            strokeWeight: { description: 'Stroke weight', type: 'number' },
            visible: { description: 'Whether the item is visible', type: 'boolean' }
        },
        required: ['pageIndex', 'itemIndex'],
        type: 'object'
    },
    handler: async (args) => {
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

        const result = await runScript(script);
        return formatResponse(result, "Set Page Item Properties");
    }
});

export const duplicatePageItem = definePageItemTool({
    name: 'duplicate_page_item',
    description: 'Duplicate a page item',
    contract: pageItemContract(),
    inputSchema: {
        additionalProperties: false,
        properties: {
            itemIndex: { description: 'Index of the page item to duplicate', type: 'integer' },
            pageIndex: { description: 'Index of the page containing the item', type: 'integer' },
            x: { description: 'X coordinate for the duplicate', type: 'number' },
            y: { description: 'Y coordinate for the duplicate', type: 'number' }
        },
        required: ['pageIndex', 'itemIndex', 'x', 'y'],
        type: 'object'
    },
    handler: async (args) => {
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

        const result = await runScript(script);
        return formatResponse(result, "Duplicate Page Item");
    }
});

export const deletePageItem = definePageItemTool({
    name: 'delete_page_item',
    description: 'Delete a page item',
    contract: pageItemContract({ destructive: true }),
    inputSchema: {
        additionalProperties: false,
        properties: {
            itemIndex: { description: 'Index of the page item to delete', type: 'integer' },
            pageIndex: { description: 'Index of the page containing the item', type: 'integer' }
        },
        required: ['pageIndex', 'itemIndex'],
        type: 'object'
    },
    handler: async (args) => {
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

        const result = await runScript(script);
        return formatResponse(result, "Delete Page Item");
    }
});

export const listPageItems = definePageItemTool({
    name: 'list_page_items',
    description: 'List all page items on a specific page',
    contract: pageItemContract({
        mutatesDocument: false
    }),
    inputSchema: {
        additionalProperties: false,
        properties: {
            pageIndex: { description: 'Index of the page to list items from', type: 'integer' }
        },
        required: ['pageIndex'],
        type: 'object'
    },
    handler: async (args) => {
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

        const result = await runScript(script);
        return formatResponse(result, "List Page Items");
    }
});

export const tools = [
    getPageItemInfo,
    selectPageItem,
    movePageItem,
    resizePageItem,
    setPageItemProperties,
    duplicatePageItem,
    deletePageItem,
    listPageItems
];
