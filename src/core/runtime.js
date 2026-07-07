import { ScriptExecutor } from './scriptExecutor.js';
import { formatErrorResponse, formatResponse } from '../utils/stringUtils.js';

export async function runScript(script) {
    return await ScriptExecutor.executeInDesignScript(script);
}

export async function runScriptFile(filePath) {
    return await ScriptExecutor.executeInDesignScriptFile(filePath);
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
    const result = await runScript(script);
    return parseJsonResult(result, options);
}

export { formatResponse, formatErrorResponse };
