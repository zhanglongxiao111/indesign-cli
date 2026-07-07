import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { call } from './toolRouter.js';
import { registry } from '../tools/index.js';

function listToolsForProfile(profile) {
    return registry.tools
        .filter((tool) => tool.profiles.includes(profile))
        .map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
        }));
}

export function createMcpServer({ profile }) {
    const server = new Server(
        {
            name: profile === 'advanced' ? 'indesign-template-orchestrator' : 'indesign-server-complete',
            version: profile === 'advanced' ? '0.1.0' : '1.0.0'
        },
        {
            capabilities: {
                tools: {}
            }
        }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: listToolsForProfile(profile)
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            const result = await call(name, args || {});
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
        }
    });

    return {
        server,
        listTools: () => listToolsForProfile(profile),
        callTool: (name, args = {}) => call(name, args),
        async run() {
            const transport = new StdioServerTransport();
            await server.connect(transport);
        }
    };
}
