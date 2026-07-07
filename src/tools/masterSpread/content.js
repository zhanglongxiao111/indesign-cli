import { runScript, formatResponse } from '../../core/runtime.js';
import { escapeJsxString } from '../../utils/stringUtils.js';
import { defineTool } from '../_contract.js';
import { DOMAIN, PROFILES, contract } from './_shared.js';

export const createMasterTextFrame = defineTool({
    name: 'create_master_text_frame',
    description: 'Create a text frame on a master spread',
    domain: DOMAIN,
    profiles: PROFILES,
    cli: { id: 'master.create_master_text_frame', aliases: [] },
    contract: contract({ requiresActiveDocument: true }),
    inputSchema: {
        additionalProperties: false,
        properties: {
            alignment: { default: 'LEFT_ALIGN', enum: ['LEFT_ALIGN', 'CENTER_ALIGN', 'RIGHT_ALIGN', 'JUSTIFY'], type: 'string' },
            content: { description: 'Text content for the frame', type: 'string' },
            fontFamily: { default: 'Helvetica Neue', description: 'Font family name', type: 'string' },
            fontSize: { default: 12, description: 'Font size in points', type: 'number' },
            height: { default: 50, description: 'Height in mm', type: 'number' },
            isPrimaryTextFrame: { default: false, description: 'Set as primary text frame', type: 'boolean' },
            masterName: { description: 'Master spread name', type: 'string' },
            textColor: { default: 'Black', description: 'Text color (RGB hex or name)', type: 'string' },
            width: { default: 100, description: 'Width in mm', type: 'number' },
            x: { default: 10, description: 'X position in mm', type: 'number' },
            y: { default: 10, description: 'Y position in mm', type: 'number' }
        },
        required: ['masterName', 'content'],
        type: 'object'
    },
    handler: async (args) => {
        const {
            masterName,
            content,
            x,
            y,
            width,
            height,
            fontSize = 12,
            fontFamily = 'Arial',
            fontStyle = 'Normal',
            alignment = 'LEFT_ALIGN'
        } = args;

        const escapedMasterName = escapeJsxString(masterName);
        const escapedContent = escapeJsxString(content);
        const escapedFontFamily = escapeJsxString(fontFamily);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  var masterSpread = doc.masterSpreads.itemByName("${escapedMasterName}");`,
            '',
            '  if (!masterSpread.isValid) {',
            `    "Master spread not found: ${escapedMasterName}";`,
            '  } else {',
            '    var page = masterSpread.pages[0];',
            '    var textFrame = page.textFrames.add();',
            '',
            `    textFrame.geometricBounds = [${y}, ${x}, ${y + height}, ${x + width}];`,
            `    textFrame.contents = "${escapedContent}";`,
            `    try { textFrame.texts[0].pointSize = ${fontSize}; } catch (e) {}`,
            `    try { textFrame.texts[0].appliedFont = app.fonts.itemByName("${escapedFontFamily}"); } catch (e) {}`,
            `    try { textFrame.texts[0].fontStyle = "${fontStyle}"; } catch (e) {}`,
            `    try { textFrame.texts[0].justification = Justification.${alignment}; } catch (e) {}`,
            '',
            '    "Master text frame created successfully";',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Create Master Text Frame');
    }
});

export const createMasterRectangle = defineTool({
    name: 'create_master_rectangle',
    description: 'Create a rectangle on a master spread',
    domain: DOMAIN,
    profiles: PROFILES,
    cli: { id: 'master.create_master_rectangle', aliases: [] },
    contract: contract({ requiresActiveDocument: true }),
    inputSchema: {
        additionalProperties: false,
        properties: {
            cornerRadius: { default: 0, description: 'Corner radius in mm', type: 'number' },
            fillColor: { description: 'Fill color (RGB hex or swatch name)', type: 'string' },
            height: { description: 'Height in mm', type: 'number' },
            masterName: { description: 'Master spread name', type: 'string' },
            strokeColor: { description: 'Stroke color', type: 'string' },
            strokeWidth: { default: 1, description: 'Stroke width in points', type: 'number' },
            width: { description: 'Width in mm', type: 'number' },
            x: { description: 'X position in mm', type: 'number' },
            y: { description: 'Y position in mm', type: 'number' }
        },
        required: ['masterName', 'x', 'y', 'width', 'height'],
        type: 'object'
    },
    handler: async (args) => {
        const {
            masterName,
            x,
            y,
            width,
            height,
            fillColor = 'None',
            strokeColor = 'Black',
            strokeWeight = 1
        } = args;

        const escapedMasterName = escapeJsxString(masterName);
        const escapedFillColor = escapeJsxString(fillColor);
        const escapedStrokeColor = escapeJsxString(strokeColor);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  var masterSpread = doc.masterSpreads.itemByName("${escapedMasterName}");`,
            '',
            '  if (!masterSpread.isValid) {',
            `    "Master spread not found: ${escapedMasterName}";`,
            '  } else {',
            '    var page = masterSpread.pages[0];',
            '    var rectangle = page.rectangles.add();',
            '',
            `    rectangle.geometricBounds = [${y}, ${x}, ${y + height}, ${x + width}];`,
            `    rectangle.fillColor = doc.colors.itemByName("${escapedFillColor}");`,
            `    rectangle.strokeColor = doc.colors.itemByName("${escapedStrokeColor}");`,
            `    rectangle.strokeWeight = ${strokeWeight};`,
            '',
            '    "Master rectangle created successfully";',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Create Master Rectangle');
    }
});

export const createMasterGuides = defineTool({
    name: 'create_master_guides',
    description: 'Create guides on a master spread',
    domain: DOMAIN,
    profiles: PROFILES,
    cli: { id: 'master.create_master_guides', aliases: [] },
    contract: contract({ requiresActiveDocument: true }),
    inputSchema: {
        additionalProperties: false,
        properties: {
            columnGutter: { default: 5, description: 'Column gutter in mm', type: 'number' },
            fitMargins: { default: true, description: 'Fit guides to margins', type: 'boolean' },
            guideColor: { default: 'BLUE', description: 'Guide color (RGB values as comma-separated string or UI color name)', type: 'string' },
            layerName: { description: 'Layer name to create guides on', type: 'string' },
            masterName: { description: 'Master spread name', type: 'string' },
            numberOfColumns: { default: 0, description: 'Number of columns', type: 'number' },
            numberOfRows: { default: 0, description: 'Number of rows', type: 'number' },
            removeExisting: { default: false, description: 'Remove existing guides', type: 'boolean' },
            rowGutter: { default: 5, description: 'Row gutter in mm', type: 'number' }
        },
        required: ['masterName'],
        type: 'object'
    },
    handler: async (args) => {
        const {
            masterName,
            numberOfRows = 0,
            numberOfColumns = 0,
            rowGutter,
            columnGutter,
            guideColor = '[0, 0, 255]',
            fitMargins = false,
            removeExisting = false
        } = args;

        const escapedMasterName = escapeJsxString(masterName);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  var masterSpread = doc.masterSpreads.itemByName("${escapedMasterName}");`,
            '',
            '  if (!masterSpread.isValid) {',
            `    "Master spread not found: ${escapedMasterName}";`,
            '  } else {',
            '',
            `    masterSpread.createGuides(${numberOfRows}, ${numberOfColumns}, "${rowGutter || ''}", "${columnGutter || ''}", ${guideColor}, ${fitMargins}, ${removeExisting});`,
            '',
            '    "Master guides created successfully";',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Create Master Guides');
    }
});

export const tools = [
    createMasterTextFrame,
    createMasterRectangle,
    createMasterGuides
];
