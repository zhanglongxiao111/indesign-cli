import { runScript, formatResponse } from '../../core/runtime.js';
import { defineTool } from '../_contract.js';
import { DOMAIN, PROFILES, contract } from './_shared.js';

export const detachMasterItems = defineTool({
    name: 'detach_master_items',
    description: 'Detach master page items from a page',
    domain: DOMAIN,
    profiles: PROFILES,
    cli: { id: 'master.detach_master_items', aliases: [] },
    contract: contract(),
    inputSchema: {
        additionalProperties: false,
        properties: {
            itemIndex: { description: 'Master item index to detach (optional, detaches all if not specified)', type: 'number' },
            pageIndex: { description: 'Page index', type: 'number' }
        },
        required: ['pageIndex'],
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
            '    var master = page.appliedMaster;',
            '    if (!master || !master.isValid) {',
            '      "No master applied to page";',
            '    } else {',
            '      var count = 0;',
            `      if (${itemIndex} !== undefined) {`,
            `        if (${itemIndex} >= master.allPageItems.length) {`,
            '          "Master item index out of range";',
            '        } else {',
            `          try { master.allPageItems[${itemIndex}].override(page); count=1; } catch (e) { "Error overriding: " + e.message; }`,
            '          "Detached 1 master item";',
            '        }',
            '      } else {',
            '        for (var i=0;i<master.allPageItems.length;i++){',
            '          try { master.allPageItems[i].override(page); count++; } catch(e) {}',
            '        }',
            '        "Detached " + count + " master items";',
            '      }',
            '    }',
            '  }',
            '}'
        ].join('\n');
        const result = await runScript(script);
        return formatResponse(result, 'Detach Master Items');
    }
});

export const removeMasterOverride = defineTool({
    name: 'remove_master_override',
    description: 'Remove override from a master page item',
    domain: DOMAIN,
    profiles: PROFILES,
    cli: { id: 'master.remove_master_override', aliases: [] },
    contract: contract(),
    inputSchema: {
        additionalProperties: false,
        properties: {
            itemIndex: { description: 'Master item index to remove override from', type: 'number' },
            pageIndex: { description: 'Page index', type: 'number' }
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
            `    if (${itemIndex} >= page.pageItems.length) {`,
            '      "Page item index out of range";',
            '    } else {',
            `      var it = page.pageItems[${itemIndex}];`,
            '      try {',
            '        it.remove();',
            '        "Master override removed (item deleted)";',
            '      } catch (e) {',
            '        "Error removing override: " + e.message;',
            '      }',
            '    }',
            '  }',
            '}'
        ].join('\n');
        const result = await runScript(script);
        return formatResponse(result, 'Remove Master Override');
    }
});

export const tools = [detachMasterItems, removeMasterOverride];
