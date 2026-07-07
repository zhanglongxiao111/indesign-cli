import { tools as documentTools } from './document.js';
import { tools as slideTools } from './slides.js';
import { tools as exportTools } from './export.js';

export const tools = [
    ...documentTools,
    ...slideTools,
    ...exportTools
];
