import { runScript, formatResponse } from '../../core/runtime.js';
import { escapeJsxString } from '../../utils/stringUtils.js';
import { defineTool } from '../_contract.js';

const layerContract = {
    needsInDesign: true,
    requiresActiveDocument: false,
    mutatesDocument: true,
    writesFilesystem: false,
    producesArtifacts: false,
    destructive: false
};

export const createLayer = defineTool({
    name: 'create_layer',
    description: 'Create a new layer',
    domain: 'layer',
    profiles: ['classic'],
    cli: { id: 'layer.create_layer', aliases: [] },
    contract: {
        ...layerContract,
        requiresActiveDocument: true
    },
    inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            color: {
                default: 'BLUE',
                description: 'Layer color (RGB values as comma-separated string or UI color name)',
                type: 'string'
            },
            locked: {
                default: false,
                description: 'Layer locked state',
                type: 'boolean'
            },
            name: {
                description: 'Layer name',
                type: 'string'
            },
            visible: {
                default: true,
                description: 'Layer visibility',
                type: 'boolean'
            }
        },
        required: ['name']
    },
    handler: async (args) => {
        const { name, visible = true, locked = false, color = 'BLUE' } = args;
        const escapedName = escapeJsxString(name);
        const normalizedColor = typeof color === 'string' ? color.trim().toUpperCase() : 'BLUE';
        const safeColor = /^[A-Z_]+$/.test(normalizedColor) ? normalizedColor : 'BLUE';
        const escapedColor = escapeJsxString(safeColor);
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  try {',
            `    var layer = doc.layers.add({name: "${escapedName}"});`,
            `    layer.visible = ${!!visible};`,
            `    layer.locked = ${!!locked};`,
            `    try { layer.layerColor = UIColors["${escapedColor}"]; } catch(e) {}`,
            `    "Layer created: ${escapedName}";`,
            '  } catch (e) {',
            '    "Error creating layer: " + e.message;',
            '  }',
            '}'
        ].join('\n');
        const result = await runScript(script);
        return formatResponse(result, 'Create Layer');
    }
});

export const setActiveLayer = defineTool({
    name: 'set_active_layer',
    description: 'Set the active layer',
    domain: 'layer',
    profiles: ['classic'],
    cli: { id: 'layer.set_active_layer', aliases: [] },
    contract: layerContract,
    inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            layerName: {
                description: 'Layer name to activate',
                type: 'string'
            }
        },
        required: ['layerName']
    },
    handler: async (args) => {
        const { layerName } = args;
        const escaped = escapeJsxString(layerName);
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  var layer = doc.layers.itemByName("${escaped}");`,
            '  if (!layer.isValid) {',
            `    "Layer not found: ${escaped}";`,
            '  } else {',
            '    doc.activeLayer = layer;',
            `    "Active layer set: ${escaped}";`,
            '  }',
            '}'
        ].join('\n');
        const result = await runScript(script);
        return formatResponse(result, 'Set Active Layer');
    }
});

export const listLayers = defineTool({
    name: 'list_layers',
    description: 'List all layers in the document',
    domain: 'layer',
    profiles: ['classic'],
    cli: { id: 'layer.list_layers', aliases: [] },
    contract: {
        needsInDesign: true,
        requiresActiveDocument: false,
        mutatesDocument: false,
        writesFilesystem: false,
        producesArtifacts: false,
        destructive: false
    },
    inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {}
    },
    handler: async () => {
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var info = "=== LAYERS ===\\n";',
            '  for (var i=0;i<doc.layers.length;i++){',
            '    var l = doc.layers[i];',
            '    info += "Index: " + i + "\\n";',
            '    info += "Name: " + l.name + "\\n";',
            '    info += "Visible: " + l.visible + "\\n";',
            '    info += "Locked: " + l.locked + "\\n---\\n";',
            '  }',
            '  info;',
            '}'
        ].join('\n');
        const result = await runScript(script);
        return formatResponse(result, 'List Layers');
    }
});

export const tools = [createLayer, listLayers, setActiveLayer];
