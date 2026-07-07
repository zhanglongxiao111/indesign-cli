#!/usr/bin/env node

import assert from 'assert/strict';
import fs from 'fs';

import { parseJsonResult, runJsonScript, runScript, runScriptFile } from '../../src/core/runtime.js';
import { registry } from '../../src/tools/index.js';
import { ScriptExecutor } from '../../src/core/scriptExecutor.js';

const runtimeSource = fs.readFileSync('src/core/runtime.js', 'utf8');
assert.equal(runtimeSource.includes('sessionManager'), false, 'runtime must not import sessionManager');

const originalExecute = ScriptExecutor.executeInDesignScript;
const originalExecuteFile = ScriptExecutor.executeInDesignScriptFile;

try {
    const calls = [];
    ScriptExecutor.executeInDesignScript = async (script) => {
        calls.push(script);
        return '{"ok":true,"value":7}';
    };
    ScriptExecutor.executeInDesignScriptFile = async (filePath) => {
        calls.push(filePath);
        return 'file-result';
    };

    assert.equal(await runScript('1 + 1'), '{"ok":true,"value":7}');
    assert.deepEqual(await runJsonScript('json'), { ok: true, value: 7 });
    assert.equal(await runScriptFile('demo.jsx'), 'file-result');
    assert.deepEqual(parseJsonResult('{"success":true}'), { success: true });
    assert.throws(() => parseJsonResult('not json'), /Expected JSON result/);

    const callGolden = JSON.parse(fs.readFileSync('docs/AI协作/本地Agent/进行中/2026-07-06_终态重构/golden/C_tool_call_snapshots.json', 'utf8'));
    const goldenByName = new Map(
        callGolden.snapshots
            .filter((snapshot) => ['create_layer', 'list_layers', 'set_active_layer'].includes(snapshot.name))
            .map((snapshot) => [snapshot.name, snapshot])
    );

    for (const tool of registry.byDomain.get('layer')) {
        calls.length = 0;
        const args = goldenByName.get(tool.name).args;
        await tool.handler(args);
        assert.equal(calls[0], goldenByName.get(tool.name).scripts[0].script, `${tool.name} generated script should match golden C`);
    }

    for (const [name, args] of [
        ['delete_master_spread', { name: 'B-ToolSuiteName' }],
        ['duplicate_master_spread', { name: 'B-ToolSuiteName', newName: 'B-ToolSuiteName Copy' }],
        ['get_master_spread_info', { name: 'B-ToolSuiteName' }],
    ]) {
        calls.length = 0;
        await registry.byName.get(name).handler(args);
        assert.equal(calls[0].includes('undefined'), false, `${name} must not inject undefined when called with schema-required name`);
    }
} finally {
    ScriptExecutor.executeInDesignScript = originalExecute;
    ScriptExecutor.executeInDesignScriptFile = originalExecuteFile;
}

console.log('Handler runtime checks passed');
