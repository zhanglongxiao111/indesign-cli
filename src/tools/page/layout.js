import { runScript, formatResponse, escapeJsxString, escapeFilePathForJsx, definePageTool, pageContract } from './_shared.js';

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

export const tools = [
    setPageProperties,
    adjustPageLayout,
    resizePage,
    reframePage,
    createPageGuides
];
