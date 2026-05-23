#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const indexPath = join(__dirname, 'index.js');

function runIndex(args, timeoutMs) {
    return new Promise((resolve) => {
        const child = spawn('node', [indexPath, ...args], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let output = '';
        let errorOutput = '';
        let settled = false;

        const timeout = setTimeout(() => {
            if (settled) {
                return;
            }
            settled = true;
            child.kill();
            resolve({ code: null, timedOut: true, output, errorOutput });
        }, timeoutMs);

        child.stdout.on('data', (data) => {
            output += data.toString();
        });

        child.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        child.on('close', (code) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timeout);
            resolve({ code, timedOut: false, output, errorOutput });
        });
    });
}

function assert(condition, message, payload) {
    if (!condition) {
        console.error(message);
        if (payload) {
            console.error(JSON.stringify(payload, null, 2));
        }
        process.exit(1);
    }
}

const missing = await runIndex(['--suite', '__missing_suite__'], 5000);
assert(!missing.timedOut, 'Missing suite should fail fast, not run the full suite list', missing);
assert(missing.code === 1, 'Missing suite should exit with code 1', missing);
assert(missing.output.includes('Unknown test suite'), 'Missing suite should explain the bad suite name', missing);

const basic = await runIndex(['--suite', 'Basic Connectivity'], 60000);
assert(!basic.timedOut, 'Basic Connectivity suite should finish under 60 seconds', basic);
assert(basic.code === 0, 'Basic Connectivity suite should pass', basic);
assert(basic.output.includes('Total Test Suites: 1'), 'Suite filter should run exactly one suite', basic);
assert(basic.output.includes('Total Tests: 2'), 'Basic Connectivity should run exactly two test files', basic);

console.log('Master runner CLI arg tests passed');
