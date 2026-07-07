import { runScript, formatResponse, escapeJsxString, defineGroupTool, contract, readOnlyContract } from './_shared.js';

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
    setGroupPropertiesTool
];
