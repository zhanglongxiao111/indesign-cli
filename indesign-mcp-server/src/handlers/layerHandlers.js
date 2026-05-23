/**
 * Layer management handlers
 */
import { ScriptExecutor } from '../core/scriptExecutor.js';
import { formatResponse, escapeJsxString } from '../utils/stringUtils.js';

export class LayerHandlers {
    static async createLayer(args) {
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
        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, 'Create Layer');
    }

    static async setActiveLayer(args) {
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
        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, 'Set Active Layer');
    }

    static async listLayers() {
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
        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, 'List Layers');
    }
}
