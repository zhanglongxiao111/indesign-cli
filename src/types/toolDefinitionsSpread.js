/**
 * Spread tool definitions for InDesign MCP Server
 * Spread management and functionality
 */

export const spreadToolDefinitions = [
    // =================== SPREAD MANAGEMENT ===================
    {
        name: 'list_spreads',
        description: 'List all spreads in the document',
        inputSchema: { type: 'object', properties: {},
            additionalProperties: false
        },
    },
    {
        name: 'get_spread_info',
        description: 'Get detailed information about a specific spread',
        inputSchema: {
            type: 'object',
            properties: {
                spreadIndex: { type: 'number', description: 'Spread index (0-based)' },
            },
            required: ['spreadIndex'],
        },
    },
    {
        name: 'duplicate_spread',
        description: 'Duplicate a spread',
        inputSchema: {
            type: 'object',
            properties: {
                spreadIndex: { type: 'number', description: 'Spread index to duplicate' },
                position: { type: 'string', enum: ['AT_END', 'AT_BEGINNING', 'BEFORE', 'AFTER'], default: 'AT_END' },
                referenceSpreadIndex: { type: 'number', description: 'Reference spread index (for BEFORE/AFTER positioning)' },
            },
            required: ['spreadIndex'],
        },
    },
    {
        name: 'move_spread',
        description: 'Move a spread to a different position',
        inputSchema: {
            type: 'object',
            properties: {
                spreadIndex: { type: 'number', description: 'Spread index to move' },
                position: { type: 'string', enum: ['AT_END', 'AT_BEGINNING', 'BEFORE', 'AFTER'], default: 'AT_END' },
                referenceSpreadIndex: { type: 'number', description: 'Reference spread index (for BEFORE/AFTER positioning)' },
            },
            required: ['spreadIndex'],
        },
    },
    {
        name: 'delete_spread',
        description: 'Delete a spread',
        inputSchema: {
            type: 'object',
            properties: {
                spreadIndex: { type: 'number', description: 'Spread index to delete' },
            },
            required: ['spreadIndex'],
        },
    },
    {
        name: 'set_spread_properties',
        description: 'Set properties for a spread',
        inputSchema: {
            type: 'object',
            properties: {
                spreadIndex: { type: 'number', description: 'Spread index' },
                name: { type: 'string', description: 'Spread name/label' },
                allowPageShuffle: { type: 'boolean', description: 'Allow page shuffle' },
                showMasterItems: { type: 'boolean', description: 'Show master items' },
                spreadHidden: { type: 'boolean', description: 'Hide/show spread' },
                pageTransitionType: { type: 'string', enum: ['NONE', 'BLINDS_TRANSITION', 'BOX_TRANSITION', 'COMB_TRANSITION', 'COVER_TRANSITION', 'DISSOLVE_TRANSITION', 'FADE_TRANSITION', 'PUSH_TRANSITION', 'SPLIT_TRANSITION', 'UNCOVER_TRANSITION', 'WIPE_TRANSITION', 'ZOOM_IN_TRANSITION', 'ZOOM_OUT_TRANSITION'], description: 'Page transition type' },
                pageTransitionDirection: { type: 'string', enum: ['HORIZONTAL', 'VERTICAL', 'HORIZONTAL_IN', 'HORIZONTAL_OUT', 'VERTICAL_IN', 'VERTICAL_OUT', 'LEFT_TO_RIGHT', 'RIGHT_TO_LEFT', 'UP', 'DOWN', 'LEFT_UP', 'LEFT_DOWN', 'RIGHT_UP', 'RIGHT_DOWN', 'IN', 'OUT', 'NOT_APPLICABLE'], description: 'Page transition direction' },
                pageTransitionDuration: { type: 'string', enum: ['FAST', 'MEDIUM', 'SLOW'], description: 'Page transition duration' },
            },
            required: ['spreadIndex'],
        },
    },
    {
        name: 'create_spread_guides',
        description: 'Create guides on a spread',
        inputSchema: {
            type: 'object',
            properties: {
                spreadIndex: { type: 'number', description: 'Spread index' },
                numberOfRows: { type: 'number', description: 'Number of rows', default: 0 },
                numberOfColumns: { type: 'number', description: 'Number of columns', default: 0 },
                rowGutter: { type: 'number', description: 'Row gutter in mm', default: 5 },
                columnGutter: { type: 'number', description: 'Column gutter in mm', default: 5 },
                guideColor: { type: 'string', description: 'Guide color (RGB values as comma-separated string or UI color name)', default: 'BLUE' },
                fitMargins: { type: 'boolean', description: 'Fit guides to margins', default: true },
                removeExisting: { type: 'boolean', description: 'Remove existing guides', default: false },
                layerName: { type: 'string', description: 'Layer name to create guides on' },
            },
            required: ['spreadIndex'],
        },
    },
    {
        name: 'place_file_on_spread',
        description: 'Place a file on a spread',
        inputSchema: {
            type: 'object',
            properties: {
                spreadIndex: { type: 'number', description: 'Spread index' },
                filePath: { type: 'string', description: 'Path to file to place' },
                x: { type: 'number', description: 'X position in mm', default: 10 },
                y: { type: 'number', description: 'Y position in mm', default: 10 },
                layerName: { type: 'string', description: 'Layer name to place on' },
                showingOptions: { type: 'boolean', description: 'Show import options dialog', default: false },
                autoflowing: { type: 'boolean', description: 'Autoflow placed text', default: false },
                pageIndexWithinSpread: { type: 'number', description: 'Page index within the spread (0-based)', default: 0 },
            },
            required: ['spreadIndex', 'filePath'],
        },
    },
    /* 注释：XML内容放置功能对纯设计流程不必要
    {
        name: 'place_xml_on_spread',
        description: 'Place XML content on a spread',
        inputSchema: {
            type: 'object',
            properties: {
                spreadIndex: { type: 'number', description: 'Spread index' },
                xmlElementName: { type: 'string', description: 'XML element name to place' },
                x: { type: 'number', description: 'X position in mm', default: 10 },
                y: { type: 'number', description: 'Y position in mm', default: 10 },
                autoflowing: { type: 'boolean', description: 'Autoflow placed text', default: false },
            },
            required: ['spreadIndex', 'xmlElementName'],
        },
    },
    */
    {
        name: 'select_spread',
        description: 'Select a spread',
        inputSchema: {
            type: 'object',
            properties: {
                spreadIndex: { type: 'number', description: 'Spread index to select' },
                selectionMode: { type: 'string', enum: ['REPLACE_WITH', 'ADD_TO', 'REMOVE_FROM', 'SET_KEY'], default: 'REPLACE_WITH' },
            },
            required: ['spreadIndex'],
        },
    },
    {
        name: 'get_spread_content_summary',
        description: 'Get a summary of content on a spread',
        inputSchema: {
            type: 'object',
            properties: {
                spreadIndex: { type: 'number', description: 'Spread index' },
            },
            required: ['spreadIndex'],
        },
    },
]; 