import { tools as lifecycleTools } from './lifecycle.js';
import { tools as maintenanceTools } from './maintenance.js';
import { tools as artifactTools } from './artifacts.js';
import { tools as inspectionTools } from './inspection.js';

export const tools = [
    ...lifecycleTools,
    ...maintenanceTools,
    ...artifactTools,
    ...inspectionTools
];
