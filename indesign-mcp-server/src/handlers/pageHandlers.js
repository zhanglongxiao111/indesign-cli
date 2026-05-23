/**
 * Page management handlers
 */
import { ScriptExecutor } from '../core/scriptExecutor.js';
import { formatResponse, escapeJsxString, escapeFilePathForJsx } from '../utils/stringUtils.js';

export class PageHandlers {
    /**
     * Add a new page to the document
     */
    static async addPage(args) {
        const { position = 'AT_END', referencePage } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var newPage;',
            '',
            '  try {',
            `    if ("${position}" === "AT_END") {`,
            '      newPage = doc.pages.add();',
            `    } else if ("${position}" === "AT_BEGINNING") {`,
            '      newPage = doc.pages.add(LocationOptions.AT_BEGINNING);',
            `    } else if ("${position}" === "BEFORE" && ${referencePage} !== undefined) {`,
            `      newPage = doc.pages.add(LocationOptions.BEFORE, doc.pages[${referencePage}]);`,
            `    } else if ("${position}" === "AFTER" && ${referencePage} !== undefined) {`,
            `      newPage = doc.pages.add(LocationOptions.AFTER, doc.pages[${referencePage}]);`,
            '    } else {',
            '      newPage = doc.pages.add();',
            '    }',
            '',
            '    "Page added successfully. Total pages: " + doc.pages.length;',
            '  } catch (error) {',
            '    "Error adding page: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Add Page");
    }

    /**
     * Get detailed information about a specific page
     */
    static async getPageInfo(args) {
        const { pageIndex } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${pageIndex} >= doc.pages.length) {`,
            '    "Page index out of range";',
            '  } else {',
            `    var page = doc.pages[${pageIndex}];`,
            '    var info = "=== PAGE INFO ===\\n";',
            '    info += "Index: " + page.documentOffset + "\\n";',
            '    info += "Name: " + page.name + "\\n";',
            '    info += "Label: " + page.label + "\\n";',
            '    info += "Bounds: " + page.bounds + "\\n";',
            '    info += "Side: " + page.side + "\\n";',
            '    info += "Applied Master: " + (page.appliedMaster ? page.appliedMaster.name : "None") + "\\n";',
            '    info += "Page Color: " + page.pageColor + "\\n";',
            '    info += "Optional Page: " + page.optionalPage + "\\n";',
            '    info += "Layout Rule: " + page.layoutRule + "\\n";',
            '    info;',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Get Page Info");
    }

    /**
     * Navigate to a specific page
     */
    static async navigateToPage(args) {
        const { pageIndex } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${pageIndex} >= doc.pages.length) {`,
            '    "Page index out of range";',
            '  } else {',
            `    doc.pages[${pageIndex}].select();`,
            `    "Navigated to page ${pageIndex}";`,
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Navigate to Page");
    }

    /**
     * Delete a specific page from the document
     */
    static async deletePage(args) {
        const { pageIndex } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${pageIndex} >= doc.pages.length) {`,
            '    "Page index out of range";',
            '  } else {',
            '    try {',
            `      doc.pages[${pageIndex}].remove();`,
            '      "Page deleted successfully. Total pages: " + doc.pages.length;',
            '    } catch (error) {',
            '      "Error deleting page: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Delete Page");
    }

    /**
     * Duplicate a specific page
     */
    static async duplicatePage(args) {
        const { pageIndex } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${pageIndex} >= doc.pages.length) {`,
            '    "Page index out of range";',
            '  } else {',
            '    try {',
            `      var originalPage = doc.pages[${pageIndex}];`,
            '      var newPage = originalPage.duplicate();',
            '      "Page duplicated successfully. Total pages: " + doc.pages.length;',
            '    } catch (error) {',
            '      "Error duplicating page: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Duplicate Page");
    }

    /**
     * Move a page to a different position
     */
    static async movePage(args) {
        const { pageIndex, newPosition } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${pageIndex} >= doc.pages.length) {`,
            '    "Page index out of range";',
            '  } else {',
            '    try {',
            `      var page = doc.pages[${pageIndex}];`,
            `      page.move(LocationOptions.${newPosition});`,
            '      "Page moved successfully";',
            '    } catch (error) {',
            '      "Error moving page: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Move Page");
    }

    /**
     * Get all pages in the document
     */
    static async getAllPages(args) {
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var pages = doc.pages;',
            '  var info = "=== ALL PAGES ===\\n";',
            '  info += "Total pages: " + pages.length + "\\n\\n";',
            '  for (var i = 0; i < pages.length; i++) {',
            '    var page = pages[i];',
            '    info += "Page " + i + ":\\n";',
            '    info += "  Name: " + page.name + "\\n";',
            '    info += "  Label: " + page.label + "\\n";',
            '    info += "  Applied Master: " + (page.appliedMaster ? page.appliedMaster.name : "None") + "\\n";',
            '    info += "\\n";',
            '  }',
            '  info;',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Get All Pages");
    }

    // =================== ADVANCED PAGE PROPERTIES ===================

    /**
     * Set properties for a page
     */
    static async setPageProperties(args) {
        const { pageIndex, label, pageColor, optionalPage, layoutRule, snapshotBlendingMode, appliedTrapPreset } = args;
        const pageColorLiteral = pageColor
            ? (/^\s*\[/.test(String(pageColor))
                ? String(pageColor)
                : `UIColors.${/^[A-Z_]+$/.test(String(pageColor).trim().toUpperCase()) ? String(pageColor).trim().toUpperCase() : 'BLUE'}`)
            : null;

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
            ...(label ? [`      page.label = "${escapeJsxString(label)}";`] : []),
            ...(pageColorLiteral ? [`      page.pageColor = ${pageColorLiteral};`] : []),
            ...(optionalPage !== undefined ? [`      page.optionalPage = ${optionalPage};`] : []),
            ...(layoutRule ? [`      page.layoutRule = LayoutRule.${layoutRule};`] : []),
            ...(snapshotBlendingMode ? [`      page.snapshotBlendingMode = SnapshotBlendingMode.${snapshotBlendingMode};`] : []),
            ...(appliedTrapPreset ? [`      page.appliedTrapPreset = "${escapeJsxString(appliedTrapPreset)}";`] : []),
            '      "Page properties updated successfully";',
            '    } catch (error) {',
            '      "Error updating page properties: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Set Page Properties");
    }

    /**
     * Adjust page layout with new dimensions and margins
     */
    static async adjustPageLayout(args) {
        const { pageIndex, width, height, bleedInside, bleedTop, bleedOutside, bleedBottom, leftMargin, topMargin, rightMargin, bottomMargin } = args;
        const updates = [];
        const safeSet = (name, statement) => (
            `try { ${statement} updatedCount++; } catch (e) { skipped.push("${name}: " + e.message); }`
        );
        if (width) updates.push(safeSet('size', `page.resize(CoordinateSpaces.PAGE_COORDINATES, AnchorPoint.CENTER_ANCHOR, ResizeMethods.REPLACING_CURRENT_DIMENSIONS_WITH, UnitValue("${escapeJsxString(String(width))}"), UnitValue("${escapeJsxString(String(height || width))}"));`));
        if (leftMargin) updates.push(safeSet('leftMargin', `page.marginPreferences.left = UnitValue("${escapeJsxString(String(leftMargin))}");`));
        if (topMargin) updates.push(safeSet('topMargin', `page.marginPreferences.top = UnitValue("${escapeJsxString(String(topMargin))}");`));
        if (rightMargin) updates.push(safeSet('rightMargin', `page.marginPreferences.right = UnitValue("${escapeJsxString(String(rightMargin))}");`));
        if (bottomMargin) updates.push(safeSet('bottomMargin', `page.marginPreferences.bottom = UnitValue("${escapeJsxString(String(bottomMargin))}");`));
        if (bleedInside) updates.push(safeSet('bleedInside', `page.bleedBoxPreferences.inside = UnitValue("${escapeJsxString(String(bleedInside))}");`));
        if (bleedTop) updates.push(safeSet('bleedTop', `page.bleedBoxPreferences.top = UnitValue("${escapeJsxString(String(bleedTop))}");`));
        if (bleedOutside) updates.push(safeSet('bleedOutside', `page.bleedBoxPreferences.outside = UnitValue("${escapeJsxString(String(bleedOutside))}");`));
        if (bleedBottom) updates.push(safeSet('bleedBottom', `page.bleedBoxPreferences.bottom = UnitValue("${escapeJsxString(String(bleedBottom))}");`));

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${pageIndex} >= doc.pages.length) {`,
            '    "Page index out of range";',
            '  } else {',
            `    var page = doc.pages[${pageIndex}];`,
            '    var updatedCount = 0;',
            '    var skipped = [];',
            '    try {',
            ...(updates.length ? updates : ['      // No page layout changes provided']),
            '      "Page layout adjusted successfully. Updated: " + updatedCount + ", skipped: " + skipped.length;',
            '    } catch (error) {',
            '      "Error adjusting page layout: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Adjust Page Layout");
    }

    /**
     * Resize a page
     */
    static async resizePage(args) {
        const { pageIndex, width, height, resizeMethod = 'REPLACING_CURRENT_DIMENSIONS_WITH', anchorPoint = 'CENTER_ANCHOR', coordinateSpace = 'PAGE_COORDINATES' } = args;

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
            `      page.resize(CoordinateSpaces.${coordinateSpace}, AnchorPoint.${anchorPoint}, ResizeMethods.${resizeMethod}, UnitValue("${width}mm"), UnitValue("${height}mm"));`,
            '      "Page resized successfully";',
            '    } catch (error) {',
            '      "Error resizing page: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Resize Page");
    }

    /**
     * Place a file on a page
     */
    static async placeFileOnPage(args) {
        const { pageIndex, filePath, x = 10, y = 10, layerName, showingOptions = false, autoflowing = false } = args;

        const escapedFilePath = escapeFilePathForJsx(filePath);
        const escapedLayerName = layerName ? escapeJsxString(layerName) : '';

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${pageIndex} >= doc.pages.length) {`,
            '    "Page index out of range";',
            '  } else {',
            `    var page = doc.pages[${pageIndex}];`,
            `    var file = File("${escapedFilePath}");`,
            '    try {',
            ...(escapedLayerName ? [`      var layer = doc.layers.itemByName("${escapedLayerName}");`] : []),
            `      var placedItem = page.place(file, [${x}, ${y}], ${showingOptions}, ${autoflowing}${escapedLayerName ? ', layer' : ''});`,
            '      "File placed successfully on page";',
            '    } catch (error) {',
            '      "Error placing file: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Place File on Page");
    }

    /**
     * Place XML content on a page
     */
    static async placeXmlOnPage(args) {
        const { pageIndex, xmlElementName, x = 10, y = 10, autoflowing = false } = args;

        const escapedXmlElementName = escapeJsxString(xmlElementName);

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
            `      var xmlElement = doc.xmlElements.itemByName("${escapedXmlElementName}");`,
            `      var placedItem = page.place(xmlElement, [${x}, ${y}], false, ${autoflowing});`,
            '      "XML content placed successfully on page";',
            '    } catch (error) {',
            '      "Error placing XML content: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Place XML on Page");
    }

    /**
     * Create a snapshot of the current page layout
     */
    static async snapshotPageLayout(args) {
        const { pageIndex } = args;

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
            '      page.createLayoutSnapshot();',
            '      "Page layout snapshot created successfully";',
            '    } catch (error) {',
            '      "Error creating page layout snapshot: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Snapshot Page Layout");
    }

    /**
     * Delete the layout snapshot for a page
     */
    static async deletePageLayoutSnapshot(args) {
        const { pageIndex } = args;

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
            '      page.deleteLayoutSnapshot();',
            '      "Page layout snapshot deleted successfully";',
            '    } catch (error) {',
            '      "Error deleting page layout snapshot: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Delete Page Layout Snapshot");
    }

    /**
     * Delete all layout snapshots for a page
     */
    static async deleteAllPageLayoutSnapshots(args) {
        const { pageIndex } = args;

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
            '      page.deleteAllLayoutSnapshots();',
            '      "All page layout snapshots deleted successfully";',
            '    } catch (error) {',
            '      "Error deleting all page layout snapshots: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Delete All Page Layout Snapshots");
    }

    /**
     * Reframe (resize) a page
     */
    static async reframePage(args) {
        const { pageIndex, x1, y1, x2, y2, coordinateSpace = 'PAGE_COORDINATES' } = args;

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
            `      page.reframe(CoordinateSpaces.${coordinateSpace}, [${x1}, ${y1}, ${x2}, ${y2}]);`,
            '      "Page reframed successfully";',
            '    } catch (error) {',
            '      "Error reframing page: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Reframe Page");
    }

    /**
     * Create guides on a page
     */
    static async createPageGuides(args) {
        const { pageIndex, numberOfRows = 0, numberOfColumns = 0, rowGutter = 5, columnGutter = 5, guideColor = 'BLUE', fitMargins = true, removeExisting = false, layerName } = args;

        const escapedLayerName = layerName ? escapeJsxString(layerName) : '';
        const formatUnit = (value) => {
            const text = String(value);
            return /[a-z%]/i.test(text) ? text : `${text}mm`;
        };
        const rowGutterUnit = escapeJsxString(formatUnit(rowGutter));
        const columnGutterUnit = escapeJsxString(formatUnit(columnGutter));
        const normalizedGuideColor = typeof guideColor === 'string' ? guideColor.trim() : 'BLUE';
        const guideColorLiteral = /^\s*\[/.test(normalizedGuideColor)
            ? normalizedGuideColor
            : `UIColors.${/^[A-Z_]+$/.test(normalizedGuideColor.toUpperCase()) ? normalizedGuideColor.toUpperCase() : 'BLUE'}`;

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
            ...(escapedLayerName ? [`      var layer = doc.layers.itemByName("${escapedLayerName}");`] : []),
            ...(removeExisting ? ['      page.guides.everyItem().remove();'] : []),
            '      var guideTarget = (typeof page.createGuides === "function") ? page : page.parent;',
            `      guideTarget.createGuides(${numberOfRows}, ${numberOfColumns}, "${rowGutterUnit}", "${columnGutterUnit}", ${guideColorLiteral}, ${fitMargins}${escapedLayerName ? ', layer' : ''});`,
            '      "Page guides created successfully";',
            '    } catch (error) {',
            '      "Error creating page guides: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Create Page Guides");
    }

    /**
     * Select a page
     */
    static async selectPage(args) {
        const { pageIndex, selectionMode = 'REPLACE_WITH' } = args;

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
            `      page.select(SelectionOptions.${selectionMode});`,
            '      "Page selected successfully";',
            '    } catch (error) {',
            '      "Error selecting page: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Select Page");
    }

    /**
     * Get a summary of content on a page
     */
    static async getPageContentSummary(args) {
        const { pageIndex } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${pageIndex} >= doc.pages.length) {`,
            '    "Page index out of range";',
            '  } else {',
            `    var page = doc.pages[${pageIndex}];`,
            '    var summary = "=== PAGE CONTENT SUMMARY ===\\n";',
            '    summary += "Page: " + page.name + "\\n";',
            '    summary += "Text Frames: " + page.textFrames.length + "\\n";',
            '    summary += "Rectangles: " + page.rectangles.length + "\\n";',
            '    summary += "Ellipses: " + page.ovals.length + "\\n";',
            '    summary += "Graphics: " + page.graphics.length + "\\n";',
            '    summary += "Groups: " + page.groups.length + "\\n";',
            '    summary += "Total Items: " + page.allPageItems.length + "\\n";',
            '    summary;',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Get Page Content Summary");
    }

    /**
     * Set page background by creating a full-page rectangle
     */
    static async setPageBackground(args) {
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
            '      // Send to back to ensure it\'s behind all content',
            '      backgroundRect.sendToBack();',
            '',
            `      "Page background set successfully with color: ${backgroundColor} and opacity: ${opacity}%";`,
            '    } catch (error) {',
            '      "Error setting page background: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Set Page Background");
    }
} 
