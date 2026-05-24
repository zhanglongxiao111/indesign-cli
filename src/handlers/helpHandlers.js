import { formatResponse, formatErrorResponse } from '../utils/stringUtils.js';

/**
 * Help Handlers
 * Provides comprehensive help information for the InDesign MCP Server
 */
export class HelpHandlers {

    // Tool categories and their descriptions
    static toolCategories = {
        document: {
            name: 'Document Management',
            description: 'Create, open, save, and manage InDesign documents',
            tools: ['create_document', 'open_document', 'save_document', 'close_document', 'get_document_info']
        },
        page: {
            name: 'Page Operations',
            description: 'Add, delete, navigate, and manage pages',
            tools: ['add_page', 'delete_page', 'navigate_to_page', 'get_page_info', 'set_page_background']
        },
        text: {
            name: 'Text & Typography',
            description: 'Create and edit text frames, apply styles',
            tools: ['create_text_frame', 'edit_text_frame', 'get_text_info', 'apply_paragraph_style', 'apply_character_style']
        },
        graphics: {
            name: 'Graphics & Images',
            description: 'Create shapes and place images with scaling',
            tools: ['create_rectangle', 'create_ellipse', 'create_polygon', 'place_image', 'get_image_info']
        },
        styles: {
            name: 'Styles & Colors',
            description: 'Create and manage colors, paragraph, character, and object styles',
            tools: ['create_color_swatch', 'list_color_swatches', 'create_paragraph_style', 'create_character_style', 'create_object_style', 'list_styles']
        },
        layout: {
            name: 'Layout & Positioning',
            description: 'Group objects, create master spreads, manage positioning',
            tools: ['create_group', 'ungroup', 'create_master_spread', 'apply_master_spread']
        },
        export: {
            name: 'Export & Utilities',
            description: 'Export documents and run custom code',
            tools: ['export_pdf', 'export_images', 'execute_indesign_code']
        }
    };

    // Tool definitions with detailed information
    static toolDefinitions = {
        create_document: {
            name: 'create_document',
            description: 'Create a new InDesign document',
            parameters: {
                name: 'Document name',
                width: 'Page width in mm (default: 210)',
                height: 'Page height in mm (default: 297)',
                facingPages: 'Enable facing pages (default: false)',
                pageOrientation: 'PORTRAIT or LANDSCAPE (default: PORTRAIT)',
                marginTop: 'Top margin in mm (default: 25)',
                marginBottom: 'Bottom margin in mm (default: 25)',
                marginLeft: 'Left margin in mm (default: 25)',
                marginRight: 'Right margin in mm (default: 25)'
            },
            example: {
                name: 'My Document',
                width: 210,
                height: 297,
                facingPages: false,
                pageOrientation: 'PORTRAIT'
            }
        },
        create_text_frame: {
            name: 'create_text_frame',
            description: 'Create a text frame with content',
            parameters: {
                content: 'Text content to display',
                x: 'X position in mm (default: 10)',
                y: 'Y position in mm (default: 10)',
                width: 'Frame width in mm',
                height: 'Frame height in mm',
                fontSize: 'Font size in points (default: 12)',
                fontName: 'Font name in format "FontName\\tStyle" (default: "Arial\\tRegular")',
                textColor: 'Text color name (default: "Black")',
                alignment: 'Text alignment: LEFT, CENTER, RIGHT, JUSTIFY (default: LEFT)',
                paragraphStyle: 'Paragraph style name to apply (optional)',
                characterStyle: 'Character style name to apply (optional)'
            },
            example: {
                content: 'Hello World',
                x: 25,
                y: 25,
                width: 160,
                height: 50,
                fontSize: 24,
                fontName: 'Arial\\tBold',
                alignment: 'CENTER'
            }
        },
        place_image: {
            name: 'place_image',
            description: 'Place an image on the active page with scaling options',
            parameters: {
                filePath: 'Absolute path to the image file (required)',
                x: 'X position in mm (default: 10)',
                y: 'Y position in mm (default: 10)',
                width: 'Frame width in mm',
                height: 'Frame height in mm',
                scale: 'Scale percentage 1-1000 (default: 100)',
                fitMode: 'Fitting mode: PROPORTIONALLY, FILL_FRAME, FIT_CONTENT, FIT_FRAME (default: PROPORTIONALLY)',
                linkImage: 'Link the image (default: true)'
            },
            example: {
                filePath: '/path/to/image.jpg',
                x: 25,
                y: 25,
                width: 100,
                height: 75,
                scale: 150,
                fitMode: 'PROPORTIONALLY'
            }
        },
        create_color_swatch: {
            name: 'create_color_swatch',
            description: 'Create a custom color swatch',
            parameters: {
                name: 'Color name (required)',
                colorType: 'Color type: PROCESS or SPOT (default: PROCESS)',
                red: 'Red value 0-255 (required)',
                green: 'Green value 0-255 (required)',
                blue: 'Blue value 0-255 (required)'
            },
            example: {
                name: 'Brand Blue',
                colorType: 'PROCESS',
                red: 0,
                green: 114,
                blue: 198
            }
        },
        create_paragraph_style: {
            name: 'create_paragraph_style',
            description: 'Create a paragraph style for consistent typography',
            parameters: {
                name: 'Style name (required)',
                fontName: 'Font name in format "FontName\\tStyle" (default: "Arial\\tRegular")',
                fontSize: 'Font size in points (default: 12)',
                fillColor: 'Text color name (default: "Black")',
                alignment: 'Text alignment: LEFT, CENTER, RIGHT, JUSTIFY (default: LEFT)',
                leading: 'Line spacing in points (optional)',
                spaceBefore: 'Space before paragraph in points (optional)',
                spaceAfter: 'Space after paragraph in points (optional)'
            },
            example: {
                name: 'Heading 1',
                fontName: 'Arial\\tBold',
                fontSize: 32,
                fillColor: 'Brand Blue',
                alignment: 'CENTER'
            }
        },
        set_page_background: {
            name: 'set_page_background',
            description: 'Set the background color of a page',
            parameters: {
                pageIndex: 'Page index (0-based) (required)',
                backgroundColor: 'Color swatch name (default: "White")',
                opacity: 'Opacity percentage 0-100 (default: 100)'
            },
            example: {
                pageIndex: 0,
                backgroundColor: 'Brand Blue',
                opacity: 50
            }
        }
    };

    /**
     * Get help information
     */
    static async getHelp(args) {
        const { tool, category, format } = args;

        try {
            // If specific tool requested
            if (tool) {
                return this.getToolHelp(tool, format);
            }

            // If category requested
            if (category && category !== 'all') {
                return this.getCategoryHelp(category, format);
            }

            // Default: show all tools summary
            return this.getAllToolsHelp(format);

        } catch (error) {
            return formatErrorResponse(`Error getting help: ${error.message}`, 'Get Help');
        }
    }

    /**
     * Get help for a specific tool
     */
    static getToolHelp(toolName, format = 'summary') {
        const toolDef = this.toolDefinitions[toolName];

        if (!toolDef) {
            return formatErrorResponse(`Tool '${toolName}' not found. Use 'help' without parameters to see all available tools.`, 'Get Help');
        }

        let helpText = `# ${toolDef.name}\n\n`;
        helpText += `**Description:** ${toolDef.description}\n\n`;

        if (format === 'detailed' || format === 'examples') {
            helpText += `## Parameters\n\n`;
            for (const [param, desc] of Object.entries(toolDef.parameters)) {
                helpText += `- **${param}**: ${desc}\n`;
            }
            helpText += '\n';
        }

        if (format === 'examples') {
            helpText += `## Example\n\n`;
            helpText += '```javascript\n';
            helpText += `await tools.call("${toolName}", ${JSON.stringify(toolDef.example, null, 2)});\n`;
            helpText += '```\n\n';
        }

        return formatResponse(helpText, 'Get Help');
    }

    /**
     * Get help for a specific category
     */
    static getCategoryHelp(category, format = 'summary') {
        const catInfo = this.toolCategories[category];

        if (!catInfo) {
            return formatErrorResponse(`Category '${category}' not found. Available categories: ${Object.keys(this.toolCategories).join(', ')}`, 'Get Help');
        }

        let helpText = `# ${catInfo.name}\n\n`;
        helpText += `${catInfo.description}\n\n`;

        helpText += `## Available Tools\n\n`;
        for (const toolName of catInfo.tools) {
            const toolDef = this.toolDefinitions[toolName];
            if (toolDef) {
                helpText += `- **${toolName}**: ${toolDef.description}\n`;
            } else {
                helpText += `- **${toolName}**: Tool available\n`;
            }
        }

        if (format === 'detailed') {
            helpText += '\n## Detailed Information\n\n';
            for (const toolName of catInfo.tools) {
                const toolDef = this.toolDefinitions[toolName];
                if (toolDef) {
                    helpText += `### ${toolName}\n`;
                    helpText += `${toolDef.description}\n\n`;
                    helpText += '**Parameters:**\n';
                    for (const [param, desc] of Object.entries(toolDef.parameters)) {
                        helpText += `- ${param}: ${desc}\n`;
                    }
                    helpText += '\n';
                }
            }
        }

        return formatResponse(helpText, 'Get Help');
    }

    /**
     * Get help for all tools
     */
    static getAllToolsHelp(format = 'summary') {
        let helpText = `# InDesign MCP Server - Available Tools\n\n`;
        helpText += `This server provides programmatic access to Adobe InDesign through Model Context Protocol (MCP).\n\n`;

        helpText += `## Quick Start\n\n`;
        helpText += `1. **Create a document**: \`create_document\`\n`;
        helpText += `2. **Add text**: \`create_text_frame\`\n`;
        helpText += `3. **Add images**: \`place_image\`\n`;
        helpText += `4. **Create styles**: \`create_paragraph_style\`, \`create_color_swatch\`\n`;
        helpText += `5. **Save**: \`save_document\`\n\n`;

        helpText += `## Tool Categories\n\n`;

        for (const [category, info] of Object.entries(this.toolCategories)) {
            helpText += `### ${info.name}\n`;
            helpText += `${info.description}\n\n`;

            if (format === 'summary') {
                helpText += `**Tools:** ${info.tools.join(', ')}\n\n`;
            } else {
                for (const toolName of info.tools) {
                    const toolDef = this.toolDefinitions[toolName];
                    if (toolDef) {
                        helpText += `- **${toolName}**: ${toolDef.description}\n`;
                    } else {
                        helpText += `- **${toolName}**: Tool available\n`;
                    }
                }
                helpText += '\n';
            }
        }

        helpText += `## Usage Examples\n\n`;
        helpText += `### Basic Document Creation\n`;
        helpText += '```javascript\n';
        helpText += '// Create document\n';
        helpText += 'await tools.call("create_document", {\n';
        helpText += '  name: "My Document",\n';
        helpText += '  width: 210,\n';
        helpText += '  height: 297\n';
        helpText += '});\n\n';
        helpText += '// Add text\n';
        helpText += 'await tools.call("create_text_frame", {\n';
        helpText += '  content: "Hello World",\n';
        helpText += '  x: 25, y: 25,\n';
        helpText += '  width: 160, height: 50,\n';
        helpText += '  fontSize: 24,\n';
        helpText += '  fontName: "Arial\\\\tBold"\n';
        helpText += '});\n\n';
        helpText += '// Save\n';
        helpText += 'await tools.call("save_document", { filePath: "./output.indd" });\n';
        helpText += '```\n\n';

        helpText += `## Help Options\n\n`;
        helpText += `- \`help()\` - Show this overview\n`;
        helpText += `- \`help({ tool: "create_document" })\` - Get help for specific tool\n`;
        helpText += `- \`help({ category: "text" })\` - Get help for tool category\n`;
        helpText += `- \`help({ format: "detailed" })\` - Get detailed information\n`;
        helpText += `- \`help({ format: "examples" })\` - Get examples\n\n`;

        helpText += `## Important Notes\n\n`;
        helpText += `- **Font Names**: Use format "FontName\\\\tStyle" (e.g., "Arial\\\\tBold")\n`;
        helpText += `- **Colors**: RGB values (0-255) for color swatches\n`;
        helpText += `- **Positioning**: x, y coordinates in millimeters\n`;
        helpText += `- **Image Paths**: Use absolute file paths\n`;
        helpText += `- **Scaling**: 1-1000% for images\n`;

        return formatResponse(helpText, 'Get Help');
    }
} 