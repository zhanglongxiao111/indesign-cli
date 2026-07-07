import { runScript, formatResponse, escapeJsxString, escapeFilePathForJsx, definePageTool, pageContract } from './_shared.js';

export const getPageInfo = definePageTool({
    name: 'get_page_info',
    description: 'Get detailed information about a specific page',
    contract: pageContract({
        requiresActiveDocument: true,
        mutatesDocument: false
    }),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index (0-based)' },
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
            '    var info = "=== PAGE INFO ===\\n";',
            '    info += "Index: " + page.documentOffset + "\\n";',
            '    info += "Name: " + page.name + "\\n";',
            '    info += "Label: " + page.label + "\\n";',
            '    info += "Bounds: " + page.bounds + "\\n";',
            '    info += "Side: " + page.side + "\\n";',
            '    info += "Applied Master: " + (page.appliedMaster ? page.appliedMaster.name : "None") + "\\n";',
            '    info += "Page Color: " + page.pageColor + "\\n";',
            '    info += "Optional Page: " + page.optionalPage + "\\n";',
            '    info += "Layout Rule: " + page.layoutRule + "\\n";',
            '    info;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Get Page Info');
    }
});

export const getPageContentSummary = definePageTool({
    name: 'get_page_content_summary',
    description: 'Get a summary of content on a page',
    contract: pageContract({
        requiresActiveDocument: true,
        mutatesDocument: false
    }),
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
            '    var summary = "=== PAGE CONTENT SUMMARY ===\\n";',
            '    summary += "Page: " + page.name + "\\n";',
            '    summary += "Text Frames: " + page.textFrames.length + "\\n";',
            '    summary += "Rectangles: " + page.rectangles.length + "\\n";',
            '    summary += "Ellipses: " + page.ovals.length + "\\n";',
            '    try { summary += "Graphics: " + page.graphics.length + "\\n"; } catch (graphicsError) { summary += "Graphics: Not available\\n"; }',
            '    summary += "Groups: " + page.groups.length + "\\n";',
            '    summary += "Total Items: " + page.allPageItems.length + "\\n";',
            '    summary;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Get Page Content Summary');
    }
});

export const tools = [
    getPageInfo,
    getPageContentSummary
];
