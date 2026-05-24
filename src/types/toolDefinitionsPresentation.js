/**
 * Presentation tool definitions for InDesign MCP Server
 */

// 注释：演示功能对纯设计流程不必要，暂时屏蔽以节省token
export const presentationToolDefinitions = [
/*
  {
    name: 'create_presentation_document',
    description: 'Create a presentation document with preset or custom size',
    inputSchema: {
      type: 'object',
      properties: {
        preset: { type: 'string', enum: ['A3_LANDSCAPE', 'A4_LANDSCAPE', 'RATIO_16x9'], default: 'A3_LANDSCAPE' },
        width: { type: 'number', description: 'Custom page width in mm (overrides preset)' },
        height: { type: 'number', description: 'Custom page height in mm (overrides preset)' },
        pages: { type: 'number', description: 'Initial number of pages', default: 1 },
        facingPages: { type: 'boolean', description: 'Facing pages', default: false },
      },
    },
  },
  {
    name: 'add_cover_page',
    description: 'Add a cover page with title/subtitle and optional background image',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', default: '项目汇报' },
        subtitle: { type: 'string', default: '' },
        bgImagePath: { type: 'string', description: 'Background image file path (optional)' },
      },
    },
  },
  {
    name: 'add_section_page',
    description: 'Add a section page with large title',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string', default: '章节标题' },
            additionalProperties: false
        },
    },
  },
  {
    name: 'add_full_bleed_image',
    description: 'Add a full-bleed image page with optional caption',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Image path' },
        caption: { type: 'string', description: 'Optional caption' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'add_image_grid',
    description: 'Add an image grid page with rows/columns and gaps',
    inputSchema: {
      type: 'object',
      properties: {
        files: { type: 'array', description: 'Image file paths' },
        rows: { type: 'number', default: 2 },
        columns: { type: 'number', default: 3 },
        gap: { type: 'number', default: 6 },
      },
      required: ['files'],
    },
  },
  {
    name: 'export_presentation_pdf',
    description: 'Export the presentation as PDF (screen preset)',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', default: 'D:/Indesign-Exports/presentation.pdf' },
        preset: { type: 'string', default: 'High Quality Print' },
      },
    },
  },
*/
];

