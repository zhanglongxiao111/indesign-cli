import { runScript, formatResponse } from '../../core/runtime.js';
import { escapeJsxString } from '../../utils/stringUtils.js';
import { defineSpreadTool, spreadContract } from './_shared.js';

export const duplicateSpread = defineSpreadTool({
    name: 'duplicate_spread',
    description: 'Duplicate a spread',
    contract: spreadContract(),
    inputSchema: {
        additionalProperties: false,
        properties: {
            position: { default: 'AT_END', enum: ['AT_END', 'AT_BEGINNING', 'BEFORE', 'AFTER'], type: 'string' },
            referenceSpreadIndex: { description: 'Reference spread index (for BEFORE/AFTER positioning)', type: 'number' },
            spreadIndex: { description: 'Spread index to duplicate', type: 'number' }
        },
        required: ['spreadIndex'],
        type: 'object'
    },
    handler: async (args) => {
        const { spreadIndex, position = 'AT_END', referenceSpreadIndex } = args;
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${spreadIndex} >= doc.spreads.length) {`,
            '    "Spread index out of range";',
            '  } else {',
            `    var sp = doc.spreads[${spreadIndex}];`,
            '    var dup;',
            `    if ("${position}" === "AT_BEGINNING") {`,
            '      dup = sp.duplicate(LocationOptions.AT_BEGINNING);',
            `    } else if ("${position}" === "BEFORE" && ${referenceSpreadIndex} !== undefined) {`,
            `      dup = sp.duplicate(LocationOptions.BEFORE, doc.spreads[${referenceSpreadIndex}]);`,
            `    } else if ("${position}" === "AFTER" && ${referenceSpreadIndex} !== undefined) {`,
            `      dup = sp.duplicate(LocationOptions.AFTER, doc.spreads[${referenceSpreadIndex}]);`,
            '    } else {',
            '      dup = sp.duplicate();',
            '    }',
            '    "Spread duplicated. New index: " + dup.index;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Duplicate Spread');
    }
});

export const moveSpread = defineSpreadTool({
    name: 'move_spread',
    description: 'Move a spread to a different position',
    contract: spreadContract(),
    inputSchema: {
        additionalProperties: false,
        properties: {
            position: { default: 'AT_END', enum: ['AT_END', 'AT_BEGINNING', 'BEFORE', 'AFTER'], type: 'string' },
            referenceSpreadIndex: { description: 'Reference spread index (for BEFORE/AFTER positioning)', type: 'number' },
            spreadIndex: { description: 'Spread index to move', type: 'number' }
        },
        required: ['spreadIndex'],
        type: 'object'
    },
    handler: async (args) => {
        const { spreadIndex, position = 'AT_END', referenceSpreadIndex } = args;
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${spreadIndex} >= doc.spreads.length) {`,
            '    "Spread index out of range";',
            '  } else {',
            `    var sp = doc.spreads[${spreadIndex}];`,
            `    if ("${position}" === "AT_BEGINNING") {`,
            '      sp.move(LocationOptions.AT_BEGINNING);',
            `    } else if ("${position}" === "BEFORE" && ${referenceSpreadIndex} !== undefined) {`,
            `      sp.move(LocationOptions.BEFORE, doc.spreads[${referenceSpreadIndex}]);`,
            `    } else if ("${position}" === "AFTER" && ${referenceSpreadIndex} !== undefined) {`,
            `      sp.move(LocationOptions.AFTER, doc.spreads[${referenceSpreadIndex}]);`,
            '    } else {',
            '      sp.move(LocationOptions.AT_END);',
            '    }',
            '    "Spread moved.";',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Move Spread');
    }
});

export const deleteSpread = defineSpreadTool({
    name: 'delete_spread',
    description: 'Delete a spread',
    contract: spreadContract({ destructive: true }),
    inputSchema: {
        additionalProperties: false,
        properties: {
            spreadIndex: { description: 'Spread index to delete', type: 'number' }
        },
        required: ['spreadIndex'],
        type: 'object'
    },
    handler: async (args) => {
        const { spreadIndex } = args;
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${spreadIndex} >= doc.spreads.length) {`,
            '    "Spread index out of range";',
            '  } else {',
            `    doc.spreads[${spreadIndex}].remove();`,
            '    "Spread deleted";',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Delete Spread');
    }
});

export const setSpreadProperties = defineSpreadTool({
    name: 'set_spread_properties',
    description: 'Set properties for a spread',
    contract: spreadContract(),
    inputSchema: {
        additionalProperties: false,
        properties: {
            allowPageShuffle: { description: 'Allow page shuffle', type: 'boolean' },
            name: { description: 'Spread name/label', type: 'string' },
            pageTransitionDirection: {
                description: 'Page transition direction',
                enum: ['HORIZONTAL', 'VERTICAL', 'HORIZONTAL_IN', 'HORIZONTAL_OUT', 'VERTICAL_IN', 'VERTICAL_OUT', 'LEFT_TO_RIGHT', 'RIGHT_TO_LEFT', 'UP', 'DOWN', 'LEFT_UP', 'LEFT_DOWN', 'RIGHT_UP', 'RIGHT_DOWN', 'IN', 'OUT', 'NOT_APPLICABLE'],
                type: 'string'
            },
            pageTransitionDuration: { description: 'Page transition duration', enum: ['FAST', 'MEDIUM', 'SLOW'], type: 'string' },
            pageTransitionType: {
                description: 'Page transition type',
                enum: ['NONE', 'BLINDS_TRANSITION', 'BOX_TRANSITION', 'COMB_TRANSITION', 'COVER_TRANSITION', 'DISSOLVE_TRANSITION', 'FADE_TRANSITION', 'PUSH_TRANSITION', 'SPLIT_TRANSITION', 'UNCOVER_TRANSITION', 'WIPE_TRANSITION', 'ZOOM_IN_TRANSITION', 'ZOOM_OUT_TRANSITION'],
                type: 'string'
            },
            showMasterItems: { description: 'Show master items', type: 'boolean' },
            spreadHidden: { description: 'Hide/show spread', type: 'boolean' },
            spreadIndex: { description: 'Spread index', type: 'number' }
        },
        required: ['spreadIndex'],
        type: 'object'
    },
    handler: async (args) => {
        const { spreadIndex, name, allowPageShuffle, showMasterItems, spreadHidden } = args;
        const escapedName = name ? escapeJsxString(name) : '';
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${spreadIndex} >= doc.spreads.length) {`,
            '    "Spread index out of range";',
            '  } else {',
            `    var sp = doc.spreads[${spreadIndex}];`,
            `    if ("${escapedName}" !== "") try { sp.label = "${escapedName}"; } catch(e) {}`,
            `    if (${allowPageShuffle} !== undefined) sp.allowPageShuffle = ${!!allowPageShuffle};`,
            `    if (${showMasterItems} !== undefined) sp.showMasterItems = ${!!showMasterItems};`,
            `    if (${spreadHidden} !== undefined) try { sp.visible = ${!spreadHidden}; } catch(e) {}`,
            '    "Spread properties updated";',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Set Spread Properties');
    }
});

export const selectSpread = defineSpreadTool({
    name: 'select_spread',
    description: 'Select a spread',
    contract: spreadContract(),
    inputSchema: {
        additionalProperties: false,
        properties: {
            selectionMode: { default: 'REPLACE_WITH', enum: ['REPLACE_WITH', 'ADD_TO', 'REMOVE_FROM', 'SET_KEY'], type: 'string' },
            spreadIndex: { description: 'Spread index to select', type: 'number' }
        },
        required: ['spreadIndex'],
        type: 'object'
    },
    handler: async (args) => {
        const { spreadIndex, selectionMode = 'REPLACE_WITH' } = args;
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  if (${spreadIndex} >= doc.spreads.length) {`,
            '    "Spread index out of range";',
            '  } else {',
            `    var sp = doc.spreads[${spreadIndex}];`,
            '    try {',
            `      var mode = SelectionOptions.REPLACE_WITH;`,
            `      if ("${selectionMode}" === "ADD_TO") mode = SelectionOptions.ADD_TO;`,
            `      else if ("${selectionMode}" === "REMOVE_FROM") mode = SelectionOptions.REMOVE_FROM;`,
            `      else if ("${selectionMode}" === "SET_KEY") mode = SelectionOptions.SET_KEY;`,
            '      app.select(sp, mode);',
            '      "Spread selected";',
            '    } catch (e) {',
            '      "Error selecting spread: " + e.message;',
            '    }',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Select Spread');
    }
});

export const tools = [
    duplicateSpread,
    moveSpread,
    deleteSpread,
    setSpreadProperties,
    selectSpread
];
