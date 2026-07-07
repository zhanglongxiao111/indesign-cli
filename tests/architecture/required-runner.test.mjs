#!/usr/bin/env node

import assert from 'assert/strict';
import fs from 'fs';

const runnerSource = fs.readFileSync('tests/index.js', 'utf8');

assert.match(runnerSource, /name:\s*['"]Architecture Registry['"]/);
assert.match(
    runnerSource,
    /name:\s*['"]Architecture Registry['"][\s\S]*?required:\s*true/,
    'Architecture Registry suite must be required'
);
assert.match(
    runnerSource,
    /tests:\s*\[[\s\S]*?['"]architecture\/registry\.test\.mjs['"][\s\S]*?['"]architecture\/required-runner\.test\.mjs['"]/,
    'Architecture Registry suite should run both architecture tests'
);

console.log('Required runner architecture suite checks passed');
