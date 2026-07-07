import { runScript, formatResponse } from '../../core/runtime.js';
import { defineTool } from '../_contract.js';

const executeIndesignCodeContract = {
    needsInDesign: true,
    requiresActiveDocument: false,
    mutatesDocument: true,
    writesFilesystem: false,
    producesArtifacts: false,
    destructive: false
};

export const executeIndesignCode = defineTool({
    name: 'execute_indesign_code',
    description: 'Execute custom InDesign ExtendScript code',
    domain: 'utility',
    profiles: ['classic'],
    cli: { id: 'script.execute_indesign_code', aliases: [] },
    contract: executeIndesignCodeContract,
    inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            code: {
                type: 'string',
                description: 'ExtendScript code to execute'
            }
        },
        required: ['code']
    },
    handler: async (args) => {
        const { code } = args;
        const script = [
            'try {',
            '  app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;',
            code || '"No code provided";',
            '} catch (error) {',
            '  "Error executing code: " + error.message;',
            '}'
        ].join('\n');

        const result = await runScript(script);
        return formatResponse(result, 'Execute InDesign Code');
    }
});

export const tools = [executeIndesignCode];
