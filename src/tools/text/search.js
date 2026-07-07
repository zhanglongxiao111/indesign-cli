import { runScript, formatResponse } from '../../core/runtime.js';
import { escapeJsxString } from '../../utils/stringUtils.js';
import { defineTool } from '../_contract.js';

export const findReplaceText = defineTool({
    name: 'find_replace_text',
    description: 'Find and replace text in the document',
    domain: 'text',
    profiles: ['classic'],
    cli: { id: 'text.find_replace_text', aliases: [] },
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
        properties: {
            findText: { type: 'string', description: 'Text to find' },
            replaceText: { type: 'string', description: 'Text to replace with' },
            caseSensitive: { type: 'boolean', description: 'Case sensitive search', default: false },
            wholeWord: { type: 'boolean', description: 'Whole word search', default: false },
        },
        required: ['findText', 'replaceText'],
    },
    handler: async (args) => {
        const {
            findText,
            replaceText,
            caseSensitive = false,
            wholeWord = false
        } = args;

        const escapedFindText = escapeJsxString(findText);
        const escapedReplaceText = escapeJsxString(replaceText);

        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var findTextPreferences = app.findTextPreferences;',
            '  var changeTextPreferences = app.changeTextPreferences;',
            '',
            '  try {',
            '    // Clear previous preferences',
            '    app.findTextPreferences = NothingEnum.NOTHING;',
            '    app.changeTextPreferences = NothingEnum.NOTHING;',
            '',
            '    // Set find preferences',
            `    app.findTextPreferences.findWhat = "${escapedFindText}";`,
            `    try { app.findTextPreferences.caseSensitive = ${caseSensitive}; } catch (caseError) {}`,
            `    try { app.findTextPreferences.wholeWord = ${wholeWord}; } catch (wordError) {}`,
            '',
            '    // Set change preferences',
            `    app.changeTextPreferences.changeTo = "${escapedReplaceText}";`,
            '',
            '    // Perform find and replace',
            '    var foundItems = doc.changeText();',
            '    app.findTextPreferences = NothingEnum.NOTHING;',
            '    app.changeTextPreferences = NothingEnum.NOTHING;',
            '',
            '    "Find and replace completed. Items changed: " + foundItems.length;',
            '  } catch (error) {',
            '    "Error during find and replace: " + error.message;',
            '  }',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, "Find Replace Text");
    }
});

export const tools = [findReplaceText];
