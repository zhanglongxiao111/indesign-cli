#!/usr/bin/env node

import assert from 'assert/strict';

import { buildExitCode, summarizeResults } from './run-all-tools.js';

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

console.log('Tool suite summary contract checks passed');
