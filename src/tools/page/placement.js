import { runScript, formatResponse, escapeJsxString, escapeFilePathForJsx, definePageTool, pageContract } from './_shared.js';

export const placeFileOnPage = definePageTool({
    name: 'place_file_on_page',
    description: 'Place a file on a page',
    contract: pageContract({ requiresActiveDocument: true }),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index' },
            filePath: { type: 'string', description: 'Path to file to place' },
            x: { type: 'number', description: 'X position in mm', default: 10 },
            y: { type: 'number', description: 'Y position in mm', default: 10 },
            layerName: { type: 'string', description: 'Layer name to place on' },
            showingOptions: { type: 'boolean', description: 'Show import options dialog', default: false },
            autoflowing: { type: 'boolean', description: 'Autoflow placed text', default: false },
        },
        required: ['pageIndex', 'filePath'],
    },
    handler: async (args) => {
        const { pageIndex, filePath, x = 10, y = 10, layerName } = args;

        const escapedFilePath = escapeFilePathForJsx(filePath);
        const escapedLayerName = layerName ? escapeJsxString(layerName) : '';

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${pageIndex} >= doc.pages.length) {`,
            '    "Page index out of range";',
            '  } else {',
            `    var page = doc.pages[${pageIndex}];`,
            `    var file = File("${escapedFilePath}");`,
            '    try {',
            '      var previousLayer = doc.activeLayer;',
            ...(escapedLayerName ? [
                `      var layer = doc.layers.itemByName("${escapedLayerName}");`,
                '      if (layer && layer.isValid) doc.activeLayer = layer;'
            ] : []),
            `      var placedItem = page.place(file, [${x}, ${y}]);`,
            '      try { doc.activeLayer = previousLayer; } catch (restoreLayerError) {}',
            '      "File placed successfully on page";',
            '    } catch (error) {',
            '      try { if (previousLayer && previousLayer.isValid) doc.activeLayer = previousLayer; } catch (restoreLayerError) {}',
            '      "Error placing file: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Place File on Page');
    }
});

export const placeXmlOnPage = definePageTool({
    name: 'place_xml_on_page',
    description: 'Place XML content on a page',
    contract: pageContract({ requiresActiveDocument: true }),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index' },
            xmlElementName: { type: 'string', description: 'XML element name to place' },
            x: { type: 'number', description: 'X position in mm', default: 10 },
            y: { type: 'number', description: 'Y position in mm', default: 10 },
            autoflowing: { type: 'boolean', description: 'Autoflow placed text', default: false },
        },
        required: ['pageIndex', 'xmlElementName'],
    },
    handler: async (args) => {
        const { pageIndex, xmlElementName, x = 10, y = 10, autoflowing = false } = args;

        const escapedXmlElementName = escapeJsxString(xmlElementName);

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
            `      var xmlElement = doc.xmlElements.itemByName("${escapedXmlElementName}");`,
            '      if (!xmlElement || !xmlElement.isValid) {',
            `        xmlElement = doc.xmlElements[0].xmlElements.itemByName("${escapedXmlElementName}");`,
            '      }',
            '      if (!xmlElement || !xmlElement.isValid) {',
            `        throw new Error("XML element not found: ${escapedXmlElementName}");`,
            '      }',
            `      var placedItem = page.placeXML(xmlElement, [${x}, ${y}], ${autoflowing});`,
            '      "XML content placed successfully on page";',
            '    } catch (error) {',
            '      "Error placing XML content: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Place XML on Page');
    }
});

export const tools = [
    placeFileOnPage,
    placeXmlOnPage
];
