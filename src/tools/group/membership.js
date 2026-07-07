import { runScript, formatResponse, escapeJsxString, defineGroupTool, contract, readOnlyContract } from './_shared.js';

export async function ungroup(args) {
    const { pageIndex, groupIndex } = args;

    const script = [
        'if (app.documents.length === 0) {',
        '  "No document open";',
        '} else {',
        '  var doc = app.activeDocument;',
        `  if (${pageIndex} >= doc.pages.length) {`,
        '    "Page index out of range";',
        '  } else {',
        `    var page = doc.pages[${pageIndex}];`,
        `    if (${groupIndex} >= page.allPageItems.length) {`,
        '      "Group index out of range";',
        '    } else {',
        `      var item = page.allPageItems[${groupIndex}];`,
        '',
        '      if (item.constructor.name !== "Group") {',
        '        "Selected item is not a group";',
        '      } else {',
        '        var itemCount = item.allPageItems.length;',
        '        item.ungroup();',
        '        "Group ungrouped successfully. " + itemCount + " items released";',
        '      }',
        '    }',
        '  }',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Ungroup');
}

export async function addItemToGroup(args) {
    const { pageIndex, groupIndex, itemIndex } = args;

    const script = [
        'if (app.documents.length === 0) {',
        '  "No document open";',
        '} else {',
        '  var doc = app.activeDocument;',
        `  if (${pageIndex} >= doc.pages.length) {`,
        '    "Page index out of range";',
        '  } else {',
        `    var page = doc.pages[${pageIndex}];`,
        `    if (${groupIndex} >= page.allPageItems.length) {`,
        '      "Group index out of range";',
        '    } else {',
        `      var group = page.allPageItems[${groupIndex}];`,
        '',
        '      if (group.constructor.name !== "Group") {',
        '        "Selected item is not a group";',
        '      } else {',
        `        if (${itemIndex} >= page.allPageItems.length) {`,
        '          "Item index out of range";',
        '        } else {',
        `          var item = page.allPageItems[${itemIndex}];`,
        '          if (item.id === group.id) {',
        '            "Cannot add a group to itself";',
        '          } else {',
        '            var groupItems = [];',
        '            var itemAlreadyInGroup = false;',
        '            for (var i = 0; i < group.allPageItems.length; i++) {',
        '              var groupItem = group.allPageItems[i];',
        '              groupItems.push(groupItem);',
        '              if (groupItem.id === item.id) itemAlreadyInGroup = true;',
        '            }',
        '',
        '            if (itemAlreadyInGroup) {',
        '              "Item already belongs to group";',
        '            } else {',
        '              var groupName = group.name;',
        '              var groupLabel = group.label;',
        '              var groupVisible = group.visible;',
        '              var groupLocked = group.locked;',
        '              groupItems.push(item);',
        '              group.ungroup();',
        '              var newGroup = page.groups.add(groupItems);',
        '              newGroup.name = groupName;',
        '              newGroup.label = groupLabel;',
        '              newGroup.visible = groupVisible;',
        '              newGroup.locked = groupLocked;',
        '              "Item added to group successfully. Group now contains " + newGroup.allPageItems.length + " items";',
        '            }',
        '          }',
        '        }',
        '      }',
        '    }',
        '  }',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Add Item to Group');
}

export async function removeItemFromGroup(args) {
    const { pageIndex, groupIndex, itemIndex } = args;

    const script = [
        'if (app.documents.length === 0) {',
        '  "No document open";',
        '} else {',
        '  var doc = app.activeDocument;',
        `  if (${pageIndex} >= doc.pages.length) {`,
        '    "Page index out of range";',
        '  } else {',
        `    var page = doc.pages[${pageIndex}];`,
        `    if (${groupIndex} >= page.allPageItems.length) {`,
        '      "Group index out of range";',
        '    } else {',
        `      var group = page.allPageItems[${groupIndex}];`,
        '',
        '      if (group.constructor.name !== "Group") {',
        '        "Selected item is not a group";',
        '      } else {',
        `        if (${itemIndex} >= group.allPageItems.length) {`,
        '          "Item index out of range in group";',
        '        } else {',
        `          var item = group.allPageItems[${itemIndex}];`,
        '          group.remove(item);',
        '          "Item removed from group successfully";',
        '        }',
        '      }',
        '    }',
        '  }',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Remove Item from Group');
}

export const ungroupTool = defineGroupTool({
    name: 'ungroup',
    description: 'Ungroup a group, releasing all its items',
    cliId: 'object.ungroup',
    contract: contract(),
    inputSchema: {
        additionalProperties: false,
        properties: {
            groupIndex: {
                description: 'Index of the group to ungroup',
                type: 'integer'
            },
            pageIndex: {
                description: 'Index of the page containing the group',
                type: 'integer'
            }
        },
        required: ['pageIndex', 'groupIndex'],
        type: 'object'
    },
    handler: ungroup
});

export const addItemToGroupTool = defineGroupTool({
    name: 'add_item_to_group',
    description: 'Add a page item to an existing group',
    cliId: 'page.add_item_to_group',
    contract: contract(),
    inputSchema: {
        additionalProperties: false,
        properties: {
            groupIndex: {
                description: 'Index of the group to add the item to',
                type: 'integer'
            },
            itemIndex: {
                description: 'Index of the page item to add to the group',
                type: 'integer'
            },
            pageIndex: {
                description: 'Index of the page containing the group and item',
                type: 'integer'
            }
        },
        required: ['pageIndex', 'groupIndex', 'itemIndex'],
        type: 'object'
    },
    handler: addItemToGroup
});

export const removeItemFromGroupTool = defineGroupTool({
    name: 'remove_item_from_group',
    description: 'Remove a page item from a group',
    cliId: 'page.remove_item_from_group',
    contract: contract(),
    inputSchema: {
        additionalProperties: false,
        properties: {
            groupIndex: {
                description: 'Index of the group to remove the item from',
                type: 'integer'
            },
            itemIndex: {
                description: 'Index of the item within the group to remove',
                type: 'integer'
            },
            pageIndex: {
                description: 'Index of the page containing the group',
                type: 'integer'
            }
        },
        required: ['pageIndex', 'groupIndex', 'itemIndex'],
        type: 'object'
    },
    handler: removeItemFromGroup
});

export const tools = [
    ungroupTool,
    addItemToGroupTool,
    removeItemFromGroupTool
];
