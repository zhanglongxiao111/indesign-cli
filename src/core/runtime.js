import { ScriptExecutor } from './scriptExecutor.js';
import { formatErrorResponse, formatResponse } from '../utils/stringUtils.js';

export async function runScript(script, options = {}) {
    return await ScriptExecutor.executeInDesignScript(script, options);
}

export async function runScriptFile(filePath, options = {}) {
    return await ScriptExecutor.executeInDesignScriptFile(filePath, options);
}

export function parseJsonResult(result, options = {}) {
    const { fallbackRaw = false } = options;
    if (typeof result !== 'string') {
        return result;
    }
    try {
        return JSON.parse(result);
    } catch (error) {
        if (fallbackRaw) {
            return result;
        }
        throw new Error(`Expected JSON result: ${error.message}`);
    }
}

export async function runJsonScript(script, options = {}) {
    const { fallbackRaw = false, ...scriptOptions } = options || {};
    const result = await runScript(script, scriptOptions);
    return parseJsonResult(result, { fallbackRaw });
}

export { formatResponse, formatErrorResponse };
