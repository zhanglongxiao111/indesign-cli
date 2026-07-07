import { registry as defaultRegistry } from '../tools/index.js';
import { formatErrorResponse } from './runtime.js';

export async function call(name, args = {}, options = {}) {
    const activeRegistry = options.registry || defaultRegistry;
    const tool = activeRegistry.byName.get(name);
    if (!tool) {
        return formatErrorResponse(`Tool '${name}' not found or not implemented. Use 'help' to see available tools.`, 'Tool Call');
    }
    if (typeof tool.handler !== 'function') {
        throw new Error(`Tool '${name}' has no handler`);
    }
    return await tool.handler(args || {});
}
