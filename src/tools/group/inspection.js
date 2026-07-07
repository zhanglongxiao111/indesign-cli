import { runScript, formatResponse, escapeJsxString, defineGroupTool, contract, readOnlyContract } from './_shared.js';

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

export const tools = [
    getGroupInfoTool,
    listGroupsTool
];
