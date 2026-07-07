import { runScript, formatResponse } from '../../core/runtime.js';
import { escapeJsxString } from '../../utils/stringUtils.js';
import { defineTool } from '../_contract.js';

export const DOMAIN = 'group';
export const PROFILES = ['classic'];

export function contract(overrides = {}) {
    return {
        needsInDesign: true,
        requiresActiveDocument: false,
        mutatesDocument: true,
        writesFilesystem: false,
        producesArtifacts: false,
        destructive: false,
        ...overrides
    };
}

export function readOnlyContract(overrides = {}) {
    return contract({
        mutatesDocument: false,
        ...overrides
    });
}

export function defineGroupTool({ name, description, cliId, inputSchema, contract: toolContract, handler }) {
    return defineTool({
        name,
        description,
        domain: DOMAIN,
        profiles: PROFILES,
        cli: { id: cliId, aliases: [] },
        contract: toolContract,
        inputSchema,
        handler
    });
}

export { runScript, formatResponse, escapeJsxString };
