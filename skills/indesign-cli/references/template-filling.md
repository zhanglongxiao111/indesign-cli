# 填充 InDesign 模板

适用于已有成熟 INDD 模板，只替换文字、图片或重复生成页面。

按顺序使用：

1. `template.list_template_blueprints`：列出模板母版。
2. `template.inspect_template_blueprint`：读取真实槽位名和说明。
3. `template.create_page_with_template`：按需创建页面。
4. `page.get_page_information`：确认页面和槽位状态。
5. `template.populate_template_slots`：填入文字和图片。

按顶层规则读取 schema 并用 `--args-file` 调用。槽位名必须来自检查结果，不能凭视觉猜测。

图片默认保留原始 UNC 路径。需要完整显示时选等比适应，需要铺满图框时选裁切填满。模板没有有效槽位时停止并说明，不用新增白块、遮罩或临时文本框伪造模板填充。
