#!/usr/bin/env node

/**
 * Error Handling Test
 * Tests that errors are properly reported as failures
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

async function testErrorHandling() {
    log('🚀 Starting Error Handling Test', 'info');
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
        // Test 1: Valid tool call (should pass)
        log('=== TEST 1: Valid Tool Call ===', 'info');
        const validTest = await testTool(serverProcess, 'get_session_info', {});
        testResults.total++;
        if (validTest) {
            testResults.passed++;
            log('✅ Valid tool call passed', 'success');
        } else {
            testResults.failed++;
            log('❌ Valid tool call failed', 'error');
        }
        await delay(TEST_CONFIG.delay);

        // Test 2: Invalid tool call (should fail)
        log('=== TEST 2: Invalid Tool Call ===', 'info');
        const invalidTest = await testTool(serverProcess, 'non_existent_tool', {});
        testResults.total++;
        if (!invalidTest) {
            testResults.passed++;
            log('✅ Invalid tool call correctly failed', 'success');
        } else {
            testResults.failed++;
            log('❌ Invalid tool call should have failed but passed', 'error');
        }
        await delay(TEST_CONFIG.delay);

        // Test 3: Tool with invalid arguments (should fail)
        log('=== TEST 3: Invalid Arguments ===', 'info');
        const invalidArgsTest = await testTool(serverProcess, 'create_document', {
            width: 'invalid',
            height: 'invalid'
        });
        testResults.total++;
        if (!invalidArgsTest) {
            testResults.passed++;
            log('✅ Invalid arguments correctly failed', 'success');
        } else {
            testResults.failed++;
            log('❌ Invalid arguments should have failed but passed', 'error');
        }
        await delay(TEST_CONFIG.delay);

        // Test 4: Tool with invalid arguments (should fail)
        log('=== TEST 4: Invalid Arguments for Text Frame ===', 'info');
        const invalidTextArgsTest = await testTool(serverProcess, 'create_text_frame', {
            content: 'Test content',
            x: 'invalid',
            y: 'invalid',
            width: 'invalid',
            height: 'invalid'
        });
        testResults.total++;
        if (!invalidTextArgsTest) {
            testResults.passed++;
            log('✅ Invalid text frame arguments correctly failed', 'success');
        } else {
            testResults.failed++;
            log('❌ Invalid text frame arguments should have failed but passed', 'error');
        }
        await delay(TEST_CONFIG.delay);

        // Test 5: Valid tool call with proper arguments (should pass)
        log('=== TEST 5: Valid Text Frame Creation ===', 'info');
        const validTextTest = await testTool(serverProcess, 'create_text_frame', {
            content: 'Test content',
            x: 20,
            y: 20,
            width: 100,
            height: 50
        });
        testResults.total++;
        if (validTextTest) {
            testResults.passed++;
            log('✅ Valid text frame creation passed', 'success');
        } else {
            testResults.failed++;
            log('❌ Valid text frame creation failed', 'error');
        }
        await delay(TEST_CONFIG.delay);

    } catch (error) {
        log(`Test execution error: ${error.message}`, 'error');
        testResults.errors.push(error.message);
    } finally {
        // Cleanup
        serverProcess.kill();
        await delay(1000);
    }

    // Results
    log('\n=== ERROR HANDLING TEST RESULTS ===', 'info');
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

    // This test should exit with code 0 if all error handling worked correctly
    // (i.e., valid tests passed and invalid tests correctly failed)
    const expectedPasses = 5; // All 5 tests should "pass" in terms of error handling
    if (testResults.passed === expectedPasses) {
        log('✅ All error handling tests passed correctly', 'success');
        process.exit(0);
    } else {
        log(`❌ Error handling test failed. Expected ${expectedPasses} passes, got ${testResults.passed}`, 'error');
        process.exit(1);
    }
}

// Run the test
testErrorHandling().catch(error => {
    log(`Test failed: ${error.message}`, 'error');
    process.exit(1);
}); 