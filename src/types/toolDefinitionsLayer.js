/**
 * Layer tool definitions for InDesign MCP Server
 * Layer management and functionality
 */

export const layerToolDefinitions = [
    // =================== LAYERS MANAGEMENT ===================
    {
        name: 'create_layer',
        description: 'Create a new layer',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Layer name' },
                visible: { type: 'boolean', description: 'Layer visibility', default: true },
                locked: { type: 'boolean', description: 'Layer locked state', default: false },
                color: { type: 'string', description: 'Layer color (RGB values as comma-separated string or UI color name)', default: 'BLUE' },
            },
            required: ['name'],
        },
    },
    {
        name: 'set_active_layer',
        description: 'Set the active layer',
        inputSchema: {
            type: 'object',
            properties: {
                layerName: { type: 'string', description: 'Layer name to activate' },
            },
            required: ['layerName'],
        },
    },
    {
        name: 'list_layers',
        description: 'List all layers in the document',
        inputSchema: { type: 'object', properties: {},
            additionalProperties: false
        },
    },
]; 