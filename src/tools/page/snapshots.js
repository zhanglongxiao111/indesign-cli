import { runScript, formatResponse, escapeJsxString, escapeFilePathForJsx, definePageTool, pageContract } from './_shared.js';

export const snapshotPageLayout = definePageTool({
    name: 'snapshot_page_layout',
    description: 'Create a snapshot of the current page layout',
    contract: pageContract(),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index' },
        },
        required: ['pageIndex'],
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
            '    try {',
            '      if (typeof page.createLayoutSnapshot === "function") {',
            '        page.createLayoutSnapshot();',
            '        "Page layout snapshot created successfully";',
            '      } else {',
            '        "Page layout snapshot not available in this InDesign version";',
            '      }',
            '    } catch (error) {',
            '      "Error creating page layout snapshot: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Snapshot Page Layout');
    }
});

export const deletePageLayoutSnapshot = definePageTool({
    name: 'delete_page_layout_snapshot',
    description: 'Delete the layout snapshot for a page',
    contract: pageContract({ destructive: true }),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index' },
        },
        required: ['pageIndex'],
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
            '    try {',
            '      if (typeof page.deleteLayoutSnapshot === "function") {',
            '        page.deleteLayoutSnapshot();',
            '        "Page layout snapshot deleted successfully";',
            '      } else {',
            '        "Page layout snapshot delete not available in this InDesign version";',
            '      }',
            '    } catch (error) {',
            '      "Error deleting page layout snapshot: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Delete Page Layout Snapshot');
    }
});

export const deleteAllPageLayoutSnapshots = definePageTool({
    name: 'delete_all_page_layout_snapshots',
    description: 'Delete all layout snapshots for a page',
    contract: pageContract({ destructive: true }),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index' },
        },
        required: ['pageIndex'],
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
            '    try {',
            '      if (typeof page.deleteAllLayoutSnapshots === "function") {',
            '        page.deleteAllLayoutSnapshots();',
            '        "All page layout snapshots deleted successfully";',
            '      } else {',
            '        "All page layout snapshot delete not available in this InDesign version";',
            '      }',
            '    } catch (error) {',
            '      "Error deleting all page layout snapshots: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Delete All Page Layout Snapshots');
    }
});

export const tools = [
    snapshotPageLayout,
    deletePageLayoutSnapshot,
    deleteAllPageLayoutSnapshots
];
