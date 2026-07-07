import { runScript, formatResponse, escapeJsxString, escapeFilePathForJsx, definePageTool, pageContract } from './_shared.js';

export const navigateToPage = definePageTool({
    name: 'navigate_to_page',
    description: 'Navigate to a specific page',
    contract: pageContract(),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index to navigate to' },
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
            `    doc.pages[${pageIndex}].select();`,
            `    "Navigated to page ${pageIndex}";`,
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Navigate to Page');
    }
});

export const selectPage = definePageTool({
    name: 'select_page',
    description: 'Select a page',
    contract: pageContract(),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index' },
            selectionMode: { type: 'string', enum: ['REPLACE_WITH', 'ADD_TO', 'REMOVE_FROM'], default: 'REPLACE_WITH' },
        },
        required: ['pageIndex'],
    },
    handler: async (args) => {
        const { pageIndex, selectionMode = 'REPLACE_WITH' } = args;

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
            `      page.select(SelectionOptions.${selectionMode});`,
            '      "Page selected successfully";',
            '    } catch (error) {',
            '      "Error selecting page: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Select Page');
    }
});

export const tools = [
    navigateToPage,
    selectPage
];
