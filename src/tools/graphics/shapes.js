import { runScript, formatResponse } from '../../core/runtime.js';
import { sessionManager } from '../../core/sessionManager.js';
import { defineTool } from '../_contract.js';
import { mutatingGraphicsContract } from './_shared.js';

export const createRectangle = defineTool({
    name: 'create_rectangle',
    description: 'Create a rectangle on the active page',
    domain: 'graphics',
    profiles: ['classic'],
    cli: { id: 'graphics.create_rectangle', aliases: [] },
    contract: mutatingGraphicsContract,
    inputSchema: {
        additionalProperties: false,
        properties: {
            cornerRadius: {
                default: 0,
                description: 'Corner radius in mm',
                type: 'number'
            },
            fillColor: {
                description: 'Fill color (RGB hex or swatch name)',
                type: 'string'
            },
            height: {
                description: 'Height in mm',
                type: 'number'
            },
            strokeColor: {
                description: 'Stroke color',
                type: 'string'
            },
            strokeWidth: {
                default: 1,
                description: 'Stroke width in points',
                type: 'number'
            },
            width: {
                description: 'Width in mm',
                type: 'number'
            },
            x: {
                description: 'X position in mm',
                type: 'number'
            },
            y: {
                description: 'Y position in mm',
                type: 'number'
            }
        },
        required: ['x', 'y', 'width', 'height'],
        type: 'object'
    },
    handler: async (args) => {
        const {
            x,
            y,
            width,
            height,
            fillColor,
            strokeColor,
            strokeWidth = 1,
            cornerRadius = 0
        } = args;

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

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var page = app.activeWindow.activePage || doc.pages[0];',
            '  var rectangle;',
            '',
            '  try {',
            '    // Create rectangle',
            `    rectangle = page.rectangles.add();`,
            `    rectangle.geometricBounds = [${positioning.y}, ${positioning.x}, ${positioning.y + positioning.height}, ${positioning.x + positioning.width}];`,
            '',
            '    // Apply fill color',
            `    if ("${fillColor}" !== "") {`,
            '      try {',
            `        rectangle.fillColor = doc.colors.itemByName("${fillColor}");`,
            '      } catch (colorError) {',
            '        // Use default color if specified color not found',
            '      }',
            '    }',
            '',
            '    // Apply stroke color',
            `    if ("${strokeColor}" !== "") {`,
            '      try {',
            `        rectangle.strokeColor = doc.colors.itemByName("${strokeColor}");`,
            `        rectangle.strokeWeight = ${strokeWidth};`,
            '      } catch (colorError) {',
            '        // Use default stroke if specified color not found',
            '      }',
            '    }',
            '',
            '    // Apply corner radius',
            '    var cornerWarnings = [];',
            `    if (${cornerRadius} > 0) {`,
            `      try { rectangle.topLeftCornerOption = CornerOptions.ROUNDED_CORNER; } catch (e) { cornerWarnings.push("topLeftCornerOption"); }`,
            `      try { rectangle.topRightCornerOption = CornerOptions.ROUNDED_CORNER; } catch (e) { cornerWarnings.push("topRightCornerOption"); }`,
            `      try { rectangle.bottomLeftCornerOption = CornerOptions.ROUNDED_CORNER; } catch (e) { cornerWarnings.push("bottomLeftCornerOption"); }`,
            `      try { rectangle.bottomRightCornerOption = CornerOptions.ROUNDED_CORNER; } catch (e) { cornerWarnings.push("bottomRightCornerOption"); }`,
            `      try { rectangle.topLeftCornerRadius = ${cornerRadius}; } catch (e) { cornerWarnings.push("topLeftCornerRadius"); }`,
            `      try { rectangle.topRightCornerRadius = ${cornerRadius}; } catch (e) { cornerWarnings.push("topRightCornerRadius"); }`,
            `      try { rectangle.bottomLeftCornerRadius = ${cornerRadius}; } catch (e) { cornerWarnings.push("bottomLeftCornerRadius"); }`,
            `      try { rectangle.bottomRightCornerRadius = ${cornerRadius}; } catch (e) { cornerWarnings.push("bottomRightCornerRadius"); }`,
            '    }',
            '',
            '    JSON.stringify({ success: true, operation: "Create Rectangle", summary: "Rectangle created successfully", data: { itemId: rectangle.id, constructorName: String(rectangle.constructor.name), pageIndex: page.documentOffset, bounds: rectangle.geometricBounds, label: rectangle.label || "" }, warnings: cornerWarnings || [] });',
            '  } catch (error) {',
            '    JSON.stringify({ success: false, operation: "Create Rectangle", code: "INDESIGN_SCRIPT_FAILED", message: error.message, result: "Error creating rectangle: " + error.message });',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);

        // Store the created item info in session
        sessionManager.setLastCreatedItem({
            type: 'rectangle',
            position: positioning,
            fillColor: fillColor,
            strokeColor: strokeColor,
            strokeWidth: strokeWidth,
            cornerRadius: cornerRadius
        });

        return formatResponse(result, "Create Rectangle");
    }
});

export const createEllipse = defineTool({
    name: 'create_ellipse',
    description: 'Create an ellipse on the active page',
    domain: 'graphics',
    profiles: ['classic'],
    cli: { id: 'graphics.create_ellipse', aliases: [] },
    contract: mutatingGraphicsContract,
    inputSchema: {
        additionalProperties: false,
        properties: {
            fillColor: {
                description: 'Fill color (RGB hex or swatch name)',
                type: 'string'
            },
            height: {
                description: 'Height in mm',
                type: 'number'
            },
            strokeColor: {
                description: 'Stroke color',
                type: 'string'
            },
            strokeWidth: {
                default: 1,
                description: 'Stroke width in points',
                type: 'number'
            },
            width: {
                description: 'Width in mm',
                type: 'number'
            },
            x: {
                description: 'X position in mm',
                type: 'number'
            },
            y: {
                description: 'Y position in mm',
                type: 'number'
            }
        },
        required: ['x', 'y', 'width', 'height'],
        type: 'object'
    },
    handler: async (args) => {
        const {
            x,
            y,
            width,
            height,
            fillColor,
            strokeColor,
            strokeWidth = 1
        } = args;

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

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var page = doc.pages[0];',
            '  var ellipse;',
            '',
            '  try {',
            '    // Create ellipse',
            `    ellipse = page.ovals.add();`,
            `    ellipse.geometricBounds = [${positioning.y}, ${positioning.x}, ${positioning.y + positioning.height}, ${positioning.x + positioning.width}];`,
            '',
            '    // Apply fill color',
            `    if ("${fillColor}" !== "") {`,
            '      try {',
            `        ellipse.fillColor = doc.colors.itemByName("${fillColor}");`,
            '      } catch (colorError) {',
            '        // Use default color if specified color not found',
            '      }',
            '    }',
            '',
            '    // Apply stroke color',
            `    if ("${strokeColor}" !== "") {`,
            '      try {',
            `        ellipse.strokeColor = doc.colors.itemByName("${strokeColor}");`,
            `        ellipse.strokeWeight = ${strokeWidth};`,
            '      } catch (colorError) {',
            '        // Use default stroke if specified color not found',
            '      }',
            '    }',
            '',
            '    "Ellipse created successfully";',
            '  } catch (error) {',
            '    "Error creating ellipse: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);

        // Store the created item info in session
        sessionManager.setLastCreatedItem({
            type: 'ellipse',
            position: positioning,
            fillColor: fillColor,
            strokeColor: strokeColor,
            strokeWidth: strokeWidth
        });

        return formatResponse(result, "Create Ellipse");
    }
});

export const createPolygon = defineTool({
    name: 'create_polygon',
    description: 'Create a polygon on the active page',
    domain: 'graphics',
    profiles: ['classic'],
    cli: { id: 'graphics.create_polygon', aliases: [] },
    contract: mutatingGraphicsContract,
    inputSchema: {
        additionalProperties: false,
        properties: {
            fillColor: {
                description: 'Fill color (RGB hex or swatch name)',
                type: 'string'
            },
            height: {
                description: 'Height in mm',
                type: 'number'
            },
            sides: {
                default: 6,
                description: 'Number of sides',
                type: 'number'
            },
            strokeColor: {
                description: 'Stroke color',
                type: 'string'
            },
            strokeWidth: {
                default: 1,
                description: 'Stroke width in points',
                type: 'number'
            },
            width: {
                description: 'Width in mm',
                type: 'number'
            },
            x: {
                description: 'X position in mm',
                type: 'number'
            },
            y: {
                description: 'Y position in mm',
                type: 'number'
            }
        },
        required: ['x', 'y', 'width', 'height'],
        type: 'object'
    },
    handler: async (args) => {
        const {
            x,
            y,
            width,
            height,
            sides = 6,
            fillColor,
            strokeColor,
            strokeWidth = 1
        } = args;

        // Use session manager for positioning if coordinates not provided
        const positioning = sessionManager.getCalculatedPositioning({ x, y, width, height });

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var page = doc.pages[0];',
            '  var polygon;',
            '',
            '  try {',
            '    // Create polygon',
            `    polygon = page.polygons.add();`,
            `    polygon.geometricBounds = [${positioning.y}, ${positioning.x}, ${positioning.y + positioning.height}, ${positioning.x + positioning.width}];`,
            `    try { polygon.polygonSides = ${sides}; } catch (sideError) {}`,
            '',
            '    // Apply fill color',
            `    if ("${fillColor}" !== "") {`,
            '      try {',
            `        polygon.fillColor = doc.colors.itemByName("${fillColor}");`,
            '      } catch (colorError) {',
            '        // Use default color if specified color not found',
            '      }',
            '    }',
            '',
            '    // Apply stroke color',
            `    if ("${strokeColor}" !== "") {`,
            '      try {',
            `        polygon.strokeColor = doc.colors.itemByName("${strokeColor}");`,
            `        polygon.strokeWeight = ${strokeWidth};`,
            '      } catch (colorError) {',
            '        // Use default stroke if specified color not found',
            '      }',
            '    }',
            '',
            '    "Polygon created successfully";',
            '  } catch (error) {',
            '    "Error creating polygon: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);

        // Store the created item info in session
        sessionManager.setLastCreatedItem({
            type: 'polygon',
            sides: sides,
            position: positioning,
            fillColor: fillColor,
            strokeColor: strokeColor,
            strokeWidth: strokeWidth
        });

        return formatResponse(result, "Create Polygon");
    }
});

export const tools = [createEllipse, createPolygon, createRectangle];

