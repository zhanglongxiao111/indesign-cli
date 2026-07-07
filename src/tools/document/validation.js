import { runScript, formatResponse, formatErrorResponse, sessionManager, escapeJsxString, escapeFilePathForJsx, defineDocumentTool } from './_shared.js';



export async function validateDocument(args) {
        const { checkLinks = true, checkFonts = true, checkImages = true, checkStyles = false } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var validation = {',
            '    isValid: true,',
            '    issues: []',
            '  };',
            '',
            '  try {',
            '    if (' + checkLinks + ') {',
            '      for (var i = 0; i < doc.links.length; i++) {',
            '        if (!doc.links[i].isValid) {',
            '          validation.issues.push("Broken link: " + doc.links[i].name);',
            '          validation.isValid = false;',
            '        }',
            '      }',
            '    }',
            '',
            '    if (' + checkFonts + ') {',
            '      for (var i = 0; i < doc.fonts.length; i++) {',
            '        if (!doc.fonts[i].isValid) {',
            '          validation.issues.push("Missing font: " + doc.fonts[i].name);',
            '          validation.isValid = false;',
            '        }',
            '      }',
            '    }',
            '',
            '    JSON.stringify(validation);',
            '  } catch (error) {',
            '    "Error validating document: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Validate Document");
    }

export async function cleanupDocument(args) {
        const { removeUnusedStyles = false, removeUnusedColors = false, removeUnusedLayers = false, removeHiddenElements = false } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var cleanup = {',
            '    actions: [],',
            '    removedItems: 0',
            '  };',
            '',
            '  try {',
            '    if (' + removeUnusedStyles + ') {',
            '      var unusedStyles = doc.unusedSwatches;',
            '      cleanup.removedItems += unusedStyles.length;',
            '      cleanup.actions.push("Found " + unusedStyles.length + " unused styles");',
            '    }',
            '',
            '    if (' + removeUnusedColors + ') {',
            '      var unusedColors = doc.unusedSwatches;',
            '      cleanup.removedItems += unusedColors.length;',
            '      cleanup.actions.push("Found " + unusedColors.length + " unused colors");',
            '    }',
            '',
            '    JSON.stringify(cleanup);',
            '  } catch (error) {',
            '    "Error cleaning up document: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Cleanup Document");
    }



export const validateDocumentTool = defineDocumentTool({
    name: 'validate_document',
    description: 'Validate document structure and content',
    profiles: [],
    cliId: 'document.validate_document',
    contract: {
            "needsInDesign": true,
            "requiresActiveDocument": true,
            "mutatesDocument": true,
            "writesFilesystem": false,
            "producesArtifacts": false,
            "destructive": false
        },
    // Source: DocumentHandlers.validateDocument(args) destructures { checkLinks = true, checkFonts = true, checkImages = true, checkStyles = false }.
    inputSchema: {
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "checkLinks": {
                "type": "boolean",
                "description": "Check for broken links",
                "default": true
            },
            "checkFonts": {
                "type": "boolean",
                "description": "Check for missing fonts",
                "default": true
            },
            "checkImages": {
                "type": "boolean",
                "description": "Check for missing images",
                "default": true
            },
            "checkStyles": {
                "type": "boolean",
                "description": "Check for unused styles",
                "default": false
            }
        }
    },
    handler: validateDocument
});

export const cleanupDocumentTool = defineDocumentTool({
    name: 'cleanup_document',
    description: 'Clean up document (remove unused elements)',
    profiles: [],
    cliId: 'document.cleanup_document',
    contract: {
            "needsInDesign": true,
            "requiresActiveDocument": true,
            "mutatesDocument": true,
            "writesFilesystem": false,
            "producesArtifacts": false,
            "destructive": false
        },
    // Source: DocumentHandlers.cleanupDocument(args) destructures { removeUnusedStyles = false, removeUnusedColors = false, removeUnusedLayers = false, removeHiddenElements = false }.
    inputSchema: {
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "removeUnusedStyles": {
                "type": "boolean",
                "description": "Remove unused styles",
                "default": false
            },
            "removeUnusedColors": {
                "type": "boolean",
                "description": "Remove unused colors",
                "default": false
            },
            "removeUnusedLayers": {
                "type": "boolean",
                "description": "Remove unused layers",
                "default": false
            },
            "removeHiddenElements": {
                "type": "boolean",
                "description": "Remove hidden elements",
                "default": false
            }
        }
    },
    handler: cleanupDocument
});



export const tools = [validateDocumentTool, cleanupDocumentTool];

