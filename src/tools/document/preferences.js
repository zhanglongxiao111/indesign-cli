import { runScript, formatResponse, formatErrorResponse, sessionManager, escapeJsxString, escapeFilePathForJsx, defineDocumentTool } from './_shared.js';



export async function getDocumentPreferences(args) {
        const { preferenceType = 'GENERAL' } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var result = "Document Preferences (' + preferenceType + '):\\n\\n";',
            '',
            '  switch ("' + preferenceType + '") {',
            '    case "GENERAL":',
            '      try {',
            '        result += "Page Width: " + doc.documentPreferences.pageWidth + "\\n";',
            '      } catch (e) { result += "Page Width: Not available\\n"; }',
            '      try {',
            '        result += "Page Height: " + doc.documentPreferences.pageHeight + "\\n";',
            '      } catch (e) { result += "Page Height: Not available\\n"; }',
            '      try {',
            '        result += "Facing Pages: " + doc.documentPreferences.facingPages + "\\n";',
            '      } catch (e) { result += "Facing Pages: Not available\\n"; }',
            '      try {',
            '        result += "Page Orientation: " + doc.documentPreferences.pageOrientation + "\\n";',
            '      } catch (e) { result += "Page Orientation: Not available\\n"; }',
            '      try {',
            '        result += "Pages Per Document: " + doc.documentPreferences.pagesPerDocument + "\\n";',
            '      } catch (e) { result += "Pages Per Document: Not available\\n"; }',
            '      try {',
            '        result += "Start Page Number: " + doc.documentPreferences.startPageNumber + "\\n";',
            '      } catch (e) { result += "Start Page Number: Not available\\n"; }',
            '      try {',
            '        result += "Document Bleed Top Offset: " + doc.documentPreferences.documentBleedTopOffset + "\\n";',
            '      } catch (e) { result += "Document Bleed Top Offset: Not available\\n"; }',
            '      try {',
            '        result += "Document Bleed Bottom Offset: " + doc.documentPreferences.documentBleedBottomOffset + "\\n";',
            '      } catch (e) { result += "Document Bleed Bottom Offset: Not available\\n"; }',
            '      try {',
            '        result += "Document Bleed Inside Or Left Offset: " + doc.documentPreferences.documentBleedInsideOrLeftOffset + "\\n";',
            '      } catch (e) { result += "Document Bleed Inside Or Left Offset: Not available\\n"; }',
            '      try {',
            '        result += "Document Bleed Outside Or Right Offset: " + doc.documentPreferences.documentBleedOutsideOrRightOffset + "\\n";',
            '      } catch (e) { result += "Document Bleed Outside Or Right Offset: Not available\\n"; }',
            '      try {',
            '        result += "Document Slug Top Offset: " + doc.documentPreferences.documentSlugTopOffset + "\\n";',
            '      } catch (e) { result += "Document Slug Top Offset: Not available\\n"; }',
            '      try {',
            '        result += "Document Slug Bottom Offset: " + doc.documentPreferences.documentSlugBottomOffset + "\\n";',
            '      } catch (e) { result += "Document Slug Bottom Offset: Not available\\n"; }',
            '      try {',
            '        result += "Document Slug Inside Or Left Offset: " + doc.documentPreferences.documentSlugInsideOrLeftOffset + "\\n";',
            '      } catch (e) { result += "Document Slug Inside Or Left Offset: Not available\\n"; }',
            '      try {',
            '        result += "Document Slug Outside Or Right Offset: " + doc.documentPreferences.documentSlugOutsideOrRightOffset + "\\n";',
            '      } catch (e) { result += "Document Slug Outside Or Right Offset: Not available\\n"; }',
            '      break;',
            '    case "GRID":',
            '      try {',
            '        result += "Document Grid Color: " + doc.gridPreferences.documentGridColor + "\\n";',
            '      } catch (e) { result += "Document Grid Color: Not available\\n"; }',
            '      try {',
            '        result += "Document Grid Increment: " + doc.gridPreferences.documentGridIncrement + "\\n";',
            '      } catch (e) { result += "Document Grid Increment: Not available\\n"; }',
            '      try {',
            '        result += "Document Grid Subdivision: " + doc.gridPreferences.documentGridSubdivision + "\\n";',
            '      } catch (e) { result += "Document Grid Subdivision: Not available\\n"; }',
            '      try {',
            '        result += "Grid View Threshold: " + doc.gridPreferences.gridViewThreshold + "\\n";',
            '      } catch (e) { result += "Grid View Threshold: Not available\\n"; }',
            '      try {',
            '        result += "Baseline Grid Color: " + doc.gridPreferences.baselineGridColor + "\\n";',
            '      } catch (e) { result += "Baseline Grid Color: Not available\\n"; }',
            '      try {',
            '        result += "Baseline Grid Increment: " + doc.gridPreferences.baselineGridIncrement + "\\n";',
            '      } catch (e) { result += "Baseline Grid Increment: Not available\\n"; }',
            '      try {',
            '        result += "Baseline Grid Offset: " + doc.gridPreferences.baselineGridOffset + "\\n";',
            '      } catch (e) { result += "Baseline Grid Offset: Not available\\n"; }',
            '      try {',
            '        result += "Baseline Grid View Threshold: " + doc.gridPreferences.baselineGridViewThreshold + "\\n";',
            '      } catch (e) { result += "Baseline Grid View Threshold: Not available\\n"; }',
            '      try {',
            '        result += "Grid Alignment: " + doc.gridPreferences.gridAlignment + "\\n";',
            '      } catch (e) { result += "Grid Alignment: Not available\\n"; }',
            '      break;',
            '    case "GUIDES":',
            '      try {',
            '        result += "Guides Locked: " + doc.guidePreferences.guidesLocked + "\\n";',
            '      } catch (e) { result += "Guides Locked: Not available\\n"; }',
            '      try {',
            '        result += "Guides In Back: " + doc.guidePreferences.guidesInBack + "\\n";',
            '      } catch (e) { result += "Guides In Back: Not available\\n"; }',
            '      try {',
            '        result += "Guides Snap To Zone: " + doc.guidePreferences.guidesSnapToZone + "\\n";',
            '      } catch (e) { result += "Guides Snap To Zone: Not available\\n"; }',
            '      try {',
            '        result += "Guides View Threshold: " + doc.guidePreferences.guidesViewThreshold + "\\n";',
            '      } catch (e) { result += "Guides View Threshold: Not available\\n"; }',
            '      break;',
            '    case "TEXT":',
            '      try {',
            '        result += "Typographers Quotes: " + doc.textPreferences.typographersQuotes + "\\n";',
            '      } catch (e) { result += "Typographers Quotes: Not available\\n"; }',
            '      try {',
            '        result += "Use Typographers Quotes: " + doc.textPreferences.useTypographersQuotes + "\\n";',
            '      } catch (e) { result += "Use Typographers Quotes: Not available\\n"; }',
            '      try {',
            '        result += "Highlight Substituted Fonts: " + doc.textPreferences.highlightSubstitutedFonts + "\\n";',
            '      } catch (e) { result += "Highlight Substituted Fonts: Not available\\n"; }',
            '      try {',
            '        result += "Highlight Substituted Glyphs: " + doc.textPreferences.highlightSubstitutedGlyphs + "\\n";',
            '      } catch (e) { result += "Highlight Substituted Glyphs: Not available\\n"; }',
            '      try {',
            '        result += "Highlight Keeps Violations: " + doc.textPreferences.highlightKeepsViolations + "\\n";',
            '      } catch (e) { result += "Highlight Keeps Violations: Not available\\n"; }',
            '      try {',
            '        result += "Highlight H&J Violations: " + doc.textPreferences.highlightHjViolations + "\\n";',
            '      } catch (e) { result += "Highlight H&J Violations: Not available\\n"; }',
            '      try {',
            '        result += "Highlight Custom Spacing: " + doc.textPreferences.highlightCustomSpacing + "\\n";',
            '      } catch (e) { result += "Highlight Custom Spacing: Not available\\n"; }',
            '      try {',
            '        result += "Highlight Substituted Lines: " + doc.textPreferences.highlightSubstitutedLines + "\\n";',
            '      } catch (e) { result += "Highlight Substituted Lines: Not available\\n"; }',
            '      break;',
            '    case "MARGINS":',
            '      try {',
            '        result += "Margin Top: " + doc.marginPreferences.top + "\\n";',
            '      } catch (e) { result += "Margin Top: Not available\\n"; }',
            '      try {',
            '        result += "Margin Bottom: " + doc.marginPreferences.bottom + "\\n";',
            '      } catch (e) { result += "Margin Bottom: Not available\\n"; }',
            '      try {',
            '        result += "Margin Left: " + doc.marginPreferences.left + "\\n";',
            '      } catch (e) { result += "Margin Left: Not available\\n"; }',
            '      try {',
            '        result += "Margin Right: " + doc.marginPreferences.right + "\\n";',
            '      } catch (e) { result += "Margin Right: Not available\\n"; }',
            '      try {',
            '        result += "Margin Column Count: " + doc.marginPreferences.columnCount + "\\n";',
            '      } catch (e) { result += "Margin Column Count: Not available\\n"; }',
            '      try {',
            '        result += "Margin Column Gutter: " + doc.marginPreferences.columnGutter + "\\n";',
            '      } catch (e) { result += "Margin Column Gutter: Not available\\n"; }',
            '      break;',
            '    default:',
            '      result += "Unknown preference type: " + preferenceType + "\\n";',
            '      result += "Available types: GENERAL, GRID, GUIDES, TEXT, MARGINS\\n";',
            '  }',
            '',
            '  result;',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Get Document Preferences");
    }

export async function setDocumentPreferences(args) {
        const { preferenceType, preferences = {} } = args;

        const updates = [];

        if (preferenceType === 'GENERAL') {
            if (preferences.pageWidth !== undefined) updates.push(`try { doc.documentPreferences.pageWidth = UnitValue("${preferences.pageWidth}mm"); updatedCount++; } catch (e) {}`);
            if (preferences.pageHeight !== undefined) updates.push(`try { doc.documentPreferences.pageHeight = UnitValue("${preferences.pageHeight}mm"); updatedCount++; } catch (e) {}`);
            if (preferences.facingPages !== undefined) updates.push(`try { doc.documentPreferences.facingPages = ${preferences.facingPages}; updatedCount++; } catch (e) {}`);
            if (preferences.pagesPerDocument !== undefined) updates.push(`try { doc.documentPreferences.pagesPerDocument = ${preferences.pagesPerDocument}; updatedCount++; } catch (e) {}`);
            if (preferences.startPageNumber !== undefined) updates.push(`try { doc.documentPreferences.startPageNumber = ${preferences.startPageNumber}; updatedCount++; } catch (e) {}`);
            if (preferences.documentBleedTopOffset !== undefined) updates.push(`try { doc.documentPreferences.documentBleedTopOffset = UnitValue("${preferences.documentBleedTopOffset}mm"); updatedCount++; } catch (e) {}`);
            if (preferences.documentBleedBottomOffset !== undefined) updates.push(`try { doc.documentPreferences.documentBleedBottomOffset = UnitValue("${preferences.documentBleedBottomOffset}mm"); updatedCount++; } catch (e) {}`);
            if (preferences.documentBleedInsideOrLeftOffset !== undefined) updates.push(`try { doc.documentPreferences.documentBleedInsideOrLeftOffset = UnitValue("${preferences.documentBleedInsideOrLeftOffset}mm"); updatedCount++; } catch (e) {}`);
            if (preferences.documentBleedOutsideOrRightOffset !== undefined) updates.push(`try { doc.documentPreferences.documentBleedOutsideOrRightOffset = UnitValue("${preferences.documentBleedOutsideOrRightOffset}mm"); updatedCount++; } catch (e) {}`);
        } else if (preferenceType === 'GRID') {
            if (preferences.documentGridColor !== undefined) updates.push(`try { doc.gridPreferences.documentGridColor = "${escapeJsxString(preferences.documentGridColor)}"; updatedCount++; } catch (e) {}`);
            if (preferences.documentGridIncrement !== undefined) updates.push(`try { doc.gridPreferences.documentGridIncrement = UnitValue("${preferences.documentGridIncrement}mm"); updatedCount++; } catch (e) {}`);
            if (preferences.documentGridSubdivision !== undefined) updates.push(`try { doc.gridPreferences.documentGridSubdivision = ${preferences.documentGridSubdivision}; updatedCount++; } catch (e) {}`);
            if (preferences.gridViewThreshold !== undefined) updates.push(`try { doc.gridPreferences.gridViewThreshold = ${preferences.gridViewThreshold}; updatedCount++; } catch (e) {}`);
            if (preferences.baselineGridColor !== undefined) updates.push(`try { doc.gridPreferences.baselineGridColor = "${escapeJsxString(preferences.baselineGridColor)}"; updatedCount++; } catch (e) {}`);
            if (preferences.baselineGridIncrement !== undefined) updates.push(`try { doc.gridPreferences.baselineGridIncrement = UnitValue("${preferences.baselineGridIncrement}mm"); updatedCount++; } catch (e) {}`);
            if (preferences.baselineGridOffset !== undefined) updates.push(`try { doc.gridPreferences.baselineGridOffset = UnitValue("${preferences.baselineGridOffset}mm"); updatedCount++; } catch (e) {}`);
            if (preferences.baselineGridViewThreshold !== undefined) updates.push(`try { doc.gridPreferences.baselineGridViewThreshold = ${preferences.baselineGridViewThreshold}; updatedCount++; } catch (e) {}`);
            if (preferences.gridAlignment !== undefined) updates.push(`try { doc.gridPreferences.gridAlignment = "${escapeJsxString(preferences.gridAlignment)}"; updatedCount++; } catch (e) {}`);
        } else if (preferenceType === 'GUIDES') {
            if (preferences.guidesLocked !== undefined) updates.push(`try { doc.guidePreferences.guidesLocked = ${preferences.guidesLocked}; updatedCount++; } catch (e) {}`);
            if (preferences.guidesInBack !== undefined) updates.push(`try { doc.guidePreferences.guidesInBack = ${preferences.guidesInBack}; updatedCount++; } catch (e) {}`);
            if (preferences.guidesSnapToZone !== undefined) updates.push(`try { doc.guidePreferences.guidesSnapToZone = ${preferences.guidesSnapToZone}; updatedCount++; } catch (e) {}`);
            if (preferences.guidesViewThreshold !== undefined) updates.push(`try { doc.guidePreferences.guidesViewThreshold = ${preferences.guidesViewThreshold}; updatedCount++; } catch (e) {}`);
        } else if (preferenceType === 'TEXT') {
            if (preferences.typographersQuotes !== undefined) updates.push(`try { doc.textPreferences.typographersQuotes = ${preferences.typographersQuotes}; updatedCount++; } catch (e) {}`);
            if (preferences.useTypographersQuotes !== undefined) updates.push(`try { doc.textPreferences.useTypographersQuotes = ${preferences.useTypographersQuotes}; updatedCount++; } catch (e) {}`);
            if (preferences.highlightSubstitutedFonts !== undefined) updates.push(`try { doc.textPreferences.highlightSubstitutedFonts = ${preferences.highlightSubstitutedFonts}; updatedCount++; } catch (e) {}`);
            if (preferences.highlightSubstitutedGlyphs !== undefined) updates.push(`try { doc.textPreferences.highlightSubstitutedGlyphs = ${preferences.highlightSubstitutedGlyphs}; updatedCount++; } catch (e) {}`);
            if (preferences.highlightKeepsViolations !== undefined) updates.push(`try { doc.textPreferences.highlightKeepsViolations = ${preferences.highlightKeepsViolations}; updatedCount++; } catch (e) {}`);
            if (preferences.highlightHjViolations !== undefined) updates.push(`try { doc.textPreferences.highlightHjViolations = ${preferences.highlightHjViolations}; updatedCount++; } catch (e) {}`);
            if (preferences.highlightCustomSpacing !== undefined) updates.push(`try { doc.textPreferences.highlightCustomSpacing = ${preferences.highlightCustomSpacing}; updatedCount++; } catch (e) {}`);
            if (preferences.highlightSubstitutedLines !== undefined) updates.push(`try { doc.textPreferences.highlightSubstitutedLines = ${preferences.highlightSubstitutedLines}; updatedCount++; } catch (e) {}`);
        } else if (preferenceType === 'MARGINS') {
            if (preferences.marginTop !== undefined) updates.push(`try { doc.marginPreferences.top = UnitValue("${preferences.marginTop}mm"); updatedCount++; } catch (e) {}`);
            if (preferences.marginBottom !== undefined) updates.push(`try { doc.marginPreferences.bottom = UnitValue("${preferences.marginBottom}mm"); updatedCount++; } catch (e) {}`);
            if (preferences.marginLeft !== undefined) updates.push(`try { doc.marginPreferences.left = UnitValue("${preferences.marginLeft}mm"); updatedCount++; } catch (e) {}`);
            if (preferences.marginRight !== undefined) updates.push(`try { doc.marginPreferences.right = UnitValue("${preferences.marginRight}mm"); updatedCount++; } catch (e) {}`);
            if (preferences.columnCount !== undefined) updates.push(`try { doc.marginPreferences.columnCount = ${preferences.columnCount}; updatedCount++; } catch (e) {}`);
            if (preferences.columnGutter !== undefined) updates.push(`try { doc.marginPreferences.columnGutter = UnitValue("${preferences.columnGutter}mm"); updatedCount++; } catch (e) {}`);
        }

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var updatedCount = 0;',
            '  try {',
            ...(updates.length ? updates : ['    // No preferences provided for this type']),
            '    "Document preferences updated successfully. " + updatedCount + " properties updated.";',
            '  } catch (error) {',
            '    "Error updating document preferences: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Set Document Preferences");
    }

export async function getDocumentGridSettings() {
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var result = "Document Grid Settings:\\n\\n";',
            '',
            '  result += "=== GRID PREFERENCES ===\\n";',
            '  try {',
            '    result += "Document Grid Color: " + doc.gridPreferences.documentGridColor + "\\n";',
            '  } catch (e) {',
            '    result += "Document Grid Color: Not available\\n";',
            '  }',
            '  try {',
            '    result += "Document Grid Increment: " + doc.gridPreferences.documentGridIncrement + "\\n";',
            '  } catch (e) {',
            '    result += "Document Grid Increment: Not available\\n";',
            '  }',
            '  try {',
            '    result += "Document Grid Subdivision: " + doc.gridPreferences.documentGridSubdivision + "\\n";',
            '  } catch (e) {',
            '    result += "Document Grid Subdivision: Not available\\n";',
            '  }',
            '  try {',
            '    result += "Grid View Threshold: " + doc.gridPreferences.gridViewThreshold + "\\n";',
            '  } catch (e) {',
            '    result += "Grid View Threshold: Not available\\n";',
            '  }',
            '',
            '  result += "\\n=== BASELINE GRID ===\\n";',
            '  try {',
            '    result += "Baseline Grid Color: " + doc.gridPreferences.baselineGridColor + "\\n";',
            '  } catch (e) {',
            '    result += "Baseline Grid Color: Not available\\n";',
            '  }',
            '  try {',
            '    result += "Baseline Grid Increment: " + doc.gridPreferences.baselineGridIncrement + "\\n";',
            '  } catch (e) {',
            '    result += "Baseline Grid Increment: Not available\\n";',
            '  }',
            '  try {',
            '    result += "Baseline Grid Offset: " + doc.gridPreferences.baselineGridOffset + "\\n";',
            '  } catch (e) {',
            '    result += "Baseline Grid Offset: Not available\\n";',
            '  }',
            '  try {',
            '    result += "Baseline Grid View Threshold: " + doc.gridPreferences.baselineGridViewThreshold + "\\n";',
            '  } catch (e) {',
            '    result += "Baseline Grid View Threshold: Not available\\n";',
            '  }',
            '',
            '  result += "\\n=== GRID ALIGNMENT ===\\n";',
            '  try {',
            '    result += "Grid Alignment: " + doc.gridPreferences.gridAlignment + "\\n";',
            '  } catch (e) {',
            '    result += "Grid Alignment: Not available\\n";',
            '  }',
            '',
            '  result;',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Get Document Grid Settings");
    }

export async function setDocumentGridSettings(args) {
        const {
            documentGridColor = null,
            documentGridIncrement = null,
            documentGridSubdivision = null,
            baselineGridColor = null,
            baselineGridIncrement = null,
            baselineGridOffset = null,
            baselineGridViewThreshold = null,
            gridViewThreshold = null,
            gridAlignment = null
        } = args;

        const lines = [];
        const safeSet = (name, statement) => (
            `try { ${statement} updatedCount++; } catch (e) { skipped.push("${name}: " + e.message); }`
        );
        if (documentGridColor !== null) lines.push(safeSet('documentGridColor', `doc.gridPreferences.documentGridColor = "${escapeJsxString(documentGridColor)}";`));
        if (documentGridIncrement !== null) lines.push(safeSet('documentGridIncrement', `doc.gridPreferences.documentGridIncrement = UnitValue("${documentGridIncrement}mm");`));
        if (documentGridSubdivision !== null) lines.push(safeSet('documentGridSubdivision', `doc.gridPreferences.documentGridSubdivision = ${documentGridSubdivision};`));
        if (gridViewThreshold !== null) lines.push(safeSet('gridViewThreshold', `doc.gridPreferences.gridViewThreshold = ${gridViewThreshold};`));

        if (baselineGridColor !== null) lines.push(safeSet('baselineGridColor', `doc.gridPreferences.baselineGridColor = "${escapeJsxString(baselineGridColor)}";`));
        if (baselineGridIncrement !== null) lines.push(safeSet('baselineGridIncrement', `doc.gridPreferences.baselineGridIncrement = UnitValue("${baselineGridIncrement}mm");`));
        if (baselineGridOffset !== null) lines.push(safeSet('baselineGridOffset', `doc.gridPreferences.baselineGridOffset = UnitValue("${baselineGridOffset}mm");`));
        if (baselineGridViewThreshold !== null) lines.push(safeSet('baselineGridViewThreshold', `doc.gridPreferences.baselineGridViewThreshold = ${baselineGridViewThreshold};`));

        if (gridAlignment !== null) lines.push(safeSet('gridAlignment', `doc.gridPreferences.gridAlignment = "${escapeJsxString(gridAlignment)}";`));

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var updatedCount = 0;',
            '  var skipped = [];',
            '  try {',
            ...(lines.length ? lines : ['    // No grid settings provided']),
            '    "Document grid settings updated successfully. Updated: " + updatedCount + ", skipped: " + skipped.length;',
            '  } catch (error) {',
            '    "Error updating grid settings: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Set Document Grid Settings");
    }

export async function getDocumentLayoutPreferences() {
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var result = "Document Layout Preferences:\\n\\n";',
            '',
            '  result += "=== ADJUST LAYOUT ===\\n";',
            '  try {',
            '    result += "Adjust Layout Enabled: " + doc.adjustLayoutPreferences.adjustLayout + "\\n";',
            '  } catch (e) {',
            '    result += "Adjust Layout Enabled: Not available\\n";',
            '  }',
            '  try {',
            '    result += "Adjust Layout Margins: " + doc.adjustLayoutPreferences.adjustLayoutMargins + "\\n";',
            '  } catch (e) {',
            '    result += "Adjust Layout Margins: Not available\\n";',
            '  }',
            '  try {',
            '    result += "Adjust Layout Page Breaks: " + doc.adjustLayoutPreferences.adjustLayoutPageBreaks + "\\n";',
            '  } catch (e) {',
            '    result += "Adjust Layout Page Breaks: Not available\\n";',
            '  }',
            '  try {',
            '    result += "Adjust Layout Rules: " + doc.adjustLayoutPreferences.adjustLayoutRules + "\\n";',
            '  } catch (e) {',
            '    result += "Adjust Layout Rules: Not available\\n";',
            '  }',
            '',
            '  result += "\\n=== ALIGN & DISTRIBUTE ===\\n";',
            '  try {',
            '    result += "Align Distribute Bounds: " + doc.alignDistributePreferences.alignDistributeBounds + "\\n";',
            '  } catch (e) {',
            '    result += "Align Distribute Bounds: Not available\\n";',
            '  }',
            '  try {',
            '    result += "Align Distribute Spacing: " + doc.alignDistributePreferences.alignDistributeSpacing + "\\n";',
            '  } catch (e) {',
            '    result += "Align Distribute Spacing: Not available\\n";',
            '  }',
            '',
            '  result += "\\n=== SMART GUIDES ===\\n";',
            '  try {',
            '    result += "Smart Guide Preferences: " + doc.smartGuidePreferences.smartGuidePreferences + "\\n";',
            '  } catch (e) {',
            '    result += "Smart Guide Preferences: Not available\\n";',
            '  }',
            '',
            '  result;',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Get Document Layout Preferences");
    }

export async function setDocumentLayoutPreferences(args) {
        const {
            adjustLayout = null,
            adjustLayoutMargins = null,
            adjustLayoutPageBreaks = null,
            adjustLayoutRules = null,
            alignDistributeBounds = null,
            alignDistributeSpacing = null,
            smartGuidePreferences = null
        } = args;

        const lines = [];
        const safeSet = (name, statement) => (
            `try { ${statement} updatedCount++; } catch (e) { skipped.push("${name}: " + e.message); }`
        );
        if (adjustLayout !== null) lines.push(safeSet('adjustLayout', `doc.adjustLayoutPreferences.adjustLayout = ${adjustLayout};`));
        if (adjustLayoutMargins !== null) lines.push(safeSet('adjustLayoutMargins', `doc.adjustLayoutPreferences.adjustLayoutMargins = ${adjustLayoutMargins};`));
        if (adjustLayoutPageBreaks !== null) lines.push(safeSet('adjustLayoutPageBreaks', `doc.adjustLayoutPreferences.adjustLayoutPageBreaks = ${adjustLayoutPageBreaks};`));
        if (adjustLayoutRules) lines.push(safeSet('adjustLayoutRules', `doc.adjustLayoutPreferences.adjustLayoutRules = "${escapeJsxString(adjustLayoutRules)}";`));

        if (alignDistributeBounds) lines.push(safeSet('alignDistributeBounds', `doc.alignDistributePreferences.alignDistributeBounds = "${escapeJsxString(alignDistributeBounds)}";`));
        if (alignDistributeSpacing) lines.push(safeSet('alignDistributeSpacing', `doc.alignDistributePreferences.alignDistributeSpacing = "${escapeJsxString(alignDistributeSpacing)}";`));

        if (smartGuidePreferences !== null) lines.push(safeSet('smartGuidePreferences', `doc.smartGuidePreferences.smartGuidePreferences = ${smartGuidePreferences};`));

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var updatedCount = 0;',
            '  var skipped = [];',
            '  try {',
            ...(lines.length ? lines : ['    // No layout preference changes provided']),
            '    "Document layout preferences updated successfully. Updated: " + updatedCount + ", skipped: " + skipped.length;',
            '  } catch (error) {',
            '    "Error updating layout preferences: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Set Document Layout Preferences");
    }



export const getDocumentPreferencesTool = defineDocumentTool({
    name: 'get_document_preferences',
    description: 'Get document preferences and settings',
    profiles: ['classic'],
    cliId: 'document.get_document_preferences',
    contract: {
            "needsInDesign": true,
            "requiresActiveDocument": true,
            "mutatesDocument": false,
            "writesFilesystem": false,
            "producesArtifacts": false,
            "destructive": false
        },
    inputSchema: {
        "additionalProperties": false,
        "properties": {
            "preferenceType": {
                "default": "GENERAL",
                "description": "Type of preferences to get",
                "enum": [
                    "GENERAL",
                    "GRID",
                    "GUIDES",
                    "HYPHENATION",
                    "STORY",
                    "TEXT",
                    "VIEW"
                ],
                "type": "string"
            }
        },
        "type": "object"
    },
    handler: getDocumentPreferences
});

export const setDocumentPreferencesTool = defineDocumentTool({
    name: 'set_document_preferences',
    description: 'Set document preferences',
    profiles: ['classic'],
    cliId: 'document.set_document_preferences',
    contract: {
            "needsInDesign": true,
            "requiresActiveDocument": true,
            "mutatesDocument": true,
            "writesFilesystem": false,
            "producesArtifacts": false,
            "destructive": false
        },
    inputSchema: {
        "additionalProperties": false,
        "properties": {
            "preferenceType": {
                "description": "Type of preferences to set",
                "enum": [
                    "GENERAL",
                    "GRID",
                    "GUIDES",
                    "HYPHENATION",
                    "STORY",
                    "TEXT",
                    "VIEW"
                ],
                "type": "string"
            },
            "preferences": {
                "additionalProperties": false,
                "description": "Preference values to set",
                "type": "object"
            }
        },
        "required": [
            "preferenceType",
            "preferences"
        ],
        "type": "object"
    },
    handler: setDocumentPreferences
});

export const getDocumentGridSettingsTool = defineDocumentTool({
    name: 'get_document_grid_settings',
    description: 'Get comprehensive grid settings for the document',
    profiles: ['classic'],
    cliId: 'document.get_document_grid_settings',
    contract: {
            "needsInDesign": true,
            "requiresActiveDocument": true,
            "mutatesDocument": false,
            "writesFilesystem": false,
            "producesArtifacts": false,
            "destructive": false
        },
    inputSchema: {
        "additionalProperties": false,
        "properties": {},
        "type": "object"
    },
    handler: getDocumentGridSettings
});

export const setDocumentGridSettingsTool = defineDocumentTool({
    name: 'set_document_grid_settings',
    description: 'Set comprehensive grid settings for the document',
    profiles: ['classic'],
    cliId: 'document.set_document_grid_settings',
    contract: {
            "needsInDesign": true,
            "requiresActiveDocument": true,
            "mutatesDocument": true,
            "writesFilesystem": false,
            "producesArtifacts": false,
            "destructive": false
        },
    inputSchema: {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "additionalProperties": false,
        "properties": {
            "baselineGrid": {
                "description": "Enable/disable baseline grid",
                "type": "boolean"
            },
            "baselineGridColor": {
                "description": "Baseline grid color",
                "type": "string"
            },
            "baselineGridIncrement": {
                "description": "Baseline grid increment (e.g., \"12pt\")",
                "type": "string"
            },
            "baselineGridOffset": {
                "description": "Baseline grid offset (e.g., \"0pt\")",
                "type": "string"
            },
            "baselineGridViewThreshold": {
                "description": "Baseline grid view threshold",
                "type": "number"
            },
            "documentGrid": {
                "description": "Enable/disable document grid",
                "type": "boolean"
            },
            "documentGridColor": {
                "description": "Document grid color",
                "type": "string"
            },
            "documentGridIncrement": {
                "description": "Document grid increment (e.g., \"12pt\")",
                "type": "string"
            },
            "documentGridSubdivision": {
                "description": "Document grid subdivision",
                "type": "number"
            },
            "gridAlignment": {
                "description": "Grid alignment option",
                "enum": [
                    "ALIGN_TO_GRID",
                    "ALIGN_TO_BASELINE_GRID",
                    "ALIGN_TO_DOCUMENT_GRID"
                ],
                "type": "string"
            },
            "gridViewThreshold": {
                "description": "Grid view threshold",
                "type": "number"
            }
        },
        "type": "object"
    },
    handler: setDocumentGridSettings
});

export const getDocumentLayoutPreferencesTool = defineDocumentTool({
    name: 'get_document_layout_preferences',
    description: 'Get layout preferences and settings for the document',
    profiles: ['classic'],
    cliId: 'document.get_document_layout_preferences',
    contract: {
            "needsInDesign": true,
            "requiresActiveDocument": true,
            "mutatesDocument": false,
            "writesFilesystem": false,
            "producesArtifacts": false,
            "destructive": false
        },
    inputSchema: {
        "additionalProperties": false,
        "properties": {},
        "type": "object"
    },
    handler: getDocumentLayoutPreferences
});

export const setDocumentLayoutPreferencesTool = defineDocumentTool({
    name: 'set_document_layout_preferences',
    description: 'Set layout preferences for the document',
    profiles: ['classic'],
    cliId: 'document.set_document_layout_preferences',
    contract: {
            "needsInDesign": true,
            "requiresActiveDocument": true,
            "mutatesDocument": true,
            "writesFilesystem": false,
            "producesArtifacts": false,
            "destructive": false
        },
    inputSchema: {
        "additionalProperties": false,
        "properties": {
            "adjustLayout": {
                "description": "Enable/disable adjust layout",
                "type": "boolean"
            },
            "adjustLayoutMargins": {
                "description": "Enable/disable adjust layout margins",
                "type": "boolean"
            },
            "adjustLayoutPageBreaks": {
                "description": "Enable/disable adjust layout page breaks",
                "type": "boolean"
            },
            "adjustLayoutRules": {
                "description": "Adjust layout rules",
                "type": "string"
            },
            "alignDistributeBounds": {
                "description": "Align distribute bounds",
                "enum": [
                    "ALIGN_TO_SELECTION",
                    "ALIGN_TO_MARGINS",
                    "ALIGN_TO_PAGE"
                ],
                "type": "string"
            },
            "alignDistributeSpacing": {
                "description": "Align distribute spacing",
                "enum": [
                    "DISTRIBUTE_SPACE_BETWEEN",
                    "DISTRIBUTE_SPACE_AROUND"
                ],
                "type": "string"
            },
            "smartGuidePreferences": {
                "description": "Enable/disable smart guide preferences",
                "type": "boolean"
            }
        },
        "type": "object"
    },
    handler: setDocumentLayoutPreferences
});



export const tools = [getDocumentPreferencesTool, setDocumentPreferencesTool, getDocumentGridSettingsTool, setDocumentGridSettingsTool, getDocumentLayoutPreferencesTool, setDocumentLayoutPreferencesTool];

