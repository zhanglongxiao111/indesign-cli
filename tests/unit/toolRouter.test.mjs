#!/usr/bin/env node

import assert from 'assert/strict';

import { call } from '../../src/core/toolRouter.js';
import { ScriptExecutor } from '../../src/core/scriptExecutor.js';

const originalExecute = ScriptExecutor.executeInDesignScript;

try {
    let capturedScript = '';
    ScriptExecutor.executeInDesignScript = async (script) => {
        capturedScript = script;
        return 'Layer created: golden';
    };

    const result = await call('create_layer', { name: 'golden' });

    assert.equal(result.success, true);
    assert.equal(result.operation, 'Create Layer');
    assert.equal(capturedScript.includes('var layer = doc.layers.add({name: "golden"});'), true);

    const unknown = await call('missing_tool', {});
    assert.equal(unknown.success, false);
    assert.equal(unknown.operation, 'Tool Call');
    assert.match(unknown.result, /Tool 'missing_tool' not found or not implemented/);
} finally {
    ScriptExecutor.executeInDesignScript = originalExecute;
}

console.log('Tool router checks passed');
