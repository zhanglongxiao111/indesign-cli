import { bookContract, defineBookTool, escapeFilePathForJsx, formatResponse, runScript } from './_shared.js';
import { BOOK_PATH, BOOK_SYNC_PROPERTIES, bookPathSchema, objectSchema } from './schemas.js';

export async function repaginateBook(args) {
    const { bookPath } = args;

    const escapedBookPath = escapeFilePathForJsx(bookPath);

    const script = [
        `var bookFile = File("${escapedBookPath}");`,
        '',
        'if (!bookFile.exists) {',
        `  "Book file not found: ${escapedBookPath}";`,
        '} else {',
        '  var book = app.open(bookFile);',
        '  book.repaginate();',
        '  book.save();',
        '  book.close();',
        '  "Book repaginated successfully";',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Repaginate Book');
}

export async function updateAllCrossReferences(args) {
    const { bookPath } = args;

    const escapedBookPath = escapeFilePathForJsx(bookPath);

    const script = [
        `var bookFile = File("${escapedBookPath}");`,
        '',
        'if (!bookFile.exists) {',
        `  "Book file not found: ${escapedBookPath}";`,
        '} else {',
        '  var book = app.open(bookFile);',
        '  book.updateAllCrossReferences();',
        '  book.save();',
        '  book.close();',
        '  "All cross references updated successfully";',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Update All Cross References');
}

export async function updateAllNumbers(args) {
    const { bookPath } = args;

    const escapedBookPath = escapeFilePathForJsx(bookPath);

    const script = [
        `var bookFile = File("${escapedBookPath}");`,
        '',
        'if (!bookFile.exists) {',
        `  "Book file not found: ${escapedBookPath}";`,
        '} else {',
        '  var book = app.open(bookFile);',
        '  book.updateAllNumbers();',
        '  book.save();',
        '  book.close();',
        '  "All numbers updated successfully";',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Update All Numbers');
}

export async function updateChapterAndParagraphNumbers(args) {
    const { bookPath } = args;

    const escapedBookPath = escapeFilePathForJsx(bookPath);

    const script = [
        `var bookFile = File("${escapedBookPath}");`,
        '',
        'if (!bookFile.exists) {',
        `  "Book file not found: ${escapedBookPath}";`,
        '} else {',
        '  var book = app.open(bookFile);',
        '  book.updateChapterAndParagraphNumbers();',
        '  book.save();',
        '  book.close();',
        '  "Chapter and paragraph numbers updated successfully";',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Update Chapter and Paragraph Numbers');
}

export async function setBookProperties(args) {
    const {
        bookPath,
        automaticPagination,
        automaticDocumentConversion,
        insertBlankPage,
        mergeIdenticalLayers,
        synchronizeBulletNumberingList,
        synchronizeCellStyle,
        synchronizeCharacterStyle,
        synchronizeConditionalText,
        synchronizeCrossReferenceFormat,
        synchronizeMasterPage,
        synchronizeObjectStyle,
        synchronizeParagraphStyle,
        synchronizeSwatch,
        synchronizeTableOfContentStyle,
        synchronizeTableStyle,
        synchronizeTextVariable,
        synchronizeTrapStyle
    } = args;

    const escapedBookPath = escapeFilePathForJsx(bookPath);

    const script = [
        `var bookFile = File("${escapedBookPath}");`,
        '',
        'if (!bookFile.exists) {',
        `  "Book file not found: ${escapedBookPath}";`,
        '} else {',
        '  var book = app.open(bookFile);',
        '  try {',
        ...(automaticPagination !== undefined ? [`    book.automaticPagination = ${automaticPagination};`] : []),
        ...(automaticDocumentConversion !== undefined ? [`    book.automaticDocumentConversion = ${automaticDocumentConversion};`] : []),
        ...(insertBlankPage !== undefined ? [`    book.insertBlankPage = ${insertBlankPage};`] : []),
        ...(mergeIdenticalLayers !== undefined ? [`    book.mergeIdenticalLayers = ${mergeIdenticalLayers};`] : []),
        ...(synchronizeBulletNumberingList !== undefined ? [`    book.synchronizeBulletNumberingList = ${synchronizeBulletNumberingList};`] : []),
        ...(synchronizeCellStyle !== undefined ? [`    book.synchronizeCellStyle = ${synchronizeCellStyle};`] : []),
        ...(synchronizeCharacterStyle !== undefined ? [`    book.synchronizeCharacterStyle = ${synchronizeCharacterStyle};`] : []),
        ...(synchronizeConditionalText !== undefined ? [`    book.synchronizeConditionalText = ${synchronizeConditionalText};`] : []),
        ...(synchronizeCrossReferenceFormat !== undefined ? [`    book.synchronizeCrossReferenceFormat = ${synchronizeCrossReferenceFormat};`] : []),
        ...(synchronizeMasterPage !== undefined ? [`    book.synchronizeMasterPage = ${synchronizeMasterPage};`] : []),
        ...(synchronizeObjectStyle !== undefined ? [`    book.synchronizeObjectStyle = ${synchronizeObjectStyle};`] : []),
        ...(synchronizeParagraphStyle !== undefined ? [`    book.synchronizeParagraphStyle = ${synchronizeParagraphStyle};`] : []),
        ...(synchronizeSwatch !== undefined ? [`    book.synchronizeSwatch = ${synchronizeSwatch};`] : []),
        ...(synchronizeTableOfContentStyle !== undefined ? [`    book.synchronizeTableOfContentStyle = ${synchronizeTableOfContentStyle};`] : []),
        ...(synchronizeTableStyle !== undefined ? [`    book.synchronizeTableStyle = ${synchronizeTableStyle};`] : []),
        ...(synchronizeTextVariable !== undefined ? [`    book.synchronizeTextVariable = ${synchronizeTextVariable};`] : []),
        ...(synchronizeTrapStyle !== undefined ? [`    book.synchronizeTrapStyle = ${synchronizeTrapStyle};`] : []),
        '    book.save();',
        '    "Book properties updated successfully";',
        '  } catch (error) {',
        '    "Error updating book properties: " + error.message;',
        '  }',
        '  book.close();',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Set Book Properties');
}

export const repaginateBookTool = defineBookTool({
    name: 'repaginate_book',
    description: '重新计算 Book 内所有文档页码',
    contract: bookContract({ mutatesDocument: true }),
    inputSchema: bookPathSchema,
    handler: repaginateBook
});

export const updateAllCrossReferencesTool = defineBookTool({
    name: 'update_all_cross_references',
    description: '更新 Book 内全部交叉引用',
    contract: bookContract({ mutatesDocument: true }),
    inputSchema: bookPathSchema,
    handler: updateAllCrossReferences
});

export const updateAllNumbersTool = defineBookTool({
    name: 'update_all_numbers',
    description: '更新 Book 内页码、章节号和段落编号',
    contract: bookContract({ mutatesDocument: true }),
    inputSchema: bookPathSchema,
    handler: updateAllNumbers
});

export const updateChapterAndParagraphNumbersTool = defineBookTool({
    name: 'update_chapter_and_paragraph_numbers',
    description: '更新 Book 的章节号和段落编号',
    contract: bookContract({ mutatesDocument: true }),
    inputSchema: bookPathSchema,
    handler: updateChapterAndParagraphNumbers
});

export const setBookPropertiesTool = defineBookTool({
    name: 'set_book_properties',
    description: '设置 Book 的同步、分页和转换属性',
    contract: bookContract({ mutatesDocument: true }),
    inputSchema: objectSchema({ bookPath: BOOK_PATH, ...BOOK_SYNC_PROPERTIES }, ['bookPath']),
    handler: setBookProperties
});

export const tools = [
    repaginateBookTool,
    updateAllCrossReferencesTool,
    updateAllNumbersTool,
    updateChapterAndParagraphNumbersTool,
    setBookPropertiesTool
];
