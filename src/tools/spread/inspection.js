import { runScript, formatResponse } from '../../core/runtime.js';
import { defineSpreadTool, readOnlySpreadContract } from './_shared.js';

export const listSpreads = defineSpreadTool({
    name: 'list_spreads',
    description: 'List all spreads in the document',
    contract: readOnlySpreadContract(),
    inputSchema: {
        additionalProperties: false,
        properties: {},
        type: 'object'
    },
    handler: async () => {
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var info = "=== SPREADS ===\\n";',
            '  for (var i=0;i<doc.spreads.length;i++){',
            '    var sp = doc.spreads[i];',
            '    info += "Index: " + i + "\\n";',
            '    info += "Pages: " + sp.pages.length + "\\n";',
            '    info += "AllItems: " + sp.allPageItems.length + "\\n---\\n";',
            '  }',
            '  info;',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'List Spreads');
    }
});

export const getSpreadInfo = defineSpreadTool({
    name: 'get_spread_info',
    description: 'Get detailed information about a specific spread',
    contract: readOnlySpreadContract({ requiresActiveDocument: true }),
    inputSchema: {
        additionalProperties: false,
        properties: {
            spreadIndex: { description: 'Spread index (0-based)', type: 'number' }
        },
        required: ['spreadIndex'],
        type: 'object'
    },
    handler: async (args) => {
        const { spreadIndex } = args;
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${spreadIndex} >= doc.spreads.length) {`,
            '    "Spread index out of range";',
            '  } else {',
            `    var sp = doc.spreads[${spreadIndex}];`,
            '    var info = "=== SPREAD INFO ===\\n";',
            '    info += "Index: " + sp.index + "\\n";',
            '    info += "Pages: " + sp.pages.length + "\\n";',
            '    info += "Allow Shuffle: " + sp.allowPageShuffle + "\\n";',
            '    info += "Show Master Items: " + sp.showMasterItems + "\\n";',
            '    try {',
            '      info += "Hidden: " + (sp.visible === false ? "true" : "false") + "\\n";',
            '    } catch (e) {',
            '      info += "Hidden: Not available\\n";',
            '    }',
            '    info += "All Page Items: " + sp.allPageItems.length + "\\n";',
            '    info;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Get Spread Info');
    }
});

export const getSpreadContentSummary = defineSpreadTool({
    name: 'get_spread_content_summary',
    description: 'Get a summary of content on a spread',
    contract: readOnlySpreadContract({ requiresActiveDocument: true }),
    inputSchema: {
        additionalProperties: false,
        properties: {
            spreadIndex: { description: 'Spread index', type: 'number' }
        },
        required: ['spreadIndex'],
        type: 'object'
    },
    handler: async (args) => {
        const { spreadIndex } = args;
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${spreadIndex} >= doc.spreads.length) {`,
            '    "Spread index out of range";',
            '  } else {',
            `    var sp = doc.spreads[${spreadIndex}];`,
            '    var info = "=== SPREAD CONTENT SUMMARY ===\\n";',
            '    info += "Text Frames: " + sp.textFrames.length + "\\n";',
            '    info += "Rectangles: " + sp.rectangles.length + "\\n";',
            '    info += "Ovals: " + sp.ovals.length + "\\n";',
            '    info += "Polygons: " + sp.polygons.length + "\\n";',
            '    info += "Groups: " + sp.groups.length + "\\n";',
            '    info += "Guides: " + sp.guides.length + "\\n";',
            '    info += "All Page Items: " + sp.allPageItems.length + "\\n";',
            '    info;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Get Spread Content Summary');
    }
});

export const tools = [
    listSpreads,
    getSpreadInfo,
    getSpreadContentSummary
];
