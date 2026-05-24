#!/usr/bin/env node

/**
 * Simple Document Test
 * Tests basic document creation and activation
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_CONFIG = {
    serverPath: join(__dirname, '../src/index.js'),
    delay: 2000,
    timeout: 30000
};

function log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const emoji = {
        info: 'ℹ️',
        success: '✅',
        error: '❌',
        warning: '⚠️'
    }[level] || 'ℹ️';
    console.log(`${emoji} [${timestamp}] ${message}`);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendRequest(serverProcess, method, params = {}) {
    return new Promise((resolve, reject) => {
        const request = {
            jsonrpc: '2.0',
            id: Date.now(),
            method: method,
            params: params
        };

        const requestStr = JSON.stringify(request) + '\n';
        serverProcess.stdin.write(requestStr);

        let responseData = '';
        const timeout = setTimeout(() => {
            reject(new Error('Request timeout'));
        }, TEST_CONFIG.timeout);

        const responseHandler = (data) => {
            responseData += data.toString();
            if (responseData.includes('\n')) {
                clearTimeout(timeout);
                serverProcess.stdout.removeListener('data', responseHandler);
                try {
                    const response = JSON.parse(responseData.trim());
                    resolve(response);
                } catch (error) {
                    reject(new Error(`Failed to parse response: ${error.message}`));
                }
            }
        };

        serverProcess.stdout.on('data', responseHandler);
    });
}

async function testTool(serverProcess, toolName, args = {}) {
    try {
        log(`Testing: ${toolName}`, 'info');

        const response = await sendRequest(serverProcess, 'tools/call', {
            name: toolName,
            arguments: args
        });

        if (response.error) {
            log(`${toolName}: ❌ Error - ${response.error.message}`, 'error');
            return false;
        }

        if (response.result && response.result.content && response.result.content[0]) {
            const content = response.result.content[0].text;
            log(`Raw response: ${content}`, 'info');

            // Check if the content indicates "No document open"
            if (content.includes('No document open') || content.includes('No documents are open')) {
                log(`${toolName}: ❌ Failed - No document open`, 'error');
                return false;
            }

            // Try to parse as JSON first
            let toolResult;
            try {
                toolResult = JSON.parse(content);
            } catch (parseError) {
                // If not JSON, treat as plain text
                toolResult = { success: true, result: content };
            }

            if (toolResult.success) {
                log(`${toolName}: ✅ Success - ${toolResult.operation || 'Operation completed'}`, 'success');
                return true;
            } else {
                log(`${toolName}: ❌ Failed - ${toolResult.result || 'Unknown error'}`, 'error');
                return false;
            }
        } else {
            log(`${toolName}: ❌ No result content`, 'error');
            return false;
        }
    } catch (error) {
        log(`${toolName}: ❌ Request failed - ${error.message}`, 'error');
        return false;
    }
}

async function testSimpleDocument() {
    log('🚀 Starting Simple Document Test', 'info');
    log(`Server Path: ${TEST_CONFIG.serverPath}`, 'info');

    const serverProcess = spawn('node', [TEST_CONFIG.serverPath], {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    serverProcess.stderr.on('data', (data) => {
        log(`Server Error: ${data.toString().trim()}`, 'error');
    });

    // Wait for server to start
    await delay(3000);

    const testResults = {
        total: 0,
        passed: 0,
        failed: 0,
        errors: []
    };

    try {
        // Test 1: Create document
        log('=== TEST 1: Create Document ===', 'info');
        const documentCreated = await testTool(serverProcess, 'create_document', {
            width: 210,
            height: 297,
            pages: 1,
            facingPages: false
        });

        testResults.total++;
        if (documentCreated) {
            testResults.passed++;
            log('✅ Document creation successful', 'success');
        } else {
            testResults.failed++;
            log('❌ Document creation failed', 'error');
            return;
        }

        await delay(TEST_CONFIG.delay);

        // Test 2: Get document info
        log('=== TEST 2: Get Document Info ===', 'info');
        const documentInfo = await testTool(serverProcess, 'get_document_info');

        testResults.total++;
        if (documentInfo) {
            testResults.passed++;
            log('✅ Document info retrieval successful', 'success');
        } else {
            testResults.failed++;
            log('❌ Document info retrieval failed', 'error');
        }

        await delay(TEST_CONFIG.delay);

        // Test 3: Close document
        log('=== TEST 3: Close Document ===', 'info');
        const documentClosed = await testTool(serverProcess, 'close_document');

        testResults.total++;
        if (documentClosed) {
            testResults.passed++;
            log('✅ Document close successful', 'success');
        } else {
            testResults.failed++;
            log('❌ Document close failed', 'error');
        }

    } catch (error) {
        log(`Test execution error: ${error.message}`, 'error');
        testResults.errors.push(error.message);
    } finally {
        // Cleanup
        serverProcess.kill();
        await delay(1000);
    }

    // Results
    log('\n=== TEST RESULTS ===', 'info');
    log(`Total Tests: ${testResults.total}`, 'info');
    log(`Passed: ${testResults.passed}`, 'success');
    log(`Failed: ${testResults.failed}`, testResults.failed > 0 ? 'error' : 'success');
    log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`, 'info');

    if (testResults.errors.length > 0) {
        log('\n=== ERRORS ===', 'error');
        testResults.errors.forEach((error, index) => {
            log(`${index + 1}. ${error}`, 'error');
        });
    }

    process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run the test
testSimpleDocument().catch(error => {
    log(`Test failed: ${error.message}`, 'error');
    process.exit(1);
}); 