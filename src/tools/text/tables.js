import { runScript, formatResponse } from '../../core/runtime.js';
import { sessionManager } from '../../core/sessionManager.js';
import { escapeJsxString } from '../../utils/stringUtils.js';
import { defineTool } from '../_contract.js';

export const createTable = defineTool({
    name: 'create_table',
    description: 'Create a table on the active page',
    domain: 'text',
    profiles: ['classic'],
    cli: { id: 'text.create_table', aliases: [] },
    contract: {
        needsInDesign: true,
        requiresActiveDocument: true,
        mutatesDocument: true,
        writesFilesystem: false,
        producesArtifacts: false,
        destructive: false
    },
    inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            rows: { type: 'number', description: 'Number of rows', default: 3 },
            columns: { type: 'number', description: 'Number of columns', default: 3 },
            x: { type: 'number', description: 'X position in mm' },
            y: { type: 'number', description: 'Y position in mm' },
            width: { type: 'number', description: 'Table width in mm' },
            height: { type: 'number', description: 'Table height in mm' },
            headerRows: { type: 'number', description: 'Number of header rows', default: 1 },
            headerColumns: { type: 'number', description: 'Number of header columns', default: 0 },
        },
        required: ['rows', 'columns'],
    },
    handler: async (args) => {
        const {
            rows = 3,
            columns = 3,
            x,
            y,
            width,
            height,
            headerRows = 1,
            headerColumns = 0
        } = args;

        // Use session manager for positioning if coordinates not provided
        const positioning = sessionManager.getCalculatedPositioning({ x, y, width, height });

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var page = app.activeWindow.activePage || doc.pages[0];',
            '  var table;',
            '',
            '  try {',
            '    // Create text frame for table',
            '    var textFrame = page.textFrames.add();',
            `    textFrame.geometricBounds = [${positioning.y}, ${positioning.x}, ${positioning.y + positioning.height}, ${positioning.x + positioning.width}];`,
            '',
            '    // Create table',
            `    table = textFrame.insertionPoints[0].tables.add({bodyRowCount: ${rows}, bodyColumnCount: ${columns}});`,
            '',
            '    // Set header rows and columns',
            `    try { table.headerRowCount = ${headerRows}; } catch (headerRowError) {}`,
            `    try { table.headerColumnCount = ${headerColumns}; } catch (headerColumnError) {}`,
            '',
            '    "Table created successfully";',
            '  } catch (error) {',
            '    "Error creating table: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);

        // Store the created item info in session
        sessionManager.setLastCreatedItem({
            type: 'table',
            rows: rows,
            columns: columns,
            position: positioning,
            headerRows: headerRows,
            headerColumns: headerColumns
        });

        return formatResponse(result, "Create Table");
    }
});

export const populateTable = defineTool({
    name: 'populate_table',
    description: 'Populate a table with data',
    domain: 'text',
    profiles: ['classic'],
    cli: { id: 'text.populate_table', aliases: [] },
    contract: {
        needsInDesign: true,
        requiresActiveDocument: false,
        mutatesDocument: true,
        writesFilesystem: false,
        producesArtifacts: false,
        destructive: false
    },
    inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            tableIndex: { type: 'number', description: 'Table index', default: 0 },
            data: { type: 'array', description: 'Array of arrays containing table data' },
            startRow: { type: 'number', description: 'Starting row index', default: 0 },
            startColumn: { type: 'number', description: 'Starting column index', default: 0 },
        },
        required: ['data'],
    },
    handler: async (args) => {
        const {
            tableIndex = 0,
            data,
            startRow = 0,
            startColumn = 0
        } = args;

        if (!data || !Array.isArray(data)) {
            return formatResponse("Invalid data provided. Expected array of arrays.", "Populate Table");
        }

        const escapedData = data.map(row =>
            row.map(cell => escapeJsxString(cell.toString()))
        );

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var page = app.activeWindow.activePage || doc.pages[0];',
            '',
            '  try {',
            '    // Find table in text frames',
            '    var table = null;',
            '    var tableCount = 0;',
            '',
            '    for (var i = 0; i < page.textFrames.length; i++) {',
            '      var textFrame = page.textFrames[i];',
            '      if (textFrame.tables.length > 0) {',
            `        if (tableCount === ${tableIndex}) {`,
            '          table = textFrame.tables[0];',
            '          break;',
            '        }',
            '        tableCount++;',
            '      }',
            '    }',
            '',
            '    if (!table) {',
            `      "Table index ${tableIndex} not found";`,
            '    } else {',
            '      // Populate table with data',
            `      var data = ${JSON.stringify(escapedData)};`,
            `      var startRow = ${startRow};`,
            `      var startColumn = ${startColumn};`,
            '',
            '      for (var row = 0; row < data.length; row++) {',
            '        for (var col = 0; col < data[row].length; col++) {',
            '          var cellRow = startRow + row;',
            '          var cellCol = startColumn + col;',
            '',
            '          if (cellRow < table.rows.length && cellCol < table.columns.length) {',
            '            var cell = table.cells.item(cellRow, cellCol);',
            '            cell.contents = data[row][col];',
            '          }',
            '        }',
            '      }',
            '',
            '      "Table populated successfully";',
            '    }',
            '  } catch (error) {',
            '    "Error populating table: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Populate Table");
    }
});

export const tools = [createTable, populateTable];
