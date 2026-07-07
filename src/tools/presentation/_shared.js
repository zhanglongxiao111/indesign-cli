import { runScript, formatResponse } from '../../core/runtime.js';
import { sessionManager } from '../../core/sessionManager.js';
import { escapeFilePathForJsx, escapeJsxString } from '../../utils/stringUtils.js';
import { defineTool } from '../_contract.js';

const DOMAIN = 'presentation';

export { runScript, formatResponse, sessionManager, escapeFilePathForJsx, escapeJsxString };

export const mutatingPresentationContract = {
    needsInDesign: true,
    requiresActiveDocument: true,
    mutatesDocument: true,
    writesFilesystem: false,
    producesArtifacts: false,
    destructive: false
};

export const exportPresentationContract = {
    needsInDesign: true,
    requiresActiveDocument: true,
    mutatesDocument: false,
    writesFilesystem: true,
    producesArtifacts: true,
    destructive: false
};

export function definePresentationTool({ name, description, contract, inputSchema, handler }) {
    return defineTool({
        name,
        description,
        domain: DOMAIN,
        profiles: [],
        cli: { id: `${DOMAIN}.${name}`, aliases: [] },
        contract,
        inputSchema,
        handler
    });
}
