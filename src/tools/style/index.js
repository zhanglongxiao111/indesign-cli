import { tools as colorTools } from './colors.js';
import { tools as objectStyleTools } from './objectStyles.js';
import { tools as typographyTools } from './typography.js';

export const tools = [
    ...typographyTools,
    ...colorTools,
    ...objectStyleTools
].sort((a, b) => a.name.localeCompare(b.name));
