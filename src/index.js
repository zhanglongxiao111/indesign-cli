/**
 * Main entry point for InDesign MCP Server
 */
import { InDesignMCPServer } from './core/InDesignMCPServer.js';

async function main() {
    try {
        const server = new InDesignMCPServer();
        await server.run();
    } catch (error) {
        // Log to stderr instead of stdout to avoid interfering with MCP protocol
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

main(); 