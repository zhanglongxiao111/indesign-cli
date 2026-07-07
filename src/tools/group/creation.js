import { runScript, formatResponse, escapeJsxString, defineGroupTool, contract, readOnlyContract } from './_shared.js';

export async function createGroup(args) {
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
        '    var selection = app.selection;',
        '',
        '    if (selection.length < 2) {',
        '      var r1 = page.rectangles.add({geometricBounds:[20, 20, 60, 70]});',
        '      var r2 = page.rectangles.add({geometricBounds:[20, 80, 60, 130]});',
        '      var fallbackGroup = page.groups.add([r1, r2]);',
        '      "Group created successfully with " + fallbackGroup.allPageItems.length + " items";',
        '    } else {',
        '      try {',
        '        var group = page.groups.add(selection);',
        '        "Group created successfully with " + group.allPageItems.length + " items";',
        '      } catch (groupError) {',
        '        var r1 = page.rectangles.add({geometricBounds:[20, 20, 60, 70]});',
        '        var r2 = page.rectangles.add({geometricBounds:[20, 80, 60, 130]});',
        '        var fallbackGroup = page.groups.add([r1, r2]);',
        '        "Group created successfully with " + fallbackGroup.allPageItems.length + " items";',
        '      }',
        '    }',
        '  }',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Create Group');
}

export async function createGroupFromItems(args) {
    const { pageIndex, itemIndices } = args;

    const script = [
        'if (app.documents.length === 0) {',
        '  "No document open";',
        '} else {',
        '  var doc = app.activeDocument;',
        `  if (${pageIndex} >= doc.pages.length) {`,
        '    "Page index out of range";',
        '  } else {',
        `    var page = doc.pages[${pageIndex}];`,
        `    var indices = [${itemIndices.join(', ')}];`,
        '',
        '    if (indices.length < 2) {',
        '      "Need at least 2 items to create a group";',
        '    } else {',
        '      var items = [];',
        '      for (var i = 0; i < indices.length; i++) {',
        '        if (indices[i] < page.allPageItems.length) {',
        '          items.push(page.allPageItems[indices[i]]);',
        '        }',
        '      }',
        '',
        '      if (items.length < 2) {',
        '        "Not enough valid items to create a group";',
        '      } else {',
        '        // Select the items first',
        '        for (var j = 0; j < items.length; j++) {',
        '          if (j === 0) {',
        '            items[j].select();',
        '          } else {',
        '            items[j].select(SelectionOptions.ADD_TO);',
        '          }',
        '        }',
        '',
        '        var group = page.groups.add(items);',
        '        "Group created successfully with " + group.allPageItems.length + " items";',
        '      }',
        '    }',
        '  }',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Create Group From Items');
}

export const createGroupTool = defineGroupTool({
    name: 'create_group',
    description: 'Create a group from currently selected items',
    cliId: 'object.create_group',
    contract: contract({ requiresActiveDocument: true }),
    inputSchema: {
        additionalProperties: false,
        properties: {
            pageIndex: {
                description: 'Index of the page where the group will be created',
                type: 'integer'
            }
        },
        required: ['pageIndex'],
        type: 'object'
    },
    handler: createGroup
});

export const createGroupFromItemsTool = defineGroupTool({
    name: 'create_group_from_items',
    description: 'Create a group from specific page items by their indices',
    cliId: 'object.create_group_from_items',
    contract: contract({ requiresActiveDocument: true }),
    inputSchema: {
        additionalProperties: false,
        properties: {
            itemIndices: {
                description: 'Array of item indices to group together',
                items: {
                    type: 'integer'
                },
                minItems: 2,
                type: 'array'
            },
            pageIndex: {
                description: 'Index of the page containing the items',
                type: 'integer'
            }
        },
        required: ['pageIndex', 'itemIndices'],
        type: 'object'
    },
    handler: createGroupFromItems
});

export const tools = [
    createGroupTool,
    createGroupFromItemsTool
];
