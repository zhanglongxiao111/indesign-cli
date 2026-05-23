/**
 * Book management handlers
 */
import { ScriptExecutor } from '../core/scriptExecutor.js';
import { formatResponse, escapeJsxString, escapeFilePathForJsx } from '../utils/stringUtils.js';

export class BookHandlers {
    /**
     * Create a book
     */
    static async createBook(args) {
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Create Book");
    }

    /**
     * Open a book
     */
    static async openBook(args) {
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Open Book");
    }

    /**
     * Add a document to a book
     */
    static async addDocumentToBook(args) {
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Add Document to Book");
    }

    /**
     * Synchronize a book
     */
    static async synchronizeBook(args) {
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Synchronize Book");
    }

    /**
     * Export a book
     */
    static async exportBook(args) {
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Export Book");
    }

    /**
     * Package a book for print
     */
    static async packageBook(args) {
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Package Book");
    }

    /**
     * Get book information
     */
    static async getBookInfo(args) {
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Get Book Info");
    }

    /**
     * List all books
     */
    static async listBooks(args) {
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "List Books");
    }

    /**
     * Repaginate a book
     */
    static async repaginateBook(args) {
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Repaginate Book");
    }

    /**
     * Update all cross references in a book
     */
    static async updateAllCrossReferences(args) {
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Update All Cross References");
    }

    /**
     * Update all numbers in a book
     */
    static async updateAllNumbers(args) {
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Update All Numbers");
    }

    /**
     * Update chapter and paragraph numbers in a book
     */
    static async updateChapterAndParagraphNumbers(args) {
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Update Chapter and Paragraph Numbers");
    }

    /**
     * Preflight a book
     */
    static async preflightBook(args) {
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Preflight Book");
    }

    /**
     * Print a book
     */
    static async printBook(args) {
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Print Book");
    }

    /**
     * Set book properties
     */
    static async setBookProperties(args) {
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

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Set Book Properties");
    }
} 
