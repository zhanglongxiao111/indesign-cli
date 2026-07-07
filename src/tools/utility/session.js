import { formatResponse } from '../../core/runtime.js';
import { sessionManager } from '../../core/sessionManager.js';
import { defineTool } from '../_contract.js';

const getSessionInfoContract = {
    needsInDesign: true,
    requiresActiveDocument: true,
    mutatesDocument: false,
    writesFilesystem: false,
    producesArtifacts: false,
    destructive: false
};

const clearSessionContract = {
    needsInDesign: true,
    requiresActiveDocument: true,
    mutatesDocument: true,
    writesFilesystem: false,
    producesArtifacts: false,
    destructive: true
};

export const getSessionInfo = defineTool({
    name: 'get_session_info',
    description: 'Get current session information including page dimensions and active document',
    domain: 'utility',
    profiles: ['classic'],
    cli: { id: 'document.get_session_info', aliases: [] },
    contract: getSessionInfoContract,
    inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {}
    },
    handler: async () => {
        const sessionInfo = sessionManager.getSessionSummary();
        return formatResponse(JSON.stringify(sessionInfo, null, 2), 'Get Session Info');
    }
});

export const clearSession = defineTool({
    name: 'clear_session',
    description: 'Clear all session data including page dimensions and document information',
    domain: 'utility',
    profiles: ['classic'],
    cli: { id: 'document.clear_session', aliases: [] },
    contract: clearSessionContract,
    inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {}
    },
    handler: async () => {
        sessionManager.clearSession();
        return formatResponse('Session data cleared successfully', 'Clear Session');
    }
});

export const tools = [getSessionInfo, clearSession];
