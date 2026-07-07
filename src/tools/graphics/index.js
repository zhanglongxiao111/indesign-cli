export { tools as imageTools } from './images.js';
export { tools as shapeTools } from './shapes.js';

import { tools as imageTools } from './images.js';
import { tools as shapeTools } from './shapes.js';

export const tools = [
    ...shapeTools,
    ...imageTools
];

