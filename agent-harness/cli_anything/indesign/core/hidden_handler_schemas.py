from __future__ import annotations

from typing import Any


def _object_schema(properties: dict[str, dict[str, Any]], required: list[str] | None = None) -> dict[str, Any]:
    schema: dict[str, Any] = {
        "type": "object",
        "additionalProperties": False,
        "properties": properties,
    }
    if required:
        schema["required"] = required
    return schema


def _string(description: str) -> dict[str, Any]:
    return {"type": "string", "description": description}


def _number(description: str, *, minimum: int | float | None = None) -> dict[str, Any]:
    schema: dict[str, Any] = {"type": "number", "description": description}
    if minimum is not None:
        schema["minimum"] = minimum
    return schema


def _boolean(description: str, default: bool | None = None) -> dict[str, Any]:
    schema: dict[str, Any] = {"type": "boolean", "description": description}
    if default is not None:
        schema["default"] = default
    return schema


BOOK_PATH = _string("InDesign Book 文件路径，通常为 .indb")
DOCUMENT_PATH = _string("要加入 Book 的 InDesign 文档路径，通常为 .indd")
OUTPUT_PATH = _string("输出文件或输出目录路径")

BOOK_SYNC_PROPERTIES = {
    "automaticPagination": _boolean("是否启用自动页码"),
    "automaticDocumentConversion": _boolean("是否启用自动文档转换"),
    "insertBlankPage": _boolean("是否插入空白页"),
    "mergeIdenticalLayers": _boolean("是否合并同名图层"),
    "synchronizeBulletNumberingList": _boolean("是否同步项目符号和编号列表"),
    "synchronizeCellStyle": _boolean("是否同步单元格样式"),
    "synchronizeCharacterStyle": _boolean("是否同步字符样式"),
    "synchronizeConditionalText": _boolean("是否同步条件文本"),
    "synchronizeCrossReferenceFormat": _boolean("是否同步交叉引用格式"),
    "synchronizeMasterPage": _boolean("是否同步主页"),
    "synchronizeObjectStyle": _boolean("是否同步对象样式"),
    "synchronizeParagraphStyle": _boolean("是否同步段落样式"),
    "synchronizeSwatch": _boolean("是否同步色板"),
    "synchronizeTableOfContentStyle": _boolean("是否同步目录样式"),
    "synchronizeTableStyle": _boolean("是否同步表格样式"),
    "synchronizeTextVariable": _boolean("是否同步文本变量"),
    "synchronizeTrapStyle": _boolean("是否同步陷印样式"),
}

HIDDEN_HANDLER_SCHEMAS: dict[str, dict[str, Any]] = {
    "book.create_book": _object_schema(
        {"filePath": BOOK_PATH},
        ["filePath"],
    ),
    "book.open_book": _object_schema(
        {"filePath": BOOK_PATH},
        ["filePath"],
    ),
    "book.add_document_to_book": _object_schema(
        {
            "bookPath": BOOK_PATH,
            "documentPath": DOCUMENT_PATH,
        },
        ["bookPath", "documentPath"],
    ),
    "book.synchronize_book": _object_schema(
        {"bookPath": BOOK_PATH},
        ["bookPath"],
    ),
    "book.export_book": _object_schema(
        {
            "bookPath": BOOK_PATH,
            "outputPath": OUTPUT_PATH,
            "format": {
                "type": "string",
                "enum": ["PDF", "EPUB", "HTML"],
                "default": "PDF",
                "description": "导出格式",
            },
        },
        ["bookPath", "outputPath"],
    ),
    "book.package_book": _object_schema(
        {
            "bookPath": BOOK_PATH,
            "outputPath": OUTPUT_PATH,
            "copyingFonts": _boolean("是否复制字体", True),
            "copyingLinkedGraphics": _boolean("是否复制链接图像", True),
            "copyingProfiles": _boolean("是否复制色彩配置文件", True),
            "updatingGraphics": _boolean("是否更新图像链接", True),
            "includingHiddenLayers": _boolean("是否包含隐藏图层", False),
            "ignorePreflightErrors": _boolean("是否忽略预检错误", False),
            "creatingReport": _boolean("是否创建打包报告", True),
            "includeIdml": _boolean("是否包含 IDML", False),
            "includePdf": _boolean("是否包含 PDF", False),
        },
        ["bookPath", "outputPath"],
    ),
    "book.get_book_info": _object_schema(
        {"bookPath": BOOK_PATH},
        ["bookPath"],
    ),
    "book.list_books": _object_schema({}),
    "book.repaginate_book": _object_schema(
        {"bookPath": BOOK_PATH},
        ["bookPath"],
    ),
    "book.update_all_cross_references": _object_schema(
        {"bookPath": BOOK_PATH},
        ["bookPath"],
    ),
    "book.update_all_numbers": _object_schema(
        {"bookPath": BOOK_PATH},
        ["bookPath"],
    ),
    "book.update_chapter_and_paragraph_numbers": _object_schema(
        {"bookPath": BOOK_PATH},
        ["bookPath"],
    ),
    "book.preflight_book": _object_schema(
        {
            "bookPath": BOOK_PATH,
            "outputPath": OUTPUT_PATH,
            "autoOpen": _boolean("生成预检报告后是否自动打开", False),
        },
        ["bookPath"],
    ),
    "book.print_book": _object_schema(
        {
            "bookPath": BOOK_PATH,
            "printDialog": _boolean("是否显示打印对话框", True),
            "printerPreset": {
                "type": "string",
                "default": "DEFAULT_VALUE",
                "description": "InDesign PrinterPresetTypes 枚举名",
            },
        },
        ["bookPath"],
    ),
    "book.set_book_properties": _object_schema(
        {"bookPath": BOOK_PATH, **BOOK_SYNC_PROPERTIES},
        ["bookPath"],
    ),
    "presentation.create_presentation_document": _object_schema(
        {
            "preset": {
                "type": "string",
                "enum": ["A3_LANDSCAPE", "A4_LANDSCAPE", "RATIO_16x9"],
                "default": "A3_LANDSCAPE",
                "description": "演示文稿页面尺寸预设",
            },
            "width": _number("自定义页面宽度，单位 mm", minimum=1),
            "height": _number("自定义页面高度，单位 mm", minimum=1),
            "pages": {
                "type": "integer",
                "minimum": 1,
                "default": 1,
                "description": "初始页数",
            },
            "facingPages": _boolean("是否启用对页", False),
        },
    ),
    "presentation.add_cover_page": _object_schema(
        {
            "title": _string("封面标题"),
            "subtitle": _string("封面副标题"),
            "bgImagePath": _string("封面背景图片路径"),
        },
    ),
    "presentation.add_section_page": _object_schema(
        {"title": _string("章节页标题")},
    ),
    "presentation.add_full_bleed_image": _object_schema(
        {
            "filePath": _string("要铺满当前页的图片路径"),
            "caption": _string("可选图片说明"),
        },
        ["filePath"],
    ),
    "presentation.add_image_grid": _object_schema(
        {
            "files": {
                "type": "array",
                "items": {"type": "string"},
                "description": "要置入网格的图片路径列表",
            },
            "rows": {
                "type": "integer",
                "minimum": 1,
                "default": 2,
                "description": "网格行数",
            },
            "columns": {
                "type": "integer",
                "minimum": 1,
                "default": 3,
                "description": "网格列数",
            },
            "gap": _number("网格间距，单位与文档标尺一致", minimum=0),
        },
        ["files"],
    ),
    "presentation.export_presentation_pdf": _object_schema(
        {
            "filePath": _string("PDF 输出路径"),
            "preset": {
                "type": "string",
                "default": "High Quality Print",
                "description": "InDesign PDF 导出预设名称",
            },
        },
        ["filePath"],
    ),
}


HIDDEN_HANDLER_METADATA: dict[str, dict[str, Any]] = {
    "book.create_book": {
        "one_line_purpose": "新建 InDesign Book（.indb）文件",
        "side_effects": ["filesystem_write"],
        "artifact_kinds": ["indb"],
        "target_scope": "filesystem",
        "produces_artifacts": True,
    },
    "book.open_book": {
        "one_line_purpose": "打开已有 InDesign Book 文件",
        "side_effects": ["indesign_mutation"],
        "target_scope": "indesign_book",
    },
    "book.add_document_to_book": {
        "one_line_purpose": "把 InDesign 文档加入指定 Book",
        "side_effects": ["indesign_mutation"],
        "target_scope": "indesign_book",
    },
    "book.synchronize_book": {
        "one_line_purpose": "同步 Book 内文档的样式、母版和编号设置",
        "side_effects": ["indesign_mutation"],
        "target_scope": "indesign_book",
    },
    "book.export_book": {
        "one_line_purpose": "把整个 Book 导出为 PDF、EPUB 或 HTML",
        "side_effects": ["filesystem_write"],
        "artifact_kinds": ["pdf", "epub", "html"],
        "target_scope": "filesystem",
        "produces_artifacts": True,
    },
    "book.package_book": {
        "one_line_purpose": "打包 Book 及其字体、链接图像和报告",
        "side_effects": ["filesystem_write"],
        "artifact_kinds": ["package", "idml", "pdf", "report"],
        "target_scope": "filesystem",
        "produces_artifacts": True,
    },
    "book.get_book_info": {
        "one_line_purpose": "读取指定 Book 的文档列表和属性信息",
        "side_effects": [],
        "target_scope": "indesign_book",
    },
    "book.list_books": {
        "one_line_purpose": "列出当前 InDesign 打开的 Book",
        "side_effects": [],
        "target_scope": "indesign_book",
    },
    "book.repaginate_book": {
        "one_line_purpose": "重新计算 Book 内所有文档页码",
        "side_effects": ["indesign_mutation"],
        "target_scope": "indesign_book",
    },
    "book.update_all_cross_references": {
        "one_line_purpose": "更新 Book 内全部交叉引用",
        "side_effects": ["indesign_mutation"],
        "target_scope": "indesign_book",
    },
    "book.update_all_numbers": {
        "one_line_purpose": "更新 Book 内页码、章节号和段落编号",
        "side_effects": ["indesign_mutation"],
        "target_scope": "indesign_book",
    },
    "book.update_chapter_and_paragraph_numbers": {
        "one_line_purpose": "更新 Book 的章节号和段落编号",
        "side_effects": ["indesign_mutation"],
        "target_scope": "indesign_book",
    },
    "book.preflight_book": {
        "one_line_purpose": "预检 Book，并可输出预检报告",
        "side_effects": ["filesystem_write"],
        "artifact_kinds": ["report"],
        "target_scope": "filesystem",
        "produces_artifacts": True,
    },
    "book.print_book": {
        "one_line_purpose": "打印 Book，可使用打印预设或系统对话框",
        "side_effects": ["print_job"],
        "target_scope": "printer",
    },
    "book.set_book_properties": {
        "one_line_purpose": "设置 Book 的同步、分页和转换属性",
        "side_effects": ["indesign_mutation"],
        "target_scope": "indesign_book",
    },
    "presentation.create_presentation_document": {
        "one_line_purpose": "创建演示汇报型 InDesign 文档",
        "side_effects": ["indesign_mutation"],
        "target_scope": "active_document",
    },
    "presentation.add_cover_page": {
        "one_line_purpose": "新增带标题、副标题和背景图的封面页",
        "side_effects": ["indesign_mutation"],
        "target_scope": "active_document",
    },
    "presentation.add_section_page": {
        "one_line_purpose": "新增章节分隔页",
        "side_effects": ["indesign_mutation"],
        "target_scope": "active_document",
    },
    "presentation.add_full_bleed_image": {
        "one_line_purpose": "新增满版图片页，可附图片说明",
        "side_effects": ["indesign_mutation"],
        "target_scope": "active_document",
    },
    "presentation.add_image_grid": {
        "one_line_purpose": "新增图片网格页，按行列置入多张图片",
        "side_effects": ["indesign_mutation"],
        "target_scope": "active_document",
    },
    "presentation.export_presentation_pdf": {
        "one_line_purpose": "把当前演示文档导出为 PDF",
        "side_effects": ["filesystem_write"],
        "artifact_kinds": ["pdf"],
        "target_scope": "filesystem",
        "produces_artifacts": True,
    },
}
