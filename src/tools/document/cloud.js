import { runScript, formatResponse, formatErrorResponse, sessionManager, escapeJsxString, escapeFilePathForJsx, defineDocumentTool } from './_shared.js';



export async function saveDocumentToCloud(args) {
        const { cloudName, includeAssets = true } = args;
        const escapedCloudName = escapeJsxString(cloudName);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  try {',
            '    if (doc.isCloudDocument) {',
            '      doc.save();',
            '      "Cloud document saved successfully";',
            '    } else {',
            `      doc.saveACopyCloud("${escapedCloudName}");`,
            '      "Document saved to cloud as: ' + escapedCloudName + '";',
            '    }',
            '  } catch (error) {',
            '    "Error saving to cloud: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Save Document to Cloud");
    }

export async function openCloudDocument(args) {
        const { cloudDocumentId } = args;
        const escapedCloudDocumentId = escapeJsxString(cloudDocumentId);

        const script = [
            'try {',
            `  app.openCloudDocument("${escapedCloudDocumentId}");`,
            '  "Cloud document opened successfully";',
            '} catch (error) {',
            '  "Error opening cloud document: " + error.message;',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Open Cloud Document");
    }



export const saveDocumentToCloudTool = defineDocumentTool({
    name: 'save_document_to_cloud',
    description: 'Save document to Adobe Creative Cloud',
    profiles: [],
    cliId: 'document.save_document_to_cloud',
    contract: {
            "needsInDesign": true,
            "requiresActiveDocument": true,
            "mutatesDocument": true,
            "writesFilesystem": true,
            "producesArtifacts": false,
            "destructive": false
        },
    // Source: DocumentHandlers.saveDocumentToCloud(args) destructures { cloudName, includeAssets = true }.
    inputSchema: {
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "cloudName": {
                "type": "string",
                "description": "Name for the cloud document"
            },
            "includeAssets": {
                "type": "boolean",
                "description": "Include linked assets",
                "default": true
            }
        },
        "required": [
            "cloudName"
        ]
    },
    handler: saveDocumentToCloud
});

export const openCloudDocumentTool = defineDocumentTool({
    name: 'open_cloud_document',
    description: 'Open a document from Adobe Creative Cloud',
    profiles: [],
    cliId: 'document.open_cloud_document',
    contract: {
            "needsInDesign": true,
            "requiresActiveDocument": true,
            "mutatesDocument": true,
            "writesFilesystem": false,
            "producesArtifacts": false,
            "destructive": false
        },
    // Source: DocumentHandlers.openCloudDocument(args) destructures { cloudDocumentId }.
    inputSchema: {
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "cloudDocumentId": {
                "type": "string",
                "description": "Cloud document ID"
            }
        },
        "required": [
            "cloudDocumentId"
        ]
    },
    handler: openCloudDocument
});



export const tools = [saveDocumentToCloudTool, openCloudDocumentTool];

