/**
 * 高级模板编排工具定义
 * 这些工具组合现有基础能力，用于基于标签化模板的智能填充。
 */

export const advancedTemplateToolDefinitions = [
    {
        name: 'run_jsx_file',
        description: '执行本地 .jsx 脚本文件，返回执行结果或错误信息。',
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                filePath: {
                    type: 'string',
                    description: '要执行的 JSX 文件绝对路径。'
                }
            },
            required: ['filePath']
        }
    },
    {
        name: 'inspect_template_blueprint',
        description: '读取指定模板的槽位说明、页面备注以及 PageNotes 图层中的说明信息，输出结构化 JSON。',
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                templatePath: {
                    type: 'string',
                    description: '模板 INDD 文件的绝对路径。若省略，则使用当前已打开的文档。'
                }
            },
            required: []
        }
    },
    {
        name: 'list_template_blueprints',
        description: '概览当前文档内所有母版模板，返回每个模板的槽位数量和槽位名称列表，帮助 Agent 快速挑选合适模板。',
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {}
        }
    },
    {
        name: 'create_page_with_template',
        description: '新建页面并套用指定母版模板，随后自动 override 母版上的脚本标签元素，返回页面索引等信息。',
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                templateName: {
                    type: 'string',
                    description: '要套用的母版名称，例如 “A-封面”。'
                },
                position: {
                    type: 'string',
                    enum: ['AT_END', 'AT_BEGINNING', 'BEFORE', 'AFTER'],
                    description: '插入位置，默认为 AT_END。'
                },
                referencePageIndex: {
                    type: 'integer',
                    description: '当 position 为 BEFORE/AFTER 时使用的参考页索引。'
                },
                label: {
                    type: 'string',
                    description: '可选，为新页面设置脚本标签（label）。'
                }
            },
            required: ['templateName']
        }
    },
    {
        name: 'get_page_information',
        description: '返回指定页面当前套用的母版及脚本标签槽位详情，包含尺寸、文本预览、是否 override 等信息。',
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                pageIndex: {
                    type: 'integer',
                    description: '目标页面的索引（0 基）。'
                }
            },
            required: ['pageIndex']
        }
    },
    {
        name: 'populate_template_slots',
        description: '根据 inspect 结果返回的槽位名称，批量填充文本与图片，并可另存为成品文档。',
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                templatePath: {
                    type: 'string',
                    description: '模板 INDD 文件的绝对路径；若省略，则对当前打开的文档进行填充。'
                },
                pageIndex: {
                    type: 'integer',
                    description: '可选，仅对指定页面的槽位进行填充（0 基）。不提供时将遍历文档全部页面。'
                },
                outputPath: {
                    type: 'string',
                    description: '可选，保存成品文档的目标路径（未提供时仅在内存中修改后关闭而不保存）。'
                },
                values: {
                    type: 'object',
                    description: '键为模板中“槽位”字段的值，值描述填充内容。',
                    minProperties: 1,
                    additionalProperties: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            text: {
                                type: 'string',
                                description: '要填充到文本槽位中的内容。'
                            },
                            imagePath: {
                                type: 'string',
                                description: '要放入图片槽位的文件绝对路径。'
                            },
                            fit: {
                                type: 'string',
                                description: '图片填充规则，例如 PROPORTIONALLY、FILL_FRAME、FIT_CONTENT、FIT_FRAME、CENTER_CONTENT。',
                                enum: ['PROPORTIONALLY', 'FILL_FRAME', 'FIT_CONTENT', 'FIT_FRAME', 'CENTER_CONTENT']
                            },
                            clearExisting: {
                                type: 'boolean',
                                description: '如果槽位已有图片，是否在放新图前移除旧内容。'
                            },
                            declaredType: {
                                type: 'string',
                                description: '可选——覆盖标签中声明的槽位类型，主要用于提示校验。'
                            }
                        }
                    }
                }
            },
            required: ['values']
        }
    }
];
