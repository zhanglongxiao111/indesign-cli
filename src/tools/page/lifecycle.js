import { runScript, formatResponse, escapeJsxString, escapeFilePathForJsx, definePageTool, pageContract } from './_shared.js';

export const addPage = definePageTool({
    name: 'add_page',
    description: 'Add a new page to the document',
    contract: pageContract(),
    inputSchema: {
        type: 'object',
        properties: {
            position: { type: 'string', enum: ['AT_END', 'AT_BEGINNING', 'BEFORE', 'AFTER'], default: 'AT_END' },
            referencePage: { type: 'number', description: 'Reference page index (for BEFORE/AFTER positioning)' },
        },
    },
    handler: async (args) => {
        const { position = 'AT_END', referencePage } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var newPage;',
            '',
            '  try {',
            `    if ("${position}" === "AT_END") {`,
            '      newPage = doc.pages.add();',
            `    } else if ("${position}" === "AT_BEGINNING") {`,
            '      newPage = doc.pages.add(LocationOptions.AT_BEGINNING);',
            `    } else if ("${position}" === "BEFORE" && ${referencePage} !== undefined) {`,
            `      newPage = doc.pages.add(LocationOptions.BEFORE, doc.pages[${referencePage}]);`,
            `    } else if ("${position}" === "AFTER" && ${referencePage} !== undefined) {`,
            `      newPage = doc.pages.add(LocationOptions.AFTER, doc.pages[${referencePage}]);`,
            '    } else {',
            '      newPage = doc.pages.add();',
            '    }',
            '',
            '    "Page added successfully. Total pages: " + doc.pages.length;',
            '  } catch (error) {',
            '    "Error adding page: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Add Page');
    }
});

export const deletePage = definePageTool({
    name: 'delete_page',
    description: 'Delete a page from the document',
    contract: pageContract({ destructive: true }),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Index of the page to delete' },
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
            '    try {',
            `      doc.pages[${pageIndex}].remove();`,
            '      "Page deleted successfully. Total pages: " + doc.pages.length;',
            '    } catch (error) {',
            '      "Error deleting page: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Delete Page');
    }
});

export const duplicatePage = definePageTool({
    name: 'duplicate_page',
    description: 'Duplicate a page',
    contract: pageContract(),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index to duplicate' },
            position: { type: 'string', enum: ['AT_END', 'AT_BEGINNING', 'BEFORE', 'AFTER'], default: 'AT_END' },
            referencePageIndex: { type: 'number', description: 'Reference page index (for BEFORE/AFTER positioning)' },
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
            '    try {',
            `      var originalPage = doc.pages[${pageIndex}];`,
            '      var newPage = originalPage.duplicate();',
            '      "Page duplicated successfully. Total pages: " + doc.pages.length;',
            '    } catch (error) {',
            '      "Error duplicating page: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Duplicate Page');
    }
});

export const movePage = definePageTool({
    name: 'move_page',
    description: 'Move a page to a different position',
    contract: pageContract(),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index to move' },
            newPosition: { type: 'string', enum: ['AT_END', 'AT_BEGINNING', 'BEFORE', 'AFTER'], description: 'LocationOptions value used by the current handler' },
            position: { type: 'string', enum: ['AT_END', 'AT_BEGINNING', 'BEFORE', 'AFTER'], default: 'AT_END' },
            referencePageIndex: { type: 'number', description: 'Reference page index (for BEFORE/AFTER positioning)' },
            binding: { type: 'string', enum: ['DEFAULT_VALUE', 'LEFT_ALIGN', 'RIGHT_ALIGN'], default: 'DEFAULT_VALUE' },
        },
        required: ['pageIndex'],
    },
    handler: async (args) => {
        const { pageIndex, newPosition } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${pageIndex} >= doc.pages.length) {`,
            '    "Page index out of range";',
            '  } else {',
            '    try {',
            `      var page = doc.pages[${pageIndex}];`,
            `      page.move(LocationOptions.${newPosition});`,
            '      "Page moved successfully";',
            '    } catch (error) {',
            '      "Error moving page: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Move Page');
    }
});

export const tools = [
    addPage,
    deletePage,
    duplicatePage,
    movePage
];
