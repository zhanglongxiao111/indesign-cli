/**
 * Spread management handlers
 */
import { ScriptExecutor } from '../core/scriptExecutor.js';
import { formatResponse, escapeJsxString, escapeFilePathForJsx } from '../utils/stringUtils.js';

export class SpreadHandlers {
    static async listSpreads() {
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var info = "=== SPREADS ===\\n";',
            '  for (var i=0;i<doc.spreads.length;i++){',
            '    var sp = doc.spreads[i];',
            '    info += "Index: " + i + "\\n";',
            '    info += "Pages: " + sp.pages.length + "\\n";',
            '    info += "AllItems: " + sp.allPageItems.length + "\\n---\\n";',
            '  }',
            '  info;',
            '}'
        ].join('\n');
        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, 'List Spreads');
    }

    static async getSpreadInfo(args) {
        const { spreadIndex } = args;
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${spreadIndex} >= doc.spreads.length) {`,
            '    "Spread index out of range";',
            '  } else {',
            `    var sp = doc.spreads[${spreadIndex}];`,
            '    var info = "=== SPREAD INFO ===\\n";',
            '    info += "Index: " + sp.index + "\\n";',
            '    info += "Pages: " + sp.pages.length + "\\n";',
            '    info += "Allow Shuffle: " + sp.allowPageShuffle + "\\n";',
            '    info += "Show Master Items: " + sp.showMasterItems + "\\n";',
            '    try {',
            '      info += "Hidden: " + (sp.visible === false ? "true" : "false") + "\\n";',
            '    } catch (e) {',
            '      info += "Hidden: Not available\\n";',
            '    }',
            '    info += "All Page Items: " + sp.allPageItems.length + "\\n";',
            '    info;',
            '  }',
            '}'
        ].join('\n');
        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, 'Get Spread Info');
    }

    static async duplicateSpread(args) {
        const { spreadIndex, position = 'AT_END', referenceSpreadIndex } = args;
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${spreadIndex} >= doc.spreads.length) {`,
            '    "Spread index out of range";',
            '  } else {',
            `    var sp = doc.spreads[${spreadIndex}];`,
            '    var dup;',
            `    if ("${position}" === "AT_BEGINNING") {`,
            '      dup = sp.duplicate(LocationOptions.AT_BEGINNING);',
            `    } else if ("${position}" === "BEFORE" && ${referenceSpreadIndex} !== undefined) {`,
            `      dup = sp.duplicate(LocationOptions.BEFORE, doc.spreads[${referenceSpreadIndex}]);`,
            `    } else if ("${position}" === "AFTER" && ${referenceSpreadIndex} !== undefined) {`,
            `      dup = sp.duplicate(LocationOptions.AFTER, doc.spreads[${referenceSpreadIndex}]);`,
            '    } else {',
            '      dup = sp.duplicate();',
            '    }',
            '    "Spread duplicated. New index: " + dup.index;',
            '  }',
            '}'
        ].join('\n');
        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, 'Duplicate Spread');
    }

    static async moveSpread(args) {
        const { spreadIndex, position = 'AT_END', referenceSpreadIndex } = args;
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${spreadIndex} >= doc.spreads.length) {`,
            '    "Spread index out of range";',
            '  } else {',
            `    var sp = doc.spreads[${spreadIndex}];`,
            `    if ("${position}" === "AT_BEGINNING") {`,
            '      sp.move(LocationOptions.AT_BEGINNING);',
            `    } else if ("${position}" === "BEFORE" && ${referenceSpreadIndex} !== undefined) {`,
            `      sp.move(LocationOptions.BEFORE, doc.spreads[${referenceSpreadIndex}]);`,
            `    } else if ("${position}" === "AFTER" && ${referenceSpreadIndex} !== undefined) {`,
            `      sp.move(LocationOptions.AFTER, doc.spreads[${referenceSpreadIndex}]);`,
            '    } else {',
            '      sp.move(LocationOptions.AT_END);',
            '    }',
            '    "Spread moved.";',
            '  }',
            '}'
        ].join('\n');
        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, 'Move Spread');
    }

    static async deleteSpread(args) {
        const { spreadIndex } = args;
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${spreadIndex} >= doc.spreads.length) {`,
            '    "Spread index out of range";',
            '  } else {',
            `    doc.spreads[${spreadIndex}].remove();`,
            '    "Spread deleted";',
            '  }',
            '}'
        ].join('\n');
        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, 'Delete Spread');
    }

    static async setSpreadProperties(args) {
        const { spreadIndex, name, allowPageShuffle, showMasterItems, spreadHidden } = args;
        const escapedName = name ? escapeJsxString(name) : '';
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${spreadIndex} >= doc.spreads.length) {`,
            '    "Spread index out of range";',
            '  } else {',
            `    var sp = doc.spreads[${spreadIndex}];`,
            `    if ("${escapedName}" !== "") try { sp.label = "${escapedName}"; } catch(e) {}`,
            `    if (${allowPageShuffle} !== undefined) sp.allowPageShuffle = ${!!allowPageShuffle};`,
            `    if (${showMasterItems} !== undefined) sp.showMasterItems = ${!!showMasterItems};`,
            `    if (${spreadHidden} !== undefined) try { sp.visible = ${!spreadHidden}; } catch(e) {}`,
            '    "Spread properties updated";',
            '  }',
            '}'
        ].join('\n');
        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, 'Set Spread Properties');
    }

    static async createSpreadGuides(args) {
        const { spreadIndex, numberOfRows = 0, numberOfColumns = 0, rowGutter, columnGutter, guideColor = 'BLUE', fitMargins = true, removeExisting = false, layerName } = args;
        const escapedLayerName = layerName ? escapeJsxString(layerName) : '';
        const normalizedGuideColor = typeof guideColor === 'string' ? guideColor.trim() : 'BLUE';
        const guideColorLiteral = /^\s*\[/.test(normalizedGuideColor)
            ? normalizedGuideColor
            : `UIColors.${/^[A-Z_]+$/.test(normalizedGuideColor.toUpperCase()) ? normalizedGuideColor.toUpperCase() : 'BLUE'}`;
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${spreadIndex} >= doc.spreads.length) {`,
            '    "Spread index out of range";',
            '  } else {',
            `    var sp = doc.spreads[${spreadIndex}];`,
            (escapedLayerName ? `    var layer = doc.layers.itemByName("${escapedLayerName}");
            try { if (layer.isValid) sp = layer; } catch(e) {}
` : ''),
            `    sp.createGuides(${numberOfRows}, ${numberOfColumns}, "${rowGutter || ''}", "${columnGutter || ''}", ${guideColorLiteral}, ${fitMargins}, ${removeExisting});`,
            '    "Spread guides created";',
            '  }',
            '}'
        ].join('\n');
        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, 'Create Spread Guides');
    }

    static async placeFileOnSpread(args) {
        const {
            spreadIndex,
            filePath,
            x = 10,
            y = 10,
            layerName,
            showingOptions = false,
            autoflowing = false,
            pageIndexWithinSpread = 0
        } = args;
        const fileEsc = escapeFilePathForJsx(filePath);
        const layerEsc = layerName ? escapeJsxString(layerName) : '';
        const pageIndexLiteral = Number.isInteger(pageIndexWithinSpread) ? pageIndexWithinSpread : 0;

        const scriptLines = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${spreadIndex} >= doc.spreads.length) {`,
            '    "Spread index out of range";',
            '  } else {',
            `    var sp = doc.spreads[${spreadIndex}];`,
            `    var targetPageIndex = ${pageIndexLiteral};`,
            '    var page = null;',
            '    if (targetPageIndex >= 0 && targetPageIndex < sp.pages.length) {',
            '      page = sp.pages[targetPageIndex];',
            '    } else if (sp.pages.length > 0) {',
            '      page = sp.pages[0];',
            '    }',
            '    if (!page) {',
            '      "Spread contains no pages";',
            '    } else {',
            `      var file = File("${fileEsc}");`,
            '      try {',
            '        var placedItem;',
            '        var layerToUse = null;',
            `        var layerNameEscaped = "${layerEsc}";`,
            '        if (layerNameEscaped !== "") {',
            '          try {',
            '            layerToUse = doc.layers.itemByName(layerNameEscaped);',
            '            if (!layerToUse || !layerToUse.isValid) {',
            '              layerToUse = null;',
            '            }',
            '          } catch (layerError) {',
            '            layerToUse = null;',
            '          }',
            '        }',
            '        var previousLayer = doc.activeLayer;',
            '        if (layerToUse) { doc.activeLayer = layerToUse; }',
            `        placedItem = page.place(file, [${x}, ${y}]);`,
            '        try { doc.activeLayer = previousLayer; } catch (restoreLayerError) {}',
            '        "File placed on spread";',
            '      } catch (e) {',
            '        try { if (previousLayer && previousLayer.isValid) doc.activeLayer = previousLayer; } catch (restoreLayerError) {}',
            '        "Error placing file: " + e.message;',
            '      }',
            '    }',
            '  }',
            '}'
        ];

        const script = scriptLines.join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, 'Place File on Spread');
    }

    static async placeXmlOnSpread(args) {
        const { spreadIndex, xmlElementName, x = 10, y = 10, autoflowing = false, pageIndexWithinSpread = 0 } = args;
        const xmlEsc = escapeJsxString(xmlElementName);
        const pageIndexLiteral = Number.isInteger(pageIndexWithinSpread) ? pageIndexWithinSpread : 0;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${spreadIndex} >= doc.spreads.length) {`,
            '    "Spread index out of range";',
            '  } else {',
            `    var sp = doc.spreads[${spreadIndex}];`,
            `    var targetPageIndex = ${pageIndexLiteral};`,
            '    var page = null;',
            '    if (targetPageIndex >= 0 && targetPageIndex < sp.pages.length) {',
            '      page = sp.pages[targetPageIndex];',
            '    } else if (sp.pages.length > 0) {',
            '      page = sp.pages[0];',
            '    }',
            '    if (!page) {',
            '      "Spread contains no pages";',
            '    } else {',
            `      var elements = doc.xmlElements.itemByName("${xmlEsc}");`,
            '      try {',
            `        page.placeXML(elements, [${x}, ${y}], ${autoflowing});`,
            '        "XML placed on spread";',
            '      } catch (e) {',
            '        "Error placing XML: " + e.message;',
            '      }',
            '    }',
            '  }',
            '}'
        ].join('\n');
        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, 'Place XML on Spread');
    }
    static async selectSpread(args) {
        const { spreadIndex, selectionMode = 'REPLACE_WITH' } = args;
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${spreadIndex} >= doc.spreads.length) {`,
            '    "Spread index out of range";',
            '  } else {',
            `    var sp = doc.spreads[${spreadIndex}];`,
            '    try {',
            `      var mode = SelectionOptions.REPLACE_WITH;`,
            `      if ("${selectionMode}" === "ADD_TO") mode = SelectionOptions.ADD_TO;`,
            `      else if ("${selectionMode}" === "REMOVE_FROM") mode = SelectionOptions.REMOVE_FROM;`,
            `      else if ("${selectionMode}" === "SET_KEY") mode = SelectionOptions.SET_KEY;`,
            '      app.select(sp, mode);',
            '      "Spread selected";',
            '    } catch (e) {',
            '      "Error selecting spread: " + e.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');
        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, 'Select Spread');
    }

    static async getSpreadContentSummary(args) {
        const { spreadIndex } = args;
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${spreadIndex} >= doc.spreads.length) {`,
            '    "Spread index out of range";',
            '  } else {',
            `    var sp = doc.spreads[${spreadIndex}];`,
            '    var info = "=== SPREAD CONTENT SUMMARY ===\\n";',
            '    info += "Text Frames: " + sp.textFrames.length + "\\n";',
            '    info += "Rectangles: " + sp.rectangles.length + "\\n";',
            '    info += "Ovals: " + sp.ovals.length + "\\n";',
            '    info += "Polygons: " + sp.polygons.length + "\\n";',
            '    info += "Groups: " + sp.groups.length + "\\n";',
            '    info += "Guides: " + sp.guides.length + "\\n";',
            '    info += "All Page Items: " + sp.allPageItems.length + "\\n";',
            '    info;',
            '  }',
            '}'
        ].join('\n');
        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, 'Get Spread Content Summary');
    }
}

