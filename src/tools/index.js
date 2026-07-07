import { buildRegistry } from './_contract.js';
import { tools as layerTools } from './layer/index.js';

export const registry = buildRegistry([
    { domain: 'layer', tools: layerTools }
]);

export const tools = registry.tools;
