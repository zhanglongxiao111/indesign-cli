# InDesign MCP Server 工具文档

本文档列出了 InDesign MCP Server 中所有可用的工具，共计 120+ 个工具。

## 内容管理工具 (Content Tools)

| 工具名称                   | 说明           | JSON字段                                                                                                                                                                                                                                                                                 | 返回信息     |
| ---------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| create_text_frame      | 在活动页面上创建文本框  | content (string): 文本内容, x (number): X位置(mm), y (number): Y位置(mm), width (number): 宽度(mm), height (number): 高度(mm), fontSize (number): 字体大小(点), fontName (string): 字体名称, textColor (string): 文本颜色, alignment (enum): 对齐方式, paragraphStyle (string): 段落样式, characterStyle (string): 字符样式 | 创建的文本框信息 |
| edit_text_frame        | 编辑现有文本框      | frameIndex (number): 文本框索引, content (string): 新文本内容, fontSize (number): 字体大小, fontName (string): 字体名称, textColor (string): 文本颜色, alignment (enum): 对齐方式                                                                                                                                | 编辑结果     |
| find_replace_text      | 在文档中查找替换文本   | findText (string): 查找文本, replaceText (string): 替换文本, caseSensitive (boolean): 区分大小写, wholeWord (boolean): 全词匹配                                                                                                                                                                         | 替换结果统计   |
| create_table           | 在活动页面上创建表格   | rows (number): 行数, columns (number): 列数, x (number): X位置, y (number): Y位置, width (number): 表格宽度, height (number): 表格高度, headerRows (number): 标题行数, headerColumns (number): 标题列数                                                                                                        | 创建的表格信息  |
| populate_table         | 使用数据填充表格     | tableIndex (number): 表格索引, data (array): 表格数据数组, startRow (number): 开始行, startColumn (number): 开始列                                                                                                                                                                                     | 填充结果     |
| place_image            | 在活动页面上放置图像   | filePath (string): 图像文件路径, x (number): X位置, y (number): Y位置, width (number): 宽度, height (number): 高度, linkImage (boolean): 链接图像, scale (number): 缩放比例, fitMode (enum): 适应模式                                                                                                            | 放置的图像信息  |
| help                   | 获取可用工具的帮助信息  | tool (string): 特定工具名称, category (enum): 工具类别, format (enum): 输出格式                                                                                                                                                                                                                      | 帮助信息     |
| create_rectangle       | 在活动页面上创建矩形   | x (number): X位置, y (number): Y位置, width (number): 宽度, height (number): 高度, fillColor (string): 填充颜色, strokeColor (string): 描边颜色, strokeWidth (number): 描边宽度, cornerRadius (number): 圆角半径                                                                                               | 创建的矩形信息  |
| create_ellipse         | 在活动页面上创建椭圆   | x (number): X位置, y (number): Y位置, width (number): 宽度, height (number): 高度, fillColor (string): 填充颜色, strokeColor (string): 描边颜色, strokeWidth (number): 描边宽度                                                                                                                            | 创建的椭圆信息  |
| create_polygon         | 在活动页面上创建多边形  | x (number): X位置, y (number): Y位置, width (number): 宽度, height (number): 高度, sides (number): 边数, fillColor (string): 填充颜色, strokeColor (string): 描边颜色, strokeWidth (number): 描边宽度                                                                                                        | 创建的多边形信息 |
| create_object_style    | 创建对象样式       | name (string): 样式名称, fillColor (string): 填充颜色, strokeColor (string): 描边颜色, strokeWeight (number): 描边粗细, cornerRadius (number): 圆角半径, transparency (number): 透明度                                                                                                                        | 创建的样式信息  |
| list_object_styles     | 列出文档中的所有对象样式 | 无参数                                                                                                                                                                                                                                                                                    | 对象样式列表   |
| apply_object_style     | 将对象样式应用到页面项目 | styleName (string): 样式名称, itemType (enum): 项目类型, itemIndex (number): 项目索引                                                                                                                                                                                                              | 应用结果     |
| get_image_info         | 获取图像的详细信息    | itemIndex (number): 图像索引                                                                                                                                                                                                                                                               | 图像详细信息   |
| create_paragraph_style | 创建段落样式       | name (string): 样式名称, fontFamily (string): 字体族, fontSize (number): 字体大小, textColor (string): 文本颜色, alignment (enum): 对齐方式, leading (number): 行距, spaceBefore (number): 前间距, spaceAfter (number): 后间距                                                                                    | 创建的样式信息  |
| create_character_style | 创建字符样式       | name (string): 样式名称, fontFamily (string): 字体族, fontSize (number): 字体大小, textColor (string): 文本颜色, bold (boolean): 加粗, italic (boolean): 斜体, underline (boolean): 下划线                                                                                                                   | 创建的样式信息  |
| apply_paragraph_style  | 将段落样式应用到文本   | styleName (string): 样式名称, frameIndex (number): 文本框索引, paragraphIndex (number): 段落索引                                                                                                                                                                                                    | 应用结果     |
| apply_character_style  | 将字符样式应用到文本   | styleName (string): 样式名称, frameIndex (number): 文本框索引, startIndex (number): 开始索引, endIndex (number): 结束索引                                                                                                                                                                               | 应用结果     |
| list_styles            | 列出所有段落和字符样式  | styleType (enum): 样式类型                                                                                                                                                                                                                                                                 | 样式列表     |
| create_color_swatch    | 创建颜色色板       | name (string): 色板名称, colorType (enum): 颜色类型, red (number): 红色值, green (number): 绿色值, blue (number): 蓝色值                                                                                                                                                                                | 创建的色板信息  |
| list_color_swatches    | 列出所有颜色色板     | 无参数                                                                                                                                                                                                                                                                                    | 色板列表     |
| apply_color            | 将颜色应用到对象     | objectIndex (number): 对象索引, colorName (string): 颜色名称, colorType (enum): 颜色类型                                                                                                                                                                                                           | 应用结果     |

## 文档管理工具 (Document Tools)

| 工具名称                            | 说明            | JSON字段                                                                                                                                                                                                                                                                                                                                                                                                | 返回信息     |
| ------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| get_document_info               | 获取活动文档的信息     | 无参数                                                                                                                                                                                                                                                                                                                                                                                                   | 文档基本信息   |
| create_document                 | 创建新文档         | width (number): 文档宽度, height (number): 文档高度, pages (number): 页数, facingPages (boolean): 面对页, pageOrientation (enum): 页面方向, bleedTop (number): 上出血, bleedBottom (number): 下出血, bleedInside (number): 内出血, bleedOutside (number): 外出血, marginTop (number): 上边距, marginBottom (number): 下边距, marginLeft (number): 左边距, marginRight (number): 右边距                                                         | 创建的文档信息  |
| open_document                   | 打开现有文档        | filePath (string): 文档文件路径                                                                                                                                                                                                                                                                                                                                                                             | 打开结果     |
| save_document                   | 保存活动文档        | filePath (string): 保存路径                                                                                                                                                                                                                                                                                                                                                                               | 保存结果     |
| close_document                  | 关闭活动文档        | 无参数                                                                                                                                                                                                                                                                                                                                                                                                   | 关闭结果     |
| zoom_to_page                    | 缩放到页面视图       | pageIndex (number): 页面索引, zoomLevel (number): 缩放级别                                                                                                                                                                                                                                                                                                                                                    | 缩放结果     |
| get_document_elements           | 获取文档中的所有元素    | elementType (string): 元素类型                                                                                                                                                                                                                                                                                                                                                                            | 文档元素列表   |
| get_document_styles             | 获取文档中的所有样式    | styleType (enum): 样式类型                                                                                                                                                                                                                                                                                                                                                                                | 样式列表     |
| get_document_colors             | 获取文档中的所有颜色和色板 | includeSwatches (boolean): 包含色板, includeGradients (boolean): 包含渐变, includeTints (boolean): 包含色调                                                                                                                                                                                                                                                                                                       | 颜色列表     |
| get_document_preferences        | 获取文档偏好设置      | preferenceType (enum): 偏好类型                                                                                                                                                                                                                                                                                                                                                                           | 偏好设置     |
| set_document_preferences        | 设置文档偏好        | preferenceType (enum): 偏好类型, preferences (object): 偏好值                                                                                                                                                                                                                                                                                                                                                | 设置结果     |
| get_document_stories            | 获取文档中的所有故事    | includeOverset (boolean): 包含溢出文本, includeHidden (boolean): 包含隐藏文本                                                                                                                                                                                                                                                                                                                                     | 故事列表     |
| find_text_in_document           | 在整个文档中查找文本    | searchText (string): 搜索文本, replaceText (string): 替换文本, caseSensitive (boolean): 区分大小写, wholeWord (boolean): 全词匹配, useRegex (boolean): 使用正则表达式                                                                                                                                                                                                                                                         | 查找结果     |
| get_document_layers             | 获取文档中的所有图层    | includeHidden (boolean): 包含隐藏图层, includeLocked (boolean): 包含锁定图层                                                                                                                                                                                                                                                                                                                                      | 图层列表     |
| organize_document_layers        | 组织和清理文档图层     | deleteEmptyLayers (boolean): 删除空图层, mergeSimilarLayers (boolean): 合并相似图层, sortLayers (boolean): 排序图层                                                                                                                                                                                                                                                                                                  | 组织结果     |
| get_document_hyperlinks         | 获取文档中的所有超链接   | includeDestinations (boolean): 包含目标, includeSources (boolean): 包含源                                                                                                                                                                                                                                                                                                                                    | 超链接列表    |
| create_document_hyperlink       | 在文档中创建超链接     | sourceText (string): 源文本, destination (string): 目标, linkType (enum): 链接类型, pageIndex (number): 页面索引                                                                                                                                                                                                                                                                                                   | 创建的超链接信息 |
| get_document_sections           | 获取文档中的所有章节    | 无参数                                                                                                                                                                                                                                                                                                                                                                                                   | 章节列表     |
| create_document_section         | 在文档中创建新章节     | startPage (number): 开始页面, sectionPrefix (string): 章节前缀, startNumber (number): 开始编号, numberingStyle (enum): 编号样式                                                                                                                                                                                                                                                                                       | 创建的章节信息  |
| get_document_grid_settings      | 获取文档的网格设置     | 无参数                                                                                                                                                                                                                                                                                                                                                                                                   | 网格设置     |
| set_document_grid_settings      | 设置文档的网格设置     | documentGrid (boolean): 启用文档网格, documentGridColor (string): 网格颜色, documentGridIncrement (string): 网格增量, documentGridSubdivision (number): 网格细分, baselineGrid (boolean): 启用基线网格, baselineGridColor (string): 基线颜色, baselineGridIncrement (string): 基线增量, baselineGridOffset (string): 基线偏移, baselineGridViewThreshold (number): 基线视图阈值, gridViewThreshold (number): 网格视图阈值, gridAlignment (enum): 网格对齐 | 设置结果     |
| get_document_layout_preferences | 获取文档的布局偏好     | 无参数                                                                                                                                                                                                                                                                                                                                                                                                   | 布局偏好     |
| set_document_layout_preferences | 设置文档的布局偏好     | adjustLayout (boolean): 调整布局, adjustLayoutMargins (boolean): 调整边距, adjustLayoutPageBreaks (boolean): 调整分页, adjustLayoutRules (string): 调整规则, alignDistributeBounds (enum): 对齐分布边界, alignDistributeSpacing (enum): 对齐分布间距, smartGuidePreferences (boolean): 智能参考线                                                                                                                                      | 设置结果     |

## 导出工具 (Export Tools)

| 工具名称             | 说明         | JSON字段                                                                                                                           | 返回信息 |
| ---------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- | ---- |
| export_pdf       | 将文档导出为PDF  | filePath (string): 输出PDF路径, quality (enum): 质量, includeMarks (boolean): 包含标记, includeBleed (boolean): 包含出血, pages (string): 页面范围 | 导出结果 |
| export_images    | 将页面导出为图像   | outputPath (string): 输出目录, format (enum): 格式, resolution (number): 分辨率, pages (string): 页面范围, quality (number): 质量               | 导出结果 |
| export_epub      | 将文档导出为EPUB | filePath (string): 输出EPUB路径, includeImages (boolean): 包含图像, includeStyles (boolean): 包含样式                                        | 导出结果 |
| package_document | 打包文档以供打印   | outputPath (string): 输出目录, includeFonts (boolean): 包含字体, includeLinks (boolean): 包含链接, includeProfiles (boolean): 包含配置文件         | 打包结果 |

## 图层管理工具 (Layer Tools)

| 工具名称             | 说明         | JSON字段                                                                                    | 返回信息    |
| ---------------- | ---------- | ----------------------------------------------------------------------------------------- | ------- |
| create_layer     | 创建新图层      | name (string): 图层名称, visible (boolean): 可见性, locked (boolean): 锁定状态, color (string): 图层颜色 | 创建的图层信息 |
| set_active_layer | 设置活动图层     | layerName (string): 图层名称                                                                  | 设置结果    |
| list_layers      | 列出文档中的所有图层 | 无参数                                                                                       | 图层列表    |

## 主版面管理工具 (Master Spread Tools)

| 工具名称                     | 说明         | JSON字段                                                                                                                                                                                                                                                                    | 返回信息     |
| ------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| create_master_spread     | 创建新的主版面    | name (string): 主版面名称, baseName (string): 基础名称, namePrefix (string): 名称前缀, pageColor (string): 页面颜色, showMasterItems (boolean): 显示主版面项目                                                                                                                                    | 创建的主版面信息 |
| list_master_spreads      | 列出所有主版面    | 无参数                                                                                                                                                                                                                                                                       | 主版面列表    |
| delete_master_spread     | 删除主版面      | name (string): 主版面名称                                                                                                                                                                                                                                                      | 删除结果     |
| duplicate_master_spread  | 复制主版面      | name (string): 主版面名称, newName (string): 新名称, position (enum): 位置                                                                                                                                                                                                          | 复制的主版面信息 |
| apply_master_spread      | 将主版面应用到页面  | masterName (string): 主版面名称, pageRange (string): 页面范围                                                                                                                                                                                                                      | 应用结果     |
| create_master_text_frame | 在主版面上创建文本框 | masterName (string): 主版面名称, content (string): 文本内容, x (number): X位置, y (number): Y位置, width (number): 宽度, height (number): 高度, fontSize (number): 字体大小, fontFamily (string): 字体族, textColor (string): 文本颜色, alignment (enum): 对齐方式, isPrimaryTextFrame (boolean): 是否为主文本框 | 创建的文本框信息 |
| create_master_rectangle  | 在主版面上创建矩形  | masterName (string): 主版面名称, x (number): X位置, y (number): Y位置, width (number): 宽度, height (number): 高度, fillColor (string): 填充颜色, strokeColor (string): 描边颜色, strokeWidth (number): 描边宽度, cornerRadius (number): 圆角半径                                                      | 创建的矩形信息  |
| create_master_guides     | 在主版面上创建参考线 | masterName (string): 主版面名称, numberOfRows (number): 行数, numberOfColumns (number): 列数, rowGutter (number): 行间距, columnGutter (number): 列间距, guideColor (string): 参考线颜色, fitMargins (boolean): 适应边距, removeExisting (boolean): 删除现有参考线, layerName (string): 图层名称             | 创建结果     |
| get_master_spread_info   | 获取主版面的详细信息 | name (string): 主版面名称                                                                                                                                                                                                                                                      | 主版面详细信息  |
| detach_master_items      | 从页面分离主版面项目 | pageIndex (number): 页面索引, itemIndex (number): 项目索引                                                                                                                                                                                                                        | 分离结果     |
| remove_master_override   | 移除主版面项目的覆盖 | pageIndex (number): 页面索引, itemIndex (number): 项目索引                                                                                                                                                                                                                        | 移除结果     |

## 页面管理工具 (Page Tools)

| 工具名称                             | 说明             | JSON字段                                                                                                                                                                                                                                                                                | 返回信息    |
| -------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| add_page                         | 向文档添加新页面       | position (enum): 位置, referencePage (number): 参考页面                                                                                                                                                                                                                                     | 添加的页面信息 |
| delete_page                      | 从文档删除页面        | pageIndex (number): 页面索引                                                                                                                                                                                                                                                              | 删除结果    |
| duplicate_page                   | 复制页面           | pageIndex (number): 页面索引, position (enum): 位置, referencePageIndex (number): 参考页面索引                                                                                                                                                                                                    | 复制的页面信息 |
| navigate_to_page                 | 导航到特定页面        | pageIndex (number): 页面索引                                                                                                                                                                                                                                                              | 导航结果    |
| get_page_info                    | 获取特定页面的详细信息    | pageIndex (number): 页面索引                                                                                                                                                                                                                                                              | 页面详细信息  |
| move_page                        | 将页面移动到不同位置     | pageIndex (number): 页面索引, position (enum): 位置, referencePageIndex (number): 参考页面索引, binding (enum): 装订                                                                                                                                                                                | 移动结果    |
| set_page_properties              | 设置页面的属性        | pageIndex (number): 页面索引, label (string): 标签, pageColor (string): 页面颜色, optionalPage (boolean): 可选页面, layoutRule (enum): 布局规则, snapshotBlendingMode (enum): 快照混合模式, appliedTrapPreset (string): 陷印预设                                                                                  | 设置结果    |
| adjust_page_layout               | 调整页面布局         | pageIndex (number): 页面索引, width (string): 宽度, height (string): 高度, bleedInside (string): 内出血, bleedTop (string): 上出血, bleedOutside (string): 外出血, bleedBottom (string): 下出血, leftMargin (string): 左边距, topMargin (string): 上边距, rightMargin (string): 右边距, bottomMargin (string): 下边距 | 调整结果    |
| resize_page                      | 调整页面大小         | pageIndex (number): 页面索引, width (number): 宽度, height (number): 高度, resizeMethod (enum): 调整方法, anchorPoint (enum): 锚点, coordinateSpace (enum): 坐标空间                                                                                                                                    | 调整结果    |
| place_file_on_page               | 在页面上放置文件       | pageIndex (number): 页面索引, filePath (string): 文件路径, x (number): X位置, y (number): Y位置, layerName (string): 图层名称, showingOptions (boolean): 显示选项, autoflowing (boolean): 自动流动                                                                                                            | 放置结果    |
| place_xml_on_page                | 在页面上放置XML内容    | pageIndex (number): 页面索引, xmlElementName (string): XML元素名称, x (number): X位置, y (number): Y位置, autoflowing (boolean): 自动流动                                                                                                                                                             | 放置结果    |
| snapshot_page_layout             | 创建页面布局快照       | pageIndex (number): 页面索引                                                                                                                                                                                                                                                              | 快照结果    |
| delete_page_layout_snapshot      | 删除页面的布局快照      | pageIndex (number): 页面索引                                                                                                                                                                                                                                                              | 删除结果    |
| delete_all_page_layout_snapshots | 删除页面的所有布局快照    | pageIndex (number): 页面索引                                                                                                                                                                                                                                                              | 删除结果    |
| reframe_page                     | 重构(调整大小)页面     | pageIndex (number): 页面索引, x1 (number): 左上X, y1 (number): 左上Y, x2 (number): 右下X, y2 (number): 右下Y, coordinateSpace (enum): 坐标空间                                                                                                                                                        | 重构结果    |
| create_page_guides               | 在页面上创建参考线      | pageIndex (number): 页面索引, numberOfRows (number): 行数, numberOfColumns (number): 列数, rowGutter (number): 行间距, columnGutter (number): 列间距, guideColor (string): 参考线颜色, fitMargins (boolean): 适应边距, removeExisting (boolean): 删除现有参考线, layerName (string): 图层名称                           | 创建结果    |
| select_page                      | 选择页面           | pageIndex (number): 页面索引, selectionMode (enum): 选择模式                                                                                                                                                                                                                                  | 选择结果    |
| get_page_content_summary         | 获取页面内容的摘要      | pageIndex (number): 页面索引                                                                                                                                                                                                                                                              | 内容摘要    |
| set_page_background              | 通过创建全页矩形设置页面背景 | pageIndex (number): 页面索引, backgroundColor (string): 背景颜色, opacity (number): 不透明度                                                                                                                                                                                                      | 设置结果    |

## 页面项目和组管理工具 (Page Item & Group Tools)

| 工具名称                     | 说明             | JSON字段                                                                                                                                                                                  | 返回信息    |
| ------------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| get_page_item_info       | 获取特定页面项目的详细信息  | pageIndex (integer): 页面索引, itemIndex (integer): 项目索引                                                                                                                                    | 项目详细信息  |
| select_page_item         | 选择特定页面项目       | pageIndex (integer): 页面索引, itemIndex (integer): 项目索引, existingSelection (enum): 现有选择                                                                                                    | 选择结果    |
| move_page_item           | 将页面项目移动到新位置    | pageIndex (integer): 页面索引, itemIndex (integer): 项目索引, x (number): 新X坐标, y (number): 新Y坐标                                                                                                | 移动结果    |
| resize_page_item         | 调整页面项目大小       | pageIndex (integer): 页面索引, itemIndex (integer): 项目索引, width (number): 新宽度, height (number): 新高度, anchorPoint (enum): 锚点                                                                 | 调整结果    |
| set_page_item_properties | 设置页面项目的属性      | pageIndex (integer): 页面索引, itemIndex (integer): 项目索引, fillColor (string): 填充颜色, strokeColor (string): 描边颜色, strokeWeight (number): 描边粗细, visible (boolean): 可见性, locked (boolean): 锁定状态 | 设置结果    |
| duplicate_page_item      | 复制页面项目         | pageIndex (integer): 页面索引, itemIndex (integer): 项目索引, x (number): 复制X坐标, y (number): 复制Y坐标                                                                                              | 复制的项目信息 |
| delete_page_item         | 删除页面项目         | pageIndex (integer): 页面索引, itemIndex (integer): 项目索引                                                                                                                                    | 删除结果    |
| list_page_items          | 列出特定页面上的所有页面项目 | pageIndex (integer): 页面索引                                                                                                                                                               | 项目列表    |
| create_group             | 从当前选中的项目创建组    | pageIndex (integer): 页面索引                                                                                                                                                               | 创建的组信息  |
| create_group_from_items  | 从特定页面项目索引创建组   | pageIndex (integer): 页面索引, itemIndices (array): 项目索引数组                                                                                                                                  | 创建的组信息  |
| ungroup                  | 取消分组，释放所有项目    | pageIndex (integer): 页面索引, groupIndex (integer): 组索引                                                                                                                                    | 取消分组结果  |
| get_group_info           | 获取组的详细信息       | pageIndex (integer): 页面索引, groupIndex (integer): 组索引                                                                                                                                    | 组详细信息   |
| add_item_to_group        | 将页面项目添加到现有组    | pageIndex (integer): 页面索引, groupIndex (integer): 组索引, itemIndex (integer): 项目索引                                                                                                         | 添加结果    |
| remove_item_from_group   | 从组中移除页面项目      | pageIndex (integer): 页面索引, groupIndex (integer): 组索引, itemIndex (integer): 项目索引                                                                                                         | 移除结果    |
| list_groups              | 列出特定页面上的所有组    | pageIndex (integer): 页面索引                                                                                                                                                               | 组列表     |
| set_group_properties     | 设置组的属性         | pageIndex (integer): 页面索引, groupIndex (integer): 组索引, visible (boolean): 可见性, locked (boolean): 锁定状态, name (string): 组名称                                                                | 设置结果    |

## 跨页管理工具 (Spread Tools)

| 工具名称                       | 说明          | JSON字段                                                                                                                                                                                                                                                                  | 返回信息    |
| -------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| list_spreads               | 列出文档中的所有跨页  | 无参数                                                                                                                                                                                                                                                                     | 跨页列表    |
| get_spread_info            | 获取特定跨页的详细信息 | spreadIndex (number): 跨页索引                                                                                                                                                                                                                                              | 跨页详细信息  |
| duplicate_spread           | 复制跨页        | spreadIndex (number): 跨页索引, position (enum): 位置, referenceSpreadIndex (number): 参考跨页索引                                                                                                                                                                                  | 复制的跨页信息 |
| move_spread                | 将跨页移动到不同位置  | spreadIndex (number): 跨页索引, position (enum): 位置, referenceSpreadIndex (number): 参考跨页索引                                                                                                                                                                                  | 移动结果    |
| delete_spread              | 删除跨页        | spreadIndex (number): 跨页索引                                                                                                                                                                                                                                              | 删除结果    |
| set_spread_properties      | 设置跨页的属性     | spreadIndex (number): 跨页索引, name (string): 名称, allowPageShuffle (boolean): 允许页面重排, showMasterItems (boolean): 显示主版面项目, spreadHidden (boolean): 隐藏跨页, pageTransitionType (enum): 页面过渡类型, pageTransitionDirection (enum): 页面过渡方向, pageTransitionDuration (enum): 页面过渡持续时间 | 设置结果    |
| create_spread_guides       | 在跨页上创建参考线   | spreadIndex (number): 跨页索引, numberOfRows (number): 行数, numberOfColumns (number): 列数, rowGutter (number): 行间距, columnGutter (number): 列间距, guideColor (string): 参考线颜色, fitMargins (boolean): 适应边距, removeExisting (boolean): 删除现有参考线, layerName (string): 图层名称           | 创建结果    |
| place_file_on_spread       | 在跨页上放置文件    | spreadIndex (number): 跨页索引, filePath (string): 文件路径, x (number): X位置, y (number): Y位置, layerName (string): 图层名称, showingOptions (boolean): 显示选项, autoflowing (boolean): 自动流动                                                                                            | 放置结果    |
| select_spread              | 选择跨页        | spreadIndex (number): 跨页索引, selectionMode (enum): 选择模式                                                                                                                                                                                                                  | 选择结果    |
| get_spread_content_summary | 获取跨页内容的摘要   | spreadIndex (number): 跨页索引                                                                                                                                                                                                                                              | 内容摘要    |

## 实用工具 (Utility Tools)

| 工具名称                  | 说明                           | JSON字段                | 返回信息   |
| --------------------- | ---------------------------- | --------------------- | ------ |
| execute_indesign_code | 执行自定义InDesign ExtendScript代码 | code (string): 要执行的代码 | 执行结果   |
| view_document         | 查看文档信息和当前状态                  | 无参数                   | 文档状态信息 |
| get_session_info      | 获取当前会话信息                     | 无参数                   | 会话信息   |
| clear_session         | 清除所有会话数据                     | 无参数                   | 清除结果   |

---

*注：此文档基于工具定义自动生成。实际返回信息可能因操作和参数而异。*

下面给出基于你“**由人类用户先行设计模板，Agent 只做内容填写 + 少量原子化操作，ExtendScript + 人类兜底**”的新方案——**一套可投入生产的精简工具集（≤35 个）**。  
统一返回结构（除非单独声明）：

```json
{ "ok": true/false, "message": "string", "warnings": ["string"], "data": {…}, "requestId": "uuid" }
```

通用约定：`pageIndex` 0 基；长度/坐标单位 mm；颜色可用色板名或 `{r,g,b}`；`fitMode` 取 `none|fit-content|fit-frame|fill-frame`。原始工具来源参见 **InDesign MCP Server 120+ 工具文档**（本方案将其合并精简并保留关键字段）。

---

## A. 模板驱动核心（人类制作 → Agent 调用）

> **目标**：人类在 InDesign 中制作若干 .INDD 模板（含主版面、标注好 Slot 的文本框/图片框/表格框、样式与色板），Agent 只负责选择模板、映射 Slot、填充内容、导出成品；特殊情况用少量原子工具或 ExtendScript 兜底。

### A1. 模板生命周期（11 个）

| 工具名                     | 用途 / 智能提示（给 Agent）                                | 主要 JSON 字段（校验/枚举）                                                                                                    | 返回 / 反馈（`data` 核心）                             | 合并自（原工具）                                                |
| ----------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| template.register       | **注册**人类制作的模板（指向 .indd 路径），解析并缓存 Slot Schema 与缩略图 | `name`(string)，`version`(string)，`filePath`(string)，`thumbnail?`(path)，`slotSchema?`([{`key`,`type`:`text            | image                                          | table`，`required?`，`target`:{`byLabel`}}])              |
| template.list           | 列出可用模板，支持按标签/用途过滤                                 | `q?`，`tags?`([])                                                                                                     | `{templates:[{templateId,name,version,tags}]}` | `help / view_document`                                  |
| template.preview        | 生成/读取模板缩略图或指定页预览图                                 | `templateId`，`pages?`(string 如 `1-3,7`)                                                                              | `{previews:[{page, imagePath}]}`               | `export_images`                                         |
| template.validate       | 校验模板完备性（Slot/样式/链接/字体）                            | `templateId`                                                                                                         | `{issues:[{type:`missing_slot                  | missing_link                                            |
| template.instantiate    | 将模板插入当前项目；支持在某页前/后/末尾追加；可**锁死 Slot 几何**避免走样       | `templateId`，`insert`:{`mode`:`before                                                                                | after                                          | append`，`referencePage`?}，`lockSlots?`(bool)            |
| template.map_slots      | 若自动识别失败，手工/半自动映射 Slot 与框体                         | `pageIndex`，`mapping`:[{`slotKey`,`frameId`}]                                                                        | `{mapped:[{slotKey,frameId}]}`                 | `list_page_items / get_page_content_summary`            |
| template.bind_data      | 绑定结构化数据（JSON）到 Slot Key                           | `pageIndex                                                                                                           | range`，`data`(object)                          | `{boundKeys:[…]}`                                       |
| template.fill           | 写入**单一 Slot**内容（文本/图片/表格）                         | `pageIndex`，`slotKey`，`content`：`text{value, styleRole?}` \| `image{filePath,fitMode}` \| `table{data[][], header?}` | `{applied:true, frameId}`                      | `create_text_frame / place_image / populate_table`      |
| template.fill_batch     | 按映射批量填充                                           | `pageRange`，`items`:[{`slotKey`,`content`…}]                                                                         | `{applied:n}`                                  | 同上                                                      |
| template.update_variant | 切换模板**变体**（如封面 A/B，图片墙 3×N/4×N），保持已填数据            | `pageRange`，`variant`(string)                                                                                        | `{variant, remapped:n}`                        | `duplicate_page / move_page / set_page_item_properties` |
| template.apply_master   | 应用模板内的主版面到指定页                                     | `templateId`，`masterName`，`pageRange`                                                                                | `{appliedPages:[…]}`                           | `apply_master_spread`                                   |

### A2. 主题与样式（3 个）

| 工具名              | 用途 / 智能提示                       | 主要 JSON 字段                                                                                   | 返回 / 反馈          | 合并自                                                                                                  |
| ---------------- | ------------------------------- | -------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| theme.set        | 设定/覆盖模板主题 Token（字体层级/色板/基线网格）   | `typography`:{H1/H2/Body/Caption…}，`colors`:{primary,accent,…}，`baseline`:{increment,offset} | `{theme}`        | `create_paragraph_style / create_character_style / create_color_swatch / set_document_grid_settings` |
| style.apply_role | 以角色（H1/H2/Body/Caption 等）快速套用样式 | `target`:{`frameId` 或 文本范围}，`role`，`overrides?`                                              | `{applied:true}` | `apply_paragraph_style / apply_character_style`                                                      |
| swatch.create    | 新建色板（若主题未覆盖）                    | `name`，`rgb`{r,g,b}                                                                          | `{swatchName}`   | `create_color_swatch`                                                                                |

### A3. 素材与链接（2 个）

| 工具名             | 用途 / 智能提示                          | 主要 JSON 字段                    | 返回 / 反馈            | 合并自                       |
| --------------- | ---------------------------------- | ----------------------------- | ------------------ | ------------------------- |
| assets.register | 预登记素材键值（`hero`, `site_plan`…）供批量填充 | `assets`:[{`key`,`filePath`}] | `{registered:[…]}` | ——                        |
| assets.check    | 检查断链/大图警告/色域                       | `scope`:`doc                  | pageRange`         | `{links:[{path,status:`ok |

---

## B. 项目/页面与原子化灵活操作（可少用，但要有）

### B1. 项目 IO & 导出（3 个）

| 工具名          | 用途 / 智能提示             | 主要 JSON 字段  | 返回 / 反馈                                 | 合并自                                                                           |
| ------------ | --------------------- | ----------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| project.io   | 统一的项目 IO：`new         | open        | save                                    | close`                                                                        |
| doc.info.get | 获取文档概要（页数、样式/色板计数、图层） | 无           | `{pageCount, styles, swatches, layers}` | `get_document_info / get_document_styles / list_color_swatches / list_layers` |
| doc.export   | PDF/图像/EPUB/打包（统一）    | `type`:`pdf | images                                  | epub                                                                          |

### B2. 页面与图层（3 个）

| 工具名             | 用途 / 智能提示    | 主要 JSON 字段                                                                   | 返回 / 反馈        | 合并自                   |
| --------------- | ------------ | ---------------------------------------------------------------------------- | -------------- | --------------------- |
| page.manage     | 新增/删/复制/移动   | `action`:`add                                                                | delete         | duplicate             |
| page.background | 设背景（全幅矩形）    | `pageIndex`，`backgroundColor`，`opacity?`                                     | `{frameId}`    | `set_page_background` |
| page.guides     | 建竖/横栅格（可贴边距） | `pageIndex`，`rows,columns,rowGutter,columnGutter,fitMargins,removeExisting?` | `{guideCount}` | `create_page_guides`  |

### B3. 原子对象操作（7 个）

| 工具名               | 用途 / 智能提示              | 主要 JSON 字段                                                                                                | 返回 / 反馈                                                             | 合并自                                                                           |
| ----------------- | ---------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| text.upsert       | 新建或更新文本框（可直接写内容）       | **创建**:`pageIndex,x,y,width,height`；**更新**:`frameId`；通用：`content?`，`alignment?`，`styleRole?`              | `{frameId, edited:true}`                                            | `create_text_frame / edit_text_frame`                                         |
| image.place       | 放置/重链图片（支持自适应）         | `pageIndex                                                                                                | spreadIndex`，`filePath`，`x,y,width?,height?`，`fitMode`，`linkImage?` | `{frameId, linkPath}`                                                         |
| table.upsert      | 创建或填充表格                | **创建**:`pageIndex,x,y,width,height,rows,columns,headerRows?`；**填充**:`tableId                              | tableIndex,data[][]`                                                | `{tableId,cellsUpdated}`                                                      |
| selector.by_label | 通过 label/类型/样式选择对象（更稳） | `scope`:`page                                                                                             | spread                                                              | doc`，`where`{`type?`:`text                                                    |
| item.transform    | 移动/缩放/旋转/透明度           | `target`:{`itemId` 或 `pageIndex+itemIndex`}；`move?`{dx,dy}；`resize?`{width?,height?}；`rotate?`；`opacity?` | `{itemId,bbox}`                                                     | `move_page_item / resize_page_item / set_page_item_properties / reframe_page` |
| item.group        | 组/解组/增删组内成员            | `action`:`group                                                                                           | ungroup                                                             | add                                                                           |
| hyperlink.create  | 目录/跳转/外链               | `source`:`frameId                                                                                         | findText`，`destination`:`pageIndex                                  | url`，`linkType`                                                               |

---

## C. 质检、协作与兜底（5 个）

| 工具名                | 用途 / 智能提示                     | 主要 JSON 字段           | 返回 / 反馈                                          | 合并自                                       |
| ------------------ | ----------------------------- | -------------------- | ------------------------------------------------ | ----------------------------------------- |
| qc.lint            | 一键预检：溢出文本/断链/缺字库/未使用色板等       | `scope`:`doc         | pageRange`，`rules?`                              | `{issues:[{type,target,severity, hint}]}` |
| ops.review.request | 提交人审任务（生成所选页低清预览并附问题清单）       | `pageRange`，`notes?` | `{taskId, previews:[{page,imagePath}], issues?}` | `export_images`（低清）                       |
| ops.comment        | 针对页/对象添加批注（可@人）               | `target`:`page       | itemId`，`text`，`assignee?`                       | `{commentId,time}`                        |
| script.run         | **ExtendScript 兜底**：当无等价工具时调用 | `code`(string)       | `{stdout,stderr?}`                               | `execute_indesign_code`                   |
| help.tools         | 返回工具 Schema 与示例（便于 Agent 自检）  | `name?`              | `{tools:[{name,schema,examples}]}`               | `help`                                    |

> **总计 34 个工具（≤40）**。其中 **模板驱动 16 个**（A1+A2+A3=16），**项目/页面/原子操作 13 个**（B 组），**QA/协作/兜底 5 个**（C 组）。

---

### 运行建议（落地实践）

1. **人类先行**：在 InDesign 中创建 3–6 套模板（封面/目录/单图+说明/图集 N×M/分析图/指标表/结尾页），统一用对象 **Label 命名 Slot**（如 `title`, `subtitle`, `hero_image`, `metrics_table`）。

2. **注册与体检**：`template.register → template.validate → template.preview`，修复报错项（断链/缺字库/未标 Slot）。

3. **实例化与填充**：`template.instantiate(lockSlots:true) → template.map_slots(必要时) → assets.register → template.bind_data → template.fill_batch`。

4. **质检与导出**：`qc.lint → assets.check → doc.export(type:pdf/package)`；若遇到无法覆盖的需求，`script.run` 注入 ExtendScript；必要时 `ops.review.request` 拉人兜底。

5. **最小原子化**：仅在“非常规页”使用 B3 原子工具（`text.upsert`, `image.place`, `table.upsert`, `item.transform` 等）微调。

---

> **与原 120+ 工具的映射说明**：上表“合并自”列给出了关键对照，确保现有 MCP Server 可在不破坏兼容性的前提下合并为稳定、低熵的调用面。完整原始工具清单与字段定义可参见你提供的 InDesign MCP Server 文档。

如果你希望，我可以把以上 Schema 直接整理为一份 `OpenAPI/JSON Schema` 草案或生成一份“Agent 使用手册”页内速查卡。
