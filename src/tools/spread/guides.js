import { runScript, formatResponse } from '../../core/runtime.js';
import { escapeJsxString } from '../../utils/stringUtils.js';
import { defineSpreadTool, spreadContract } from './_shared.js';

export const createSpreadGuides = defineSpreadTool({
    name: 'create_spread_guides',
    description: 'Create guides on a spread',
    contract: spreadContract({ requiresActiveDocument: true }),
    inputSchema: {
        additionalProperties: false,
        properties: {
            columnGutter: { default: 5, description: 'Column gutter in mm', type: 'number' },
            fitMargins: { default: true, description: 'Fit guides to margins', type: 'boolean' },
            guideColor: { default: 'BLUE', description: 'Guide color (RGB values as comma-separated string or UI color name)', type: 'string' },
            layerName: { description: 'Layer name to create guides on', type: 'string' },
            numberOfColumns: { default: 0, description: 'Number of columns', type: 'number' },
            numberOfRows: { default: 0, description: 'Number of rows', type: 'number' },
            removeExisting: { default: false, description: 'Remove existing guides', type: 'boolean' },
            rowGutter: { default: 5, description: 'Row gutter in mm', type: 'number' },
            spreadIndex: { description: 'Spread index', type: 'number' }
        },
        required: ['spreadIndex'],
        type: 'object'
    },
    handler: async (args) => {
        const { spreadIndex, numberOfRows = 0, numberOfColumns = 0, rowGutter, columnGutter, guideColor = 'BLUE', fitMargins = true, removeExisting = false, layerName } = args;
        const escapedLayerName = layerName ? escapeJsxString(layerName) : '';
        const normalizedGuideColor = typeof guideColor === 'string' ? guideColor.trim() : 'BLUE';
        const guideColorLiteral = /^\s*\[/.test(normalizedGuideColor)
            ? normalizedGuideColor
            : `UIColors.${/^[A-Z_]+$/.test(normalizedGuideColor.toUpperCase()) ? normalizedGuideColor.toUpperCase() : 'BLUE'}`;
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${spreadIndex} >= doc.spreads.length) {`,
            '    "Spread index out of range";',
            '  } else {',
            `    var sp = doc.spreads[${spreadIndex}];`,
            (escapedLayerName ? `    var layer = doc.layers.itemByName("${escapedLayerName}");
            try { if (layer.isValid) sp = layer; } catch(e) {}
` : ''),
            `    sp.createGuides(${numberOfRows}, ${numberOfColumns}, "${rowGutter || ''}", "${columnGutter || ''}", ${guideColorLiteral}, ${fitMargins}, ${removeExisting});`,
            '    "Spread guides created";',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Create Spread Guides');
    }
});

export const tools = [
    createSpreadGuides
];
