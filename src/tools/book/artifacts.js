import { bookContract, defineBookTool, escapeFilePathForJsx, escapeJsxString, formatResponse, runScript } from './_shared.js';
import { BOOK_PATH, OUTPUT_PATH, booleanSchema, objectSchema } from './schemas.js';

export async function exportBook(args) {
    const { bookPath, format = 'PDF', outputPath } = args;

    const escapedBookPath = escapeFilePathForJsx(bookPath);
    const escapedOutputPath = escapeFilePathForJsx(outputPath);
    const allowedFormats = new Set(['PDF', 'EPUB', 'HTML']);
    const normalizedFormat = typeof format === 'string' ? format.trim().toUpperCase() : 'PDF';
    const safeFormat = allowedFormats.has(normalizedFormat) ? normalizedFormat : 'PDF';
    const escapedFormat = escapeJsxString(safeFormat);

    const script = [
        `var bookFile = File("${escapedBookPath}");`,
        `var outputFile = File("${escapedOutputPath}");`,
        '',
        'if (!bookFile.exists) {',
        `  "Book file not found: ${escapedBookPath}";`,
        '} else {',
        '  var book = app.open(bookFile);',
        '',
        `  if ("${escapedFormat}" === "PDF") {`,
        '    book.exportFile(ExportFormat.PDF_TYPE, outputFile);',
        `  } else if ("${escapedFormat}" === "EPUB") {`,
        '    book.exportFile(ExportFormat.EPUB, outputFile);',
        `  } else if ("${escapedFormat}" === "HTML") {`,
        '    book.exportFile(ExportFormat.HTML, outputFile);',
        '  } else {',
        `    "Unsupported format: ${escapedFormat}";`,
        '  }',
        '',
        '  book.close();',
        '  "Book exported successfully";',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Export Book');
}

export async function packageBook(args) {
    const {
        bookPath,
        outputPath,
        copyingFonts = true,
        copyingLinkedGraphics = true,
        copyingProfiles = true,
        updatingGraphics = true,
        includingHiddenLayers = false,
        ignorePreflightErrors = false,
        creatingReport = true,
        includeIdml = false,
        includePdf = false
    } = args;

    const escapedBookPath = escapeFilePathForJsx(bookPath);
    const escapedOutputPath = escapeFilePathForJsx(outputPath);

    const script = [
        `var bookFile = File("${escapedBookPath}");`,
        `var outputFolder = Folder("${escapedOutputPath}");`,
        '',
        'if (!bookFile.exists) {',
        `  "Book file not found: ${escapedBookPath}";`,
        '} else {',
        '  var book = app.open(bookFile);',
        '',
        `  book.packageForPrint(outputFolder, ${copyingFonts}, ${copyingLinkedGraphics}, ${copyingProfiles}, ${updatingGraphics}, ${includingHiddenLayers}, ${ignorePreflightErrors}, ${creatingReport}, ${includeIdml}, ${includePdf});`,
        '',
        '  book.close();',
        '  "Book packaged successfully";',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Package Book');
}

export async function preflightBook(args) {
    const { bookPath, outputPath, autoOpen = false } = args;

    const escapedBookPath = escapeFilePathForJsx(bookPath);
    const escapedOutputPath = outputPath ? escapeFilePathForJsx(outputPath) : '';

    const script = [
        `var bookFile = File("${escapedBookPath}");`,
        ...(escapedOutputPath ? [`var outputFile = File("${escapedOutputPath}");`] : []),
        '',
        'if (!bookFile.exists) {',
        `  "Book file not found: ${escapedBookPath}";`,
        '} else {',
        '  var book = app.open(bookFile);',
        ...(escapedOutputPath ? [
            '  book.preflight(outputFile, ' + autoOpen + ');'
        ] : [
            '  book.preflight();'
        ]),
        '  book.close();',
        '  "Book preflighted successfully";',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Preflight Book');
}

export async function printBook(args) {
    const { bookPath, printDialog = true, printerPreset = 'DEFAULT_VALUE' } = args;

    const escapedBookPath = escapeFilePathForJsx(bookPath);

    const script = [
        `var bookFile = File("${escapedBookPath}");`,
        '',
        'if (!bookFile.exists) {',
        `  "Book file not found: ${escapedBookPath}";`,
        '} else {',
        '  var book = app.open(bookFile);',
        `  book.print(${printDialog}, PrinterPresetTypes.${printerPreset});`,
        '  book.close();',
        '  "Book print job sent successfully";',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Print Book');
}

export const exportBookTool = defineBookTool({
    name: 'export_book',
    description: '把整个 Book 导出为 PDF、EPUB 或 HTML',
    contract: bookContract({
        requiresActiveDocument: true,
        writesFilesystem: true,
        producesArtifacts: true
    }),
    inputSchema: objectSchema({
        bookPath: BOOK_PATH,
        outputPath: OUTPUT_PATH,
        format: {
            type: 'string',
            enum: ['PDF', 'EPUB', 'HTML'],
            default: 'PDF',
            description: '导出格式'
        }
    }, ['bookPath', 'outputPath']),
    handler: exportBook
});

export const packageBookTool = defineBookTool({
    name: 'package_book',
    description: '打包 Book 及其字体、链接图像和报告',
    contract: bookContract({
        requiresActiveDocument: true,
        writesFilesystem: true,
        producesArtifacts: true
    }),
    inputSchema: objectSchema({
        bookPath: BOOK_PATH,
        outputPath: OUTPUT_PATH,
        copyingFonts: booleanSchema('是否复制字体', true),
        copyingLinkedGraphics: booleanSchema('是否复制链接图像', true),
        copyingProfiles: booleanSchema('是否复制色彩配置文件', true),
        updatingGraphics: booleanSchema('是否更新图像链接', true),
        includingHiddenLayers: booleanSchema('是否包含隐藏图层', false),
        ignorePreflightErrors: booleanSchema('是否忽略预检错误', false),
        creatingReport: booleanSchema('是否创建打包报告', true),
        includeIdml: booleanSchema('是否包含 IDML', false),
        includePdf: booleanSchema('是否包含 PDF', false)
    }, ['bookPath', 'outputPath']),
    handler: packageBook
});

export const preflightBookTool = defineBookTool({
    name: 'preflight_book',
    description: '预检 Book，并可输出预检报告',
    contract: bookContract({
        writesFilesystem: true,
        producesArtifacts: true
    }),
    inputSchema: objectSchema({
        bookPath: BOOK_PATH,
        outputPath: OUTPUT_PATH,
        autoOpen: booleanSchema('生成预检报告后是否自动打开', false)
    }, ['bookPath']),
    handler: preflightBook
});

export const printBookTool = defineBookTool({
    name: 'print_book',
    description: '打印 Book，可使用打印预设或系统对话框',
    contract: bookContract({ mutatesDocument: true }),
    inputSchema: objectSchema({
        bookPath: BOOK_PATH,
        printDialog: booleanSchema('是否显示打印对话框', true),
        printerPreset: {
            type: 'string',
            default: 'DEFAULT_VALUE',
            description: 'InDesign PrinterPresetTypes 枚举名'
        }
    }, ['bookPath']),
    handler: printBook
});

export const tools = [
    exportBookTool,
    packageBookTool,
    preflightBookTool,
    printBookTool
];
