import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { call } from './toolRouter.js';
import { registry as defaultRegistry } from '../tools/index.js';
import { assertPublicProfile, isToolVisibleToProfile } from '../tools/_contract.js';

function listToolsForProfile(profile, registry) {
    return registry.tools
        .filter((tool) => isToolVisibleToProfile(tool, profile))
        .map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
        }));
}

export function createMcpServer({ profile, registry = defaultRegistry }) {
    assertPublicProfile(profile);

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
        tools: listToolsForProfile(profile, registry)
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            const result = await call(name, args || {}, { profile, registry });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
        }
    });

    return {
        server,
        listTools: () => listToolsForProfile(profile, registry),
        callTool: (name, args = {}) => call(name, args, { profile, registry }),
        async run() {
            const transport = new StdioServerTransport();
            await server.connect(transport);
        }
    };
}
