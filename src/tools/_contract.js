export const PUBLIC_PROFILES = ['classic', 'advanced'];
const VALID_PROFILES = new Set(PUBLIC_PROFILES);
const CONTRACT_KEYS = [
    'needsInDesign',
    'requiresActiveDocument',
    'mutatesDocument',
    'writesFilesystem',
    'producesArtifacts',
    'destructive'
];

function assertPlainObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${label} must be an object`);
    }
}

function assertNonEmptyString(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${label} must be a non-empty string`);
    }
}

function validateContract(contract, toolName) {
    assertPlainObject(contract, `${toolName}.contract`);
    const actualKeys = Object.keys(contract).sort();
    const expectedKeys = [...CONTRACT_KEYS].sort();
    if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
        throw new Error(`${toolName}.contract must contain exactly: ${expectedKeys.join(', ')}`);
    }
    for (const key of CONTRACT_KEYS) {
        if (typeof contract[key] !== 'boolean') {
            throw new Error(`${toolName}.contract.${key} must be boolean`);
        }
    }
}

function validateProfiles(profiles, toolName) {
    if (!Array.isArray(profiles)) {
        throw new Error(`${toolName}.profiles must be an array`);
    }
    if (new Set(profiles).size !== profiles.length) {
        throw new Error(`${toolName}.profiles must not contain duplicates`);
    }
    for (const profile of profiles) {
        if (!VALID_PROFILES.has(profile)) {
            throw new Error(`${toolName}.profiles contains invalid profile: ${profile}`);
        }
    }
    if (profiles.length > 1) {
        throw new Error(`${toolName}.profiles must be one of: [], ['classic'], ['advanced']`);
    }
}

export function assertPublicProfile(profile) {
    if (!VALID_PROFILES.has(profile)) {
        throw new Error(`Invalid profile: ${profile}`);
    }
}

export function isToolVisibleToProfile(tool, profile) {
    assertPublicProfile(profile);
    return tool.profiles.length === 1 && tool.profiles[0] === profile;
}

function validateInputSchema(inputSchema, toolName) {
    assertPlainObject(inputSchema, `${toolName}.inputSchema`);
    if (inputSchema.type !== 'object') {
        throw new Error(`${toolName}.inputSchema.type must be object`);
    }
    if (!inputSchema.properties || typeof inputSchema.properties !== 'object' || Array.isArray(inputSchema.properties)) {
        throw new Error(`${toolName}.inputSchema.properties must be an object`);
    }
    if (inputSchema.required !== undefined && !Array.isArray(inputSchema.required)) {
        throw new Error(`${toolName}.inputSchema.required must be an array when present`);
    }
}

export function defineTool(tool) {
    assertPlainObject(tool, 'tool');
    assertNonEmptyString(tool.name, 'tool.name');
    assertNonEmptyString(tool.description, `${tool.name}.description`);
    assertNonEmptyString(tool.domain, `${tool.name}.domain`);
    assertPlainObject(tool.cli, `${tool.name}.cli`);
    assertNonEmptyString(tool.cli.id, `${tool.name}.cli.id`);
    if (tool.cli.aliases !== undefined && !Array.isArray(tool.cli.aliases)) {
        throw new Error(`${tool.name}.cli.aliases must be an array`);
    }
    validateProfiles(tool.profiles, tool.name);
    validateContract(tool.contract, tool.name);
    validateInputSchema(tool.inputSchema, tool.name);
    if (typeof tool.handler !== 'function') {
        throw new Error(`${tool.name}.handler must be a function`);
    }
    return {
        ...tool,
        cli: {
            ...tool.cli,
            aliases: tool.cli.aliases || []
        }
    };
}

function assertStaticContractInvariants(tool) {
    const contract = tool.contract;
    if (contract.destructive && !contract.mutatesDocument) {
        throw new Error(`${tool.name}: destructive tools must mutate document`);
    }
    if (contract.requiresActiveDocument && !contract.needsInDesign) {
        throw new Error(`${tool.name}: requiresActiveDocument implies needsInDesign`);
    }
    if (tool.domain === 'export' && contract.writesFilesystem !== true) {
        throw new Error(`${tool.name}: export domain tools must write filesystem`);
    }
    if (contract.producesArtifacts && !contract.writesFilesystem) {
        throw new Error(`${tool.name}: producesArtifacts implies writesFilesystem`);
    }
}

export function buildRegistry(domainGroups) {
    if (!Array.isArray(domainGroups)) {
        throw new Error('domainGroups must be an array');
    }

    const tools = [];
    const byName = new Map();
    const byCliId = new Map();
    const byDomain = new Map();

    for (const group of domainGroups) {
        assertPlainObject(group, 'domain group');
        assertNonEmptyString(group.domain, 'domain group.domain');
        if (!Array.isArray(group.tools)) {
            throw new Error(`${group.domain}.tools must be an array`);
        }
        byDomain.set(group.domain, []);
        for (const tool of group.tools) {
            if (tool.domain !== group.domain) {
                throw new Error(`${tool.name}: domain ${tool.domain} must match directory domain ${group.domain}`);
            }
            if (byName.has(tool.name)) {
                throw new Error(`Duplicate tool name: ${tool.name}`);
            }
            if (byCliId.has(tool.cli.id)) {
                throw new Error(`Duplicate cli.id: ${tool.cli.id}`);
            }
            assertStaticContractInvariants(tool);
            tools.push(tool);
            byName.set(tool.name, tool);
            byCliId.set(tool.cli.id, tool);
            byDomain.get(group.domain).push(tool);
        }
    }

    return { tools, byName, byCliId, byDomain };
}
