import { formatErrorResponse, formatResponse } from '../../core/runtime.js';
import { defineTool } from '../_contract.js';

const HELP_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        tool: {
            type: 'string',
            description: 'Specific tool name to get help for (optional)',
            default: null
        },
        category: {
            type: 'string',
            description: 'Category of tools to list (optional)',
            default: 'all'
        },
        format: {
            type: 'string',
            description: 'Output format',
            enum: ['summary', 'detailed', 'examples'],
            default: 'summary'
        }
    },
    required: []
};

const HELP_CONTRACT = {
    needsInDesign: true,
    requiresActiveDocument: false,
    mutatesDocument: true,
    writesFilesystem: false,
    producesArtifacts: false,
    destructive: false
};

function resolveRegistry(options, context) {
    if (context?.registry) return context.registry;
    if (typeof options.getRegistry === 'function') return options.getRegistry();
    if (options.registry) return options.registry;
    return null;
}

function visibleTools(registry, profile) {
    const tools = Array.isArray(registry?.tools) ? registry.tools : [];
    return tools.filter((tool) => tool.profiles.length === 1 && tool.profiles[0] === profile);
}

function groupedByDomain(tools) {
    const groups = new Map();
    for (const tool of tools) {
        if (!groups.has(tool.domain)) groups.set(tool.domain, []);
        groups.get(tool.domain).push(tool);
    }
    return groups;
}

function categoryDomain(category, groups) {
    if (!category || category === 'all') return null;
    if (groups.has(category)) return category;
    const singular = category.endsWith('s') ? category.slice(0, -1) : category;
    if (groups.has(singular)) return singular;
    return category;
}

function formatDomainTitle(domain) {
    return domain
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^\w/, (char) => char.toUpperCase());
}

function schemaParameters(inputSchema) {
    return Object.entries(inputSchema.properties || {}).map(([name, schema]) => ({
        name,
        description: schema.description || schema.type || 'Parameter',
        required: Array.isArray(inputSchema.required) && inputSchema.required.includes(name)
    }));
}

function exampleValue(schema) {
    if (schema.default !== undefined && schema.default !== null) return schema.default;
    if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
    if (schema.type === 'number' || schema.type === 'integer') return 0;
    if (schema.type === 'boolean') return false;
    if (schema.type === 'array') return [];
    if (schema.type === 'object') return {};
    return '<value>';
}

function exampleArgs(tool) {
    const required = new Set(tool.inputSchema.required || []);
    const args = {};
    for (const [name, schema] of Object.entries(tool.inputSchema.properties || {})) {
        if (required.has(name)) args[name] = exampleValue(schema);
    }
    return args;
}

function renderToolHelp(tool, format) {
    let helpText = `# ${tool.name}\n\n`;
    helpText += `**Description:** ${tool.description}\n\n`;
    helpText += `**CLI id:** \`${tool.cli.id}\`\n`;
    helpText += `**Domain:** \`${tool.domain}\`\n\n`;

    if (format === 'detailed' || format === 'examples') {
        const parameters = schemaParameters(tool.inputSchema);
        helpText += '## Parameters\n\n';
        if (parameters.length === 0) {
            helpText += 'No parameters.\n\n';
        } else {
            for (const param of parameters) {
                const marker = param.required ? 'required' : 'optional';
                helpText += `- **${param.name}** (${marker}): ${param.description}\n`;
            }
            helpText += '\n';
        }
    }

    if (format === 'examples') {
        helpText += '## Example\n\n';
        helpText += '```javascript\n';
        helpText += `await tools.call("${tool.name}", ${JSON.stringify(exampleArgs(tool), null, 2)});\n`;
        helpText += '```\n\n';
    }

    return helpText;
}

function renderCategoryHelp(domain, tools, format) {
    let helpText = `# ${formatDomainTitle(domain)}\n\n`;
    helpText += '## Available Tools\n\n';
    for (const tool of tools) {
        helpText += `- **${tool.name}**: ${tool.description}\n`;
    }

    if (format === 'detailed' || format === 'examples') {
        helpText += '\n## Detailed Information\n\n';
        for (const tool of tools) {
            helpText += renderToolHelp(tool, format).replace(/^# /, '### ');
        }
    }

    return helpText;
}

function renderAllHelp(tools, format) {
    const groups = groupedByDomain(tools);
    let helpText = '# InDesign MCP Server - Available Tools\n\n';
    helpText += 'This server provides programmatic access to Adobe InDesign through Model Context Protocol (MCP).\n\n';
    helpText += '## Tool Categories\n\n';

    for (const [domain, domainTools] of groups.entries()) {
        helpText += `### ${formatDomainTitle(domain)}\n`;
        if (format === 'summary') {
            helpText += `**Tools:** ${domainTools.map((tool) => tool.name).join(', ')}\n\n`;
        } else {
            for (const tool of domainTools) {
                helpText += `- **${tool.name}**: ${tool.description}\n`;
            }
            helpText += '\n';
        }
    }

    helpText += '## Help Options\n\n';
    helpText += '- `help()` - Show this overview\n';
    helpText += '- `help({ tool: "create_document" })` - Get help for a specific tool\n';
    helpText += '- `help({ category: "document" })` - Get help for a tool category\n';
    helpText += '- `help({ format: "detailed" })` - Get detailed information\n';
    helpText += '- `help({ format: "examples" })` - Get generated examples\n';

    return helpText;
}

export function createHelpHandler(options = {}) {
    const profile = options.profile || 'classic';
    return async function helpHandler(args = {}, context = {}) {
        const registry = resolveRegistry(options, context);
        if (!registry) {
            return formatErrorResponse('Help registry context is not available. Wire help with createTools({ getRegistry }) or pass handler context.registry.', 'Get Help');
        }

        const { tool, category = 'all', format = 'summary' } = args || {};
        const tools = visibleTools(registry, profile);
        const byName = new Map(tools.map((entry) => [entry.name, entry]));

        if (tool) {
            const toolDefinition = byName.get(tool);
            if (!toolDefinition) {
                return formatErrorResponse(`Tool '${tool}' not found. Use 'help' without parameters to see all available tools.`, 'Get Help');
            }
            return formatResponse(renderToolHelp(toolDefinition, format), 'Get Help');
        }

        const groups = groupedByDomain(tools);
        const domain = categoryDomain(category, groups);
        if (domain) {
            const domainTools = groups.get(domain);
            if (!domainTools) {
                return formatErrorResponse(`Category '${category}' not found. Available categories: ${Array.from(groups.keys()).join(', ')}`, 'Get Help');
            }
            return formatResponse(renderCategoryHelp(domain, domainTools, format), 'Get Help');
        }

        return formatResponse(renderAllHelp(tools, format), 'Get Help');
    };
}

export function createTools(options = {}) {
    return [
        defineTool({
            name: 'help',
            description: 'Get help information about available tools and their usage',
            domain: 'help',
            profiles: ['classic'],
            cli: { id: 'utility.help', aliases: [] },
            contract: HELP_CONTRACT,
            inputSchema: HELP_SCHEMA,
            handler: createHelpHandler(options)
        })
    ];
}

export const tools = createTools();
