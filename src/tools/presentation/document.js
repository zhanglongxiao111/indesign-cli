import {
    definePresentationTool,
    formatResponse,
    mutatingPresentationContract,
    runScript,
    sessionManager
} from './_shared.js';

export async function createPresentationDocument(args) {
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

        const result = await runScript(script);
        // update session
        sessionManager.setPageDimensions({ width: size.width, height: size.height });
        sessionManager.setActiveDocument({ name: 'Presentation', pageCount: pages });
        return formatResponse(result, 'Create Presentation Document');
    }

export const createPresentationDocumentTool = definePresentationTool({
    name: 'create_presentation_document',
    description: '创建演示汇报型 InDesign 文档',
    contract: mutatingPresentationContract,
    inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            preset: {
                type: 'string',
                enum: ['A3_LANDSCAPE', 'A4_LANDSCAPE', 'RATIO_16x9'],
                default: 'A3_LANDSCAPE',
                description: '演示文稿页面尺寸预设'
            },
            width: {
                type: 'number',
                description: '自定义页面宽度，单位 mm',
                minimum: 1
            },
            height: {
                type: 'number',
                description: '自定义页面高度，单位 mm',
                minimum: 1
            },
            pages: {
                type: 'integer',
                minimum: 1,
                default: 1,
                description: '初始页数'
            },
            facingPages: {
                type: 'boolean',
                description: '是否启用对页',
                default: false
            }
        }
    },
    handler: createPresentationDocument
});

export const tools = [createPresentationDocumentTool];
