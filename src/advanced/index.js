import { createMcpServer } from '../core/mcpServer.js';

async function main() {
    const server = createMcpServer({ profile: 'advanced' });
    await server.run();
}

main().catch((error) => {
    console.error('Failed to start advanced template server:', error);
    process.exit(1);
});
