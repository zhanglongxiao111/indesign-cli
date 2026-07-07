import { runScript, formatResponse } from '../../core/runtime.js';
import { escapeJsxString, escapeFilePathForJsx } from '../../utils/stringUtils.js';
import { defineTool } from '../_contract.js';

const DOMAIN = 'page';
const PROFILE = ['classic'];

export function pageContract(overrides = {}) {
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

export function definePageTool({ name, description, inputSchema, contract, handler }) {
    return defineTool({
        name,
        description,
        domain: DOMAIN,
        profiles: PROFILE,
        cli: { id: `${DOMAIN}.${name}`, aliases: [] },
        contract,
        inputSchema,
        handler
    });
}

export { runScript, formatResponse, escapeJsxString, escapeFilePathForJsx };
