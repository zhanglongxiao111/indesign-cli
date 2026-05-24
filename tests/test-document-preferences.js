#!/usr/bin/env node

/**
 * Comprehensive Document Preferences Test
 * Tests all document preference types and functionality
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

async function testDocumentPreferences() {
    log('🚀 Starting Comprehensive Document Preferences Test', 'info');
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
        // Phase 1: Document Foundation
        log('=== PHASE 1: Document Foundation ===', 'info');
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

        // Phase 2: General Preferences
        log('=== PHASE 2: General Preferences ===', 'info');

        // Test getting general preferences
        const generalPrefsGet = await testTool(serverProcess, 'get_document_preferences', { preferenceType: 'GENERAL' });
        testResults.total++;
        if (generalPrefsGet) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Test setting general preferences
        const generalPrefsSet = await testTool(serverProcess, 'set_document_preferences', {
            preferenceType: 'GENERAL',
            preferences: {
                facingPages: true,
                pagesPerDocument: 2,
                startPageNumber: 1
            }
        });
        testResults.total++;
        if (generalPrefsSet) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 3: Grid Preferences
        log('=== PHASE 3: Grid Preferences ===', 'info');

        // Test getting grid preferences
        const gridPrefsGet = await testTool(serverProcess, 'get_document_preferences', { preferenceType: 'GRID' });
        testResults.total++;
        if (gridPrefsGet) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Test setting grid preferences
        const gridPrefsSet = await testTool(serverProcess, 'set_document_preferences', {
            preferenceType: 'GRID',
            preferences: {
                documentGridIncrement: 12,
                documentGridSubdivision: 4,
                gridViewThreshold: 50,
                baselineGridIncrement: 12,
                baselineGridOffset: 0
            }
        });
        testResults.total++;
        if (gridPrefsSet) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 4: Guides Preferences
        log('=== PHASE 4: Guides Preferences ===', 'info');

        // Test getting guides preferences
        const guidesPrefsGet = await testTool(serverProcess, 'get_document_preferences', { preferenceType: 'GUIDES' });
        testResults.total++;
        if (guidesPrefsGet) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Test setting guides preferences
        const guidesPrefsSet = await testTool(serverProcess, 'set_document_preferences', {
            preferenceType: 'GUIDES',
            preferences: {
                guidesLocked: true,
                guidesInBack: false,
                guidesSnapToZone: 4,
                guidesViewThreshold: 25
            }
        });
        testResults.total++;
        if (guidesPrefsSet) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 5: Text Preferences
        log('=== PHASE 5: Text Preferences ===', 'info');

        // Test getting text preferences
        const textPrefsGet = await testTool(serverProcess, 'get_document_preferences', { preferenceType: 'TEXT' });
        testResults.total++;
        if (textPrefsGet) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Test setting text preferences
        const textPrefsSet = await testTool(serverProcess, 'set_document_preferences', {
            preferenceType: 'TEXT',
            preferences: {
                typographersQuotes: true,
                useTypographersQuotes: true,
                highlightSubstitutedFonts: true,
                highlightKeepsViolations: true
            }
        });
        testResults.total++;
        if (textPrefsSet) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 6: Margins Preferences
        log('=== PHASE 6: Margins Preferences ===', 'info');

        // Test getting margins preferences
        const marginsPrefsGet = await testTool(serverProcess, 'get_document_preferences', { preferenceType: 'MARGINS' });
        testResults.total++;
        if (marginsPrefsGet) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Test setting margins preferences
        const marginsPrefsSet = await testTool(serverProcess, 'set_document_preferences', {
            preferenceType: 'MARGINS',
            preferences: {
                marginTop: 25,
                marginBottom: 25,
                marginLeft: 20,
                marginRight: 20,
                columnCount: 2,
                columnGutter: 5
            }
        });
        testResults.total++;
        if (marginsPrefsSet) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 7: Verify Changes
        log('=== PHASE 7: Verify Changes ===', 'info');

        // Verify general preferences were applied
        const verifyGeneral = await testTool(serverProcess, 'get_document_preferences', { preferenceType: 'GENERAL' });
        testResults.total++;
        if (verifyGeneral) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Verify margins preferences were applied
        const verifyMargins = await testTool(serverProcess, 'get_document_preferences', { preferenceType: 'MARGINS' });
        testResults.total++;
        if (verifyMargins) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 8: Cleanup
        log('=== PHASE 8: Cleanup ===', 'info');
        const documentClosed = await testTool(serverProcess, 'close_document');
        testResults.total++;
        if (documentClosed) testResults.passed++; else testResults.failed++;

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
testDocumentPreferences().catch(error => {
    log(`Test failed: ${error.message}`, 'error');
    process.exit(1);
}); 