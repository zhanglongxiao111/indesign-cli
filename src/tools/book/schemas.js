export const BOOK_PATH = {
    type: 'string',
    description: 'InDesign Book 文件路径，通常为 .indb'
};

export const DOCUMENT_PATH = {
    type: 'string',
    description: '要加入 Book 的 InDesign 文档路径，通常为 .indd'
};

export const OUTPUT_PATH = {
    type: 'string',
    description: '输出文件或输出目录路径'
};

export function objectSchema(properties, required) {
    const schema = {
        type: 'object',
        additionalProperties: false,
        properties
    };
    if (required && required.length > 0) {
        schema.required = required;
    }
    return schema;
}

export function booleanSchema(description, defaultValue) {
    const schema = { type: 'boolean', description };
    if (defaultValue !== undefined) {
        schema.default = defaultValue;
    }
    return schema;
}

export const BOOK_SYNC_PROPERTIES = {
    automaticPagination: booleanSchema('是否启用自动页码'),
    automaticDocumentConversion: booleanSchema('是否启用自动文档转换'),
    insertBlankPage: booleanSchema('是否插入空白页'),
    mergeIdenticalLayers: booleanSchema('是否合并同名图层'),
    synchronizeBulletNumberingList: booleanSchema('是否同步项目符号和编号列表'),
    synchronizeCellStyle: booleanSchema('是否同步单元格样式'),
    synchronizeCharacterStyle: booleanSchema('是否同步字符样式'),
    synchronizeConditionalText: booleanSchema('是否同步条件文本'),
    synchronizeCrossReferenceFormat: booleanSchema('是否同步交叉引用格式'),
    synchronizeMasterPage: booleanSchema('是否同步主页'),
    synchronizeObjectStyle: booleanSchema('是否同步对象样式'),
    synchronizeParagraphStyle: booleanSchema('是否同步段落样式'),
    synchronizeSwatch: booleanSchema('是否同步色板'),
    synchronizeTableOfContentStyle: booleanSchema('是否同步目录样式'),
    synchronizeTableStyle: booleanSchema('是否同步表格样式'),
    synchronizeTextVariable: booleanSchema('是否同步文本变量'),
    synchronizeTrapStyle: booleanSchema('是否同步陷印样式')
};

export const bookPathSchema = objectSchema({ bookPath: BOOK_PATH }, ['bookPath']);
