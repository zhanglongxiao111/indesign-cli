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

const layerNames = ['create_layer', 'list_layers', 'set_active_layer'];

function byName(items) {
    return new Map(items.map((item) => [item.name, item]));
}

assert.equal(registry.tools.length, 3, 'Task 1 registry should only contain the layer pilot domain');
assert.deepEqual(registry.byDomain.get('layer').map((tool) => tool.name).sort(), layerNames);

for (const tool of registry.tools) {
    assert.equal(tool.domain, 'layer');
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
const serverLayerOrder = createMcpServer({ profile: 'classic' })
    .listTools()
    .map((tool) => tool.name)
    .filter((name) => layerNames.includes(name));
assert.deepEqual(serverLayerOrder, goldenLayerOrder, 'classic mcpServer layer tool order should match golden A');

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

const currentArtifact = generateArtifact();
assert.equal(currentArtifact.generated_at, beforeWrite.generated_at, 'generateArtifact should preserve generated_at for unchanged payload');

execFileSync('node', ['src/core/artifact.js', '--check'], { stdio: 'inherit' });

console.log('Architecture registry checks passed');
