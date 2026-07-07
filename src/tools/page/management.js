import { runScript, formatResponse } from '../../core/runtime.js';
import { escapeJsxString, escapeFilePathForJsx } from '../../utils/stringUtils.js';
import { defineTool } from '../_contract.js';

const DOMAIN = 'page';
const PROFILE = ['classic'];

function pageContract(overrides = {}) {
    return {
        needsInDesign: true,
        requiresActiveDocument: false,
        mutatesDocument: true,
        writesFilesystem: false,
        producesArtifacts: false,
        destructive: false,
        ...overrides
    };
}

function definePageTool({ name, description, inputSchema, contract, handler }) {
    return defineTool({
        name,
        description,
        domain: DOMAIN,
        profiles: PROFILE,
        cli: { id: `${DOMAIN}.${name}`, aliases: [] },
        contract,
        inputSchema,
        handler
    });
}

export const addPage = definePageTool({
    name: 'add_page',
    description: 'Add a new page to the document',
    contract: pageContract(),
    inputSchema: {
        type: 'object',
        properties: {
            position: { type: 'string', enum: ['AT_END', 'AT_BEGINNING', 'BEFORE', 'AFTER'], default: 'AT_END' },
            referencePage: { type: 'number', description: 'Reference page index (for BEFORE/AFTER positioning)' },
        },
    },
    handler: async (args) => {
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

        const result = await runScript(script);
        return formatResponse(result, 'Add Page');
    }
});

export const deletePage = definePageTool({
    name: 'delete_page',
    description: 'Delete a page from the document',
    contract: pageContract({ destructive: true }),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Index of the page to delete' },
        },
        required: ['pageIndex'],
    },
    handler: async (args) => {
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

        const result = await runScript(script);
        return formatResponse(result, 'Delete Page');
    }
});

export const duplicatePage = definePageTool({
    name: 'duplicate_page',
    description: 'Duplicate a page',
    contract: pageContract(),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index to duplicate' },
            position: { type: 'string', enum: ['AT_END', 'AT_BEGINNING', 'BEFORE', 'AFTER'], default: 'AT_END' },
            referencePageIndex: { type: 'number', description: 'Reference page index (for BEFORE/AFTER positioning)' },
        },
        required: ['pageIndex'],
    },
    handler: async (args) => {
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

        const result = await runScript(script);
        return formatResponse(result, 'Duplicate Page');
    }
});

export const navigateToPage = definePageTool({
    name: 'navigate_to_page',
    description: 'Navigate to a specific page',
    contract: pageContract(),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index to navigate to' },
        },
        required: ['pageIndex'],
    },
    handler: async (args) => {
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

        const result = await runScript(script);
        return formatResponse(result, 'Navigate to Page');
    }
});

export const getPageInfo = definePageTool({
    name: 'get_page_info',
    description: 'Get detailed information about a specific page',
    contract: pageContract({
        requiresActiveDocument: true,
        mutatesDocument: false
    }),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index (0-based)' },
        },
        required: ['pageIndex'],
    },
    handler: async (args) => {
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

        const result = await runScript(script);
        return formatResponse(result, 'Get Page Info');
    }
});

export const movePage = definePageTool({
    name: 'move_page',
    description: 'Move a page to a different position',
    contract: pageContract(),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index to move' },
            newPosition: { type: 'string', enum: ['AT_END', 'AT_BEGINNING', 'BEFORE', 'AFTER'], description: 'LocationOptions value used by the current handler' },
            position: { type: 'string', enum: ['AT_END', 'AT_BEGINNING', 'BEFORE', 'AFTER'], default: 'AT_END' },
            referencePageIndex: { type: 'number', description: 'Reference page index (for BEFORE/AFTER positioning)' },
            binding: { type: 'string', enum: ['DEFAULT_VALUE', 'LEFT_ALIGN', 'RIGHT_ALIGN'], default: 'DEFAULT_VALUE' },
        },
        required: ['pageIndex'],
    },
    handler: async (args) => {
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

        const result = await runScript(script);
        return formatResponse(result, 'Move Page');
    }
});

export const setPageProperties = definePageTool({
    name: 'set_page_properties',
    description: 'Set properties for a page',
    contract: pageContract(),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index' },
            label: { type: 'string', description: 'Page label' },
            pageColor: { type: 'string', description: 'Page color (RGB values as comma-separated string or UI color name)' },
            optionalPage: { type: 'boolean', description: 'Optional page for HTML5 pagination' },
            layoutRule: { type: 'string', enum: ['GUIDE_BASED', 'OBJECT_BASED', 'OFF', 'PRESERVE_EXISTING', 'RECENTER', 'SCALE', 'USE_MASTER'], description: 'Layout rule' },
            snapshotBlendingMode: { type: 'string', enum: ['FULL_SNAPSHOT_BLENDING', 'IGNORE_LAYOUT_SNAPSHOTS', 'LIMITED_SNAPSHOT_BLENDING', 'USE_NEAREST_SNAPSHOT'], description: 'Snapshot blending mode' },
            appliedTrapPreset: { type: 'string', description: 'Trap preset name to apply' },
        },
        required: ['pageIndex'],
    },
    handler: async (args) => {
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

        const result = await runScript(script);
        return formatResponse(result, 'Set Page Properties');
    }
});

export const adjustPageLayout = definePageTool({
    name: 'adjust_page_layout',
    description: 'Adjust page layout with new dimensions and margins',
    contract: pageContract(),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index' },
            width: { type: 'string', description: 'Page width (e.g., "600px", "8.5in")' },
            height: { type: 'string', description: 'Page height (e.g., "800px", "11in")' },
            bleedInside: { type: 'string', description: 'Inside bleed (e.g., "3mm")' },
            bleedTop: { type: 'string', description: 'Top bleed (e.g., "3mm")' },
            bleedOutside: { type: 'string', description: 'Outside bleed (e.g., "3mm")' },
            bleedBottom: { type: 'string', description: 'Bottom bleed (e.g., "3mm")' },
            leftMargin: { type: 'string', description: 'Left margin (e.g., "20mm")' },
            topMargin: { type: 'string', description: 'Top margin (e.g., "20mm")' },
            rightMargin: { type: 'string', description: 'Right margin (e.g., "20mm")' },
            bottomMargin: { type: 'string', description: 'Bottom margin (e.g., "20mm")' },
        },
        required: ['pageIndex'],
    },
    handler: async (args) => {
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

        const result = await runScript(script);
        return formatResponse(result, 'Adjust Page Layout');
    }
});

export const resizePage = definePageTool({
    name: 'resize_page',
    description: 'Resize a page',
    contract: pageContract(),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index' },
            width: { type: 'number', description: 'New width in mm' },
            height: { type: 'number', description: 'New height in mm' },
            resizeMethod: { type: 'string', enum: ['REPLACING_CURRENT_DIMENSIONS_WITH', 'MULTIPLYING_CURRENT_DIMENSIONS_BY', 'ADDING_CURRENT_DIMENSIONS_TO', 'RESHAPING_AREA_TO_RATIO', 'RESHAPING_BORDER_TO_RATIO'], default: 'REPLACING_CURRENT_DIMENSIONS_WITH' },
            anchorPoint: { type: 'string', enum: ['TOP_LEFT_ANCHOR', 'TOP_CENTER_ANCHOR', 'TOP_RIGHT_ANCHOR', 'LEFT_CENTER_ANCHOR', 'CENTER_ANCHOR', 'RIGHT_CENTER_ANCHOR', 'BOTTOM_LEFT_ANCHOR', 'BOTTOM_CENTER_ANCHOR', 'BOTTOM_RIGHT_ANCHOR'], default: 'CENTER_ANCHOR' },
            coordinateSpace: { type: 'string', enum: ['PAGE_COORDINATES', 'SPREAD_COORDINATES', 'PASTEBOARD_COORDINATES'], default: 'PAGE_COORDINATES' },
        },
        required: ['pageIndex'],
    },
    handler: async (args) => {
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
            `      try {`,
            `        page.resize(CoordinateSpaces.${coordinateSpace}, AnchorPoint.${anchorPoint}, ResizeMethods.${resizeMethod}, [${width}, ${height}]);`,
            `      } catch (resizeError) {`,
            `        page.reframe(CoordinateSpaces.${coordinateSpace}, [[0, 0], [${width}, ${height}]]);`,
            `      }`,
            '      "Page resized successfully";',
            '    } catch (error) {',
            '      "Error resizing page: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Resize Page');
    }
});

export const placeFileOnPage = definePageTool({
    name: 'place_file_on_page',
    description: 'Place a file on a page',
    contract: pageContract({ requiresActiveDocument: true }),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index' },
            filePath: { type: 'string', description: 'Path to file to place' },
            x: { type: 'number', description: 'X position in mm', default: 10 },
            y: { type: 'number', description: 'Y position in mm', default: 10 },
            layerName: { type: 'string', description: 'Layer name to place on' },
            showingOptions: { type: 'boolean', description: 'Show import options dialog', default: false },
            autoflowing: { type: 'boolean', description: 'Autoflow placed text', default: false },
        },
        required: ['pageIndex', 'filePath'],
    },
    handler: async (args) => {
        const { pageIndex, filePath, x = 10, y = 10, layerName } = args;

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
            '      var previousLayer = doc.activeLayer;',
            ...(escapedLayerName ? [
                `      var layer = doc.layers.itemByName("${escapedLayerName}");`,
                '      if (layer && layer.isValid) doc.activeLayer = layer;'
            ] : []),
            `      var placedItem = page.place(file, [${x}, ${y}]);`,
            '      try { doc.activeLayer = previousLayer; } catch (restoreLayerError) {}',
            '      "File placed successfully on page";',
            '    } catch (error) {',
            '      try { if (previousLayer && previousLayer.isValid) doc.activeLayer = previousLayer; } catch (restoreLayerError) {}',
            '      "Error placing file: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Place File on Page');
    }
});

export const placeXmlOnPage = definePageTool({
    name: 'place_xml_on_page',
    description: 'Place XML content on a page',
    contract: pageContract({ requiresActiveDocument: true }),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index' },
            xmlElementName: { type: 'string', description: 'XML element name to place' },
            x: { type: 'number', description: 'X position in mm', default: 10 },
            y: { type: 'number', description: 'Y position in mm', default: 10 },
            autoflowing: { type: 'boolean', description: 'Autoflow placed text', default: false },
        },
        required: ['pageIndex', 'xmlElementName'],
    },
    handler: async (args) => {
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
            `      var placedItem = page.placeXML(xmlElement, [${x}, ${y}], ${autoflowing});`,
            '      "XML content placed successfully on page";',
            '    } catch (error) {',
            '      "Error placing XML content: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Place XML on Page');
    }
});

export const snapshotPageLayout = definePageTool({
    name: 'snapshot_page_layout',
    description: 'Create a snapshot of the current page layout',
    contract: pageContract(),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index' },
        },
        required: ['pageIndex'],
    },
    handler: async (args) => {
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
            '      if (typeof page.createLayoutSnapshot === "function") {',
            '        page.createLayoutSnapshot();',
            '        "Page layout snapshot created successfully";',
            '      } else {',
            '        "Page layout snapshot not available in this InDesign version";',
            '      }',
            '    } catch (error) {',
            '      "Error creating page layout snapshot: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Snapshot Page Layout');
    }
});

export const deletePageLayoutSnapshot = definePageTool({
    name: 'delete_page_layout_snapshot',
    description: 'Delete the layout snapshot for a page',
    contract: pageContract({ destructive: true }),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index' },
        },
        required: ['pageIndex'],
    },
    handler: async (args) => {
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
            '      if (typeof page.deleteLayoutSnapshot === "function") {',
            '        page.deleteLayoutSnapshot();',
            '        "Page layout snapshot deleted successfully";',
            '      } else {',
            '        "Page layout snapshot delete not available in this InDesign version";',
            '      }',
            '    } catch (error) {',
            '      "Error deleting page layout snapshot: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Delete Page Layout Snapshot');
    }
});

export const deleteAllPageLayoutSnapshots = definePageTool({
    name: 'delete_all_page_layout_snapshots',
    description: 'Delete all layout snapshots for a page',
    contract: pageContract({ destructive: true }),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index' },
        },
        required: ['pageIndex'],
    },
    handler: async (args) => {
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
            '      if (typeof page.deleteAllLayoutSnapshots === "function") {',
            '        page.deleteAllLayoutSnapshots();',
            '        "All page layout snapshots deleted successfully";',
            '      } else {',
            '        "All page layout snapshot delete not available in this InDesign version";',
            '      }',
            '    } catch (error) {',
            '      "Error deleting all page layout snapshots: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Delete All Page Layout Snapshots');
    }
});

export const reframePage = definePageTool({
    name: 'reframe_page',
    description: 'Reframe (resize) a page',
    contract: pageContract(),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index' },
            x1: { type: 'number', description: 'Top-left X coordinate in mm' },
            y1: { type: 'number', description: 'Top-left Y coordinate in mm' },
            x2: { type: 'number', description: 'Bottom-right X coordinate in mm' },
            y2: { type: 'number', description: 'Bottom-right Y coordinate in mm' },
            coordinateSpace: { type: 'string', enum: ['PAGE_COORDINATES', 'SPREAD_COORDINATES', 'PASTEBOARD_COORDINATES'], default: 'PAGE_COORDINATES' },
        },
        required: ['pageIndex', 'x1', 'y1', 'x2', 'y2'],
    },
    handler: async (args) => {
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
            `      page.reframe(CoordinateSpaces.${coordinateSpace}, [[${x1}, ${y1}], [${x2}, ${y2}]]);`,
            '      "Page reframed successfully";',
            '    } catch (error) {',
            '      "Error reframing page: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Reframe Page');
    }
});

export const createPageGuides = definePageTool({
    name: 'create_page_guides',
    description: 'Create guides on a page',
    contract: pageContract({ requiresActiveDocument: true }),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index' },
            numberOfRows: { type: 'number', description: 'Number of rows', default: 0 },
            numberOfColumns: { type: 'number', description: 'Number of columns', default: 0 },
            rowGutter: { type: 'number', description: 'Row gutter in mm', default: 5 },
            columnGutter: { type: 'number', description: 'Column gutter in mm', default: 5 },
            guideColor: { type: 'string', description: 'Guide color (RGB values as comma-separated string or UI color name)', default: 'BLUE' },
            fitMargins: { type: 'boolean', description: 'Fit guides to margins', default: true },
            removeExisting: { type: 'boolean', description: 'Remove existing guides', default: false },
            layerName: { type: 'string', description: 'Layer name to create guides on' },
        },
        required: ['pageIndex'],
    },
    handler: async (args) => {
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

        const result = await runScript(script);
        return formatResponse(result, 'Create Page Guides');
    }
});

export const selectPage = definePageTool({
    name: 'select_page',
    description: 'Select a page',
    contract: pageContract(),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index' },
            selectionMode: { type: 'string', enum: ['REPLACE_WITH', 'ADD_TO', 'REMOVE_FROM'], default: 'REPLACE_WITH' },
        },
        required: ['pageIndex'],
    },
    handler: async (args) => {
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

        const result = await runScript(script);
        return formatResponse(result, 'Select Page');
    }
});

export const getPageContentSummary = definePageTool({
    name: 'get_page_content_summary',
    description: 'Get a summary of content on a page',
    contract: pageContract({
        requiresActiveDocument: true,
        mutatesDocument: false
    }),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index' },
        },
        required: ['pageIndex'],
    },
    handler: async (args) => {
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
            '    try { summary += "Graphics: " + page.graphics.length + "\\n"; } catch (graphicsError) { summary += "Graphics: Not available\\n"; }',
            '    summary += "Groups: " + page.groups.length + "\\n";',
            '    summary += "Total Items: " + page.allPageItems.length + "\\n";',
            '    summary;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Get Page Content Summary');
    }
});

export const setPageBackground = definePageTool({
    name: 'set_page_background',
    description: 'Set page background by creating a full-page rectangle with specified color',
    contract: pageContract(),
    inputSchema: {
        type: 'object',
        properties: {
            pageIndex: { type: 'number', description: 'Page index', default: 0 },
            backgroundColor: { type: 'string', description: 'Background color name (must be a color swatch in the document)', default: 'White' },
            opacity: { type: 'number', description: 'Background opacity percentage (0-100)', default: 100 },
        },
        required: [],
    },
    handler: async (args) => {
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
            "      // Send to back to ensure it's behind all content",
            '      backgroundRect.sendToBack();',
            '',
            `      "Page background set successfully with color: ${backgroundColor} and opacity: ${opacity}%";`,
            '    } catch (error) {',
            '      "Error setting page background: " + error.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Set Page Background');
    }
});

export const tools = [
    addPage,
    deletePage,
    duplicatePage,
    navigateToPage,
    getPageInfo,
    movePage,
    setPageProperties,
    adjustPageLayout,
    resizePage,
    placeFileOnPage,
    placeXmlOnPage,
    snapshotPageLayout,
    deletePageLayoutSnapshot,
    deleteAllPageLayoutSnapshots,
    reframePage,
    createPageGuides,
    selectPage,
    getPageContentSummary,
    setPageBackground
];
