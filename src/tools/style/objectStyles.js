import { runScript, formatErrorResponse, formatResponse } from '../../core/runtime.js';
import { escapeJsxString } from '../../utils/stringUtils.js';
import { defineTool } from '../_contract.js';
import { createStyleContract, mutateStyleContract, readStyleContract } from './_shared.js';

export const createObjectStyle = defineTool({
    name: 'create_object_style',
    description: 'Create an object style for consistent formatting',
    domain: 'style',
    profiles: ['classic'],
    cli: { id: 'style.create_object_style', aliases: [] },
    contract: createStyleContract,
    inputSchema: {
        additionalProperties: false,
        type: 'object',
        properties: {
            cornerRadius: { default: 0, description: 'Corner radius in mm', type: 'number' },
            fillColor: { description: 'Fill color (swatch name)', type: 'string' },
            name: { description: 'Object style name', type: 'string' },
            strokeColor: { description: 'Stroke color (swatch name)', type: 'string' },
            strokeWeight: { default: 1, description: 'Stroke weight in points', type: 'number' },
            transparency: { default: 100, description: 'Transparency percentage (0-100)', type: 'number' }
        },
        required: ['name']
    },
    handler: async (args) => {
        const {
            name,
            fillColor,
            strokeColor,
            strokeWeight = 1,
            cornerRadius = 0,
            transparency = 100
        } = args;

        const escapedName = escapeJsxString(name);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '',
            '  try {',
            `    var objectStyle = doc.objectStyles.add({name: "${escapedName}"});`,
            '',
            '    // Apply fill color',
            `    if ("${fillColor}" !== "") {`,
            '      try {',
            `        objectStyle.fillColor = doc.colors.itemByName("${fillColor}");`,
            '      } catch (colorError) {',
            '        // Use default color if specified color not found',
            '      }',
            '    }',
            '',
            '    // Apply stroke color',
            `    if ("${strokeColor}" !== "") {`,
            '      try {',
            `        objectStyle.strokeColor = doc.colors.itemByName("${strokeColor}");`,
            `        objectStyle.strokeWeight = ${strokeWeight};`,
            '      } catch (colorError) {',
            '        // Use default stroke if specified color not found',
            '      }',
            '    }',
            '',
            '    // Apply corner radius',
            `    if (${cornerRadius} > 0) {`,
            `      objectStyle.topLeftCornerOption = CornerOptions.ROUNDED_CORNER;`,
            `      objectStyle.topRightCornerOption = CornerOptions.ROUNDED_CORNER;`,
            `      objectStyle.bottomLeftCornerOption = CornerOptions.ROUNDED_CORNER;`,
            `      objectStyle.bottomRightCornerOption = CornerOptions.ROUNDED_CORNER;`,
            `      objectStyle.topLeftCornerRadius = ${cornerRadius};`,
            `      objectStyle.topRightCornerRadius = ${cornerRadius};`,
            `      objectStyle.bottomLeftCornerRadius = ${cornerRadius};`,
            `      objectStyle.bottomRightCornerRadius = ${cornerRadius};`,
            '    }',
            '',
            '    // Apply transparency',
            `    if (${transparency} < 100) {`,
            `      objectStyle.transparencySettings.blendingSettings.opacity = ${transparency};`,
            '    }',
            '',
            `    "Object style '${escapedName}' created successfully";`,
            '  } catch (error) {',
            '    "Error creating object style: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return result.includes('created successfully')
            ? formatResponse(result, 'Create Object Style')
            : formatErrorResponse(result, 'Create Object Style');
    }
});

export const listObjectStyles = defineTool({
    name: 'list_object_styles',
    description: 'List all object styles in the document',
    domain: 'style',
    profiles: ['classic'],
    cli: { id: 'style.list_object_styles', aliases: [] },
    contract: readStyleContract,
    inputSchema: {
        additionalProperties: false,
        type: 'object',
        properties: {}
    },
    handler: async () => {
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var info = "=== OBJECT STYLES ===\\n";',
            '',
            '  for (var i = 0; i < doc.objectStyles.length; i++) {',
            '    var style = doc.objectStyles[i];',
            '    if (style.isValid) {',
            '      info += "Name: " + style.name + "\\n";',
            '      try { info += "  Fill Color: " + (style.fillColor ? style.fillColor.name : "None") + "\\n"; } catch (_) {}',
            '      try { info += "  Stroke Color: " + (style.strokeColor ? style.strokeColor.name : "None") + "\\n"; } catch (_) {}',
            '      try { info += "  Stroke Weight: " + style.strokeWeight + "\\n"; } catch (_) {}',
            '      try { info += "  Top Left Corner: " + style.topLeftCornerOption + "\\n"; } catch (_) {}',
            '      try { info += "  Top Left Corner Radius: " + style.topLeftCornerRadius + "\\n"; } catch (_) {}',
            '      info += "\\n";',
            '    }',
            '  }',
            '',
            '  info;',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'List Object Styles');
    }
});

export const applyObjectStyle = defineTool({
    name: 'apply_object_style',
    description: 'Apply an object style to a page item',
    domain: 'style',
    profiles: ['classic'],
    cli: { id: 'style.apply_object_style', aliases: [] },
    contract: mutateStyleContract,
    inputSchema: {
        additionalProperties: false,
        type: 'object',
        properties: {
            itemIndex: { default: 0, description: 'Item index', type: 'number' },
            itemType: { default: 'rectangle', enum: ['rectangle', 'ellipse', 'polygon'], type: 'string' },
            styleName: { description: 'Object style name', type: 'string' }
        },
        required: ['styleName']
    },
    handler: async (args) => {
        const {
            styleName,
            itemType = 'rectangle',
            itemIndex = 0
        } = args;

        const escapedStyleName = escapeJsxString(styleName);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var page = doc.pages[0];',
            '',
            '  try {',
            `    var objectStyle = doc.objectStyles.itemByName("${escapedStyleName}");`,
            '    if (!objectStyle.isValid) {',
            `      "Object style '${escapedStyleName}' not found";`,
            '    } else {',
            `      var item;`,
            `      if ("${itemType}" === "rectangle") {`,
            `        if (${itemIndex} >= page.rectangles.length) {`,
            '          "Rectangle index out of range";',
            '        } else {',
            `          item = page.rectangles[${itemIndex}];`,
            '        }',
            `      } else if ("${itemType}" === "ellipse") {`,
            `        if (${itemIndex} >= page.ovals.length) {`,
            '          "Ellipse index out of range";',
            '        } else {',
            `          item = page.ovals[${itemIndex}];`,
            '        }',
            `      } else if ("${itemType}" === "polygon") {`,
            `        if (${itemIndex} >= page.polygons.length) {`,
            '          "Polygon index out of range";',
            '        } else {',
            `          item = page.polygons[${itemIndex}];`,
            '        }',
            '      } else {',
            '        "Invalid item type. Use: rectangle, ellipse, or polygon";',
            '      }',
            '',
            '      if (item) {',
            '        item.appliedObjectStyle = objectStyle;',
            `        "Object style '${escapedStyleName}' applied successfully";`,
            '      }',
            '    }',
            '  } catch (error) {',
            '    "Error applying object style: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Apply Object Style');
    }
});

export const tools = [applyObjectStyle, createObjectStyle, listObjectStyles];
