import { runScript, formatResponse, formatErrorResponse } from '../../core/runtime.js';
import { sessionManager } from '../../core/sessionManager.js';
import { escapeJsxString, escapeFilePathForJsx } from '../../utils/stringUtils.js';
import { defineTool } from '../_contract.js';

export { runScript, formatResponse, formatErrorResponse, sessionManager, escapeJsxString, escapeFilePathForJsx };

export function defineDocumentTool(tool) {
    return defineTool({
        ...tool,
        domain: 'document',
        cli: { id: tool.cliId, aliases: [] }
    });
}
