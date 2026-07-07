import { runScript, formatResponse } from '../../core/runtime.js';
import { escapeJsxString, escapeFilePathForJsx } from '../../utils/stringUtils.js';
import { defineTool } from '../_contract.js';

export { runScript, formatResponse, escapeJsxString, escapeFilePathForJsx };

export function bookContract({
    requiresActiveDocument = false,
    mutatesDocument = false,
    writesFilesystem = false,
    producesArtifacts = false
} = {}) {
    return {
        needsInDesign: true,
        requiresActiveDocument,
        mutatesDocument,
        writesFilesystem,
        producesArtifacts,
        destructive: false
    };
}

export function defineBookTool(tool) {
    return defineTool({
        ...tool,
        domain: 'book',
        profiles: [],
        cli: { id: `book.${tool.name}`, aliases: [] }
    });
}
