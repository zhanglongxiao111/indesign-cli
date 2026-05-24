#!/usr/bin/env node

/**
 * Simple MCP Protocol Test
 * Tests basic MCP communication before running comprehensive tests
 */

import { spawn } from 'child_process';

function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
}

function sendMCPCommand(command) {
    return new Promise((resolve, reject) => {
        const child = spawn('node', ['src/index.js'], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let errorOutput = '';

        child.stdout.on('data', (data) => {
            output += data.toString();
        });

        child.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve(output);
            } else {
                reject(new Error(`Process exited with code ${code}: ${errorOutput}`));
            }
        });

        child.on('error', (error) => {
            reject(error);
        });

        // Send the command
        child.stdin.write(JSON.stringify(command) + '\n');
        child.stdin.end();

        // Timeout after 10 seconds
        setTimeout(() => {
            child.kill();
            reject(new Error('Command timed out'));
        }, 10000);
    });
}

async function testMCPProtocol() {
    log('🚀 Testing MCP Protocol Communication', 'info');

    try {
        // Test 1: List tools
        log('Testing: tools/list', 'info');
        const listCommand = {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
            params: {}
        };

        const listResult = await sendMCPCommand(listCommand);
        log('✅ tools/list response received', 'success');

        // Parse the response
        const listResponse = JSON.parse(listResult);
        if (listResponse.result && listResponse.result.tools) {
            log(`📊 Found ${listResponse.result.tools.length} tools`, 'success');
        }

        // Test 2: Call a simple tool
        log('Testing: get_document_info', 'info');
        const callCommand = {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
                name: 'get_document_info',
                arguments: {}
            }
        };

        const callResult = await sendMCPCommand(callCommand);
        log('✅ get_document_info response received', 'success');

        // Parse the response
        const callResponse = JSON.parse(callResult);
        if (callResponse.result && callResponse.result.content && callResponse.result.content[0]) {
            const toolResult = JSON.parse(callResponse.result.content[0].text);
            log(`📄 Tool result: ${toolResult.operation}`, 'success');
        }

        log('🎉 MCP Protocol test completed successfully!', 'success');
        return true;

    } catch (error) {
        log(`❌ MCP Protocol test failed: ${error.message}`, 'error');
        return false;
    }
}

// Run the test
testMCPProtocol().then(success => {
    process.exit(success ? 0 : 1);
}).catch(error => {
    log(`❌ Test failed to start: ${error.message}`, 'error');
    process.exit(1);
}); 