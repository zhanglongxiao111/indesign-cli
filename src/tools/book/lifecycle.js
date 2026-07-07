import { bookContract, defineBookTool, escapeFilePathForJsx, formatResponse, runScript } from './_shared.js';
import { BOOK_PATH, DOCUMENT_PATH, bookPathSchema, objectSchema } from './schemas.js';

export async function createBook(args) {
    const { filePath } = args;

    const escapedFilePath = escapeFilePathForJsx(filePath);

    const script = [
        `var bookFile = File("${escapedFilePath}");`,
        'var bookFolder = bookFile.parent;',
        'if (!bookFolder.exists) {',
        '  bookFolder.create();',
        '}',
        'var book = app.books.add(bookFile);',
        'try { book.save(bookFile); } catch (saveError) { try { book.save(); } catch (_) {} }',
        'book.close();',
        `"Book created successfully: ${escapedFilePath}";`
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Create Book');
}

export async function openBook(args) {
    const { filePath } = args;

    const escapedFilePath = escapeFilePathForJsx(filePath);

    const script = [
        `var bookFile = File("${escapedFilePath}");`,
        'if (!bookFile.exists) {',
        `  "Book file not found: ${escapedFilePath}";`,
        '} else {',
        '  var book = app.open(bookFile);',
        '  "Book opened successfully: " + book.name;',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Open Book');
}

export async function addDocumentToBook(args) {
    const { bookPath, documentPath } = args;

    const escapedBookPath = escapeFilePathForJsx(bookPath);
    const escapedDocumentPath = escapeFilePathForJsx(documentPath);

    const script = [
        `var bookFile = File("${escapedBookPath}");`,
        `var docFile = File("${escapedDocumentPath}");`,
        '',
        'if (!bookFile.exists) {',
        `  "Book file not found: ${escapedBookPath}";`,
        '} else if (!docFile.exists) {',
        `  "Document file not found: ${escapedDocumentPath}";`,
        '} else {',
        '  var book = app.open(bookFile);',
        '  var bookContent = book.bookContents.add(docFile);',
        '  book.save();',
        '  book.close();',
        '  "Document added to book successfully";',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Add Document to Book');
}

export async function synchronizeBook(args) {
    const { bookPath } = args;

    const escapedBookPath = escapeFilePathForJsx(bookPath);

    const script = [
        `var bookFile = File("${escapedBookPath}");`,
        '',
        'if (!bookFile.exists) {',
        `  "Book file not found: ${escapedBookPath}";`,
        '} else {',
        '  var book = app.open(bookFile);',
        '  book.synchronize();',
        '  book.save();',
        '  book.close();',
        '  "Book synchronized successfully";',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Synchronize Book');
}

export const createBookTool = defineBookTool({
    name: 'create_book',
    description: '新建 InDesign Book（.indb）文件',
    contract: bookContract({
        requiresActiveDocument: true,
        writesFilesystem: true,
        producesArtifacts: true
    }),
    inputSchema: objectSchema({ filePath: BOOK_PATH }, ['filePath']),
    handler: createBook
});

export const openBookTool = defineBookTool({
    name: 'open_book',
    description: '打开已有 InDesign Book 文件',
    contract: bookContract({ mutatesDocument: true }),
    inputSchema: objectSchema({ filePath: BOOK_PATH }, ['filePath']),
    handler: openBook
});

export const addDocumentToBookTool = defineBookTool({
    name: 'add_document_to_book',
    description: '把 InDesign 文档加入指定 Book',
    contract: bookContract({ mutatesDocument: true }),
    inputSchema: objectSchema({
        bookPath: BOOK_PATH,
        documentPath: DOCUMENT_PATH
    }, ['bookPath', 'documentPath']),
    handler: addDocumentToBook
});

export const synchronizeBookTool = defineBookTool({
    name: 'synchronize_book',
    description: '同步 Book 内文档的样式、母版和编号设置',
    contract: bookContract({ mutatesDocument: true }),
    inputSchema: bookPathSchema,
    handler: synchronizeBook
});

export const tools = [
    createBookTool,
    openBookTool,
    addDocumentToBookTool,
    synchronizeBookTool
];
