/**
 * Master spread management handlers
 */
import { ScriptExecutor } from '../core/scriptExecutor.js';
import { formatResponse, escapeJsxString } from '../utils/stringUtils.js';

export class MasterSpreadHandlers {
    /**
     * Create a master spread
     */
    static async createMasterSpread(args) {
        const { name, namePrefix, baseName, showMasterItems = true } = args;

        let resolvedNamePrefix = namePrefix;
        let resolvedBaseName = baseName;
        if (name && (!resolvedNamePrefix || !resolvedBaseName)) {
            const match = String(name).match(/^([A-Za-z]+)-(.+)$/);
            if (match) {
                resolvedNamePrefix = resolvedNamePrefix || match[1];
                resolvedBaseName = resolvedBaseName || match[2];
            } else {
                resolvedBaseName = resolvedBaseName || name;
            }
        }

        const escapedNamePrefix = escapeJsxString(resolvedNamePrefix);
        const escapedBaseName = escapeJsxString(resolvedBaseName);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var masterSpread = null;',
            ...(resolvedNamePrefix ? [
                `  for (var i = 0; i < doc.masterSpreads.length; i++) {`,
                `    if (doc.masterSpreads[i].namePrefix === "${escapedNamePrefix}") { masterSpread = doc.masterSpreads[i]; break; }`,
                '  }'
            ] : []),
            '  if (masterSpread === null) {',
            '    masterSpread = doc.masterSpreads.add();',
            ...(resolvedNamePrefix ? [`    masterSpread.namePrefix = "${escapedNamePrefix}";`] : []),
            '  }',
            '',
            `  masterSpread.showMasterItems = ${showMasterItems};`,
            // Apply naming if provided
            ...(resolvedBaseName ? [`  masterSpread.baseName = "${escapedBaseName}";`] : []),
            '',
            '  "Master spread created successfully: " + masterSpread.name;',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Create Master Spread");
    }

    /**
     * List all master spreads
     */
    static async listMasterSpreads(args) {
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var masterSpreads = doc.masterSpreads;',
            '  var result = "=== MASTER SPREADS ===\\n";',
            '',
            '  for (var i = 0; i < masterSpreads.length; i++) {',
            '    var master = masterSpreads[i];',
            '    result += "Index: " + i + "\\n";',
            '    result += "Name: " + master.name + "\\n";',
            '    result += "Name Prefix: " + master.namePrefix + "\\n";',
            '    result += "Base Name: " + master.baseName + "\\n";',
            '    result += "Show Master Items: " + master.showMasterItems + "\\n";',
            '    result += "Pages: " + master.pages.length + "\\n";',
            '    result += "---\\n";',
            '  }',
            '',
            '  result;',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "List Master Spreads");
    }

    /**
     * Delete a master spread
     */
    static async deleteMasterSpread(args) {
        const { masterIndex } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${masterIndex} >= doc.masterSpreads.length) {`,
            '    "Master spread index out of range";',
            '  } else {',
            `    var masterSpread = doc.masterSpreads[${masterIndex}];`,
            '    var name = masterSpread.name;',
            '    masterSpread.remove();',
            '    "Master spread deleted: " + name;',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Delete Master Spread");
    }

    /**
     * Duplicate a master spread
     */
    static async duplicateMasterSpread(args) {
        const { masterIndex, position = 'AT_END', referenceMaster } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${masterIndex} >= doc.masterSpreads.length) {`,
            '    "Master spread index out of range";',
            '  } else {',
            `    var masterSpread = doc.masterSpreads[${masterIndex}];`,
            '    var newMasterSpread;',
            '',
            `    if ("${position}" === "AT_END") {`,
            '      newMasterSpread = masterSpread.duplicate();',
            `    } else if ("${position}" === "AT_BEGINNING") {`,
            '      newMasterSpread = masterSpread.duplicate(LocationOptions.AT_BEGINNING);',
            `    } else if ("${position}" === "BEFORE" && ${referenceMaster} !== undefined) {`,
            `      newMasterSpread = masterSpread.duplicate(LocationOptions.BEFORE, doc.masterSpreads[${referenceMaster}]);`,
            `    } else if ("${position}" === "AFTER" && ${referenceMaster} !== undefined) {`,
            `      newMasterSpread = masterSpread.duplicate(LocationOptions.AFTER, doc.masterSpreads[${referenceMaster}]);`,
            '    } else {',
            '      newMasterSpread = masterSpread.duplicate();',
            '    }',
            '',
            '    "Master spread duplicated successfully. New master index: " + newMasterSpread.index;',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Duplicate Master Spread");
    }

    /**
     * Apply a master spread to pages
     */
    static async applyMasterSpread(args) {
        const { masterName, pageRange } = args;

        const escapedMasterName = escapeJsxString(masterName);
        const escapedPageRange = escapeJsxString(pageRange);

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
            '    var pages = doc.pages;',
            '',
            `    if ("${escapedPageRange}" === "all") {`,
            '      for (var i = 0; i < pages.length; i++) {',
            '        pages[i].appliedMaster = masterSpread;',
            '      }',
            `    } else if ("${escapedPageRange}".indexOf("-") !== -1) {`,
            `      var range = "${escapedPageRange}".split("-");`,
            '      var start = parseInt(range[0]) - 1;',
            '      var end = parseInt(range[1]) - 1;',
            '      for (var i = start; i <= end && i < pages.length; i++) {',
            '        pages[i].appliedMaster = masterSpread;',
            '      }',
            '    } else {',
            `      var pageIndex = parseInt("${escapedPageRange}") - 1;`,
            '      if (pageIndex >= 0 && pageIndex < pages.length) {',
            '        pages[pageIndex].appliedMaster = masterSpread;',
            '      }',
            '    }',
            '',
            '    "Master spread applied successfully";',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Apply Master Spread");
    }

    /**
     * Create a text frame on a master spread
     */
    static async createMasterTextFrame(args) {
        const {
            masterName,
            content,
            x,
            y,
            width,
            height,
            fontSize = 12,
            fontFamily = "Arial",
            fontStyle = "Normal",
            alignment = "LEFT_ALIGN"
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Create Master Text Frame");
    }

    /**
     * Create a rectangle on a master spread
     */
    static async createMasterRectangle(args) {
        const {
            masterName,
            x,
            y,
            width,
            height,
            fillColor = "None",
            strokeColor = "Black",
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Create Master Rectangle");
    }

    /**
     * Create guides on a master spread
     */
    static async createMasterGuides(args) {
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Create Master Guides");
    }

    /**
     * Get master spread information
     */
    static async getMasterSpreadInfo(args) {
        const { masterIndex } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${masterIndex} >= doc.masterSpreads.length) {`,
            '    "Master spread index out of range";',
            '  } else {',
            `    var masterSpread = doc.masterSpreads[${masterIndex}];`,
            '    var info = "=== MASTER SPREAD INFO ===\\n";',
            '',
            '    info += "Name: " + masterSpread.name + "\\n";',
            '    info += "Name Prefix: " + masterSpread.namePrefix + "\\n";',
            '    info += "Base Name: " + masterSpread.baseName + "\\n";',
            '    info += "Show Master Items: " + masterSpread.showMasterItems + "\\n";',
            '    info += "Index: " + masterSpread.index + "\\n";',
            '    info += "ID: " + masterSpread.id + "\\n";',
            '',
            '    // Content counts',
            '    info += "\\n=== CONTENT COUNTS ===\\n";',
            '    info += "Pages: " + masterSpread.pages.length + "\\n";',
            '    info += "Text Frames: " + masterSpread.textFrames.length + "\\n";',
            '    info += "Rectangles: " + masterSpread.rectangles.length + "\\n";',
            '    info += "Ovals: " + masterSpread.ovals.length + "\\n";',
            '    info += "Polygons: " + masterSpread.polygons.length + "\\n";',
            '    info += "Groups: " + masterSpread.groups.length + "\\n";',
            '    info += "Guides: " + masterSpread.guides.length + "\\n";',
            '    info += "All Page Items: " + masterSpread.allPageItems.length + "\\n";',
            '',
            '    info;',
            '  }',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Get Master Spread Info");
    }

    /**
     * Detach master items on a page (override to page)
     */
    static async detachMasterItems(args) {
        const { pageIndex, itemIndex } = args;
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${pageIndex} >= doc.pages.length) {`,
            '    "Page index out of range";',
            '  } else {',
            `    var page = doc.pages[${pageIndex}];`,
            '    var master = page.appliedMaster;',
            '    if (!master || !master.isValid) {',
            '      "No master applied to page";',
            '    } else {',
            '      var count = 0;',
            `      if (${itemIndex} !== undefined) {`,
            `        if (${itemIndex} >= master.allPageItems.length) {`,
            '          "Master item index out of range";',
            '        } else {',
            `          try { master.allPageItems[${itemIndex}].override(page); count=1; } catch (e) { "Error overriding: " + e.message; }`,
            '          "Detached 1 master item";',
            '        }',
            '      } else {',
            '        for (var i=0;i<master.allPageItems.length;i++){',
            '          try { master.allPageItems[i].override(page); count++; } catch(e) {}',
            '        }',
            '        "Detached " + count + " master items";',
            '      }',
            '    }',
            '  }',
            '}'
        ].join('\n');
        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, 'Detach Master Items');
    }

    /**
     * Remove override from a master page item on a page
     * Implementation: deletes the overridden instance so master item shows again
     */
    static async removeMasterOverride(args) {
        const { pageIndex, itemIndex } = args;
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${pageIndex} >= doc.pages.length) {`,
            '    "Page index out of range";',
            '  } else {',
            `    var page = doc.pages[${pageIndex}];`,
            `    if (${itemIndex} >= page.pageItems.length) {`,
            '      "Page item index out of range";',
            '    } else {',
            `      var it = page.pageItems[${itemIndex}];`,
            '      try {',
            '        it.remove();',
            '        "Master override removed (item deleted)";',
            '      } catch (e) {',
            '        "Error removing override: " + e.message;',
            '      }',
            '    }',
            '  }',
            '}'
        ].join('\n');
        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, 'Remove Master Override');
    }
}
