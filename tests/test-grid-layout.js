#!/usr/bin/env node

/**
 * Test Grid and Layout Tools
 * Tests the new comprehensive grid and layout functionality
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_CONFIG = {
    serverPath: join(__dirname, '../index.js'),
    delay: 1000,
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

async function testGridAndLayoutTools() {
    log('🚀 Starting Grid and Layout Tools Test', 'info');
    log(`Server Path: ${TEST_CONFIG.serverPath}`, 'info');

    const serverProcess = spawn('node', [TEST_CONFIG.serverPath], {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    serverProcess.stderr.on('data', (data) => {
        log(`Server Error: ${data.toString().trim()}`, 'error');
    });

    // Wait for server to start
    await delay(2000);

    const testResults = {
        total: 0,
        passed: 0,
        failed: 0,
        errors: []
    };

    try {
        // Phase 1: Document Foundation
        log('=== PHASE 1: Document Foundation ===', 'info');

        // Create a new document
        const documentCreated = await testTool(serverProcess, 'create_document', {
            width: 210,
            height: 297,
            pages: 1,
            facingPages: false,
            marginTop: 20,
            marginBottom: 20,
            marginLeft: 20,
            marginRight: 20
        });

        if (!documentCreated) {
            log('❌ Document creation failed - cannot continue', 'error');
            return;
        }

        testResults.total++;
        testResults.passed++;
        await delay(TEST_CONFIG.delay);

        // Verify document is open by getting document info
        const documentInfo = await testTool(serverProcess, 'get_document_info');
        if (!documentInfo) {
            log('❌ Document info retrieval failed - document may not be properly open', 'error');
            return;
        }

        testResults.total++;
        testResults.passed++;
        await delay(TEST_CONFIG.delay);

        // Phase 2: Grid Settings
        log('=== PHASE 2: Grid Settings ===', 'info');

        // Test getting current grid settings
        const gridSettingsRetrieved = await testTool(serverProcess, 'get_document_grid_settings');
        testResults.total++;
        if (gridSettingsRetrieved) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Test setting grid settings
        const gridSettingsSet = await testTool(serverProcess, 'set_document_grid_settings', {
            documentGrid: true,
            documentGridIncrement: '12pt',
            documentGridSubdivision: 4,
            baselineGrid: true,
            baselineGridIncrement: '12pt',
            baselineGridOffset: '0pt',
            gridViewThreshold: 50,
            baselineGridViewThreshold: 50
        });
        testResults.total++;
        if (gridSettingsSet) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Verify grid settings were applied
        const gridSettingsVerified = await testTool(serverProcess, 'get_document_grid_settings');
        testResults.total++;
        if (gridSettingsVerified) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 3: Layout Preferences
        log('=== PHASE 3: Layout Preferences ===', 'info');

        // Test getting current layout preferences
        const layoutPrefsRetrieved = await testTool(serverProcess, 'get_document_layout_preferences');
        testResults.total++;
        if (layoutPrefsRetrieved) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Test setting layout preferences
        const layoutPrefsSet = await testTool(serverProcess, 'set_document_layout_preferences', {
            adjustLayout: true,
            adjustLayoutMargins: true,
            adjustLayoutPageBreaks: false,
            alignDistributeBounds: 'ALIGN_TO_MARGINS',
            alignDistributeSpacing: 'DISTRIBUTE_SPACE_BETWEEN',
            smartGuidePreferences: true
        });
        testResults.total++;
        if (layoutPrefsSet) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Verify layout preferences were applied
        const layoutPrefsVerified = await testTool(serverProcess, 'get_document_layout_preferences');
        testResults.total++;
        if (layoutPrefsVerified) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 4: Enhanced Grid Preferences
        log('=== PHASE 4: Enhanced Grid Preferences ===', 'info');

        // Test getting enhanced grid preferences
        const enhancedGridPrefs = await testTool(serverProcess, 'get_document_preferences', { preferenceType: 'GRID' });
        testResults.total++;
        if (enhancedGridPrefs) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 5: Cleanup
        log('=== PHASE 5: Cleanup ===', 'info');

        const documentClosed = await testTool(serverProcess, 'close_document');
        testResults.total++;
        if (documentClosed) testResults.passed++; else testResults.failed++;
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
testGridAndLayoutTools().catch(error => {
    log(`Test failed: ${error.message}`, 'error');
    process.exit(1);
}); 