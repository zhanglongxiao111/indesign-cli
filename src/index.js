/**
 * Main entry point for InDesign MCP Server
 */
import { createMcpServer } from './core/mcpServer.js';

async function main() {
    try {
        const server = createMcpServer({ profile: 'classic' });
        await server.run();
    } catch (error) {
        // Log to stderr instead of stdout to avoid interfering with MCP protocol
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

main();
