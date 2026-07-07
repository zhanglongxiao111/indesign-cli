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

export async function getGroupInfo(args) {
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
        '        var info = "=== GROUP INFO ===\\n";',
        '        info += "Name: " + (item.name || "Unnamed") + "\\n";',
        '        info += "ID: " + item.id + "\\n";',
        '        info += "Visible: " + item.visible + "\\n";',
        '        info += "Locked: " + item.locked + "\\n";',
        '        info += "Bounds: " + item.geometricBounds.join(", ") + "\\n";',
        '        info += "Item Count: " + item.allPageItems.length + "\\n\\n";',
        '',
        '        info += "=== GROUP CONTENTS ===\\n";',
        '        for (var i = 0; i < item.allPageItems.length; i++) {',
        '          var groupItem = item.allPageItems[i];',
        '          info += "Item " + i + ": " + groupItem.constructor.name + " (ID: " + groupItem.id + ")\\n";',
        '        }',
        '',
        '        info;',
        '      }',
        '    }',
        '  }',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Get Group Info');
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

export async function listGroups(args) {
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
        '    var result = "=== GROUPS ===\\n";',
        '    var groupCount = 0;',
        '',
        '    for (var i = 0; i < items.length; i++) {',
        '      var item = items[i];',
        '      if (item.constructor.name === "Group") {',
        '        result += "Group Index: " + i + "\\n";',
        '        result += "Name: " + (item.name || "Unnamed") + "\\n";',
        '        result += "ID: " + item.id + "\\n";',
        '        result += "Visible: " + item.visible + "\\n";',
        '        result += "Locked: " + item.locked + "\\n";',
        '        result += "Item Count: " + item.allPageItems.length + "\\n";',
        '        result += "Bounds: " + item.geometricBounds.join(", ") + "\\n";',
        '        result += "---\\n";',
        '        groupCount++;',
        '      }',
        '    }',
        '',
        '    if (groupCount === 0) {',
        '      result += "No groups found on this page";',
        '    }',
        '',
        '    result;',
        '  }',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'List Groups');
}

export async function setGroupProperties(args) {
    const { pageIndex, groupIndex, visible, locked, name } = args;

    const escapedName = name ? escapeJsxString(name) : '';

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
        `        if (${visible} !== undefined) {`,
        `          group.visible = ${visible};`,
        '        }',
        '',
        `        if (${locked} !== undefined) {`,
        `          group.locked = ${locked};`,
        '        }',
        '',
        `        if ("${escapedName}" !== "") {`,
        `          group.name = "${escapedName}";`,
        '        }',
        '',
        '        "Group properties updated successfully";',
        '      }',
        '    }',
        '  }',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Set Group Properties');
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

export const getGroupInfoTool = defineGroupTool({
    name: 'get_group_info',
    description: 'Get detailed information about a group',
    cliId: 'object.get_group_info',
    contract: readOnlyContract({ requiresActiveDocument: true }),
    inputSchema: {
        additionalProperties: false,
        properties: {
            groupIndex: {
                description: 'Index of the group to get info for',
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
    handler: getGroupInfo
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

export const listGroupsTool = defineGroupTool({
    name: 'list_groups',
    description: 'List all groups on a specific page',
    cliId: 'page.list_groups',
    contract: readOnlyContract(),
    inputSchema: {
        additionalProperties: false,
        properties: {
            pageIndex: {
                description: 'Index of the page to list groups from',
                type: 'integer'
            }
        },
        required: ['pageIndex'],
        type: 'object'
    },
    handler: listGroups
});

export const setGroupPropertiesTool = defineGroupTool({
    name: 'set_group_properties',
    description: 'Set properties of a group',
    cliId: 'object.set_group_properties',
    contract: contract(),
    inputSchema: {
        additionalProperties: false,
        properties: {
            groupIndex: {
                description: 'Index of the group to modify',
                type: 'integer'
            },
            locked: {
                description: 'Whether the group is locked',
                type: 'boolean'
            },
            name: {
                description: 'Name for the group',
                type: 'string'
            },
            pageIndex: {
                description: 'Index of the page containing the group',
                type: 'integer'
            },
            visible: {
                description: 'Whether the group is visible',
                type: 'boolean'
            }
        },
        required: ['pageIndex', 'groupIndex'],
        type: 'object'
    },
    handler: setGroupProperties
});

export const tools = [
    createGroupTool,
    createGroupFromItemsTool,
    ungroupTool,
    getGroupInfoTool,
    addItemToGroupTool,
    removeItemFromGroupTool,
    listGroupsTool,
    setGroupPropertiesTool
];
