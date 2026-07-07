#!/usr/bin/env node

import assert from 'assert/strict';
import path from 'path';

import { formatScriptResult } from '../../src/utils/stringUtils.js';
import { buildExitCode, summarizeResults, ToolSuiteRunner } from './run-all-tools.js';

const results = [
    { tool: 'ok', status: 'passed' },
    { tool: 'book.create', status: 'skipped' },
    { tool: 'known', status: 'expectedFailure' },
    { tool: 'broken', status: 'failed' },
];

assert.deepEqual(summarizeResults(results, null), {
    totalTools: 4,
    passed: 1,
    skipped: 1,
    expectedFailed: 1,
    failed: 1,
    runnerError: null,
});
assert.equal(buildExitCode(summarizeResults(results, null)), 1);

const expectedOnly = summarizeResults(results.filter((item) => item.status !== 'failed'), null);
assert.equal(expectedOnly.failed, 0);
assert.equal(buildExitCode(expectedOnly), 0);

const runnerFailure = summarizeResults([], 'server failed');
assert.equal(runnerFailure.failed, 0);
assert.equal(buildExitCode(runnerFailure), 1);

const errorTextPassed = summarizeResults([
    { tool: 'bad-envelope', status: 'passed', message: "Error: Object does not support the property or method 'undefined'" },
], null);
assert.equal(errorTextPassed.passed, 0);
assert.equal(errorTextPassed.failed, 1);
assert.equal(buildExitCode(errorTextPassed), 1);

assert.equal(formatScriptResult("Error: Object does not support the property or method 'undefined'", 'Synthetic').success, false);
assert.equal(formatScriptResult('Failed to export file', 'Synthetic').success, false);

const runner = new ToolSuiteRunner(new Map());
assert.deepEqual(runner.buildArguments({
    name: 'needs_integer',
    inputSchema: {
        properties: {
            pageIndex: { type: 'integer' },
        },
        required: ['pageIndex'],
    },
}), { pageIndex: 0 });

assert.equal(path.extname(runner.buildArguments({
    name: 'export_epub',
    inputSchema: {
        properties: {
            filePath: { type: 'string' },
        },
        required: ['filePath'],
    },
}).filePath), '.epub');

console.log('Tool suite summary contract checks passed');
