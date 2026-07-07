#!/usr/bin/env node

import assert from 'assert/strict';
import { execFileSync } from 'child_process';
import fs from 'fs';

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

const goldenCalls = byName(callGolden.snapshots.filter((snapshot) => layerNames.includes(snapshot.name)));
for (const name of layerNames) {
    assert.equal(goldenCalls.get(name).scriptCount, 1, `${name} should have one golden script`);
}

execFileSync('node', ['src/core/artifact.js', '--check'], { stdio: 'inherit' });

console.log('Architecture registry checks passed');
