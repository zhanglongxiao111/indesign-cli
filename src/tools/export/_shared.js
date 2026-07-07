import { runScript, formatResponse } from '../../core/runtime.js';
import { escapeFilePathForJsx, escapeJsxString } from '../../utils/stringUtils.js';
import { defineTool } from '../_contract.js';

export { runScript, formatResponse, escapeFilePathForJsx, escapeJsxString };

export const exportContract = {
    needsInDesign: true,
    requiresActiveDocument: true,
    mutatesDocument: false,
    writesFilesystem: true,
    producesArtifacts: false,
    destructive: false
};

export function defineExportTool(tool) {
    return defineTool({
        ...tool,
        domain: 'export',
        profiles: ['classic'],
        cli: { id: `export.${tool.name}`, aliases: [] },
        contract: exportContract
    });
}
