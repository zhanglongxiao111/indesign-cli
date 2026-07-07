import { runScript, formatResponse } from '../../core/runtime.js';
import { escapeJsxString } from '../../utils/stringUtils.js';
import { defineTool } from '../_contract.js';
import { createStyleContract, mutateStyleContract, readStyleContract } from './_shared.js';

export const createParagraphStyle = defineTool({
    name: 'create_paragraph_style',
    description: 'Create a paragraph style',
    domain: 'style',
    profiles: ['classic'],
    cli: { id: 'style.create_paragraph_style', aliases: [] },
    contract: createStyleContract,
    inputSchema: {
        additionalProperties: false,
        type: 'object',
        properties: {
            alignment: { default: 'LEFT_ALIGN', enum: ['LEFT_ALIGN', 'CENTER_ALIGN', 'RIGHT_ALIGN', 'JUSTIFY'], type: 'string' },
            fontFamily: { default: 'Arial\\tRegular', description: 'Font family (use format: FontName\\tStyle)', type: 'string' },
            fontSize: { default: 12, description: 'Font size in points', type: 'number' },
            leading: { description: 'Line spacing in points', type: 'number' },
            name: { description: 'Style name', type: 'string' },
            spaceAfter: { description: 'Space after paragraph in points', type: 'number' },
            spaceBefore: { description: 'Space before paragraph in points', type: 'number' },
            textColor: { default: 'Black', description: 'Text color', type: 'string' }
        },
        required: ['name']
    },
    handler: async (args) => {
        const {
            name,
            fontFamily = 'Arial\\tRegular',
            fontSize = 12,
            textColor = 'Black',
            alignment = 'LEFT_ALIGN',
            leading,
            spaceBefore,
            spaceAfter
        } = args;

        const escapedName = escapeJsxString(name);
        const escapedFontFamily = escapeJsxString(fontFamily);
        const sanitizedTextColor = typeof textColor === 'string' && textColor.trim() !== '' ? textColor.trim() : 'Black';
        const escapedTextColor = escapeJsxString(sanitizedTextColor);
        const alignmentOptions = new Set(['LEFT_ALIGN', 'CENTER_ALIGN', 'RIGHT_ALIGN', 'JUSTIFY', 'FULLY_JUSTIFIED']);
        const normalizedAlignment = typeof alignment === 'string' ? alignment.trim().toUpperCase() : 'LEFT_ALIGN';
        const safeAlignment = alignmentOptions.has(normalizedAlignment) ? normalizedAlignment : 'LEFT_ALIGN';
        const escapedAlignment = escapeJsxString(safeAlignment);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '',
            '  try {',
            `    var style = doc.paragraphStyles.add({name: "${escapedName}"});`,
            '',
            '    // Apply font settings',
            '    try {',
            `      style.appliedFont = app.fonts.itemByName("${escapedFontFamily}");`,
            '    } catch (fontError) {',
            '      // Keep the document default font when the requested font is unavailable.',
            '    }',
            `    style.pointSize = ${fontSize};`,
            '',
            '    // Apply color',
            `    if ("${escapedTextColor}" !== "Black") {`,
            '      try {',
            `        var color = doc.colors.itemByName("${escapedTextColor}");`,
            '        if (color.isValid) {',
            '          style.fillColor = color;',
            '        }',
            '      } catch (colorError) {',
            '        // Use default color if specified color not found',
            '      }',
            '    }',
            '',
            '    // Apply alignment',
            `    if ("${escapedAlignment}" === "CENTER_ALIGN") {`,
            '      style.justification = Justification.CENTER_ALIGN;',
            `    } else if ("${escapedAlignment}" === "RIGHT_ALIGN") {`,
            '      style.justification = Justification.RIGHT_ALIGN;',
            `    } else if ("${escapedAlignment}" === "JUSTIFY" || "${escapedAlignment}" === "FULLY_JUSTIFIED") {`,
            '      style.justification = Justification.FULLY_JUSTIFIED;',
            '    } else {',
            '      style.justification = Justification.LEFT_ALIGN;',
            '    }',
            '',
            ...(leading ? [`    style.leading = ${leading};`] : []),
            ...(spaceBefore ? [`    style.spaceBefore = ${spaceBefore};`] : []),
            ...(spaceAfter ? [`    style.spaceAfter = ${spaceAfter};`] : []),
            '',
            '    // Verify the style was created correctly',
            '    var actualFont = style.appliedFont.name;',
            '    var actualSize = style.pointSize;',
            '    var actualAlignment = style.justification;',
            '',
            `    "Paragraph style '${escapedName}' created successfully with font: " + actualFont + " at " + actualSize + "pt";`,
            '  } catch (error) {',
            '    "Error creating paragraph style: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Create Paragraph Style');
    }
});

export const createCharacterStyle = defineTool({
    name: 'create_character_style',
    description: 'Create a character style',
    domain: 'style',
    profiles: ['classic'],
    cli: { id: 'style.create_character_style', aliases: [] },
    contract: createStyleContract,
    inputSchema: {
        additionalProperties: false,
        type: 'object',
        properties: {
            bold: { default: false, description: 'Bold text', type: 'boolean' },
            fontFamily: { default: 'Arial\\tRegular', description: 'Font family (use format: FontName\\tStyle)', type: 'string' },
            fontSize: { default: 12, description: 'Font size in points', type: 'number' },
            italic: { default: false, description: 'Italic text', type: 'boolean' },
            name: { description: 'Style name', type: 'string' },
            textColor: { default: 'Black', description: 'Text color', type: 'string' },
            underline: { default: false, description: 'Underline text', type: 'boolean' }
        },
        required: ['name']
    },
    handler: async (args) => {
        const {
            name,
            fontFamily = 'Arial\\tRegular',
            fontSize = 12,
            textColor = 'Black',
            bold = false,
            italic = false,
            underline = false
        } = args;
        void italic;

        const escapedName = escapeJsxString(name);
        const escapedFontFamily = escapeJsxString(fontFamily);
        const sanitizedTextColor = typeof textColor === 'string' && textColor.trim() !== '' ? textColor.trim() : 'Black';
        const escapedTextColor = escapeJsxString(sanitizedTextColor);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '',
            '  try {',
            `    var style = doc.characterStyles.add({name: "${escapedName}"});`,
            '',
            '    // Apply font settings',
            '    try {',
            `      style.appliedFont = app.fonts.itemByName("${escapedFontFamily}");`,
            '    } catch (fontError) {',
            '      // Keep the document default font when the requested font is unavailable.',
            '    }',
            `    style.pointSize = ${fontSize};`,
            '',
            '    // Apply color',
            `    if ("${escapedTextColor}" !== "Black") {`,
            '      try {',
            `        var color = doc.colors.itemByName("${escapedTextColor}");`,
            '        if (color.isValid) {',
            '          style.fillColor = color;',
            '        }',
            '      } catch (colorError) {',
            '        // Use default color if specified color not found',
            '      }',
            '    }',
            '',
            '    // Apply text attributes',
            `    style.fontStyle = "${bold ? 'Bold' : 'Normal'}";`,
            `    style.underline = ${underline};`,
            `    style.underlineOffset = ${underline ? 1 : 0};`,
            `    style.underlineWeight = ${underline ? 1 : 0};`,
            '',
            '    // Verify the style was created correctly',
            '    var actualFont = style.appliedFont.name;',
            '    var actualSize = style.pointSize;',
            '    var actualStyle = style.fontStyle;',
            '',
            `    "Character style '${escapedName}' created successfully with font: " + actualFont + " at " + actualSize + "pt";`,
            '  } catch (error) {',
            '    "Error creating character style: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Create Character Style');
    }
});

export const applyParagraphStyle = defineTool({
    name: 'apply_paragraph_style',
    description: 'Apply a paragraph style to text',
    domain: 'style',
    profiles: ['classic'],
    cli: { id: 'style.apply_paragraph_style', aliases: [] },
    contract: mutateStyleContract,
    inputSchema: {
        additionalProperties: false,
        type: 'object',
        properties: {
            frameIndex: { default: 0, description: 'Text frame index', type: 'number' },
            paragraphIndex: { default: 0, description: 'Paragraph index within the frame (0-based)', type: 'number' },
            styleName: { description: 'Paragraph style name', type: 'string' }
        },
        required: ['styleName']
    },
    handler: async (args) => {
        const { styleName, frameIndex = 0 } = args;
        const escapedStyleName = escapeJsxString(styleName);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var page = doc.pages[0];',
            '',
            '  try {',
            `    if (${frameIndex} >= page.textFrames.length) {`,
            '      "Text frame index out of range";',
            '    } else {',
            `      var textFrame = page.textFrames[${frameIndex}];`,
            `      var style = doc.paragraphStyles.itemByName("${escapedStyleName}");`,
            '',
            '      if (style.isValid) {',
            '        textFrame.paragraphs[0].appliedParagraphStyle = style;',
            `        "Paragraph style '${escapedStyleName}' applied successfully";`,
            '      } else {',
            `        "Paragraph style '${escapedStyleName}' not found";`,
            '      }',
            '    }',
            '  } catch (error) {',
            '    "Error applying paragraph style: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Apply Paragraph Style');
    }
});

export const applyCharacterStyle = defineTool({
    name: 'apply_character_style',
    description: 'Apply a character style to text',
    domain: 'style',
    profiles: ['classic'],
    cli: { id: 'style.apply_character_style', aliases: [] },
    contract: mutateStyleContract,
    inputSchema: {
        additionalProperties: false,
        type: 'object',
        properties: {
            endIndex: { default: -1, description: 'End character index (-1 for all)', type: 'number' },
            frameIndex: { default: 0, description: 'Text frame index (0-based)', type: 'number' },
            startIndex: { default: 0, description: 'Start character index', type: 'number' },
            styleName: { description: 'Character style name', type: 'string' }
        },
        required: ['styleName']
    },
    handler: async (args) => {
        const { styleName, frameIndex = 0, startIndex = 0, endIndex = -1 } = args;
        const escapedStyleName = escapeJsxString(styleName);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var page = doc.pages[0];',
            '',
            '  try {',
            `    if (${frameIndex} >= page.textFrames.length) {`,
            '      "Text frame index out of range";',
            '    } else {',
            `      var textFrame = page.textFrames[${frameIndex}];`,
            `      var style = doc.characterStyles.itemByName("${escapedStyleName}");`,
            '',
            '      if (style.isValid) {',
            `        if (${endIndex} === -1) {`,
            '          // Apply to entire text frame',
            '          textFrame.texts[0].appliedCharacterStyle = style;',
            `        } else {`,
            '          // Apply to specific range',
            `          textFrame.texts[0].characters.itemByRange(${startIndex}, ${endIndex}).appliedCharacterStyle = style;`,
            '        }',
            `        "Character style '${escapedStyleName}' applied successfully";`,
            '      } else {',
            `        "Character style '${escapedStyleName}' not found";`,
            '      }',
            '    }',
            '  } catch (error) {',
            '    "Error applying character style: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Apply Character Style');
    }
});

export const listStyles = defineTool({
    name: 'list_styles',
    description: 'List all paragraph and character styles',
    domain: 'style',
    profiles: ['classic'],
    cli: { id: 'style.list_styles', aliases: [] },
    contract: readStyleContract,
    inputSchema: {
        additionalProperties: false,
        type: 'object',
        properties: {
            styleType: { default: 'ALL', enum: ['PARAGRAPH', 'CHARACTER', 'ALL'], type: 'string' }
        }
    },
    handler: async (args) => {
        const { styleType = 'ALL' } = args;
        const allowedStyleTypes = new Set(['PARAGRAPH', 'CHARACTER', 'ALL']);
        const normalizedStyleType = typeof styleType === 'string' ? styleType.trim().toUpperCase() : 'ALL';
        const safeStyleType = allowedStyleTypes.has(normalizedStyleType) ? normalizedStyleType : 'ALL';
        const escapedStyleType = escapeJsxString(safeStyleType);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var info = "=== STYLES LIST ===\\n";',
            '',
            '  // Helper function to get alignment name',
            '  function getAlignmentName(alignment) {',
            '    if (alignment === Justification.LEFT_ALIGN) return "LEFT_ALIGN";',
            '    if (alignment === Justification.CENTER_ALIGN) return "CENTER_ALIGN";',
            '    if (alignment === Justification.RIGHT_ALIGN) return "RIGHT_ALIGN";',
            '    if (alignment === Justification.FULLY_JUSTIFIED) return "FULLY_JUSTIFIED";',
            '    return "UNKNOWN (" + alignment + ")";',
            '  }',
            '',
            `  if ("${escapedStyleType}" === "PARAGRAPH" || "${escapedStyleType}" === "ALL") {`,
            '    info += "\\n=== PARAGRAPH STYLES ===\\n";',
            '    for (var i = 0; i < doc.paragraphStyles.length; i++) {',
            '      var style = doc.paragraphStyles[i];',
            '      if (style.isValid) {',
            '        info += "Name: " + style.name + "\\n";',
            '        if (style.appliedFont && style.appliedFont.isValid) {',
            '          info += "  Font: " + style.appliedFont.name + "\\n";',
            '        } else {',
            '          info += "  Font: [Not set]\\n";',
            '        }',
            '        info += "  Size: " + style.pointSize + "pt\\n";',
            '        info += "  Alignment: " + getAlignmentName(style.justification) + "\\n";',
            '        if (style.fillColor && style.fillColor.isValid) {',
            '          info += "  Color: " + style.fillColor.name + "\\n";',
            '        }',
            '        info += "\\n";',
            '      }',
            '    }',
            '  }',
            '',
            `  if ("${escapedStyleType}" === "CHARACTER" || "${escapedStyleType}" === "ALL") {`,
            '    info += "\\n=== CHARACTER STYLES ===\\n";',
            '    for (var i = 0; i < doc.characterStyles.length; i++) {',
            '      var style = doc.characterStyles[i];',
            '      if (style.isValid) {',
            '        info += "Name: " + style.name + "\\n";',
            '        if (style.appliedFont && style.appliedFont.isValid) {',
            '          info += "  Font: " + style.appliedFont.name + "\\n";',
            '        } else {',
            '          info += "  Font: [Not set]\\n";',
            '        }',
            '        info += "  Size: " + style.pointSize + "pt\\n";',
            '        info += "  Style: " + style.fontStyle + "\\n";',
            '        if (style.fillColor && style.fillColor.isValid) {',
            '          info += "  Color: " + style.fillColor.name + "\\n";',
            '        }',
            '        info += "\\n";',
            '      }',
            '    }',
            '  }',
            '',
            '  info;',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'List Styles');
    }
});

export const tools = [
    applyCharacterStyle,
    applyParagraphStyle,
    createCharacterStyle,
    createParagraphStyle,
    listStyles
];
