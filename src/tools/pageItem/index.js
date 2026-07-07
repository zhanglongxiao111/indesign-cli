import { tools as managementTools } from './management.js';
import { tools as labelTools } from './labels.js';

export const tools = [
    ...managementTools.slice(0, 7),
    ...labelTools,
    managementTools[7]
];
