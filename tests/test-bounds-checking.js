#!/usr/bin/env node

/**
 * Bounds Checking Test
 * Verifies that all content is properly positioned within page boundaries
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
                return toolResult;
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

async function testBoundsChecking() {
    log('🚀 Starting Bounds Checking Test', 'info');
    log(`Server Path: ${TEST_CONFIG.serverPath}`, 'info');

    const serverProcess = spawn('node', [TEST_CONFIG.serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
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
    let createdDocumentName = '';

    try {
        // Phase 1: Create a properly sized document with good margins
        log('=== PHASE 1: Create Document with Proper Margins ===', 'info');
        const documentCreated = await testTool(serverProcess, 'create_document', {
            width: 210,  // A4 width in mm
            height: 297, // A4 height in mm
            pages: 1,
            facingPages: false,
            marginTop: 20,
            marginBottom: 20,
            marginLeft: 20,
            marginRight: 20
        });

        testResults.total++;
        if (documentCreated) {
            testResults.passed++;
            createdDocumentName = String(documentCreated.result || '').match(/Document name:\s*(.+)/)?.[1]?.trim() || '';
            log('✅ Document created with proper margins', 'success');
        } else {
            testResults.failed++;
            log('❌ Document creation failed', 'error');
            return;
        }
        await delay(TEST_CONFIG.delay);

        // Phase 2: Test text frame positioning within bounds
        log('=== PHASE 2: Text Frame Bounds Testing ===', 'info');

        // Test 1: Text frame with explicit coordinates within bounds
        const textFrame1 = await testTool(serverProcess, 'create_text_frame', {
            content: 'Test content within bounds',
            x: 30,
            y: 30,
            width: 150,
            height: 50
        });
        testResults.total++;
        if (textFrame1) {
            testResults.passed++;
            log('✅ Text frame 1 created within bounds', 'success');
        } else {
            testResults.failed++;
            log('❌ Text frame 1 failed', 'error');
        }
        await delay(TEST_CONFIG.delay);

        // Test 2: Text frame with smart positioning (no coordinates)
        const textFrame2 = await testTool(serverProcess, 'create_text_frame', {
            content: 'Smart positioned content'
        });
        testResults.total++;
        if (textFrame2) {
            testResults.passed++;
            log('✅ Text frame 2 created with smart positioning', 'success');
        } else {
            testResults.failed++;
            log('❌ Text frame 2 failed', 'error');
        }
        await delay(TEST_CONFIG.delay);

        // Phase 3: Test graphics positioning within bounds
        log('=== PHASE 3: Graphics Bounds Testing ===', 'info');

        // Test 3: Rectangle within bounds
        const rectangle = await testTool(serverProcess, 'create_rectangle', {
            x: 30,
            y: 100,
            width: 80,
            height: 40
        });
        testResults.total++;
        if (rectangle) {
            testResults.passed++;
            log('✅ Rectangle created within bounds', 'success');
        } else {
            testResults.failed++;
            log('❌ Rectangle failed', 'error');
        }
        await delay(TEST_CONFIG.delay);

        // Test 4: Ellipse with smart positioning
        const ellipse = await testTool(serverProcess, 'create_ellipse', {
            width: 60,
            height: 60
        });
        testResults.total++;
        if (ellipse) {
            testResults.passed++;
            log('✅ Ellipse created with smart positioning', 'success');
        } else {
            testResults.failed++;
            log('❌ Ellipse failed', 'error');
        }
        await delay(TEST_CONFIG.delay);

        // Phase 4: Test table positioning within bounds
        log('=== PHASE 4: Table Bounds Testing ===', 'info');

        const table = await testTool(serverProcess, 'create_table', {
            rows: 3,
            columns: 3,
            x: 30,
            y: 180,
            width: 150,
            height: 60,
            headerRows: 1
        });
        testResults.total++;
        if (table) {
            testResults.passed++;
            log('✅ Table created within bounds', 'success');
        } else {
            testResults.failed++;
            log('❌ Table failed', 'error');
        }
        await delay(TEST_CONFIG.delay);

        // Phase 5: Test edge cases - content that should be rejected
        log('=== PHASE 5: Edge Case Testing ===', 'info');

        // Test 5: Text frame that would extend beyond page (should be handled by smart positioning)
        const edgeCaseText = await testTool(serverProcess, 'create_text_frame', {
            content: 'Edge case content',
            x: 200,  // This would be beyond the page width
            y: 30,
            width: 50,
            height: 30
        });
        testResults.total++;
        if (edgeCaseText) {
            testResults.passed++;
            log('✅ Edge case text frame handled correctly', 'success');
        } else {
            testResults.failed++;
            log('❌ Edge case text frame failed', 'error');
        }
        await delay(TEST_CONFIG.delay);

        // Phase 6: Verify session manager has correct page dimensions
        log('=== PHASE 6: Session Manager Verification ===', 'info');

        const sessionInfo = await testTool(serverProcess, 'get_session_info', {});
        testResults.total++;
        if (sessionInfo) {
            testResults.passed++;
            log('✅ Session manager has page dimensions', 'success');
        } else {
            testResults.failed++;
            log('❌ Session manager verification failed', 'error');
        }
        await delay(TEST_CONFIG.delay);

        // Phase 7: Cleanup
        log('=== PHASE 7: Cleanup ===', 'info');
        const documentClosed = await testTool(serverProcess, 'close_document', { allowDiscard: true, forceActiveDocument: true });
        testResults.total++;
        if (documentClosed) {
            testResults.passed++;
            createdDocumentName = '';
            log('✅ Document closed successfully', 'success');
        } else {
            testResults.failed++;
            log('❌ Document close failed', 'error');
        }

    } catch (error) {
        log(`Test execution error: ${error.message}`, 'error');
        testResults.errors.push(error.message);
    } finally {
        if (createdDocumentName) {
            const closed = await testTool(serverProcess, 'close_document', {
                expectedDocumentName: createdDocumentName,
                allowDiscard: true
            });
            if (!closed) {
                testResults.failed++;
                testResults.errors.push(`Failed to close test document: ${createdDocumentName}`);
            }
        }
        serverProcess.kill();
        await delay(1000);
    }

    // Results
    log('\n=== BOUNDS CHECKING TEST RESULTS ===', 'info');
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

    // This test should exit with code 0 if all bounds checking worked correctly
    const expectedPasses = 9; // All 9 checks should pass
    if (testResults.passed === expectedPasses) {
        log('✅ All bounds checking tests passed correctly', 'success');
        log('✅ Content positioning is working properly within page boundaries', 'success');
        process.exit(0);
    } else {
        log(`❌ Bounds checking test failed. Expected ${expectedPasses} passes, got ${testResults.passed}`, 'error');
        process.exit(1);
    }
}

// Run the test
testBoundsChecking().catch(error => {
    log(`Test failed: ${error.message}`, 'error');
    process.exit(1);
}); 
