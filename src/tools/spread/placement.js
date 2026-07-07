import { runScript, formatResponse } from '../../core/runtime.js';
import { escapeFilePathForJsx, escapeJsxString } from '../../utils/stringUtils.js';
import { defineSpreadTool, INTERNAL_PROFILE, spreadContract } from './_shared.js';

export const placeFileOnSpread = defineSpreadTool({
    name: 'place_file_on_spread',
    description: 'Place a file on a spread',
    contract: spreadContract({ requiresActiveDocument: true }),
    inputSchema: {
        additionalProperties: false,
        properties: {
            autoflowing: { default: false, description: 'Autoflow placed text', type: 'boolean' },
            filePath: { description: 'Path to file to place', type: 'string' },
            layerName: { description: 'Layer name to place on', type: 'string' },
            pageIndexWithinSpread: { default: 0, description: 'Page index within the spread (0-based)', type: 'number' },
            showingOptions: { default: false, description: 'Show import options dialog', type: 'boolean' },
            spreadIndex: { description: 'Spread index', type: 'number' },
            x: { default: 10, description: 'X position in mm', type: 'number' },
            y: { default: 10, description: 'Y position in mm', type: 'number' }
        },
        required: ['spreadIndex', 'filePath'],
        type: 'object'
    },
    handler: async (args) => {
        const {
            spreadIndex,
            filePath,
            x = 10,
            y = 10,
            layerName,
            showingOptions = false,
            autoflowing = false,
            pageIndexWithinSpread = 0
        } = args;
        const fileEsc = escapeFilePathForJsx(filePath);
        const layerEsc = layerName ? escapeJsxString(layerName) : '';
        const pageIndexLiteral = Number.isInteger(pageIndexWithinSpread) ? pageIndexWithinSpread : 0;

        const scriptLines = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${spreadIndex} >= doc.spreads.length) {`,
            '    "Spread index out of range";',
            '  } else {',
            `    var sp = doc.spreads[${spreadIndex}];`,
            `    var targetPageIndex = ${pageIndexLiteral};`,
            '    var page = null;',
            '    if (targetPageIndex >= 0 && targetPageIndex < sp.pages.length) {',
            '      page = sp.pages[targetPageIndex];',
            '    } else if (sp.pages.length > 0) {',
            '      page = sp.pages[0];',
            '    }',
            '    if (!page) {',
            '      "Spread contains no pages";',
            '    } else {',
            `      var file = File("${fileEsc}");`,
            '      try {',
            '        var placedItem;',
            '        var layerToUse = null;',
            `        var layerNameEscaped = "${layerEsc}";`,
            '        if (layerNameEscaped !== "") {',
            '          try {',
            '            layerToUse = doc.layers.itemByName(layerNameEscaped);',
            '            if (!layerToUse || !layerToUse.isValid) {',
            '              layerToUse = null;',
            '            }',
            '          } catch (layerError) {',
            '            layerToUse = null;',
            '          }',
            '        }',
            '        var previousLayer = doc.activeLayer;',
            '        if (layerToUse) { doc.activeLayer = layerToUse; }',
            `        placedItem = page.place(file, [${x}, ${y}]);`,
            '        try { doc.activeLayer = previousLayer; } catch (restoreLayerError) {}',
            '        "File placed on spread";',
            '      } catch (e) {',
            '        try { if (previousLayer && previousLayer.isValid) doc.activeLayer = previousLayer; } catch (restoreLayerError) {}',
            '        "Error placing file: " + e.message;',
            '      }',
            '    }',
            '  }',
            '}'
        ];

        const script = scriptLines.join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Place File on Spread');
    }
});

export const placeXmlOnSpread = defineSpreadTool({
    name: 'place_xml_on_spread',
    description: 'Place XML content on a spread',
    profiles: INTERNAL_PROFILE,
    contract: spreadContract({ requiresActiveDocument: true }),
    // Source: src/handlers/spreadHandlers.js placeXmlOnSpread destructures spreadIndex/xmlElementName/x/y/autoflowing/pageIndexWithinSpread.
    inputSchema: {
        additionalProperties: false,
        properties: {
            autoflowing: { default: false, description: 'Autoflow placed text', type: 'boolean' },
            pageIndexWithinSpread: { default: 0, description: 'Page index within the spread (0-based)', type: 'number' },
            spreadIndex: { description: 'Spread index', type: 'number' },
            x: { default: 10, description: 'X position in mm', type: 'number' },
            xmlElementName: { description: 'XML element name to place', type: 'string' },
            y: { default: 10, description: 'Y position in mm', type: 'number' }
        },
        required: ['spreadIndex', 'xmlElementName'],
        type: 'object'
    },
    handler: async (args) => {
        const { spreadIndex, xmlElementName, x = 10, y = 10, autoflowing = false, pageIndexWithinSpread = 0 } = args;
        const xmlEsc = escapeJsxString(xmlElementName);
        const pageIndexLiteral = Number.isInteger(pageIndexWithinSpread) ? pageIndexWithinSpread : 0;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${spreadIndex} >= doc.spreads.length) {`,
            '    "Spread index out of range";',
            '  } else {',
            `    var sp = doc.spreads[${spreadIndex}];`,
            `    var targetPageIndex = ${pageIndexLiteral};`,
            '    var page = null;',
            '    if (targetPageIndex >= 0 && targetPageIndex < sp.pages.length) {',
            '      page = sp.pages[targetPageIndex];',
            '    } else if (sp.pages.length > 0) {',
            '      page = sp.pages[0];',
            '    }',
            '    if (!page) {',
            '      "Spread contains no pages";',
            '    } else {',
            `      var elements = doc.xmlElements.itemByName("${xmlEsc}");`,
            '      try {',
            `        page.placeXML(elements, [${x}, ${y}], ${autoflowing});`,
            '        "XML placed on spread";',
            '      } catch (e) {',
            '        "Error placing XML: " + e.message;',
            '      }',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Place XML on Spread');
    }
});

export const tools = [
    placeFileOnSpread,
    placeXmlOnSpread
];
