import { registry } from '../src/tools/index.js';

const classic = registry.tools.filter((tool) => tool.profiles.includes('classic')).length;
const advanced = registry.tools.filter((tool) => tool.profiles.includes('advanced')).length;
const internal = registry.tools.filter((tool) => tool.profiles.length === 0).length;

console.log('Registry tool count:', registry.tools.length);
console.log('Classic tools:', classic);
console.log('Advanced tools:', advanced);
console.log('Internal tools:', internal);
