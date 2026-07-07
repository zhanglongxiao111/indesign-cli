#!/usr/bin/env node

import assert from 'assert/strict';
import { execFileSync } from 'child_process';
import fs from 'fs';

import { generateArtifact, writeArtifact } from '../../src/core/artifact.js';
import { createMcpServer } from '../../src/core/mcpServer.js';
import { defineTool } from '../../src/tools/_contract.js';
import { registry } from '../../src/tools/index.js';

const classicGolden = JSON.parse(fs.readFileSync('docs/AI协作/本地Agent/进行中/2026-07-06_终态重构/golden/A_classic_list_tools.json', 'utf8'));
const callGolden = JSON.parse(fs.readFileSync('docs/AI协作/本地Agent/进行中/2026-07-06_终态重构/golden/C_tool_call_snapshots.json', 'utf8'));
const cliGolden = JSON.parse(fs.readFileSync('docs/AI协作/本地Agent/进行中/2026-07-06_终态重构/golden/B_cli_tool_list_all_sources.json', 'utf8'));
const cliSchemaGolden = JSON.parse(fs.readFileSync('docs/AI协作/本地Agent/进行中/2026-07-06_终态重构/golden/B_cli_tool_schemas.json', 'utf8'));
const contractBaseline = JSON.parse(fs.readFileSync('docs/AI协作/本地Agent/进行中/2026-07-06_终态重构/golden/contract_baseline.json', 'utf8'));
const schemaNetNewWhitelist = JSON.parse(fs.readFileSync('docs/AI协作/本地Agent/进行中/2026-07-06_终态重构/golden/schema_net_new_whitelist.json', 'utf8'));
const intentionalHelpSchemaDiffIds = new Set(['utility.help']);

const layerNames = ['create_layer', 'list_layers', 'set_active_layer'];

function byName(items) {
    return new Map(items.map((item) => [item.name, item]));
}

function byId(items) {
    return new Map(items.map((item) => [item.cli.id, item]));
}

function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function normalizeSchema(schema) {
    return JSON.parse(stableStringify(schema));
}

function artifactTools(artifact) {
    return Object.values(artifact.sources).flat();
}

function contractFromGolden(tool) {
    return {
        needsInDesign: tool.needs_indesign,
        requiresActiveDocument: tool.requires_active_document,
        mutatesDocument: tool.mutates_document,
        writesFilesystem: tool.writes_filesystem,
        destructive: tool.destructive
    };
}

function comparableContract(contract) {
    return {
        needsInDesign: contract.needsInDesign,
        requiresActiveDocument: contract.requiresActiveDocument,
        mutatesDocument: contract.mutatesDocument,
        writesFilesystem: contract.writesFilesystem,
        destructive: contract.destructive
    };
}

function collectDiffs(expected, actual, label) {
    const diffs = [];
    for (const [id, expectedValue] of expected.entries()) {
        const actualValue = actual.get(id);
        if (stableStringify(actualValue) !== stableStringify(expectedValue)) {
            diffs.push({ id, expected: expectedValue, actual: actualValue });
        }
    }
    assert.deepEqual(diffs, [], `${label} should have 0 diffs`);
}

assert.equal(registry.tools.length, 150, 'Task 2 registry should contain all Node-backed tools');
assert.equal(registry.tools.filter((tool) => tool.profiles.includes('classic')).length, 114, 'classic profile count should match golden baseline');
assert.equal(registry.tools.filter((tool) => tool.profiles.includes('advanced')).length, 6, 'advanced profile count should match golden baseline');
assert.equal(registry.tools.filter((tool) => tool.profiles.length === 0).length, 30, 'internal tool count should match hidden baseline');
assert.deepEqual(registry.byDomain.get('layer').map((tool) => tool.name).sort(), layerNames);

const cliPrimitiveSources = new Set(['cli', 'cli.primitive', 'script']);
const existingNodeGolden = cliGolden.filter((tool) => !cliPrimitiveSources.has(tool.source));
const netNewToolNames = new Set(schemaNetNewWhitelist.map((entry) => entry.name));
const currentArtifact = generateArtifact();
const artifactById = byId(artifactTools(currentArtifact));
const registryById = byId(registry.tools);

assert.equal(existingNodeGolden.length, 141, 'frozen CLI golden should contain 141 existing Node-backed tools');
assert.equal(netNewToolNames.size, 9, 'schema net-new whitelist should contain 9 tools');
assert.deepEqual(
    registry.tools
        .filter((tool) => netNewToolNames.has(tool.name))
        .map((tool) => tool.name)
        .sort(),
    [...netNewToolNames].sort(),
    'registry should contain exactly the 9 schema net-new whitelist tools'
);

const missingIds = existingNodeGolden
    .filter((tool) => !artifactById.has(tool.id) || !registryById.has(tool.id))
    .map((tool) => tool.id);
assert.deepEqual(missingIds, [], 'artifact and registry should include every existing Node-backed CLI id');

const unexpectedExistingIds = [...artifactById.keys()]
    .filter((id) => !existingNodeGolden.some((tool) => tool.id === id))
    .filter((id) => !netNewToolNames.has(artifactById.get(id).name))
    .sort();
assert.deepEqual(unexpectedExistingIds, [], 'artifact should only add the 9 schema net-new whitelist tools beyond golden B node-backed ids');

collectDiffs(
    new Map(existingNodeGolden.map((tool) => [tool.id, { id: tool.id, domain: tool.domain, source: tool.source }])),
    new Map([...artifactById.entries()].map(([id, tool]) => [id, { id: tool.cli.id, domain: tool.domain, source: tool.source }])),
    'artifact CLI id/domain/source'
);

collectDiffs(
    new Map(existingNodeGolden.map((tool) => [tool.id, { id: tool.id, domain: tool.domain, source: tool.source }])),
    new Map([...registryById.entries()].map(([id, tool]) => [id, { id: tool.cli.id, domain: tool.cli.domain, source: tool.profiles.includes('classic') ? 'classic' : tool.profiles.includes('advanced') ? 'advanced' : 'hidden_handler' }])),
    'registry CLI id/domain/source'
);

collectDiffs(
    new Map(existingNodeGolden.filter((tool) => !intentionalHelpSchemaDiffIds.has(tool.id)).map((tool) => [tool.id, normalizeSchema(cliSchemaGolden[tool.id].data.inputSchema)])),
    new Map([...artifactById.entries()].map(([id, tool]) => [id, normalizeSchema(tool.inputSchema)])),
    'artifact schemas'
);

collectDiffs(
    new Map(contractBaseline.entries.filter((tool) => existingNodeGolden.some((entry) => entry.id === tool.id)).map((tool) => [tool.id, contractFromGolden(tool)])),
    new Map([...artifactById.entries()].map(([id, tool]) => [id, comparableContract(tool.contract)])),
    'artifact contract booleans'
);

assert.equal(registry.byName.get('help').inputSchema.properties.category.enum, undefined, 'help category enum should not be a fixed handwritten catalog');

for (const tool of registry.byDomain.get('layer')) {
    assert.ok(tool.profiles.includes('classic'));
    assert.equal(typeof tool.handler, 'function');
}

const goldenTools = byName(classicGolden.tools.filter((tool) => layerNames.includes(tool.name)));
const registryTools = byName(registry.tools);
for (const name of layerNames) {
    assert.deepEqual(registryTools.get(name).inputSchema, goldenTools.get(name).inputSchema, `${name} schema should match golden A`);
}

const goldenLayerOrder = classicGolden.tools
    .map((tool) => tool.name)
    .filter((name) => layerNames.includes(name));
const classicServerToolNames = createMcpServer({ profile: 'classic' }).listTools().map((tool) => tool.name);
const advancedServerToolNames = createMcpServer({ profile: 'advanced' }).listTools().map((tool) => tool.name);
assert.deepEqual(classicServerToolNames, classicGolden.tools.map((tool) => tool.name), 'classic mcpServer ListTools order should match golden A');
assert.deepEqual(advancedServerToolNames, JSON.parse(fs.readFileSync('docs/AI协作/本地Agent/进行中/2026-07-06_终态重构/golden/A_advanced_list_tools.json', 'utf8')).tools.map((tool) => tool.name), 'advanced mcpServer ListTools order should match golden A');

const serverLayerOrder = classicServerToolNames.filter((name) => layerNames.includes(name));
assert.deepEqual(serverLayerOrder, goldenLayerOrder, 'classic mcpServer layer tool order should match golden A');

for (const domain of ['page', 'group']) {
    const goldenDomainOrder = classicGolden.tools
        .map((tool) => tool.name)
        .filter((name) => registry.byName.get(name)?.domain === domain);
    const serverDomainOrder = classicServerToolNames.filter((name) => registry.byName.get(name)?.domain === domain);
    assert.deepEqual(serverDomainOrder, goldenDomainOrder, `classic mcpServer ${domain} tool order should match golden A`);
}

function artifactModifiedTime() {
    const stats = fs.statSync('src/core/indesign-tool-registry.json', { bigint: true });
    return stats.mtimeNs ?? stats.mtimeMs;
}

const validTool = {
    name: 'synthetic_profile_tool',
    description: 'Synthetic profile validation tool',
    domain: 'synthetic',
    profiles: ['classic'],
    cli: { id: 'synthetic.profile_tool' },
    contract: {
        needsInDesign: false,
        requiresActiveDocument: false,
        mutatesDocument: false,
        writesFilesystem: false,
        producesArtifacts: false,
        destructive: false
    },
    inputSchema: {
        type: 'object',
        properties: {}
    },
    handler: async () => ({ ok: true })
};

assert.doesNotThrow(() => defineTool({ ...validTool, profiles: [] }));
assert.doesNotThrow(() => defineTool({ ...validTool, profiles: ['classic'] }));
assert.doesNotThrow(() => defineTool({ ...validTool, profiles: ['advanced'] }));
assert.throws(() => defineTool({ ...validTool, profiles: ['classic', 'advanced'] }), /profiles must be one of/);
assert.throws(() => defineTool({ ...validTool, profiles: ['classic', 'classic'] }), /profiles must not contain duplicates/);
assert.throws(() => defineTool({ ...validTool, profiles: ['unknown'] }), /contains invalid profile/);

const goldenCalls = byName(callGolden.snapshots.filter((snapshot) => layerNames.includes(snapshot.name)));
for (const name of layerNames) {
    assert.equal(goldenCalls.get(name).scriptCount, 1, `${name} should have one golden script`);
}

const beforeWrite = JSON.parse(fs.readFileSync('src/core/indesign-tool-registry.json', 'utf8'));
const beforeWriteMtime = artifactModifiedTime();
writeArtifact();
const afterWrite = JSON.parse(fs.readFileSync('src/core/indesign-tool-registry.json', 'utf8'));
const afterWriteMtime = artifactModifiedTime();
assert.equal(afterWrite.generated_at, beforeWrite.generated_at, 'artifact --write should keep generated_at when payload is unchanged');
assert.deepEqual(afterWrite, beforeWrite, 'artifact --write should not rewrite unchanged artifact payload');
assert.equal(afterWriteMtime, beforeWriteMtime, 'artifact --write should not touch artifact file when payload is unchanged');

const regeneratedArtifact = generateArtifact();
assert.equal(regeneratedArtifact.generated_at, beforeWrite.generated_at, 'generateArtifact should preserve generated_at for unchanged payload');

execFileSync('node', ['src/core/artifact.js', '--check'], { stdio: 'inherit' });

console.log('Architecture registry checks passed');
