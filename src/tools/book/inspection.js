import { bookContract, defineBookTool, escapeFilePathForJsx, formatResponse, runScript } from './_shared.js';
import { bookPathSchema, objectSchema } from './schemas.js';

export async function getBookInfo(args) {
    const { bookPath } = args;

    const escapedBookPath = escapeFilePathForJsx(bookPath);

    const script = [
        `var bookFile = File("${escapedBookPath}");`,
        '',
        'if (!bookFile.exists) {',
        `  "Book file not found: ${escapedBookPath}";`,
        '} else {',
        '  var book = app.open(bookFile);',
        '  var info = "=== BOOK INFORMATION ===\\n";',
        '',
        '  info += "Name: " + book.name + "\\n";',
        '  info += "File Path: " + book.filePath + "\\n";',
        '  info += "Modified: " + book.modified + "\\n";',
        '  info += "Saved: " + book.saved + "\\n";',
        '  info += "Automatic Pagination: " + book.automaticPagination + "\\n";',
        '  info += "Automatic Document Conversion: " + book.automaticDocumentConversion + "\\n";',
        '',
        '  // Book contents',
        '  info += "\\n=== BOOK CONTENTS ===\\n";',
        '  info += "Number of Documents: " + book.bookContents.length + "\\n";',
        '',
        '  for (var i = 0; i < book.bookContents.length; i++) {',
        '    var content = book.bookContents[i];',
        '    var status = "Unknown";',
        '    var pageCount = "Unknown";',
        '    try { status = content.status; } catch (statusError) {}',
        '    try { pageCount = content.pageCount; } catch (pageCountError) { try { pageCount = content.documentPageRange; } catch (_) {} }',
        '    info += "Document " + (i + 1) + ": " + content.name + "\\n";',
        '    info += "  Status: " + status + "\\n";',
        '    info += "  Page Count: " + pageCount + "\\n";',
        '  }',
        '',
        '  book.close();',
        '  info;',
        '}'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'Get Book Info');
}

export async function listBooks() {
    const script = [
        'var books = app.books;',
        'var info = "=== ALL BOOKS ===\\n";',
        'info += "Total books: " + books.length + "\\n\\n";',
        '',
        'for (var i = 0; i < books.length; i++) {',
        '  var book = books[i];',
        '  info += "Book " + i + ":\\n";',
        '  info += "  Name: " + book.name + "\\n";',
        '  info += "  File Path: " + book.filePath + "\\n";',
        '  info += "  Modified: " + book.modified + "\\n";',
        '  info += "  Saved: " + book.saved + "\\n";',
        '  info += "  Document Count: " + book.bookContents.length + "\\n";',
        '  info += "\\n";',
        '}',
        'info;'
    ].join('\n');

    const result = await runScript(script);
    return formatResponse(result, 'List Books');
}

export const getBookInfoTool = defineBookTool({
    name: 'get_book_info',
    description: '读取指定 Book 的文档列表和属性信息',
    contract: bookContract({ requiresActiveDocument: true }),
    inputSchema: bookPathSchema,
    handler: getBookInfo
});

export const listBooksTool = defineBookTool({
    name: 'list_books',
    description: '列出当前 InDesign 打开的 Book',
    contract: bookContract(),
    inputSchema: objectSchema({}),
    handler: listBooks
});

export const tools = [getBookInfoTool, listBooksTool];
