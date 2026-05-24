/**
 * Utility tool definitions for InDesign MCP Server
 * Utility functions and custom execution capabilities
 */

export const utilityToolDefinitions = [
    // =================== UTILITY TOOLS ===================
    {
        name: 'execute_indesign_code',
        description: 'Execute custom InDesign ExtendScript code',
        inputSchema: {
            type: 'object',
            properties: {
                code: { type: 'string', description: 'ExtendScript code to execute' },
            },
            required: ['code'],
        },
    },
    {
        name: 'view_document',
        description: 'View document information and current state',
        inputSchema: { type: 'object', properties: {},
            additionalProperties: false
        },
    },
    {
        name: 'get_session_info',
        description: 'Get current session information including page dimensions and active document',
        inputSchema: { type: 'object', properties: {},
            additionalProperties: false
        },
    },
    {
        name: 'clear_session',
        description: 'Clear all session data including page dimensions and document information',
        inputSchema: { type: 'object', properties: {},
            additionalProperties: false
        },
    },
]; 