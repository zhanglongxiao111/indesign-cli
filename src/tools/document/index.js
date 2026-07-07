import { tools as lifecycleTools } from './lifecycle.js';
import { tools as advancedTools } from './advanced.js';
import { tools as inspectionTools } from './inspection.js';
import { tools as preferencesTools } from './preferences.js';
import { tools as structureTools } from './structure.js';
import { tools as cloudTools } from './cloud.js';
import { tools as validationTools } from './validation.js';

export const tools = [
    ...lifecycleTools,
    ...advancedTools,
    ...inspectionTools,
    ...preferencesTools,
    ...structureTools,
    ...cloudTools,
    ...validationTools
];
