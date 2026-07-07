import { runScript, formatResponse } from '../../core/runtime.js';
import { escapeJsxString } from '../../utils/stringUtils.js';
import { defineTool } from '../_contract.js';
import { DOMAIN, PROFILES, contract, readOnlyContract } from './_shared.js';

function masterSpreadLookupLines({ masterIndex, name }) {
    const indexLiteral = Number.isInteger(masterIndex) ? String(masterIndex) : 'null';
    const escapedName = escapeJsxString(name);
    return [
        `  var requestedMasterIndex = ${indexLiteral};`,
        `  var requestedMasterName = "${escapedName}";`,
        '  var masterSpread = null;',
        '  var masterSpreadError = "";',
        '  if (requestedMasterIndex !== null) {',
        '    if (requestedMasterIndex < 0 || requestedMasterIndex >= doc.masterSpreads.length) {',
        '      masterSpreadError = "Error: Master spread index out of range";',
        '    } else {',
        '      masterSpread = doc.masterSpreads[requestedMasterIndex];',
        '    }',
        '  } else {',
        '    masterSpread = doc.masterSpreads.itemByName(requestedMasterName);',
        '    if (!masterSpread || !masterSpread.isValid) {',
        '      masterSpreadError = "Error: Master spread not found: " + requestedMasterName;',
        '    }',
        '  }'
    ];
}

export const createMasterSpread = defineTool({
    name: 'create_master_spread',
    description: 'Create a new master spread',
    domain: DOMAIN,
    profiles: PROFILES,
    cli: { id: 'master.create_master_spread', aliases: [] },
    contract: contract({ requiresActiveDocument: true }),
    inputSchema: {
        additionalProperties: false,
        properties: {
            baseName: { description: 'Base name for the master spread', type: 'string' },
            name: { description: 'Master spread name', type: 'string' },
            namePrefix: { description: 'Name prefix for the master spread', type: 'string' },
            pageColor: { description: 'Page color (RGB values as comma-separated string or UI color name)', type: 'string' },
            showMasterItems: { default: true, description: 'Show master items on document pages', type: 'boolean' }
        },
        required: ['name'],
        type: 'object'
    },
    handler: async (args) => {
        const { name, namePrefix, baseName, showMasterItems = true } = args;

        let resolvedNamePrefix = namePrefix;
        let resolvedBaseName = baseName;
        if (name && (!resolvedNamePrefix || !resolvedBaseName)) {
            const match = String(name).match(/^([A-Za-z]+)-(.+)$/);
            if (match) {
                resolvedNamePrefix = resolvedNamePrefix || match[1];
                resolvedBaseName = resolvedBaseName || match[2];
            } else {
                resolvedBaseName = resolvedBaseName || name;
            }
        }

        const escapedNamePrefix = escapeJsxString(resolvedNamePrefix);
        const escapedBaseName = escapeJsxString(resolvedBaseName);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var masterSpread = null;',
            ...(resolvedNamePrefix ? [
                `  for (var i = 0; i < doc.masterSpreads.length; i++) {`,
                `    if (doc.masterSpreads[i].namePrefix === "${escapedNamePrefix}") { masterSpread = doc.masterSpreads[i]; break; }`,
                '  }'
            ] : []),
            '  if (masterSpread === null) {',
            '    masterSpread = doc.masterSpreads.add();',
            ...(resolvedNamePrefix ? [`    masterSpread.namePrefix = "${escapedNamePrefix}";`] : []),
            '  }',
            '',
            `  masterSpread.showMasterItems = ${showMasterItems};`,
            ...(resolvedBaseName ? [`  masterSpread.baseName = "${escapedBaseName}";`] : []),
            '',
            '  "Master spread created successfully: " + masterSpread.name;',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Create Master Spread');
    }
});

export const listMasterSpreads = defineTool({
    name: 'list_master_spreads',
    description: 'List all master spreads in the document',
    domain: DOMAIN,
    profiles: PROFILES,
    cli: { id: 'document.list_master_spreads', aliases: [] },
    contract: readOnlyContract({ requiresActiveDocument: true }),
    inputSchema: {
        additionalProperties: false,
        properties: {},
        type: 'object'
    },
    handler: async () => {
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var masterSpreads = doc.masterSpreads;',
            '  var result = "=== MASTER SPREADS ===\\n";',
            '',
            '  for (var i = 0; i < masterSpreads.length; i++) {',
            '    var master = masterSpreads[i];',
            '    result += "Index: " + i + "\\n";',
            '    result += "Name: " + master.name + "\\n";',
            '    result += "Name Prefix: " + master.namePrefix + "\\n";',
            '    result += "Base Name: " + master.baseName + "\\n";',
            '    result += "Show Master Items: " + master.showMasterItems + "\\n";',
            '    result += "Pages: " + master.pages.length + "\\n";',
            '    result += "---\\n";',
            '  }',
            '',
            '  result;',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'List Master Spreads');
    }
});

export const deleteMasterSpread = defineTool({
    name: 'delete_master_spread',
    description: 'Delete a master spread',
    domain: DOMAIN,
    profiles: PROFILES,
    cli: { id: 'master.delete_master_spread', aliases: [] },
    contract: contract({ destructive: true }),
    inputSchema: {
        additionalProperties: false,
        properties: {
            masterIndex: { description: 'Master spread index to delete', type: 'number' },
            name: { description: 'Master spread name to delete', type: 'string' }
        },
        required: ['name'],
        type: 'object'
    },
    handler: async (args) => {
        const { masterIndex, name } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            ...masterSpreadLookupLines({ masterIndex, name }),
            '  if (masterSpreadError !== "") {',
            '    masterSpreadError;',
            '  } else {',
            '    var name = masterSpread.name;',
            '    masterSpread.remove();',
            '    "Master spread deleted: " + name;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Delete Master Spread');
    }
});

export const duplicateMasterSpread = defineTool({
    name: 'duplicate_master_spread',
    description: 'Duplicate a master spread',
    domain: DOMAIN,
    profiles: PROFILES,
    cli: { id: 'master.duplicate_master_spread', aliases: [] },
    contract: contract(),
    inputSchema: {
        additionalProperties: false,
        properties: {
            masterIndex: { description: 'Master spread index to duplicate', type: 'number' },
            name: { description: 'Master spread name to duplicate', type: 'string' },
            newName: { description: 'Name for the duplicated master spread', type: 'string' },
            position: { default: 'AT_END', enum: ['AT_END', 'AT_BEGINNING', 'BEFORE', 'AFTER'], type: 'string' },
            referenceMaster: { description: 'Reference master spread index for BEFORE/AFTER placement', type: 'number' }
        },
        required: ['name', 'newName'],
        type: 'object'
    },
    handler: async (args) => {
        const { masterIndex, name, newName, position = 'AT_END', referenceMaster } = args;
        const escapedNewName = escapeJsxString(newName);
        const referenceMasterLiteral = Number.isInteger(referenceMaster) ? String(referenceMaster) : 'null';

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            ...masterSpreadLookupLines({ masterIndex, name }),
            '  if (masterSpreadError !== "") {',
            '    masterSpreadError;',
            '  } else {',
            '    var newMasterSpread;',
            `    var requestedReferenceMaster = ${referenceMasterLiteral};`,
            '',
            `    if ("${position}" === "AT_END") {`,
            '      newMasterSpread = masterSpread.duplicate();',
            `    } else if ("${position}" === "AT_BEGINNING") {`,
            '      newMasterSpread = masterSpread.duplicate(LocationOptions.AT_BEGINNING);',
            `    } else if ("${position}" === "BEFORE" && requestedReferenceMaster !== null) {`,
            '      newMasterSpread = masterSpread.duplicate(LocationOptions.BEFORE, doc.masterSpreads[requestedReferenceMaster]);',
            `    } else if ("${position}" === "AFTER" && requestedReferenceMaster !== null) {`,
            '      newMasterSpread = masterSpread.duplicate(LocationOptions.AFTER, doc.masterSpreads[requestedReferenceMaster]);',
            '    } else {',
            '      newMasterSpread = masterSpread.duplicate();',
            '    }',
            `    if ("${escapedNewName}" !== "") {`,
            `      newMasterSpread.baseName = "${escapedNewName}";`,
            '    }',
            '',
            '    "Master spread duplicated successfully. New master index: " + newMasterSpread.index;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Duplicate Master Spread');
    }
});

export const applyMasterSpread = defineTool({
    name: 'apply_master_spread',
    description: 'Apply a master spread to pages',
    domain: DOMAIN,
    profiles: PROFILES,
    cli: { id: 'master.apply_master_spread', aliases: [] },
    contract: contract(),
    inputSchema: {
        additionalProperties: false,
        properties: {
            masterName: { description: 'Master spread name to apply', type: 'string' },
            pageRange: { default: 'all', description: 'Page range (e.g., "1-5", "all")', type: 'string' }
        },
        required: ['masterName'],
        type: 'object'
    },
    handler: async (args) => {
        const { masterName, pageRange } = args;

        const escapedMasterName = escapeJsxString(masterName);
        const escapedPageRange = escapeJsxString(pageRange);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            `  var masterSpread = doc.masterSpreads.itemByName("${escapedMasterName}");`,
            '',
            '  if (!masterSpread.isValid) {',
            `    "Master spread not found: ${escapedMasterName}";`,
            '  } else {',
            '    var pages = doc.pages;',
            '',
            `    if ("${escapedPageRange}" === "all") {`,
            '      for (var i = 0; i < pages.length; i++) {',
            '        pages[i].appliedMaster = masterSpread;',
            '      }',
            `    } else if ("${escapedPageRange}".indexOf("-") !== -1) {`,
            `      var range = "${escapedPageRange}".split("-");`,
            '      var start = parseInt(range[0]) - 1;',
            '      var end = parseInt(range[1]) - 1;',
            '      for (var i = start; i <= end && i < pages.length; i++) {',
            '        pages[i].appliedMaster = masterSpread;',
            '      }',
            '    } else {',
            `      var pageIndex = parseInt("${escapedPageRange}") - 1;`,
            '      if (pageIndex >= 0 && pageIndex < pages.length) {',
            '        pages[pageIndex].appliedMaster = masterSpread;',
            '      }',
            '    }',
            '',
            '    "Master spread applied successfully";',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Apply Master Spread');
    }
});

export const getMasterSpreadInfo = defineTool({
    name: 'get_master_spread_info',
    description: 'Get detailed information about a master spread',
    domain: DOMAIN,
    profiles: PROFILES,
    cli: { id: 'master.get_master_spread_info', aliases: [] },
    contract: readOnlyContract({ requiresActiveDocument: true }),
    inputSchema: {
        additionalProperties: false,
        properties: {
            masterIndex: { description: 'Master spread index', type: 'number' },
            name: { description: 'Master spread name', type: 'string' }
        },
        required: ['name'],
        type: 'object'
    },
    handler: async (args) => {
        const { masterIndex, name } = args;

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            ...masterSpreadLookupLines({ masterIndex, name }),
            '  if (masterSpreadError !== "") {',
            '    masterSpreadError;',
            '  } else {',
            '    var info = "=== MASTER SPREAD INFO ===\\n";',
            '',
            '    info += "Name: " + masterSpread.name + "\\n";',
            '    info += "Name Prefix: " + masterSpread.namePrefix + "\\n";',
            '    info += "Base Name: " + masterSpread.baseName + "\\n";',
            '    info += "Show Master Items: " + masterSpread.showMasterItems + "\\n";',
            '    info += "Index: " + masterSpread.index + "\\n";',
            '    info += "ID: " + masterSpread.id + "\\n";',
            '',
            '    // Content counts',
            '    info += "\\n=== CONTENT COUNTS ===\\n";',
            '    info += "Pages: " + masterSpread.pages.length + "\\n";',
            '    info += "Text Frames: " + masterSpread.textFrames.length + "\\n";',
            '    info += "Rectangles: " + masterSpread.rectangles.length + "\\n";',
            '    info += "Ovals: " + masterSpread.ovals.length + "\\n";',
            '    info += "Polygons: " + masterSpread.polygons.length + "\\n";',
            '    info += "Groups: " + masterSpread.groups.length + "\\n";',
            '    info += "Guides: " + masterSpread.guides.length + "\\n";',
            '    info += "All Page Items: " + masterSpread.allPageItems.length + "\\n";',
            '',
            '    info;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Get Master Spread Info');
    }
});

export const tools = [
    createMasterSpread,
    listMasterSpreads,
    deleteMasterSpread,
    duplicateMasterSpread,
    applyMasterSpread,
    getMasterSpreadInfo
];
