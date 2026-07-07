import {
    defineExportTool,
    escapeFilePathForJsx,
    escapeJsxString,
    formatResponse,
    runScript
} from './_shared.js';

export async function exportPDF(args) {
    // Support both schema variants: {filePath, preset} or {filePath, quality, pages, includeBleed, includeMarks}
    const filePath = args.filePath;
    const rawPageRange = args.pages ?? args.pageRange ?? 'all';
    const pageRangeString = typeof rawPageRange === 'string' ? rawPageRange : String(rawPageRange ?? 'all');
    const normalizedPageRange = pageRangeString.trim() === '' ? 'all' : pageRangeString.trim();
    const quality = args.quality || null; // PRESS/PRINT/SCREEN/DIGITAL
    const presetCandidate = args.preset || (quality === 'PRESS' ? 'Press Quality' : quality === 'PRINT' ? 'High Quality Print' : 'Smallest File Size');
    const preset = typeof presetCandidate === 'string' && presetCandidate.trim() !== '' ? presetCandidate : 'High Quality Print';

    const escapedFilePath = escapeFilePathForJsx(filePath);
    const escapedPreset = escapeJsxString(preset);
    const escapedPageRange = escapeJsxString(normalizedPageRange);

    const script = [
        'if (app.documents.length === 0) {',
        '  "No document open";',
        '} else {',
        '  var doc = app.activeDocument;',
        '  var pdfFile = File("' + escapedFilePath + '");',
        '',
        '  try {',
        '    // Ensure target directory exists',
        '    var targetFolder = pdfFile.parent;',
        '    if (targetFolder && !targetFolder.exists) {',
        '      try { targetFolder.create(); } catch (fe) {}',
        '    }',
        '',
        '    // Page range preference (best-effort)',
        `    try { app.pdfExportPreferences.pageRange = "${escapedPageRange}"; } catch(e) {}`,
        '    // Export to PDF with preset',
        '    doc.exportFile(ExportFormat.PDF_TYPE, pdfFile, false, "' + escapedPreset + '");',
        '',
        `    "PDF exported successfully to: ${escapedFilePath}";`,
        '  } catch (error) {',
        '    "Error exporting PDF: " + error.message;',
        '  }',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Export PDF');
}

export async function exportImages(args) {
    // Support alias: outputPath (types) vs folderPath (handler)
    const folderPath = args.folderPath || args.outputPath;
    const format = args.format || 'JPEG';
    const quality = args.quality ?? 80;
    const resolution = args.resolution ?? 300;
    const rawPageRange = args.pageRange ?? args.pages ?? 'all';
    const pageRangeString = typeof rawPageRange === 'string' ? rawPageRange : String(rawPageRange ?? 'all');
    const trimmedRange = pageRangeString.trim();
    const canonicalPageRange = trimmedRange === '' ? 'all' : (trimmedRange.toLowerCase() === 'all' ? 'all' : trimmedRange);

    const escapedFolderPath = escapeFilePathForJsx(folderPath);
    const escapedPageRange = escapeJsxString(canonicalPageRange);
    const normalizedFormat = typeof format === 'string' ? format.trim().toUpperCase() : 'JPEG';
    const supportedFormats = new Set(['JPEG']);
    if (!supportedFormats.has(normalizedFormat)) {
        return formatResponse({
            success: false,
            operation: 'Export Images',
            code: 'ARTIFACT_FORMAT_UNSUPPORTED',
            message: `export_images currently supports JPEG only, not ${normalizedFormat}`,
            data: { requestedFormat: normalizedFormat, supportedFormats: ['JPEG'] }
        }, 'Export Images');
    }
    const escapedFormat = escapeJsxString(normalizedFormat);

    const script = [
        'if (app.documents.length === 0) {',
        '  "No document open";',
        '} else {',
        '  var doc = app.activeDocument;',
        '  var folder = Folder("' + escapedFolderPath + '");',
        '',
        '  try {',
        '    if (!folder.exists) {',
        '      folder.create();',
        '    }',
        '',
        '    var exportedCount = 0;',
        '    var artifacts = [];',
        '    var pagesToExport = [];',
        `    if ("${escapedPageRange}" !== "all") {`,
        `      var parts = "${escapedPageRange}".split(",");`,
        '      for (var i=0; i<parts.length; i++) {',
        '        var seg = parts[i];',
        '        if (seg.indexOf("-") >= 0) {',
        '          var ab = seg.split("-");',
        '          var a = parseInt(ab[0],10), b = parseInt(ab[1],10);',
        '          if (!isNaN(a) && !isNaN(b)) {',
        '            for (var p=a; p<=b; p++) { if (p>=1 && p<=doc.pages.length) pagesToExport.push(p); }',
        '          }',
        '        } else {',
        '          var p = parseInt(seg,10); if (!isNaN(p) && p>=1 && p<=doc.pages.length) pagesToExport.push(p);',
        '        }',
        '      }',
        '    } else {',
        '      for (var i=1; i<=doc.pages.length; i++) pagesToExport.push(i);',
        '    }',
        '',
        '    // Configure JPEG export preferences',
        `    var fmt = "${escapedFormat}";`,
        '    app.jpegExportPreferences.exportResolution = ' + resolution + ';',
        '    try { app.jpegExportPreferences.jpegExportRange = ExportRangeOrAllPages.EXPORT_RANGE; } catch (_) {}',
        '    try { app.jpegExportPreferences.exportingSpread = false; } catch (_) {}',
        '    // Map quality 0-100 to enum',
        '    var q = ' + quality + ';',
        '    var qual = JPEGOptionsQuality.HIGH;',
        '    try {',
        '      if (q >= 95) qual = JPEGOptionsQuality.MAXIMUM; else if (q >= 75) qual = JPEGOptionsQuality.HIGH; else if (q >= 50) qual = JPEGOptionsQuality.MEDIUM; else qual = JPEGOptionsQuality.LOW;',
        '      app.jpegExportPreferences.jpegQuality = qual;',
        '    } catch (_) {}',
        '',
        '    for (var idx=0; idx<pagesToExport.length; idx++) {',
        '      var pageNum = pagesToExport[idx];',
        '      var pageName = String(pageNum);',
        '      try { pageName = doc.pages[pageNum - 1].name; } catch (_) {}',
        '      var fileName = folder.fsName + "/page_" + pageNum + ".jpg";',
        '      var imageFile = File(fileName);',
        '      app.jpegExportPreferences.pageString = pageName;',
        '      doc.exportFile(ExportFormat.JPG, imageFile, false);',
        '      artifacts.push({ path: imageFile.fsName, page: pageNum, kind: "image/jpeg" });',
        '      exportedCount++;',
        '    }',
        '',
        `    JSON.stringify({ success: true, operation: "Export Images", summary: exportedCount + " pages exported as JPEG images to: ${escapedFolderPath}", data: { format: "JPEG", files: artifacts, documentState: { documentsCount: app.documents.length, activeDocumentName: doc.name, activeDocumentPathKnown: !!doc.saved, modified: doc.modified, targetWasExplicit: false, state_uncertain: false } }, artifacts: artifacts });`,
        '  } catch (error) {',
        '    JSON.stringify({ success: false, operation: "Export Images", code: "INDESIGN_SCRIPT_FAILED", message: error.message, result: "Error exporting images: " + error.message });',
        '  }',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Export Images');
}

export async function packageDocument(args) {
    const folderPath = args.folderPath || args.outputPath;
    const { includeFonts = true, includeLinks = true, includeProfiles = true } = args;
    const escapedFolderPath = escapeFilePathForJsx(folderPath);

    const script = [
        'if (app.documents.length === 0) {',
        '  "No document open";',
        '} else {',
        '  var doc = app.activeDocument;',
        '  var folder = Folder("' + escapedFolderPath + '");',
        '  var packageTarget = File("' + escapedFolderPath + '");',
        '',
        '  try {',
        '    if (!folder.exists) {',
        '      folder.create();',
        '    }',
        '',
        '    // Package the document. COM builds may not expose doc.packagePreferences, so pass options directly.',
        '    try {',
        `      doc.packageForPrint(packageTarget, ${includeFonts}, ${includeLinks}, ${includeProfiles}, false, false, true, true, false, false, "", true, "CLI E2E package", true);`,
        '    } catch (packageArgsError) {',
        `      doc.packageForPrint(packageTarget, ${includeFonts}, ${includeLinks}, ${includeProfiles}, false, false, true, true);`,
        '    }',
        '',
        `    "Document packaged successfully to: ${escapedFolderPath}";`,
        '  } catch (error) {',
        '    "Error packaging document: " + error.message;',
        '  }',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Package Document');
}

export async function exportEPUB(args) {
    const { filePath } = args;
    const escapedFilePath = escapeFilePathForJsx(filePath);

    const script = [
        'if (app.documents.length === 0) {',
        '  "No document open";',
        '} else {',
        '  var doc = app.activeDocument;',
        '  var epubFile = File("' + escapedFilePath + '");',
        '  try {',
        '    var folder = epubFile.parent; if (folder && !folder.exists) { try { folder.create(); } catch(e) {} }',
        '    doc.exportFile(ExportFormat.EPUB, epubFile, false);',
        `    "EPUB exported successfully to: ${escapedFilePath}";`,
        '  } catch (error) {',
        '    "Error exporting EPUB: " + error.message;',
        '  }',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Export EPUB');
}

export const exportPdfTool = defineExportTool({
    name: 'export_pdf',
    description: 'Export document to PDF',
    inputSchema: {
        additionalProperties: false,
        properties: {
            filePath: {
                description: 'Output PDF file path',
                type: 'string'
            },
            includeBleed: {
                default: false,
                description: 'Include bleed',
                type: 'boolean'
            },
            includeMarks: {
                default: false,
                description: 'Include printer marks',
                type: 'boolean'
            },
            pages: {
                default: 'all',
                description: 'Page range (e.g., "1-5", "all")',
                type: 'string'
            },
            quality: {
                default: 'PRINT',
                enum: ['PRESS', 'PRINT', 'SCREEN', 'DIGITAL'],
                type: 'string'
            }
        },
        required: ['filePath'],
        type: 'object'
    },
    handler: exportPDF
});

export const exportImagesTool = defineExportTool({
    name: 'export_images',
    description: 'Export pages as images',
    inputSchema: {
        additionalProperties: false,
        properties: {
            format: {
                default: 'JPEG',
                enum: ['JPEG'],
                type: 'string'
            },
            outputPath: {
                description: 'Output directory path',
                type: 'string'
            },
            pages: {
                default: 'all',
                description: 'Page range (e.g., "1-5", "all")',
                type: 'string'
            },
            quality: {
                default: 80,
                description: 'Quality (1-100 for JPEG)',
                type: 'number'
            },
            resolution: {
                default: 300,
                description: 'Resolution in DPI',
                type: 'number'
            }
        },
        required: ['outputPath'],
        type: 'object'
    },
    handler: exportImages
});

export const exportEpubTool = defineExportTool({
    name: 'export_epub',
    description: 'Export document to EPUB',
    inputSchema: {
        additionalProperties: false,
        properties: {
            filePath: {
                description: 'Output EPUB file path',
                type: 'string'
            },
            includeImages: {
                default: true,
                description: 'Include images',
                type: 'boolean'
            },
            includeStyles: {
                default: true,
                description: 'Include styles',
                type: 'boolean'
            }
        },
        required: ['filePath'],
        type: 'object'
    },
    handler: exportEPUB
});

export const packageDocumentTool = defineExportTool({
    name: 'package_document',
    description: 'Package document for printing',
    inputSchema: {
        additionalProperties: false,
        properties: {
            includeFonts: {
                default: true,
                description: 'Include fonts',
                type: 'boolean'
            },
            includeLinks: {
                default: true,
                description: 'Include linked files',
                type: 'boolean'
            },
            includeProfiles: {
                default: true,
                description: 'Include color profiles',
                type: 'boolean'
            },
            outputPath: {
                description: 'Output directory path',
                type: 'string'
            }
        },
        required: ['outputPath'],
        type: 'object'
    },
    handler: packageDocument
});

export const tools = [
    exportEpubTool,
    exportImagesTool,
    exportPdfTool,
    packageDocumentTool
];
