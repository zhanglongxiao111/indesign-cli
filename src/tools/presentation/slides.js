import {
    definePresentationTool,
    escapeFilePathForJsx,
    escapeJsxString,
    formatResponse,
    mutatingPresentationContract,
    runScript
} from './_shared.js';

export async function addCoverPage(args) {
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

        const result = await runScript(scriptLines.join('\n'));
        return formatResponse(result, 'Add Cover Page');
    }

export async function addSectionPage(args) {
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

        const result = await runScript(script);
        return formatResponse(result, 'Add Section Page');
    }

export async function addFullBleedImage(args) {
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

        const result = await runScript(script);
        return formatResponse(result, 'Add Full-Bleed Image');
    }

export async function addImageGrid(args) {
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

        const result = await runScript(script);
        return formatResponse(result, 'Add Image Grid');
    }

export const addCoverPageTool = definePresentationTool({
    name: 'add_cover_page',
    description: '新增带标题、副标题和背景图的封面页',
    contract: mutatingPresentationContract,
    inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            title: { type: 'string', description: '封面标题' },
            subtitle: { type: 'string', description: '封面副标题' },
            bgImagePath: { type: 'string', description: '封面背景图片路径' }
        }
    },
    handler: addCoverPage
});

export const addSectionPageTool = definePresentationTool({
    name: 'add_section_page',
    description: '新增章节分隔页',
    contract: mutatingPresentationContract,
    inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            title: { type: 'string', description: '章节页标题' }
        }
    },
    handler: addSectionPage
});

export const addFullBleedImageTool = definePresentationTool({
    name: 'add_full_bleed_image',
    description: '新增满版图片页，可附图片说明',
    contract: mutatingPresentationContract,
    inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            filePath: { type: 'string', description: '要铺满当前页的图片路径' },
            caption: { type: 'string', description: '可选图片说明' }
        },
        required: ['filePath']
    },
    handler: addFullBleedImage
});

export const addImageGridTool = definePresentationTool({
    name: 'add_image_grid',
    description: '新增图片网格页，按行列置入多张图片',
    contract: mutatingPresentationContract,
    inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            files: {
                type: 'array',
                items: { type: 'string' },
                description: '要置入网格的图片路径列表'
            },
            rows: {
                type: 'integer',
                minimum: 1,
                default: 2,
                description: '网格行数'
            },
            columns: {
                type: 'integer',
                minimum: 1,
                default: 3,
                description: '网格列数'
            },
            gap: {
                type: 'number',
                description: '网格间距，单位与文档标尺一致',
                minimum: 0
            }
        },
        required: ['files']
    },
    handler: addImageGrid
});

export const tools = [
    addCoverPageTool,
    addSectionPageTool,
    addFullBleedImageTool,
    addImageGridTool
];
