import { defineTool } from '../_contract.js';

export const DOMAIN = 'spread';
export const CLASSIC_PROFILE = ['classic'];
export const INTERNAL_PROFILE = [];

export function spreadContract(overrides = {}) {
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

export function readOnlySpreadContract(overrides = {}) {
    return spreadContract({
        mutatesDocument: false,
        ...overrides
    });
}

export function defineSpreadTool(tool) {
    return defineTool({
        ...tool,
        domain: DOMAIN,
        profiles: tool.profiles || CLASSIC_PROFILE,
        cli: { id: `${DOMAIN}.${tool.name}`, aliases: [] }
    });
}
