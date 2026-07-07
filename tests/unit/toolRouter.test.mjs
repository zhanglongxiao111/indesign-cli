#!/usr/bin/env node

import assert from 'assert/strict';

import { createMcpServer } from '../../src/core/mcpServer.js';
import { call } from '../../src/core/toolRouter.js';
import { ScriptExecutor } from '../../src/core/scriptExecutor.js';
import { buildRegistry, defineTool } from '../../src/tools/_contract.js';

const baseContract = {
    needsInDesign: false,
    requiresActiveDocument: false,
    mutatesDocument: false,
    writesFilesystem: false,
    producesArtifacts: false,
    destructive: false
};

function syntheticTool(name, profiles) {
    return defineTool({
        name,
        description: `${name} synthetic tool`,
        domain: 'synthetic',
        profiles,
        cli: { id: `synthetic.${name}` },
        contract: baseContract,
        inputSchema: {
            type: 'object',
            properties: {}
        },
        handler: async () => ({ success: true, operation: name })
    });
}

const syntheticRegistry = buildRegistry([
    {
        domain: 'synthetic',
        tools: [
            syntheticTool('synthetic_classic', ['classic']),
            syntheticTool('synthetic_advanced', ['advanced']),
            syntheticTool('synthetic_internal', [])
        ]
    }
]);

const originalExecute = ScriptExecutor.executeInDesignScript;

try {
    let capturedScript = '';
    ScriptExecutor.executeInDesignScript = async (script) => {
        capturedScript = script;
        return 'Layer created: golden';
    };

    const result = await call('create_layer', { name: 'golden' }, { profile: 'classic' });

    assert.equal(result.success, true);
    assert.equal(result.operation, 'Create Layer');
    assert.equal(capturedScript.includes('var layer = doc.layers.add({name: "golden"});'), true);

    const unknown = await call('missing_tool', {}, { profile: 'classic' });
    assert.equal(unknown.success, false);
    assert.equal(unknown.operation, 'Tool Call');
    assert.match(unknown.result, /Tool 'missing_tool' not found or not implemented/);

    const advancedFromClassic = await call('synthetic_advanced', {}, { registry: syntheticRegistry, profile: 'classic' });
    assert.equal(advancedFromClassic.success, false);
    assert.match(advancedFromClassic.result, /not available for profile 'classic'/);

    const internalFromClassic = await call('synthetic_internal', {}, { registry: syntheticRegistry, profile: 'classic' });
    assert.equal(internalFromClassic.success, false);
    assert.match(internalFromClassic.result, /not available for profile 'classic'/);

    const classicFromAdvanced = await call('synthetic_classic', {}, { registry: syntheticRegistry, profile: 'advanced' });
    assert.equal(classicFromAdvanced.success, false);
    assert.match(classicFromAdvanced.result, /not available for profile 'advanced'/);

    await assert.rejects(
        () => call('create_layer', { name: 'missing-profile' }),
        /Invalid profile: undefined/
    );
    const internalFromInternal = await call('synthetic_internal', {}, { registry: syntheticRegistry, profile: 'internal' });
    assert.equal(internalFromInternal.success, true);
    assert.equal(internalFromInternal.operation, 'synthetic_internal');

    const publicFromInternal = await call('synthetic_classic', {}, { registry: syntheticRegistry, profile: 'internal' });
    assert.equal(publicFromInternal.success, false);
    assert.match(publicFromInternal.result, /not available for profile 'internal'/);

    assert.throws(
        () => createMcpServer({ profile: 'internal', registry: syntheticRegistry }),
        /Invalid profile: internal/
    );

    const classicServer = createMcpServer({ profile: 'classic', registry: syntheticRegistry });
    assert.deepEqual(classicServer.listTools().map((tool) => tool.name), ['synthetic_classic']);

    const advancedServer = createMcpServer({ profile: 'advanced', registry: syntheticRegistry });
    assert.deepEqual(advancedServer.listTools().map((tool) => tool.name), ['synthetic_advanced']);

    const serverAdvancedReject = await classicServer.callTool('synthetic_advanced', {});
    assert.equal(serverAdvancedReject.success, false);
    assert.match(serverAdvancedReject.result, /not available for profile 'classic'/);

    const serverInternalReject = await classicServer.callTool('synthetic_internal', {});
    assert.equal(serverInternalReject.success, false);
    assert.match(serverInternalReject.result, /not available for profile 'classic'/);

    const advancedInternalReject = await advancedServer.callTool('synthetic_internal', {});
    assert.equal(advancedInternalReject.success, false);
    assert.match(advancedInternalReject.result, /not available for profile 'advanced'/);
} finally {
    ScriptExecutor.executeInDesignScript = originalExecute;
}

console.log('Tool router checks passed');
