import { runScript, formatResponse, formatErrorResponse, sessionManager, escapeJsxString, escapeFilePathForJsx, defineDocumentTool } from './_shared.js';



export async function findTextInDocument(args) {
        const { searchText, replaceText, caseSensitive = false, wholeWord = false, useRegex = false } = args;
        const escapedSearchText = escapeJsxString(searchText);
        const escapedReplaceText = replaceText ? escapeJsxString(replaceText) : '';

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var foundCount = 0;',
            '',
            '  try {',
            '    app.findTextPreferences = app.changeTextPreferences = NothingEnum.NOTHING;',
            '    app.findTextPreferences.findWhat = "' + escapedSearchText + '";',
            '    try { app.findTextPreferences.caseSensitive = ' + caseSensitive + '; } catch (caseError) {}',
            '    try { app.findTextPreferences.wholeWord = ' + wholeWord + '; } catch (wordError) {}',
            '',
            '    if ("' + escapedReplaceText + '") {',
            '      app.changeTextPreferences.changeTo = "' + escapedReplaceText + '";',
            '      var found = doc.changeText();',
            '      foundCount = found.length;',
            '      "Found and replaced " + foundCount + " instances of \\"" + "' + escapedSearchText + '" + "\\"";',
            '    } else {',
            '      var found = doc.findText();',
            '      foundCount = found.length;',
            '      "Found " + foundCount + " instances of \\"" + "' + escapedSearchText + '" + "\\"";',
            '    }',
            '  } catch (error) {',
            '    "Error during find/replace: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Find Text in Document");
    }

export async function organizeDocumentLayers(args) {
        const { deleteEmptyLayers = false, mergeSimilarLayers = false, sortLayers = false } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var actions = [];',
            '',
            '  try {',
            '    if (' + deleteEmptyLayers + ') {',
            '      for (var i = doc.layers.length - 1; i >= 0; i--) {',
            '        if (doc.layers[i].pageItems.length === 0) {',
            '          doc.layers[i].remove();',
            '          actions.push("Deleted empty layer: " + doc.layers[i].name);',
            '        }',
            '      }',
            '    }',
            '',
            '    if (' + sortLayers + ') {',
            '      // Note: Layer sorting would require more complex logic',
            '      actions.push("Layer sorting not implemented in this version");',
            '    }',
            '',
            '    "Layer organization completed. Actions: " + actions.join(", ");',
            '  } catch (error) {',
            '    "Error organizing layers: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Organize Document Layers");
    }

export async function createDocumentHyperlink(args) {
        const { sourceText, destination, linkType = 'URL', pageIndex } = args;
        const escapedSourceText = escapeJsxString(sourceText);
        const escapedDestination = escapeJsxString(destination);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  try {',
            '    app.findTextPreferences = NothingEnum.NOTHING;',
            `    app.findTextPreferences.findWhat = "${escapedSourceText}";`,
            '    var found = doc.findText();',
            '    app.findTextPreferences = NothingEnum.NOTHING;',
            '    if (!found || found.length === 0) {',
            `      throw new Error("Source text not found: ${escapedSourceText}");`,
            '    }',
            `    var urlDestination = doc.hyperlinkURLDestinations.add("${escapedDestination}");`,
            '    var textSource = doc.hyperlinkTextSources.add(found[0]);',
            '    var hyperlink = doc.hyperlinks.add(textSource, urlDestination);',
            '    hyperlink.name = "Link to ' + escapedDestination + '";',
            '    "Hyperlink created successfully: " + hyperlink.name;',
            '  } catch (error) {',
            '    "Error creating hyperlink: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Create Document Hyperlink");
    }

export async function createDocumentSection(args) {
        const { startPage, sectionPrefix, startNumber = 1, numberingStyle = 'ARABIC' } = args;
        const escapedSectionPrefix = sectionPrefix ? escapeJsxString(sectionPrefix) : '';
        const normalizedNumberingStyle = typeof numberingStyle === 'string' ? numberingStyle.trim().toUpperCase() : 'ARABIC';
        const numberingStyleLiteral = /^[A-Z_]+$/.test(normalizedNumberingStyle)
            ? `PageNumberStyle.${normalizedNumberingStyle}`
            : 'PageNumberStyle.ARABIC';

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  try {',
            `    var page = doc.pages[${startPage}];`,
            '    var section = doc.sections.add(page);',
            '    if ("' + escapedSectionPrefix + '") section.sectionPrefix = "' + escapedSectionPrefix + '";',
            `    try { section.pageNumberingStyle = ${numberingStyleLiteral}; } catch (styleError) {}`,
            `    try { section.pageNumberStart = ${startNumber}; } catch (startError) {}`,
            '    "Section created successfully on page " + page.name;',
            '  } catch (error) {',
            '    "Error creating section: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Create Document Section");
    }

export async function getDocumentXmlStructure(args) {
        const { includeTags = true, includeElements = true } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var result = "Document XML Structure:\\n";',
            '',
            '  if (' + includeTags + ') {',
            '    result += "XML Tags: " + doc.xmlTags.length + "\\n";',
            '    for (var i = 0; i < doc.xmlTags.length; i++) {',
            '      result += "- " + doc.xmlTags[i].name + "\\n";',
            '    }',
            '    result += "\\n";',
            '  }',
            '',
            '  if (' + includeElements + ') {',
            '    result += "XML Elements: " + doc.xmlElements.length + "\\n";',
            '    for (var i = 0; i < doc.xmlElements.length; i++) {',
            '      result += "- Element " + (i + 1) + "\\n";',
            '    }',
            '  }',
            '',
            '  result;',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Get Document XML Structure");
    }

export async function exportDocumentXml(args) {
        const { filePath, includeImages = true, includeStyles = true } = args;
        const escapedFilePath = escapeFilePathForJsx(filePath);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  try {',
            `    var xmlFile = File("${escapedFilePath}");`,
            '    doc.exportFile(ExportFormat.XML_TYPE, xmlFile, false);',
            '    "Document exported as XML successfully";',
            '  } catch (error) {',
            '    "Error exporting XML: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Export Document XML");
    }



export const findTextInDocumentTool = defineDocumentTool({
    name: 'find_text_in_document',
    description: 'Find text across the entire document',
    profiles: ['classic'],
    cliId: 'text.find_text_in_document',
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
        "properties": {
            "caseSensitive": {
                "default": false,
                "description": "Case sensitive search",
                "type": "boolean"
            },
            "replaceText": {
                "description": "Text to replace with (optional)",
                "type": "string"
            },
            "searchText": {
                "description": "Text to search for",
                "type": "string"
            },
            "useRegex": {
                "default": false,
                "description": "Use regular expressions",
                "type": "boolean"
            },
            "wholeWord": {
                "default": false,
                "description": "Whole word search",
                "type": "boolean"
            }
        },
        "required": [
            "searchText"
        ],
        "type": "object"
    },
    handler: findTextInDocument
});

export const organizeDocumentLayersTool = defineDocumentTool({
    name: 'organize_document_layers',
    description: 'Organize and clean up document layers',
    profiles: ['classic'],
    cliId: 'document.organize_document_layers',
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
            "deleteEmptyLayers": {
                "default": false,
                "description": "Delete empty layers",
                "type": "boolean"
            },
            "mergeSimilarLayers": {
                "default": false,
                "description": "Merge layers with similar names",
                "type": "boolean"
            },
            "sortLayers": {
                "default": false,
                "description": "Sort layers alphabetically",
                "type": "boolean"
            }
        },
        "type": "object"
    },
    handler: organizeDocumentLayers
});

export const createDocumentHyperlinkTool = defineDocumentTool({
    name: 'create_document_hyperlink',
    description: 'Create a hyperlink in the document',
    profiles: ['classic'],
    cliId: 'document.create_document_hyperlink',
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
            "destination": {
                "description": "URL or destination",
                "type": "string"
            },
            "linkType": {
                "default": "URL",
                "description": "Type of hyperlink",
                "enum": [
                    "URL",
                    "PAGE",
                    "TEXT"
                ],
                "type": "string"
            },
            "pageIndex": {
                "description": "Target page index (for page links)",
                "type": "number"
            },
            "sourceText": {
                "description": "Text to link",
                "type": "string"
            }
        },
        "required": [
            "sourceText",
            "destination"
        ],
        "type": "object"
    },
    handler: createDocumentHyperlink
});

export const createDocumentSectionTool = defineDocumentTool({
    name: 'create_document_section',
    description: 'Create a new section in the document',
    profiles: ['classic'],
    cliId: 'document.create_document_section',
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
            "numberingStyle": {
                "default": "ARABIC",
                "description": "Numbering style",
                "enum": [
                    "ARABIC",
                    "ROMAN_UPPER",
                    "ROMAN_LOWER",
                    "LETTER_UPPER",
                    "LETTER_LOWER"
                ],
                "type": "string"
            },
            "sectionPrefix": {
                "description": "Section prefix",
                "type": "string"
            },
            "startNumber": {
                "default": 1,
                "description": "Starting page number",
                "type": "number"
            },
            "startPage": {
                "description": "Page to start section on",
                "type": "number"
            }
        },
        "required": [
            "startPage"
        ],
        "type": "object"
    },
    handler: createDocumentSection
});

export const getDocumentXmlStructureTool = defineDocumentTool({
    name: 'get_document_xml_structure',
    description: 'Get XML structure of the document',
    profiles: [],
    cliId: 'document.get_document_xml_structure',
    contract: {
            "needsInDesign": true,
            "requiresActiveDocument": true,
            "mutatesDocument": false,
            "writesFilesystem": false,
            "producesArtifacts": false,
            "destructive": false
        },
    // Source: DocumentHandlers.getDocumentXmlStructure(args) destructures { includeTags = true, includeElements = true }.
    inputSchema: {
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "includeTags": {
                "type": "boolean",
                "description": "Include XML tags",
                "default": true
            },
            "includeElements": {
                "type": "boolean",
                "description": "Include XML elements",
                "default": true
            }
        }
    },
    handler: getDocumentXmlStructure
});

export const exportDocumentXmlTool = defineDocumentTool({
    name: 'export_document_xml',
    description: 'Export document as XML',
    profiles: [],
    cliId: 'document.export_document_xml',
    contract: {
            "needsInDesign": true,
            "requiresActiveDocument": true,
            "mutatesDocument": false,
            "writesFilesystem": true,
            "producesArtifacts": false,
            "destructive": false
        },
    // Source: DocumentHandlers.exportDocumentXml(args) destructures { filePath, includeImages = true, includeStyles = true }.
    inputSchema: {
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "filePath": {
                "type": "string",
                "description": "Path to save XML file"
            },
            "includeImages": {
                "type": "boolean",
                "description": "Include images in export",
                "default": true
            },
            "includeStyles": {
                "type": "boolean",
                "description": "Include style information",
                "default": true
            }
        },
        "required": [
            "filePath"
        ]
    },
    handler: exportDocumentXml
});



export const tools = [findTextInDocumentTool, organizeDocumentLayersTool, createDocumentHyperlinkTool, createDocumentSectionTool, getDocumentXmlStructureTool, exportDocumentXmlTool];

