/**
 * Presentation Handlers - Architecture presentation oriented utilities
 */
import { ScriptExecutor } from '../core/scriptExecutor.js';
import { formatResponse } from '../utils/stringUtils.js';
import { escapeJsxString, escapeFilePathForJsx } from '../utils/stringUtils.js';
import { sessionManager } from '../core/sessionManager.js';

export class PresentationHandlers {
    // 1) create_presentation_document: presets or custom size
    static async createPresentationDocument(args) {
        const { preset = 'A3_LANDSCAPE', width, height, pages = 1, facingPages = false } = args || {};

        // default sizes in mm
        const presets = {
            A3_LANDSCAPE: { width: 420, height: 297 },
            A4_LANDSCAPE: { width: 297, height: 210 },
            RATIO_16x9: { width: 320, height: 180 },
        };
        const size = (width && height) ? { width, height } : (presets[preset] || presets.A3_LANDSCAPE);

        const script = [
            'try {',
            '  app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;',
            `  var doc = app.documents.add({documentPreferences: {pageWidth: ${size.width}, pageHeight: ${size.height}, facingPages: ${!!facingPages}, pagesPerDocument: ${pages}}});`,
            '  app.activeWindow.activePage = doc.pages[0];',
            '  "Presentation document created: " + doc.name + ", size=" + doc.documentPreferences.pageWidth + "x" + doc.documentPreferences.pageHeight;',
            '} catch (e) {',
            '  "Error: " + e.message;',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        // update session
        sessionManager.setPageDimensions({ width: size.width, height: size.height });
        sessionManager.setActiveDocument({ name: 'Presentation', pageCount: pages });
        return formatResponse(result, 'Create Presentation Document');
    }

    // 2) add_cover_page: title/subtitle/background image
    static async addCoverPage(args) {
        const { title = '项目汇报', subtitle = '', bgImagePath } = args || {};
        const titleEsc = escapeJsxString(title);
        const subtitleEsc = escapeJsxString(subtitle);
        const bgPathEsc = bgImagePath ? escapeFilePathForJsx(bgImagePath) : null;

        const scriptLines = [
            'try {',
            '  app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;',
            '  if (app.documents.length === 0) { "No document open"; }',
            '  var doc = app.activeDocument;',
            '  var page = doc.layoutWindows[0].activePage;',
            '  var pageWidth = doc.documentPreferences.pageWidth;',
            '  var pageHeight = doc.documentPreferences.pageHeight;',
        ];

        if (bgPathEsc) {
            scriptLines.push(
                `  var bgFile = File("${bgPathEsc}");`,
                '  if (bgFile.exists) {',
                '    var bgRect = page.rectangles.add({geometricBounds:[0,0,pageHeight,pageWidth]});',
                '    bgRect.place(bgFile);',
                '    bgRect.fit(FitOptions.FILL_PROPORTIONALLY);',
                '    bgRect.sendToBack();',
                '  }'
            );
        }

        scriptLines.push(
            '  var titleFrame = page.textFrames.add();',
            '  titleFrame.geometricBounds = [pageHeight*0.35, pageWidth*0.08, pageHeight*0.55, pageWidth*0.92];',
            `  titleFrame.contents = "${titleEsc}";`,
            '  try { titleFrame.texts[0].pointSize = 48; } catch(e) {}',
            '  try { titleFrame.paragraphs[0].justification = Justification.CENTER_ALIGN; } catch(e) {}',
            '  var subFrame = null;'
        );
        if (subtitleEsc) {
            scriptLines.push(
                '  subFrame = page.textFrames.add();',
                '  subFrame.geometricBounds = [pageHeight*0.60, pageWidth*0.2, pageHeight*0.68, pageWidth*0.8];',
                `  subFrame.contents = "${subtitleEsc}";`,
                '  try { subFrame.texts[0].pointSize = 18; } catch(e) {}',
                '  try { subFrame.paragraphs[0].justification = Justification.CENTER_ALIGN; } catch(e) {}'
            );
        }

        scriptLines.push(
            '  "Cover page added";',
            '} catch (e) { "Error: " + e.message; }'
        );

        const result = await ScriptExecutor.executeInDesignScript(scriptLines.join('\n'));
        return formatResponse(result, 'Add Cover Page');
    }

    // 3) add_section_page: section title page
    static async addSectionPage(args) {
        const { title = '章节标题' } = args || {};
        const titleEsc = escapeJsxString(title);

        const script = [
            'try {',
            '  app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;',
            '  if (app.documents.length === 0) { "No document open"; }',
            '  var doc = app.activeDocument;',
            '  var page = doc.layoutWindows[0].activePage;',
            '  var pageWidth = doc.documentPreferences.pageWidth;',
            '  var pageHeight = doc.documentPreferences.pageHeight;',
            '  var tf = page.textFrames.add();',
            '  tf.geometricBounds = [pageHeight*0.40, pageWidth*0.1, pageHeight*0.60, pageWidth*0.9];',
            `  tf.contents = "${titleEsc}";`,
            '  try { tf.texts[0].pointSize = 36; } catch(e) {}',
            '  try { tf.paragraphs[0].justification = Justification.CENTER_ALIGN; } catch(e) {}',
            '  "Section page added";',
            '} catch (e) { "Error: " + e.message; }'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, 'Add Section Page');
    }

    // 4) add_full_bleed_image: one image filling page with optional caption
    static async addFullBleedImage(args) {
        const { filePath, caption } = args || {};
        const fileEsc = escapeFilePathForJsx(filePath || '');
        const captionEsc = caption ? escapeJsxString(caption) : null;

        const script = [
            'try {',
            '  app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;',
            '  if (app.documents.length === 0) { "No document open"; }',
            '  var doc = app.activeDocument;',
            '  var page = doc.layoutWindows[0].activePage;',
            '  var pageWidth = doc.documentPreferences.pageWidth;',
            '  var pageHeight = doc.documentPreferences.pageHeight;',
            `  var f = File("${fileEsc}");`,
            '  if (!f.exists) { "Image not found"; }',
            '  var rect = page.rectangles.add({geometricBounds:[0,0,pageHeight,pageWidth]});',
            '  rect.place(f);',
            '  rect.fit(FitOptions.FILL_PROPORTIONALLY);',
            '  if ("' + (captionEsc || '') + '" !== "") {',
            '    var cap = page.textFrames.add();',
            '    cap.geometricBounds = [pageHeight*0.85, pageWidth*0.05, pageHeight*0.93, pageWidth*0.95];',
            `    cap.contents = "${captionEsc || ''}";`,
            '    try { cap.texts[0].pointSize = 11; } catch(e) {}',
            '    try { cap.paragraphs[0].justification = Justification.LEFT_ALIGN; } catch(e) {}',
            '    cap.fillColor = doc.swatches.itemByName("Paper");',
            '    cap.transparencySettings.blendingSettings.opacity = 85;',
            '  }',
            '  "Full-bleed image added";',
            '} catch (e) { "Error: " + e.message; }'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, 'Add Full-Bleed Image');
    }

    // 5) add_image_grid: grid of images with rows/columns and gaps
    static async addImageGrid(args) {
        const { files = [], rows = 2, columns = 3, gap = 6 } = args || {};
        const filesEsc = files.map(f => '"' + escapeFilePathForJsx(f) + '"').join(',');

        const script = [
            'try {',
            '  app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;',
            '  if (app.documents.length === 0) { "No document open"; }',
            '  var doc = app.activeDocument;',
            '  var page = doc.layoutWindows[0].activePage;',
            '  var W = doc.documentPreferences.pageWidth;',
            '  var H = doc.documentPreferences.pageHeight;',
            `  var files = [${filesEsc}];`,
            `  var rows = ${Math.max(1, rows)};`,
            `  var cols = ${Math.max(1, columns)};`,
            `  var gap = ${Math.max(0, gap)};`,
            '  var innerW = W - gap*(cols+1);',
            '  var innerH = H - gap*(rows+1);',
            '  var cellW = innerW/cols;',
            '  var cellH = innerH/rows;',
            '  var idx = 0;',
            '  for (var r=0; r<rows; r++) {',
            '    for (var c=0; c<cols; c++) {',
            '      if (idx >= files.length) break;',
            '      var x = gap + c*(cellW+gap);',
            '      var y = gap + r*(cellH+gap);',
            '      var rect = page.rectangles.add({geometricBounds:[y,x,y+cellH,x+cellW]});',
            '      var f = File(files[idx]);',
            '      if (f.exists) { rect.place(f); rect.fit(FitOptions.PROPORTIONALLY); rect.fit(FitOptions.CENTER_CONTENT); }',
            '      idx++;',
            '    }',
            '  }',
            '  "Image grid added";',
            '} catch (e) { "Error: " + e.message; }'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, 'Add Image Grid');
    }

    // 6) export_presentation_pdf: screen preset export
    static async exportPresentationPDF(args) {
        const { filePath = 'D:/Indesign-Exports/presentation.pdf', preset = 'High Quality Print' } = args || {};
        const fileEsc = escapeFilePathForJsx(filePath);
        const presetEsc = escapeJsxString(preset);

        const script = [
            'try {',
            '  app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;',
            '  if (app.documents.length === 0) { "No document open"; }',
            '  var doc = app.activeDocument;',
            `  var pdfFile = File("${fileEsc}");`,
            '  var folder = pdfFile.parent; if (folder && !folder.exists) { try { folder.create(); } catch(e) {} }',
            `  doc.exportFile(ExportFormat.PDF_TYPE, pdfFile, false, "${presetEsc}");`,
            `  "Presentation exported: ${fileEsc}";`,
            '} catch (e) { "Error: " + e.message; }'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, 'Export Presentation PDF');
    }
}
