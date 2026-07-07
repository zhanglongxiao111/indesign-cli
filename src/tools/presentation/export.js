import {
    definePresentationTool,
    escapeFilePathForJsx,
    escapeJsxString,
    exportPresentationContract,
    formatResponse,
    runScript
} from './_shared.js';

export async function exportPresentationPDF(args) {
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

        const result = await runScript(script);
        return formatResponse(result, 'Export Presentation PDF');
    }

export const exportPresentationPDFTool = definePresentationTool({
    name: 'export_presentation_pdf',
    description: '把当前演示文档导出为 PDF',
    contract: exportPresentationContract,
    inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            filePath: { type: 'string', description: 'PDF 输出路径' },
            preset: {
                type: 'string',
                default: 'High Quality Print',
                description: 'InDesign PDF 导出预设名称'
            }
        },
        required: ['filePath']
    },
    handler: exportPresentationPDF
});

export const tools = [exportPresentationPDFTool];
