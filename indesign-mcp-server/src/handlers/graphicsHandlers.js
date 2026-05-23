/**
 * Graphics management handlers
 */
import { ScriptExecutor } from '../core/scriptExecutor.js';
import { formatResponse, formatErrorResponse, escapeJsxString, escapeFilePathForJsx } from '../utils/stringUtils.js';
import { sessionManager } from '../core/sessionManager.js';

export class GraphicsHandlers {
    /**
     * Create a rectangle on the active page
     */
    static async createRectangle(args) {
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
            `    if (${cornerRadius} > 0) {`,
            `      rectangle.topLeftCornerOption = CornerOptions.ROUNDED_CORNER;`,
            `      rectangle.topRightCornerOption = CornerOptions.ROUNDED_CORNER;`,
            `      rectangle.bottomLeftCornerOption = CornerOptions.ROUNDED_CORNER;`,
            `      rectangle.bottomRightCornerOption = CornerOptions.ROUNDED_CORNER;`,
            `      rectangle.cornerRadius = ${cornerRadius};`,
            '    }',
            '',
            '    "Rectangle created successfully";',
            '  } catch (error) {',
            '    "Error creating rectangle: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);

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

    /**
     * Create an ellipse on the active page
     */
    static async createEllipse(args) {
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

        const result = await ScriptExecutor.executeInDesignScript(script);

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

    /**
     * Create a polygon on the active page
     */
    static async createPolygon(args) {
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
            `    polygon.polygonSides = ${sides};`,
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

        const result = await ScriptExecutor.executeInDesignScript(script);

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

    /**
     * Place an image on the active page with enhanced options
     */
    static async placeImage(args) {
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
            '              graphic.fit(FittingOptions.FILL_PROPORTIONALLY);',
            `            } else if ("${fitMode}" === "FIT_CONTENT") {`,
            '              graphic.fit(FittingOptions.FIT_CONTENT);',
            `            } else if ("${fitMode}" === "FIT_FRAME") {`,
            '              graphic.fit(FittingOptions.FIT_FRAME);',
            '            } else {',
            '              graphic.fit(FittingOptions.PROPORTIONALLY);',
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

        const result = await ScriptExecutor.executeInDesignScript(script);

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

    /**
     * Create an object style
     */
    static async createObjectStyle(args) {
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return result.includes("created successfully") ?
            formatResponse(result, "Create Object Style") :
            formatErrorResponse(result, "Create Object Style");
    }

    /**
     * List all object styles
     */
    static async listObjectStyles() {
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "List Object Styles");
    }

    /**
     * Apply object style to a page item
     */
    static async applyObjectStyle(args) {
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Apply Object Style");
    }

    /**
     * Get image information
     */
    static async getImageInfo(args) {
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Get Image Info");
    }
} 
