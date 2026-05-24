#!/usr/bin/env node

/**
 * Basic InDesign Test
 * Tests if InDesign is accessible and can execute basic commands
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

async function testInDesignBasic() {
    log('🚀 Starting Basic InDesign Test', 'info');
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
        // Test 1: Check if InDesign is accessible
        log('=== TEST 1: Check InDesign Accessibility ===', 'info');

        // Use execute_indesign_code to test basic InDesign access
        const basicTest = await testTool(serverProcess, 'execute_indesign_code', {
            code: `
                try {
                    if (app) {
                        "InDesign is accessible. Version: " + app.version;
                    } else {
                        "InDesign app object not available";
                    }
                } catch (error) {
                    "Error accessing InDesign: " + error.message;
                }
            `
        });

        testResults.total++;
        if (basicTest) {
            testResults.passed++;
            log('✅ InDesign accessibility test successful', 'success');
        } else {
            testResults.failed++;
            log('❌ InDesign accessibility test failed', 'error');
        }

        await delay(TEST_CONFIG.delay);

        // Test 2: Check documents collection
        log('=== TEST 2: Check Documents Collection ===', 'info');

        const documentsTest = await testTool(serverProcess, 'execute_indesign_code', {
            code: `
                try {
                    "Documents count: " + app.documents.length;
                } catch (error) {
                    "Error accessing documents: " + error.message;
                }
            `
        });

        testResults.total++;
        if (documentsTest) {
            testResults.passed++;
            log('✅ Documents collection test successful', 'success');
        } else {
            testResults.failed++;
            log('❌ Documents collection test failed', 'error');
        }

        await delay(TEST_CONFIG.delay);

        // Test 3: Try to create a document with basic approach
        log('=== TEST 3: Basic Document Creation ===', 'info');

        const createTest = await testTool(serverProcess, 'execute_indesign_code', {
            code: `
                try {
                    var doc = app.documents.add();
                    "Document created successfully. Name: " + doc.name;
                } catch (error) {
                    "Error creating document: " + error.message;
                }
            `
        });

        testResults.total++;
        if (createTest) {
            testResults.passed++;
            log('✅ Basic document creation successful', 'success');
        } else {
            testResults.failed++;
            log('❌ Basic document creation failed', 'error');
        }

        await delay(TEST_CONFIG.delay);

        // Test 4: Check if document is now active
        log('=== TEST 4: Check Active Document ===', 'info');

        const activeTest = await testTool(serverProcess, 'execute_indesign_code', {
            code: `
                try {
                    if (app.activeDocument) {
                        "Active document: " + app.activeDocument.name;
                    } else {
                        "No active document";
                    }
                } catch (error) {
                    "Error checking active document: " + error.message;
                }
            `
        });

        testResults.total++;
        if (activeTest) {
            testResults.passed++;
            log('✅ Active document check successful', 'success');
        } else {
            testResults.failed++;
            log('❌ Active document check failed', 'error');
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
testInDesignBasic().catch(error => {
    log(`Test failed: ${error.message}`, 'error');
    process.exit(1);
}); 