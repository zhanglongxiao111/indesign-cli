import { runScript, formatResponse, formatErrorResponse } from '../../core/runtime.js';
import { sessionManager } from '../../core/sessionManager.js';
import { escapeJsxString } from '../../utils/stringUtils.js';
import { defineTool } from '../_contract.js';

const mutatingTextContract = {
    needsInDesign: true,
    requiresActiveDocument: true,
    mutatesDocument: true,
    writesFilesystem: false,
    producesArtifacts: false,
    destructive: false
};

export const createTextFrame = defineTool({
    name: 'create_text_frame',
    description: 'Create a text frame on the active page',
    domain: 'text',
    profiles: ['classic'],
    cli: { id: 'text.create_text_frame', aliases: [] },
    contract: mutatingTextContract,
    inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            content: { type: 'string', description: 'Text content for the frame' },
            x: { type: 'number', description: 'X position in mm', default: 10 },
            y: { type: 'number', description: 'Y position in mm', default: 10 },
            width: { type: 'number', description: 'Width in mm', default: 100 },
            height: { type: 'number', description: 'Height in mm', default: 50 },
            fontSize: { type: 'number', description: 'Font size in points', default: 12 },
            fontName: { type: 'string', description: 'Font name (use format: FontName\\tStyle)', default: 'Arial\\tRegular' },
            textColor: { type: 'string', description: 'Text color (RGB hex or name)', default: 'Black' },
            alignment: { type: 'string', enum: ['LEFT', 'CENTER', 'RIGHT', 'JUSTIFY'], default: 'LEFT' },
            paragraphStyle: { type: 'string', description: 'Paragraph style name to apply during creation' },
            characterStyle: { type: 'string', description: 'Character style name to apply during creation' },
        },
        required: ['content'],
    },
    handler: async (args) => {
        const {
            content,
            x,
            y,
            width,
            height,
            fontSize = 12,
            fontName = 'Arial\\tRegular',
            textColor = 'Black',
            alignment = 'LEFT',
            paragraphStyle = null,
            characterStyle = null
        } = args;

        const numericInputs = { x, y, width, height, fontSize };
        for (const [field, value] of Object.entries(numericInputs)) {
            if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
                return formatErrorResponse(`${field} must be a valid number`, "Create Text Frame");
            }
        }

        // Use session manager for positioning if coordinates not provided
        const positioning = sessionManager.getCalculatedPositioning({ x, y, width, height });

        // Validate positioning before creating content
        const validation = sessionManager.validatePositioning(positioning.x, positioning.y, positioning.width, positioning.height);
        if (!validation.valid) {
            // Apply suggested corrections if available, otherwise use safe defaults
            if (validation.suggested) {
                Object.assign(positioning, validation.suggested);
            } else {
                // Fallback to safe positioning
                const safePos = sessionManager.getCalculatedPositioning({});
                Object.assign(positioning, safePos);
            }
        }

        const escapedContent = escapeJsxString(content);
        const escapedFontName = escapeJsxString(fontName);
        const escapedParagraphStyle = paragraphStyle ? escapeJsxString(paragraphStyle) : '';
        const escapedCharacterStyle = characterStyle ? escapeJsxString(characterStyle) : '';
        const sanitizedTextColor = typeof textColor === 'string' && textColor.trim() !== '' ? textColor : 'Black';
        const escapedTextColor = escapeJsxString(sanitizedTextColor);
        const alignmentOptions = new Set(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFY']);
        const normalizedAlignment = typeof alignment === 'string' ? alignment.trim().toUpperCase() : 'LEFT';
        const safeAlignment = alignmentOptions.has(normalizedAlignment) ? normalizedAlignment : 'LEFT';
        const escapedAlignment = escapeJsxString(safeAlignment);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var page = app.activeWindow.activePage || doc.pages[0];',
            '  var textFrame;',
            '  var styleMessage = "";',
            '',
            '  try {',
            '    // Create text frame',
            `    textFrame = page.textFrames.add();`,
            `    textFrame.geometricBounds = [${positioning.y}, ${positioning.x}, ${positioning.y + positioning.height}, ${positioning.x + positioning.width}];`,
            `    textFrame.contents = "${escapedContent}";`,
            '',
            '    // Apply paragraph style if specified',
            `    if ("${escapedParagraphStyle}" !== "") {`,
            '      try {',
            `        var paragraphStyle = doc.paragraphStyles.itemByName("${escapedParagraphStyle}");`,
            '        if (paragraphStyle.isValid) {',
            '          textFrame.paragraphs[0].appliedParagraphStyle = paragraphStyle;',
            `          styleMessage += "Paragraph style '${escapedParagraphStyle}' applied. ";`,
            '        } else {',
            `          styleMessage += "Paragraph style '${escapedParagraphStyle}' not found. ";`,
            '        }',
            '      } catch (styleError) {',
            `        styleMessage += "Error applying paragraph style: " + styleError.message + ". ";`,
            '      }',
            '    }',
            '',
            '    // Apply character style if specified',
            `    if ("${escapedCharacterStyle}" !== "") {`,
            '      try {',
            `        var characterStyle = doc.characterStyles.itemByName("${escapedCharacterStyle}");`,
            '        if (characterStyle.isValid) {',
            '          textFrame.texts[0].appliedCharacterStyle = characterStyle;',
            `          styleMessage += "Character style '${escapedCharacterStyle}' applied. ";`,
            '        } else {',
            `          styleMessage += "Character style '${escapedCharacterStyle}' not found. ";`,
            '        }',
            '      } catch (styleError) {',
            `        styleMessage += "Error applying character style: " + styleError.message + ". ";`,
            '      }',
            '    }',
            '',
            '    // Apply direct formatting only if no styles were applied',
            `    if ("${escapedParagraphStyle}" === "" && "${escapedCharacterStyle}" === "") {`,
            '      // Apply text formatting',
            '      try {',
            `        textFrame.texts[0].appliedFont = app.fonts.itemByName("${escapedFontName}");`,
            '      } catch (fontError) {',
            '        // Keep the document default font when the requested font is unavailable.',
            '      }',
            `      textFrame.texts[0].pointSize = ${fontSize};`,
            '',
            '      // Apply color',
            `      if ("${escapedTextColor}" !== "Black") {`,
            '        try {',
            `          textFrame.texts[0].fillColor = app.colors.itemByName("${escapedTextColor}");`,
            '        } catch (colorError) {',
            '          // Use default color if specified color not found',
            '        }',
            '      }',
            '',
            '      // Apply alignment',
            `      if ("${escapedAlignment}" === "CENTER") {`,
            '        textFrame.texts[0].justification = Justification.CENTER_ALIGN;',
            `      } else if ("${escapedAlignment}" === "RIGHT") {`,
            '        textFrame.texts[0].justification = Justification.RIGHT_ALIGN;',
            `      } else if ("${escapedAlignment}" === "JUSTIFY") {`,
            '        textFrame.texts[0].justification = Justification.FULLY_JUSTIFIED;',
            '      } else {',
            '        textFrame.texts[0].justification = Justification.LEFT_ALIGN;',
            '      }',
            '    }',
            '',
            '    "Text frame created successfully. " + styleMessage;',
            '  } catch (error) {',
            '    "Error creating text frame: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);

        // Check if the operation was successful
        const isSuccess = result.includes("Text frame created successfully");

        if (isSuccess) {
            // Store the created item info in session
            sessionManager.setLastCreatedItem({
                type: 'textFrame',
                content: content,
                position: positioning,
                fontSize: fontSize,
                fontName: fontName,
                paragraphStyle: paragraphStyle,
                characterStyle: characterStyle,
                textColor: sanitizedTextColor,
                alignment: safeAlignment
            });
        }

        return isSuccess ?
            formatResponse(result, "Create Text Frame") :
            formatErrorResponse(result, "Create Text Frame");
    }
});

export const editTextFrame = defineTool({
    name: 'edit_text_frame',
    description: 'Edit an existing text frame',
    domain: 'text',
    profiles: ['classic'],
    cli: { id: 'text.edit_text_frame', aliases: [] },
    contract: mutatingTextContract,
    inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            frameIndex: { type: 'number', description: 'Index of the text frame to edit' },
            content: { type: 'string', description: 'New text content' },
            fontSize: { type: 'number', description: 'Font size in points' },
            fontName: { type: 'string', description: 'Font name' },
            textColor: { type: 'string', description: 'Text color (RGB hex or name)' },
            alignment: { type: 'string', enum: ['LEFT', 'CENTER', 'RIGHT', 'JUSTIFY'] },
        },
        required: ['frameIndex'],
    },
    handler: async (args) => {
        const {
            frameIndex,
            content,
            fontSize,
            fontName,
            textColor,
            alignment
        } = args;

        const escapedContent = content ? escapeJsxString(content) : '';
        const escapedFontName = fontName ? escapeJsxString(fontName) : '';
        const sanitizedTextColor = typeof textColor === 'string' ? textColor.trim() : '';
        const escapedTextColor = sanitizedTextColor ? escapeJsxString(sanitizedTextColor) : '';
        const normalizedAlignment = typeof alignment === 'string' ? alignment.trim().toUpperCase() : '';
        const safeAlignment = ['LEFT', 'CENTER', 'RIGHT', 'JUSTIFY'].includes(normalizedAlignment) ? normalizedAlignment : '';
        const escapedAlignment = safeAlignment ? escapeJsxString(safeAlignment) : '';

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var page = app.activeWindow.activePage || doc.pages[0];',
            '',
            '  try {',
            `    if (${frameIndex} >= page.textFrames.length) {`,
            '      "Text frame index out of range";',
            '    } else {',
            `      var textFrame = page.textFrames[${frameIndex}];`,
            '',
            `      if ("${escapedContent}" !== "") {`,
            `        textFrame.contents = "${escapedContent}";`,
            '      }',
            '',
            `      if (${fontSize}) {`,
            `        textFrame.texts[0].pointSize = ${fontSize};`,
            '      }',
            '',
            `      if ("${escapedFontName}" !== "") {`,
            `        textFrame.texts[0].appliedFont = app.fonts.itemByName("${escapedFontName}");`,
            '      }',
            '',
            `      if ("${escapedTextColor}" !== "") {`,
            '      try {',
            `        textFrame.texts[0].fillColor = app.colors.itemByName("${escapedTextColor}");`,
            '      } catch (colorError) {',
            '        // Use default color if specified color not found',
            '      }',
            '      }',
            '',
            `      if ("${escapedAlignment}" !== "") {`,
            `        if ("${escapedAlignment}" === "CENTER") {`,
            '          textFrame.texts[0].justification = Justification.CENTER_ALIGN;',
            `        } else if ("${escapedAlignment}" === "RIGHT") {`,
            '          textFrame.texts[0].justification = Justification.RIGHT_ALIGN;',
            `        } else if ("${escapedAlignment}" === "JUSTIFY") {`,
            '          textFrame.texts[0].justification = Justification.FULLY_JUSTIFIED;',
            '        } else {',
            '          textFrame.texts[0].justification = Justification.LEFT_ALIGN;',
            '        }',
            '      }',
            '',
            '      "Text frame updated successfully";',
            '    }',
            '  } catch (error) {',
            '    "Error updating text frame: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Edit Text Frame");
    }
});

export const tools = [createTextFrame, editTextFrame];
