import { runScript, formatErrorResponse, formatResponse } from '../../core/runtime.js';
import { sessionManager } from '../../core/sessionManager.js';
import { escapeFilePathForJsx, escapeJsxString } from '../../utils/stringUtils.js';
import { defineTool } from '../_contract.js';
import { inspectingGraphicsContract, mutatingGraphicsContract } from './_shared.js';

export const placeImage = defineTool({
    name: 'place_image',
    description: 'Place an image on the active page with scaling and fitting options',
    domain: 'graphics',
    profiles: ['classic'],
    cli: { id: 'graphics.place_image', aliases: [] },
    contract: mutatingGraphicsContract,
    inputSchema: {
        additionalProperties: false,
        properties: {
            filePath: {
                description: 'Path to the image file',
                type: 'string'
            },
            fitMode: {
                default: 'PROPORTIONALLY',
                description: 'Image fitting mode',
                enum: ['PROPORTIONALLY', 'FILL_FRAME', 'FIT_CONTENT', 'FIT_FRAME'],
                type: 'string'
            },
            height: {
                description: 'Height in mm',
                type: 'number'
            },
            linkImage: {
                default: true,
                description: 'Link the image',
                type: 'boolean'
            },
            scale: {
                default: 100,
                description: 'Scale percentage (1-1000)',
                type: 'number'
            },
            width: {
                description: 'Width in mm',
                type: 'number'
            },
            x: {
                default: 10,
                description: 'X position in mm',
                type: 'number'
            },
            y: {
                default: 10,
                description: 'Y position in mm',
                type: 'number'
            }
        },
        required: ['filePath'],
        type: 'object'
    },
    handler: async (args) => {
        const {
            filePath,
            x,
            y,
            width,
            height,
            linkImage = true,
            createProxy = false,
            applyObjectStyle = '',
            imagePreference = {},
            scale = 100,
            fitMode = 'PROPORTIONALLY'
        } = args;

        // Use session manager for positioning if coordinates not provided
        const positioning = sessionManager.getCalculatedPositioning({ x, y, width, height });
        const escapedFilePath = escapeFilePathForJsx(filePath);
        const escapedObjectStyle = escapeJsxString(applyObjectStyle);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var page = app.activeWindow.activePage || doc.pages[0];',
            '  var imageFile;',
            '  var image;',
            '',
            '  try {',
            `    imageFile = File("${escapedFilePath}");`,
            '    if (!imageFile.exists) {',
            `      "ERROR: Image file not found: ${escapedFilePath}";`,
            '    } else {',
            '      // Place image',
            `      image = page.rectangles.add();`,
            `      image.geometricBounds = [${positioning.y}, ${positioning.x}, ${positioning.y + positioning.height}, ${positioning.x + positioning.width}];`,
            '',
            '      // Place the image in the rectangle',
            '      try {',
            `        image.place(imageFile);`,
            '',
            '        // Note: Linking preferences are set automatically by InDesign',
            '',
            '        // Apply object style if specified',
            `        if ("${escapedObjectStyle}" !== "") {`,
            '          try {',
            `            var objectStyle = doc.objectStyles.itemByName("${escapedObjectStyle}");`,
            '            if (objectStyle.isValid) {',
            '              image.appliedObjectStyle = objectStyle;',
            '            }',
            '          } catch (styleError) {',
            '            // Object style not found, continue without it',
            '          }',
            '        }',
            '',
            '        // Apply image scaling and fitting options',
            '        if (image.graphics.length > 0) {',
            '          var graphic = image.graphics[0];',
            '          if (graphic.constructor.name === "Image") {',
            '            // Apply scaling',
            `            if (${scale} !== 100) {`,
            `              graphic.horizontalScale = ${scale};`,
            `              graphic.verticalScale = ${scale};`,
            '            }',
            '',
            '            // Set image fitting options',
            `            if ("${fitMode}" === "FILL_FRAME") {`,
            '              graphic.fit(FitOptions.FILL_PROPORTIONALLY);',
            `            } else if ("${fitMode}" === "FIT_CONTENT") {`,
            '              graphic.fit(FitOptions.CONTENT_TO_FRAME);',
            `            } else if ("${fitMode}" === "FIT_FRAME") {`,
            '              graphic.fit(FitOptions.FRAME_TO_CONTENT);',
            '            } else {',
            '              graphic.fit(FitOptions.PROPORTIONALLY);',
            '            }',
            '',
            '            // Set alignment',
            '            graphic.horizontalAlignment = HorizontalAlignment.CENTER_ALIGN;',
            '            graphic.verticalAlignment = VerticalAlignment.CENTER_ALIGN;',
            '          }',
            '        }',
            '',
            '        "SUCCESS: Image placed successfully at " + imageFile.fsName;',
            '      } catch (placeError) {',
            '        // Remove the rectangle if image placement failed',
            '        image.remove();',
            `        "ERROR: Failed to place image: " + placeError.message;`,
            '      }',
            '    }',
            '  } catch (error) {',
            '    "ERROR: Error placing image: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);

        // Check if the operation was successful
        const isSuccess = result.includes("SUCCESS:") && !result.includes("ERROR:");

        if (isSuccess) {
            // Store the created item info in session
            sessionManager.setLastCreatedItem({
                type: 'image',
                filePath: filePath,
                position: positioning,
                linkImage: linkImage,
                objectStyle: applyObjectStyle
            });
        }

        return isSuccess ?
            formatResponse(result, "Place Image") :
            formatErrorResponse(result, "Place Image");
    }
});

export const getImageInfo = defineTool({
    name: 'get_image_info',
    description: 'Get detailed information about an image',
    domain: 'graphics',
    profiles: ['classic'],
    cli: { id: 'graphics.get_image_info', aliases: [] },
    contract: inspectingGraphicsContract,
    inputSchema: {
        additionalProperties: false,
        properties: {
            itemIndex: {
                default: 0,
                description: 'Image index',
                type: 'number'
            }
        },
        type: 'object'
    },
    handler: async (args) => {
        const { itemIndex = 0 } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var info = "=== IMAGE INFORMATION ===\\n";',
            '',
            '  try {',
            '    // Find placed graphics in rectangles',
            '    var imageCount = 0;',
            '    var foundInfo = "";',
            '    for (var p = 0; p < doc.pages.length; p++) {',
            '      var page = doc.pages[p];',
            '      for (var i = 0; i < page.rectangles.length; i++) {',
            '        var rect = page.rectangles[i];',
            '        if (rect.graphics.length > 0) {',
            '          for (var j = 0; j < rect.graphics.length; j++) {',
            '            var graphic = rect.graphics[j];',
            `            if (imageCount === ${itemIndex}) {`,
            '              foundInfo += "Image " + imageCount + ":\\n";',
            '              foundInfo += "  Page: " + (p + 1) + "\\n";',
            '              foundInfo += "  Graphic Type: " + graphic.constructor.name + "\\n";',
            '              try { foundInfo += "  File Path: " + graphic.itemLink.filePath + "\\n"; } catch (_) {}',
            '              try { foundInfo += "  File Name: " + graphic.itemLink.name + "\\n"; } catch (_) {}',
            '              try { foundInfo += "  Link Status: " + graphic.itemLink.status + "\\n"; } catch (_) {}',
            '              try { foundInfo += "  Image Type: " + graphic.imageTypeName + "\\n"; } catch (_) {}',
            '              try { foundInfo += "  Actual PPI: " + graphic.actualPpi + "\\n"; } catch (_) {}',
            '              try { foundInfo += "  Effective PPI: " + graphic.effectivePpi + "\\n"; } catch (_) {}',
            '              try { foundInfo += "  Geometric Bounds: " + graphic.geometricBounds + "\\n"; } catch (_) {}',
            '              try { foundInfo += "  Visible Bounds: " + graphic.visibleBounds + "\\n"; } catch (_) {}',
            '            }',
            '            imageCount++;',
            '          }',
            '        }',
            '      }',
            '    }',
            '',
            `    if (imageCount === 0) {`,
            '      "No images found on page";',
            `    } else if (imageCount <= ${itemIndex}) {`,
            `      "Image index ${itemIndex} not found. Total images: " + imageCount;`,
            '    } else {',
            '      info + foundInfo;',
            '    }',
            '  } catch (error) {',
            '    "Error getting image information: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Get Image Info");
    }
});

export const tools = [getImageInfo, placeImage];

