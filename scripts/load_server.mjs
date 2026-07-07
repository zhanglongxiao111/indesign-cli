import { createMcpServer } from '../src/core/mcpServer.js';
// Just construct to ensure imports resolve
createMcpServer({ profile: 'classic' });
console.log('classic mcpServer constructed OK');
