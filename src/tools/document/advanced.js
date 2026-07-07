import { runScript, formatResponse, formatErrorResponse, sessionManager, escapeJsxString, escapeFilePathForJsx, defineDocumentTool } from './_shared.js';



export async function preflightDocument(args) {
        const { profile = 'Basic', includeWarnings = true } = args;
        const escapedProfile = escapeJsxString(profile);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  try {',
            `    doc.preflight("${escapedProfile}", ${includeWarnings});`,
            '    "Document preflighted successfully";',
            '  } catch (error) {',
            '    "Error preflighting document: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Preflight Document");
    }

export async function zoomToPage(args) {
        const { pageIndex, zoomLevel = 100 } = args;

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
            '      if (app.layoutWindows.length > 0) {',
            '        var win = app.layoutWindows[0];',
            '        try { win.activePage = page; } catch (e) {}',
            `        try { win.zoomPercentage = ${zoomLevel}; } catch (e) {}`,
            '      } else {',
            '        try { page.select(); } catch (e) {}',
            '      }',
            `      "Zoomed to page ${pageIndex} at ${zoomLevel}%";`,
            '    } catch (error) {',
            '      "Error zooming to page: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Zoom to Page");
    }

export async function dataMerge(args) {
        const { dataSource, targetPage = 0, createNewPages = false, removeUnusedPages = false } = args;
        const escapedDataSource = escapeFilePathForJsx(dataSource);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  var dataFile = File("${escapedDataSource}");`,
            '',
            '  if (!dataFile.exists) {',
            `    "Data source file not found: ${escapedDataSource}";`,
            '  } else {',
            '    try {',
            `      var targetPageObj = doc.pages[${targetPage}];`,
            `      doc.dataMerge(dataFile, targetPageObj, ${createNewPages}, ${removeUnusedPages});`,
            '      "Data merge completed successfully";',
            '    } catch (error) {',
            '      "Error performing data merge: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Data Merge");
    }



export const preflightDocumentTool = defineDocumentTool({
    name: 'preflight_document',
    description: 'Run preflight on the document',
    profiles: [],
    cliId: 'document.preflight_document',
    contract: {
            "needsInDesign": true,
            "requiresActiveDocument": true,
            "mutatesDocument": true,
            "writesFilesystem": false,
            "producesArtifacts": false,
            "destructive": false
        },
    // Source: DocumentHandlers.preflightDocument(args) destructures { profile = 'Basic', includeWarnings = true }.
    inputSchema: {
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "profile": {
                "type": "string",
                "description": "Preflight profile name",
                "default": "Basic"
            },
            "includeWarnings": {
                "type": "boolean",
                "description": "Include warnings in report",
                "default": true
            }
        }
    },
    handler: preflightDocument
});

export const zoomToPageTool = defineDocumentTool({
    name: 'zoom_to_page',
    description: 'Zoom to fit page in view',
    profiles: ['classic'],
    cliId: 'page.zoom_to_page',
    contract: {
            "needsInDesign": true,
            "requiresActiveDocument": false,
            "mutatesDocument": true,
            "writesFilesystem": false,
            "producesArtifacts": false,
            "destructive": false
        },
    inputSchema: {
        "additionalProperties": false,
        "properties": {
            "pageIndex": {
                "description": "Page index to zoom to",
                "type": "number"
            },
            "zoomLevel": {
                "default": 100,
                "description": "Zoom level (percentage)",
                "type": "number"
            }
        },
        "required": [
            "pageIndex"
        ],
        "type": "object"
    },
    handler: zoomToPage
});

export const dataMergeTool = defineDocumentTool({
    name: 'data_merge',
    description: 'Perform data merge operation',
    profiles: [],
    cliId: 'document.data_merge',
    contract: {
            "needsInDesign": true,
            "requiresActiveDocument": true,
            "mutatesDocument": true,
            "writesFilesystem": false,
            "producesArtifacts": false,
            "destructive": false
        },
    // Source: DocumentHandlers.dataMerge(args) destructures { dataSource, targetPage = 0, createNewPages = false, removeUnusedPages = false }.
    inputSchema: {
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "dataSource": {
                "type": "string",
                "description": "Path to data source file (CSV, XML, etc.)"
            },
            "targetPage": {
                "type": "number",
                "description": "Target page index",
                "default": 0
            },
            "createNewPages": {
                "type": "boolean",
                "description": "Create new pages for each record",
                "default": false
            },
            "removeUnusedPages": {
                "type": "boolean",
                "description": "Remove unused pages after merge",
                "default": false
            }
        },
        "required": [
            "dataSource"
        ]
    },
    handler: dataMerge
});



export const tools = [preflightDocumentTool, zoomToPageTool, dataMergeTool];

