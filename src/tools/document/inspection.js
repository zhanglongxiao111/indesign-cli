import { runScript, formatResponse, formatErrorResponse, sessionManager, escapeJsxString, escapeFilePathForJsx, defineDocumentTool } from './_shared.js';



export async function getDocumentElements(args) {
        const { elementType = 'all' } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var result = "Document Elements:\\n";',
            '',
            '  if ("' + elementType + '" === "all" || "' + elementType + '" === "text") {',
            '    result += "Text Frames: " + doc.textFrames.length + "\\n";',
            '    result += "Stories: " + doc.stories.length + "\\n";',
            '  }',
            '',
            '  if ("' + elementType + '" === "all" || "' + elementType + '" === "graphics") {',
            '    result += "Rectangles: " + doc.rectangles.length + "\\n";',
            '    result += "Ovals: " + doc.ovals.length + "\\n";',
            '    result += "Polygons: " + doc.polygons.length + "\\n";',
            '    result += "Graphic Lines: " + doc.graphicLines.length + "\\n";',
            '    result += "All Graphics: " + doc.allGraphics.length + "\\n";',
            '  }',
            '',
            '  if ("' + elementType + '" === "all" || "' + elementType + '" === "tables") {',
            '    var tableCount = 0;',
            '    for (var i = 0; i < doc.textFrames.length; i++) {',
            '      if (doc.textFrames[i].tables.length > 0) {',
            '        tableCount += doc.textFrames[i].tables.length;',
            '      }',
            '    }',
            '    result += "Tables: " + tableCount + "\\n";',
            '  }',
            '',
            '  if ("' + elementType + '" === "all") {',
            '    result += "All Page Items: " + doc.allPageItems.length + "\\n";',
            '    result += "Groups: " + doc.groups.length + "\\n";',
            '    result += "Layers: " + doc.layers.length + "\\n";',
            '  }',
            '',
            '  result;',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Get Document Elements");
    }

export async function getDocumentStyles(args) {
        const { styleType = 'PARAGRAPH' } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var result = "Document Styles (' + styleType + '):\\n";',
            '',
            '  switch ("' + styleType + '") {',
            '    case "PARAGRAPH":',
            '      result += "Count: " + doc.paragraphStyles.length + "\\n";',
            '      for (var i = 0; i < doc.paragraphStyles.length; i++) {',
            '        result += "- " + doc.paragraphStyles[i].name + "\\n";',
            '      }',
            '      break;',
            '    case "CHARACTER":',
            '      result += "Count: " + doc.characterStyles.length + "\\n";',
            '      for (var i = 0; i < doc.characterStyles.length; i++) {',
            '        result += "- " + doc.characterStyles[i].name + "\\n";',
            '      }',
            '      break;',
            '    case "OBJECT":',
            '      result += "Count: " + doc.objectStyles.length + "\\n";',
            '      for (var i = 0; i < doc.objectStyles.length; i++) {',
            '        result += "- " + doc.objectStyles[i].name + "\\n";',
            '      }',
            '      break;',
            '    case "TABLE":',
            '      result += "Count: " + doc.tableStyles.length + "\\n";',
            '      for (var i = 0; i < doc.tableStyles.length; i++) {',
            '        result += "- " + doc.tableStyles[i].name + "\\n";',
            '      }',
            '      break;',
            '    case "CELL":',
            '      result += "Count: " + doc.cellStyles.length + "\\n";',
            '      for (var i = 0; i < doc.cellStyles.length; i++) {',
            '        result += "- " + doc.cellStyles[i].name + "\\n";',
            '      }',
            '      break;',
            '  }',
            '',
            '  result;',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Get Document Styles");
    }

export async function getDocumentColors(args) {
        const { includeSwatches = true, includeGradients = true, includeTints = true } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var result = "Document Colors:\\n";',
            '',
            '  result += "Colors: " + doc.colors.length + "\\n";',
            '  for (var i = 0; i < doc.colors.length; i++) {',
            '    result += "- " + doc.colors[i].name + " (" + doc.colors[i].model + ")\\n";',
            '  }',
            '',
            '  if (' + includeSwatches + ') {',
            '    result += "\\nSwatches: " + doc.swatches.length + "\\n";',
            '    for (var i = 0; i < doc.swatches.length; i++) {',
            '      result += "- " + doc.swatches[i].name + "\\n";',
            '    }',
            '  }',
            '',
            '  if (' + includeGradients + ') {',
            '    result += "\\nGradients: " + doc.gradients.length + "\\n";',
            '    for (var i = 0; i < doc.gradients.length; i++) {',
            '      result += "- " + doc.gradients[i].name + "\\n";',
            '    }',
            '  }',
            '',
            '  if (' + includeTints + ') {',
            '    result += "\\nTints: " + doc.tints.length + "\\n";',
            '    for (var i = 0; i < doc.tints.length; i++) {',
            '      result += "- " + doc.tints[i].name + "\\n";',
            '    }',
            '  }',
            '',
            '  result;',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Get Document Colors");
    }

export async function getDocumentStories(args) {
        const { includeOverset = true, includeHidden = false } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var result = "Document Stories:\\n";',
            '  var storyCount = 0;',
            '',
            '  for (var i = 0; i < doc.stories.length; i++) {',
            '    var story = doc.stories[i];',
            '    var isHidden = false;',
            '    var isOverset = false;',
            '    var storyName = "";',
            '    try { isHidden = story.hidden; } catch (hiddenError) { isHidden = false; }',
            '    try { isOverset = story.overset; } catch (oversetError) { isOverset = false; }',
            '    try { storyName = story.name; } catch (nameError) { storyName = "Story " + (i + 1); }',
            '    if (' + includeHidden + ' || !isHidden) {',
            '      storyCount++;',
            '      result += "Story " + storyCount + ": " + storyName + "\\n";',
            '      result += "  Contents: " + story.contents.substring(0, 50) + "...\\n";',
            '      result += "  Overset: " + isOverset + "\\n";',
            '      result += "  Hidden: " + isHidden + "\\n\\n";',
            '    }',
            '  }',
            '',
            '  result += "Total Stories: " + storyCount;',
            '  result;',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Get Document Stories");
    }

export async function getDocumentLayers(args) {
        const { includeHidden = true, includeLocked = true } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var result = "Document Layers:\\n";',
            '  var layerCount = 0;',
            '',
            '  for (var i = 0; i < doc.layers.length; i++) {',
            '    var layer = doc.layers[i];',
            '    if ((' + includeHidden + ' || !layer.visible) && (' + includeLocked + ' || !layer.locked)) {',
            '      layerCount++;',
            '      result += "Layer " + layerCount + ": " + layer.name + "\\n";',
            '      result += "  Visible: " + layer.visible + "\\n";',
            '      result += "  Locked: " + layer.locked + "\\n";',
            '      result += "  Page Items: " + layer.pageItems.length + "\\n\\n";',
            '    }',
            '  }',
            '',
            '  result += "Total Layers: " + layerCount;',
            '  result;',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Get Document Layers");
    }

export async function getDocumentHyperlinks(args) {
        const { includeDestinations = true, includeSources = true } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var result = "Document Hyperlinks:\\n";',
            '',
            '  for (var i = 0; i < doc.hyperlinks.length; i++) {',
            '    var link = doc.hyperlinks[i];',
            '    result += "Hyperlink " + (i + 1) + ": " + link.name + "\\n";',
            '    result += "  Source: " + link.source.name + "\\n";',
            '    result += "  Destination: " + link.destination.name + "\\n\\n";',
            '  }',
            '',
            '  result += "Total Hyperlinks: " + doc.hyperlinks.length;',
            '  result;',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Get Document Hyperlinks");
    }

export async function getDocumentSections() {
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var result = "Document Sections:\\n";',
            '',
            '  for (var i = 0; i < doc.sections.length; i++) {',
            '    var section = doc.sections[i];',
            '    result += "Section " + (i + 1) + ": " + section.name + "\\n";',
            '    result += "  Prefix: " + section.sectionPrefix + "\\n\\n";',
            '  }',
            '',
            '  result += "Total Sections: " + doc.sections.length;',
            '  result;',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Get Document Sections");
    }



export const getDocumentElementsTool = defineDocumentTool({
    name: 'get_document_elements',
    description: 'Get all elements in the document',
    profiles: ['classic'],
    cliId: 'document.get_document_elements',
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
            "elementType": {
                "default": "all",
                "description": "Type of elements to get (e.g., \"all\", \"text\", \"graphics\", \"tables\")",
                "type": "string"
            }
        },
        "type": "object"
    },
    handler: getDocumentElements
});

export const getDocumentStylesTool = defineDocumentTool({
    name: 'get_document_styles',
    description: 'Get all styles in the document',
    profiles: ['classic'],
    cliId: 'document.get_document_styles',
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
            "styleType": {
                "default": "PARAGRAPH",
                "description": "Type of styles to get",
                "enum": [
                    "PARAGRAPH",
                    "CHARACTER",
                    "OBJECT",
                    "TABLE",
                    "CELL"
                ],
                "type": "string"
            }
        },
        "type": "object"
    },
    handler: getDocumentStyles
});

export const getDocumentColorsTool = defineDocumentTool({
    name: 'get_document_colors',
    description: 'Get all colors and swatches in the document',
    profiles: ['classic'],
    cliId: 'document.get_document_colors',
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
            "includeGradients": {
                "default": true,
                "description": "Include gradients",
                "type": "boolean"
            },
            "includeSwatches": {
                "default": true,
                "description": "Include swatches",
                "type": "boolean"
            },
            "includeTints": {
                "default": true,
                "description": "Include tints",
                "type": "boolean"
            }
        },
        "type": "object"
    },
    handler: getDocumentColors
});

export const getDocumentStoriesTool = defineDocumentTool({
    name: 'get_document_stories',
    description: 'Get all stories in the document',
    profiles: ['classic'],
    cliId: 'document.get_document_stories',
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
            "includeHidden": {
                "default": false,
                "description": "Include hidden text",
                "type": "boolean"
            },
            "includeOverset": {
                "default": true,
                "description": "Include overset text",
                "type": "boolean"
            }
        },
        "type": "object"
    },
    handler: getDocumentStories
});

export const getDocumentLayersTool = defineDocumentTool({
    name: 'get_document_layers',
    description: 'Get all layers in the document',
    profiles: ['classic'],
    cliId: 'document.get_document_layers',
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
            "includeHidden": {
                "default": true,
                "description": "Include hidden layers",
                "type": "boolean"
            },
            "includeLocked": {
                "default": true,
                "description": "Include locked layers",
                "type": "boolean"
            }
        },
        "type": "object"
    },
    handler: getDocumentLayers
});

export const getDocumentHyperlinksTool = defineDocumentTool({
    name: 'get_document_hyperlinks',
    description: 'Get all hyperlinks in the document',
    profiles: ['classic'],
    cliId: 'document.get_document_hyperlinks',
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
            "includeDestinations": {
                "default": true,
                "description": "Include link destinations",
                "type": "boolean"
            },
            "includeSources": {
                "default": true,
                "description": "Include link sources",
                "type": "boolean"
            }
        },
        "type": "object"
    },
    handler: getDocumentHyperlinks
});

export const getDocumentSectionsTool = defineDocumentTool({
    name: 'get_document_sections',
    description: 'Get all sections in the document',
    profiles: ['classic'],
    cliId: 'document.get_document_sections',
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
    handler: getDocumentSections
});



export const tools = [getDocumentElementsTool, getDocumentStylesTool, getDocumentColorsTool, getDocumentStoriesTool, getDocumentLayersTool, getDocumentHyperlinksTool, getDocumentSectionsTool];

