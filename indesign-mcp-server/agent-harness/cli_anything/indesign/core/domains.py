from __future__ import annotations


DOMAINS = {
    "template": "模板槽位、脚本标签、母版占位和模板填充",
    "document": "打开、保存、关闭、文档信息",
    "page": "页面、页面尺寸和页面基础操作",
    "spread": "跨页、跨页布局和跨页范围操作",
    "master": "母版、母版跨页和母版对象",
    "layer": "图层创建、查询、锁定、显示和删除",
    "object": "页面对象、对象组、几何位置、脚本标签",
    "text": "文本框、文本内容、段落和字符操作",
    "graphics": "图片、图形框、适配和基础绘制",
    "style": "段落样式、字符样式、对象样式",
    "export": "PDF、IDML、图片等导出和产物验证",
    "book": "InDesign Book 文件、章节和书籍级同步",
    "presentation": "演示型版面、页面序列和 presentation handler 能力",
    "script": "JSX 文件执行和 stdin 临时脚本",
    "session": "CLI 本地状态、最近文档和最近输出",
    "server": "依赖、后端、InDesign COM 健康检查",
    "utility": "难以归入以上域的辅助能力",
}


EXACT_TOOL_DOMAINS = {
    "run_jsx_file": "template",
    "inspect_template_blueprint": "template",
    "list_template_blueprints": "template",
    "create_page_with_template": "template",
    "populate_template_slots": "template",
}


KEYWORD_DOMAINS = {
    "template": "template",
    "blueprint": "template",
    "slot": "template",
    "document": "document",
    "page": "page",
    "spread": "spread",
    "master": "master",
    "layer": "layer",
    "item": "object",
    "object": "object",
    "group": "object",
    "label": "object",
    "text": "text",
    "paragraph": "style",
    "character": "style",
    "style": "style",
    "graphic": "graphics",
    "image": "graphics",
    "export": "export",
    "pdf": "export",
    "idml": "export",
    "book": "book",
    "presentation": "presentation",
    "session": "session",
    "health": "server",
    "help": "utility",
}


def infer_domain(tool_name: str, description: str = "") -> str:
    exact = EXACT_TOOL_DOMAINS.get(tool_name)
    if exact:
        return exact
    haystack = f"{tool_name} {description}".lower()
    for keyword, domain in KEYWORD_DOMAINS.items():
        if keyword in haystack:
            return domain
    return "utility"
