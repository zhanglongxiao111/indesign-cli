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

        const result = await runScript(script, { disableRedraw: true });

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
            Array.isArray(row)
                ? row.map(cell => escapeJsxString(cell == null ? '' : cell.toString()))
                : []
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
            '      // Populate table with data (prefer batch table.contents assignment)',
            `      var data = ${JSON.stringify(escapedData)};`,
            `      var startRow = ${startRow};`,
            `      var startColumn = ${startColumn};`,
            '      var totalRows = table.rows.length;',
            '      var totalCols = table.columns.length;',
            '      var expectedCellCount = totalRows * totalCols;',
            '      var batchApplied = false;',
            '',
            '      if (data.length === 0) {',
            '        batchApplied = true;',
            '      } else if (expectedCellCount > 0 && table.cells && table.cells.length === expectedCellCount) {',
            '        try {',
            '          var isFullOverwrite = (startRow === 0 && startColumn === 0 && data.length >= totalRows);',
            '          if (isFullOverwrite) {',
            '            for (var fr = 0; fr < totalRows; fr++) {',
            '              if (!data[fr] || data[fr].length < totalCols) {',
            '                isFullOverwrite = false;',
            '                break;',
            '              }',
            '            }',
            '          }',
            '',
            '          var flatArray = null;',
            '          if (isFullOverwrite) {',
            '            flatArray = new Array(expectedCellCount);',
            '            for (var r = 0; r < totalRows; r++) {',
            '              for (var c = 0; c < totalCols; c++) {',
            '                flatArray[r * totalCols + c] = data[r][c];',
            '              }',
            '            }',
            '          } else {',
            '            var existingContents = table.contents;',
            '            if (existingContents && existingContents.length === expectedCellCount) {',
            '              flatArray = new Array(expectedCellCount);',
            '              for (var k = 0; k < expectedCellCount; k++) {',
            '                flatArray[k] = existingContents[k];',
            '              }',
            '              for (var pr = 0; pr < data.length; pr++) {',
            '                if (!data[pr]) continue;',
            '                for (var pc = 0; pc < data[pr].length; pc++) {',
            '                  var targetRow = startRow + pr;',
            '                  var targetCol = startColumn + pc;',
            '                  if (targetRow >= 0 && targetCol >= 0 && targetRow < totalRows && targetCol < totalCols) {',
            '                    flatArray[targetRow * totalCols + targetCol] = data[pr][pc];',
            '                  }',
            '                }',
            '              }',
            '            }',
            '          }',
            '',
            '          if (flatArray) {',
            '            table.contents = flatArray;',
            '            batchApplied = true;',
            '          }',
            '        } catch (_batchErr) {',
            '          batchApplied = false;',
            '        }',
            '      }',
            '',
            '      if (!batchApplied) {',
            '        for (var row = 0; row < data.length; row++) {',
            '          if (!data[row]) continue;',
            '          for (var col = 0; col < data[row].length; col++) {',
            '            var cellRow = startRow + row;',
            '            var cellCol = startColumn + col;',
            '',
            '            if (cellRow >= 0 && cellCol >= 0 && cellRow < totalRows && cellCol < totalCols) {',
            '              var cell = table.cells.item(cellRow, cellCol);',
            '              cell.contents = data[row][col];',
            '            }',
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

        const result = await runScript(script, { disableRedraw: true });
        return formatResponse(result, "Populate Table");
    }
});

export const tools = [createTable, populateTable];
