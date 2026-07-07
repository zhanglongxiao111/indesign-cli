import { runScript, formatResponse } from '../../core/runtime.js';
import { escapeJsxString } from '../../utils/stringUtils.js';
import { defineTool } from '../_contract.js';
import { createStyleContract, mutateStyleContract, readStyleContract } from './_shared.js';

export const createColorSwatch = defineTool({
    name: 'create_color_swatch',
    description: 'Create a color swatch',
    domain: 'style',
    profiles: ['classic'],
    cli: { id: 'style.create_color_swatch', aliases: [] },
    contract: createStyleContract,
    inputSchema: {
        additionalProperties: false,
        type: 'object',
        properties: {
            blue: { description: 'Blue value (0-255)', type: 'number' },
            colorType: { default: 'PROCESS', enum: ['PROCESS', 'SPOT'], type: 'string' },
            green: { description: 'Green value (0-255)', type: 'number' },
            name: { description: 'Swatch name', type: 'string' },
            red: { description: 'Red value (0-255)', type: 'number' }
        },
        required: ['name', 'red', 'green', 'blue']
    },
    handler: async (args) => {
        const {
            name,
            colorType = 'PROCESS',
            red,
            green,
            blue
        } = args;
        void colorType;

        const escapedName = escapeJsxString(name);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '',
            '  try {',
            `    var color = doc.colors.itemByName("${escapedName}");`,
            '    if (!color.isValid) {',
            `      color = doc.colors.add({name: "${escapedName}"});`,
            '    }',
            '',
            '    color.model = ColorModel.PROCESS;',
            '    color.space = ColorSpace.RGB;',
            `    color.colorValue = [${red}, ${green}, ${blue}];`,
            '',
            '    // Verify the color was set correctly',
            '    var actualValues = color.colorValue;',
            '',
            `    "Color swatch '${escapedName}' created successfully with RGB values [" + actualValues[0] + ", " + actualValues[1] + ", " + actualValues[2] + "]";`,
            '  } catch (error) {',
            '    "Error creating color swatch: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Create Color Swatch');
    }
});

export const listColorSwatches = defineTool({
    name: 'list_color_swatches',
    description: 'List all color swatches',
    domain: 'style',
    profiles: ['classic'],
    cli: { id: 'style.list_color_swatches', aliases: [] },
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
            '  var info = "=== COLOR SWATCHES ===\\n";',
            '',
            '  try {',
            '    for (var i = 0; i < doc.colors.length; i++) {',
            '      var color = doc.colors[i];',
            '      if (color && color.isValid) {',
            '        info += "Name: " + color.name + "\\n";',
            '        if (color.colorValue && color.colorValue.length >= 4) {',
            '          info += "  CMYK: [" + color.colorValue[0] + ", " + color.colorValue[1] + ", " + color.colorValue[2] + ", " + color.colorValue[3] + "]\\n";',
            '        } else if (color.colorValue && color.colorValue.length >= 3) {',
            '          info += "  RGB: [" + color.colorValue[0] + ", " + color.colorValue[1] + ", " + color.colorValue[2] + "]\\n";',
            '        } else {',
            '          info += "  Values: [No values set]\\n";',
            '        }',
            '        info += "\\n";',
            '      }',
            '    }',
            '  } catch (error) {',
            '    info += "Error listing colors: " + error.message + "\\n";',
            '  }',
            '',
            '  info;',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'List Color Swatches');
    }
});

export const applyColor = defineTool({
    name: 'apply_color',
    description: 'Apply color to an object',
    domain: 'style',
    profiles: ['classic'],
    cli: { id: 'style.apply_color', aliases: [] },
    contract: mutateStyleContract,
    inputSchema: {
        additionalProperties: false,
        type: 'object',
        properties: {
            colorName: { description: 'Color swatch name', type: 'string' },
            colorType: { default: 'FILL', enum: ['FILL', 'STROKE'], type: 'string' },
            frameIndex: { default: 0, description: 'Target frame or page item index', type: 'number' },
            objectIndex: { description: 'Object index', type: 'number' },
            targetType: { default: 'text', enum: ['text', 'rectangle', 'ellipse'], type: 'string' }
        },
        required: ['objectIndex', 'colorName']
    },
    handler: async (args) => {
        const { colorName, targetType = 'text', frameIndex = 0 } = args;
        const escapedColorName = escapeJsxString(colorName);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var page = doc.pages[0];',
            '',
            '  try {',
            `    var color = doc.colors.itemByName("${escapedColorName}");`,
            '    if (!color.isValid) {',
            `      "Color '${escapedColorName}' not found";`,
            '    } else {',
            `      if ("${targetType}" === "text") {`,
            `        if (${frameIndex} >= page.textFrames.length) {`,
            '          "Text frame index out of range";',
            '        } else {',
            `          var textFrame = page.textFrames[${frameIndex}];`,
            '          textFrame.texts[0].fillColor = color;',
            `          "Color '${escapedColorName}' applied to text";`,
            '        }',
            `      } else if ("${targetType}" === "rectangle") {`,
            `        if (${frameIndex} >= page.rectangles.length) {`,
            '          "Rectangle index out of range";',
            '        } else {',
            `          var rectangle = page.rectangles[${frameIndex}];`,
            '          rectangle.fillColor = color;',
            `          "Color '${escapedColorName}' applied to rectangle";`,
            '        }',
            `      } else if ("${targetType}" === "ellipse") {`,
            `        if (${frameIndex} >= page.ovals.length) {`,
            '          "Ellipse index out of range";',
            '        } else {',
            `          var ellipse = page.ovals[${frameIndex}];`,
            '          ellipse.fillColor = color;',
            `          "Color '${escapedColorName}' applied to ellipse";`,
            '        }',
            '      } else {',
            '        "Invalid target type. Use: text, rectangle, or ellipse";',
            '      }',
            '    }',
            '  } catch (error) {',
            '    "Error applying color: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Apply Color');
    }
});

export const tools = [applyColor, createColorSwatch, listColorSwatches];
