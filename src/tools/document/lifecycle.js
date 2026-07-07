import { runScript, formatResponse, formatErrorResponse, sessionManager, escapeJsxString, escapeFilePathForJsx, defineDocumentTool } from './_shared.js';



export async function getDocumentInfo() {
        const script = [
            'try {',
            '  if (app.documents.length === 0) {',
            '    "No document open";',
            '  } else {',
            '    var doc = app.activeDocument;',
            '    if (!doc) {',
            '      // If no active document, try to get the first one',
            '      if (app.documents.length > 0) {',
            '        doc = app.documents[0];',
            '        app.activeDocument = doc;',
            '      } else {',
            '        "No document open";',
            '      }',
            '    }',
            '    ',
            '    var info = "=== DOCUMENT INFO ===\\n";',
            '    info += "Name: " + doc.name + "\\n";',
            '    try {',
            '      info += "Path: " + doc.filePath + "\\n";',
            '    } catch (e) {',
            '      info += "Path: Unsaved\\n";',
            '    }',
            '    info += "Pages: " + doc.pages.length + "\\n";',
            '    info += "Spreads: " + doc.spreads.length + "\\n";',
            '    info += "Layers: " + doc.layers.length + "\\n";',
            '    info += "Master Spreads: " + doc.masterSpreads.length + "\\n";',
            '    info += "Document Width: " + doc.documentPreferences.pageWidth + "\\n";',
            '    info += "Document Height: " + doc.documentPreferences.pageHeight + "\\n";',
            '    info += "Facing Pages: " + doc.documentPreferences.facingPages + "\\n";',
            '    info += "Page Orientation: " + doc.documentPreferences.pageOrientation + "\\n";',
            '    info += "Bleed Top: " + doc.documentPreferences.documentBleedTopOffset + "\\n";',
            '    info += "Bleed Bottom: " + doc.documentPreferences.documentBleedBottomOffset + "\\n";',
            '    info += "Bleed Inside: " + doc.documentPreferences.documentBleedInsideOrLeftOffset + "\\n";',
            '    info += "Bleed Outside: " + doc.documentPreferences.documentBleedOutsideOrRightOffset + "\\n";',
            '    info += "Margin Top: " + doc.marginPreferences.top + "\\n";',
            '    info += "Margin Bottom: " + doc.marginPreferences.bottom + "\\n";',
            '    info += "Margin Left: " + doc.marginPreferences.left + "\\n";',
            '    info += "Margin Right: " + doc.marginPreferences.right + "\\n";',
            '    info;',
            '  }',
            '} catch (error) {',
            '  "Error getting document info: " + error.message;',
            '}'
        ].join('\n');

        const result = await runScript(script);

        // Store document info in session manager
        if (result.includes("=== DOCUMENT INFO ===")) {
            const docInfo = {
                name: result.match(/Name: (.+)/)?.[1] || 'Unknown',
                path: result.match(/Path: (.+)/)?.[1] || 'Unsaved',
                pages: parseInt(result.match(/Pages: (\d+)/)?.[1] || '0'),
                width: parseFloat(result.match(/Document Width: ([\d.]+)/)?.[1] || '0'),
                height: parseFloat(result.match(/Document Height: ([\d.]+)/)?.[1] || '0')
            };

            sessionManager.setActiveDocument(docInfo);
            sessionManager.setPageDimensions({
                width: docInfo.width,
                height: docInfo.height
            });
        }

        return formatResponse(result, "Get Document Info");
    }

export async function createDocument(args) {
        const {
            width = 210,
            height = 297,
            pages = 1,
            facingPages = false,
            pageOrientation = 'PORTRAIT',
            bleedTop = 3,
            bleedBottom = 3,
            bleedInside = 3,
            bleedOutside = 3,
            marginTop = 20,
            marginBottom = 20,
            marginLeft = 20,
            marginRight = 20
        } = args;

        const script = [
            'try {',
            '  // Create the document with basic parameters',
            '  var doc = app.documents.add();',
            '',
            '  // Set document preferences after creation',
            `  doc.documentPreferences.pageWidth = ${width};`,
            `  doc.documentPreferences.pageHeight = ${height};`,
            `  doc.documentPreferences.facingPages = ${facingPages};`,
            `  doc.documentPreferences.pageOrientation = PageOrientation.${pageOrientation === 'PORTRAIT' ? 'PORTRAIT' : 'LANDSCAPE'};`,
            `  doc.documentPreferences.documentBleedTopOffset = ${bleedTop};`,
            `  doc.documentPreferences.documentBleedBottomOffset = ${bleedBottom};`,
            `  doc.documentPreferences.documentBleedInsideOrLeftOffset = ${bleedInside};`,
            `  doc.documentPreferences.documentBleedOutsideOrRightOffset = ${bleedOutside};`,
            `  doc.marginPreferences.top = ${marginTop};`,
            `  doc.marginPreferences.bottom = ${marginBottom};`,
            `  doc.marginPreferences.left = ${marginLeft};`,
            `  doc.marginPreferences.right = ${marginRight};`,
            '',
            '  // Ensure the document is active',
            '  app.activeDocument = doc;',
            '',
            '  // Verify the document is active and return success',
            '  if (app.activeDocument === doc) {',
            '    "Document created and activated successfully. Document name: " + doc.name;',
            '  } else {',
            '    "Document created but activation failed";',
            '  }',
            '} catch (error) {',
            '  "Error creating document: " + error.message;',
            '}'
        ].join('\n');

        const result = await runScript(script);

        // Check if the operation was successful
        const isSuccess = result.includes("Document created and activated successfully");

        if (isSuccess) {
            // Store document info in session manager
            sessionManager.setActiveDocument({
                name: result.match(/Document name: (.+)/)?.[1] || 'New Document',
                path: 'Unsaved',
                pages: pages,
                width: width,
                height: height
            });

            sessionManager.setPageDimensions({
                width: width,
                height: height
            });
        }

        return isSuccess ?
            formatResponse(result, "Create Document") :
            formatErrorResponse(result, "Create Document");
    }

export async function openDocument(args) {
        const { filePath } = args;
        const escapedFilePath = escapeFilePathForJsx(filePath);

        const script = [
            'var file = File("' + escapedFilePath + '");',
            'if (!file.exists) {',
            `  "File not found: ${escapedFilePath}";`,
            '} else {',
            '  app.open(file);',
            `  "Document opened: ${escapedFilePath}";`,
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Open Document");
    }

export async function saveDocument(args) {
        const { filePath } = args;
        const escapedFilePath = escapeFilePathForJsx(filePath);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var file = File("' + escapedFilePath + '");',
            '  try {',
            '    doc.save(file);',
            `    "Document saved: ${escapedFilePath}";`,
            '  } catch (error) {',
            '    "Error saving document: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Save Document");
    }

export async function closeDocument(args = {}) {
        const { allowDiscard = false, forceActiveDocument = false, expectedDocumentName = null } = args || {};
        const escapedExpectedDocumentName = expectedDocumentName ? escapeJsxString(expectedDocumentName) : '';
        const script = [
            'var __result = null;',
            'try {',
            '  if (app.documents.length === 0) {',
            '    __result = JSON.stringify({ success: false, code: "NO_ACTIVE_DOCUMENT", message: "No document to close", documentState: { documentsCount: 0, targetWasExplicit: false, state_uncertain: false } });',
            '  } else {',
            '    var docsCount = app.documents.length;',
            `    var expectedName = "${escapedExpectedDocumentName}";`,
            `    var forceActiveDocument = ${forceActiveDocument ? 'true' : 'false'};`,
            '    var targetWasExplicit = expectedName.length > 0 || forceActiveDocument;',
            '    var doc = null;',
            '    if (targetWasExplicit) {',
            '      if (expectedName.length > 0) {',
            '        for (var i = 0; i < app.documents.length; i++) {',
            '          if (app.documents[i].name === expectedName) {',
            '            doc = app.documents[i];',
            '            break;',
            '          }',
            '        }',
            '      } else if (forceActiveDocument) {',
            '        doc = app.activeDocument || app.documents[0];',
            '      }',
            '      if (!doc) {',
            '        __result = JSON.stringify({ success: false, code: "DOCUMENT_TARGET_NOT_FOUND", message: "No open document matched expectedDocumentName", documentState: { documentsCount: docsCount, expectedDocumentName: expectedName, targetWasExplicit: true, state_uncertain: false } });',
            '      }',
            '    } else if (docsCount > 1) {',
            '      __result = JSON.stringify({ success: false, code: "DOCUMENT_TARGET_AMBIGUOUS", message: "Multiple documents are open; close_document requires expectedDocumentName", documentState: { documentsCount: docsCount, targetWasExplicit: false, state_uncertain: true } });',
            '    } else {',
            '      doc = app.activeDocument || app.documents[0];',
            '    }',
            '    if (doc) {',
            '      var docName = doc.name;',
            '      var modified = false;',
            '      try { modified = !!doc.modified; } catch (modifiedError) { modified = true; }',
            `      var allowDiscard = ${allowDiscard ? 'true' : 'false'};`,
            '      if (modified && !allowDiscard) {',
            '        __result = JSON.stringify({ success: false, code: "DOCUMENT_HAS_UNSAVED_CHANGES", message: "Document has unsaved changes; pass allowDiscard true to close without saving", documentState: { documentsCount: docsCount, activeDocumentName: docName, modified: modified, targetWasExplicit: targetWasExplicit, state_uncertain: false } });',
            '      } else {',
            '        if (allowDiscard) {',
            '          var discardOption = SaveOptions.NO;',
            '          doc.close(discardOption);',
            '        } else {',
            '          doc.close();',
            '        }',
            '        __result = JSON.stringify({ success: true, operation: "Close Document", summary: "Document closed successfully: " + docName, data: { documentName: docName, documentState: { documentsCount: Math.max(0, docsCount - 1), targetWasExplicit: targetWasExplicit, discardedChanges: allowDiscard && modified, state_uncertain: false } } });',
            '      }',
            '    }',
            '  }',
            '} catch (error) {',
            '  __result = JSON.stringify({ success: false, code: "INDESIGN_SCRIPT_FAILED", message: "Error closing document: " + error.message });',
            '}',
            '__result;'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Close Document");
    }



export const getDocumentInfoTool = defineDocumentTool({
    name: 'get_document_info',
    description: 'Get information about the active document',
    profiles: ['classic'],
    cliId: 'document.get_document_info',
    contract: {
            "needsInDesign": true,
            "requiresActiveDocument": true,
            "mutatesDocument": false,
            "writesFilesystem": false,
            "producesArtifacts": false,
            "destructive": false
        },
    inputSchema: {
        "additionalProperties": false,
        "properties": {},
        "type": "object"
    },
    handler: getDocumentInfo
});

export const createDocumentTool = defineDocumentTool({
    name: 'create_document',
    description: 'Create a new document',
    profiles: ['classic'],
    cliId: 'document.create_document',
    contract: {
            "needsInDesign": true,
            "requiresActiveDocument": true,
            "mutatesDocument": true,
            "writesFilesystem": false,
            "producesArtifacts": false,
            "destructive": false
        },
    inputSchema: {
        "additionalProperties": false,
        "properties": {
            "bleedBottom": {
                "default": 3,
                "description": "Bottom bleed in mm",
                "type": "number"
            },
            "bleedInside": {
                "default": 3,
                "description": "Inside bleed in mm",
                "type": "number"
            },
            "bleedOutside": {
                "default": 3,
                "description": "Outside bleed in mm",
                "type": "number"
            },
            "bleedTop": {
                "default": 3,
                "description": "Top bleed in mm",
                "type": "number"
            },
            "facingPages": {
                "default": false,
                "description": "Enable facing pages",
                "type": "boolean"
            },
            "height": {
                "default": 297,
                "description": "Document height in mm",
                "type": "number"
            },
            "marginBottom": {
                "default": 20,
                "description": "Bottom margin in mm",
                "type": "number"
            },
            "marginLeft": {
                "default": 20,
                "description": "Left margin in mm",
                "type": "number"
            },
            "marginRight": {
                "default": 20,
                "description": "Right margin in mm",
                "type": "number"
            },
            "marginTop": {
                "default": 20,
                "description": "Top margin in mm",
                "type": "number"
            },
            "pageOrientation": {
                "default": "PORTRAIT",
                "enum": [
                    "PORTRAIT",
                    "LANDSCAPE"
                ],
                "type": "string"
            },
            "pages": {
                "default": 1,
                "description": "Number of pages",
                "type": "number"
            },
            "width": {
                "default": 210,
                "description": "Document width in mm",
                "type": "number"
            }
        },
        "type": "object"
    },
    handler: createDocument
});

export const openDocumentTool = defineDocumentTool({
    name: 'open_document',
    description: 'Open an existing document',
    profiles: ['classic'],
    cliId: 'document.open_document',
    contract: {
            "needsInDesign": true,
            "requiresActiveDocument": true,
            "mutatesDocument": true,
            "writesFilesystem": false,
            "producesArtifacts": false,
            "destructive": false
        },
    inputSchema: {
        "additionalProperties": false,
        "properties": {
            "filePath": {
                "description": "Path to the document file",
                "type": "string"
            }
        },
        "required": [
            "filePath"
        ],
        "type": "object"
    },
    handler: openDocument
});

export const saveDocumentTool = defineDocumentTool({
    name: 'save_document',
    description: 'Save the active document',
    profiles: ['classic'],
    cliId: 'document.save_document',
    contract: {
            "needsInDesign": true,
            "requiresActiveDocument": true,
            "mutatesDocument": true,
            "writesFilesystem": true,
            "producesArtifacts": false,
            "destructive": false
        },
    inputSchema: {
        "additionalProperties": false,
        "properties": {
            "filePath": {
                "description": "Path where to save the document",
                "type": "string"
            }
        },
        "required": [
            "filePath"
        ],
        "type": "object"
    },
    handler: saveDocument
});

export const closeDocumentTool = defineDocumentTool({
    name: 'close_document',
    description: 'Close a document only when the target is unambiguous. Modified documents require allowDiscard.',
    profiles: ['classic'],
    cliId: 'document.close_document',
    contract: {
            "needsInDesign": true,
            "requiresActiveDocument": true,
            "mutatesDocument": true,
            "writesFilesystem": false,
            "producesArtifacts": false,
            "destructive": true
        },
    inputSchema: {
        "additionalProperties": false,
        "properties": {
            "allowDiscard": {
                "default": false,
                "description": "Explicitly discard unsaved changes when closing the target document",
                "type": "boolean"
            },
            "expectedDocumentName": {
                "description": "Optional document name to close when multiple documents are open",
                "type": "string"
            },
            "forceActiveDocument": {
                "default": false,
                "description": "Explicitly close the active document even when multiple documents are open",
                "type": "boolean"
            }
        },
        "type": "object"
    },
    handler: closeDocument
});



export const tools = [getDocumentInfoTool, createDocumentTool, openDocumentTool, saveDocumentTool, closeDocumentTool];

