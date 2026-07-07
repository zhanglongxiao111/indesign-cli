import { tools as inspectionTools } from './inspection.js';
import { tools as managementTools } from './management.js';
import { tools as guideTools } from './guides.js';
import { tools as placementTools } from './placement.js';

export const tools = [
    ...inspectionTools,
    ...managementTools,
    ...guideTools,
    ...placementTools
];
