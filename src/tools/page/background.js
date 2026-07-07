import { runScript, formatResponse, escapeJsxString, escapeFilePathForJsx, definePageTool, pageContract } from './_shared.js';

export const setPageBackground = definePageTool({
    name: 'set_page_background',
    description: 'Set page background by creating a full-page rectangle with specified color',
    contract: pageContract(),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index', default: 0 },
            backgroundColor: { type: 'string', description: 'Background color name (must be a color swatch in the document)', default: 'White' },
            opacity: { type: 'number', description: 'Background opacity percentage (0-100)', default: 100 },
        },
        required: [],
    },
    handler: async (args) => {
        const { pageIndex = 0, backgroundColor = 'White', opacity = 100 } = args;

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
            '      // Get page bounds',
            '      var pageBounds = page.bounds;',
            '      var pageWidth = pageBounds[3] - pageBounds[1];',
            '      var pageHeight = pageBounds[2] - pageBounds[0];',
            '',
            '      // Create background rectangle',
            '      var backgroundRect = page.rectangles.add();',
            '      backgroundRect.geometricBounds = [0, 0, pageHeight, pageWidth];',
            '',
            '      // Set background color',
            `      if ("${backgroundColor}" !== "White") {`,
            '        try {',
            `          var bgColor = doc.colors.itemByName("${escapeJsxString(backgroundColor)}");`,
            '          if (bgColor.isValid) {',
            '            backgroundRect.fillColor = bgColor;',
            '          } else {',
            '            backgroundRect.fillColor = doc.colors.itemByName("White");',
            '          }',
            '        } catch (colorError) {',
            '          backgroundRect.fillColor = doc.colors.itemByName("White");',
            '        }',
            '      } else {',
            '        backgroundRect.fillColor = doc.colors.itemByName("White");',
            '      }',
            '',
            '      // Set opacity',
            `      backgroundRect.transparencySettings.blendingSettings.opacity = ${opacity};`,
            '',
            "      // Send to back to ensure it's behind all content",
            '      backgroundRect.sendToBack();',
            '',
            `      "Page background set successfully with color: ${backgroundColor} and opacity: ${opacity}%";`,
            '    } catch (error) {',
            '      "Error setting page background: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Set Page Background');
    }
});

export const tools = [
    setPageBackground
];
