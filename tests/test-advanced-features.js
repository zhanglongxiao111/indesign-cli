#!/usr/bin/env node

/**
 * Advanced Features Test
 * Tests master spreads, spreads, layers, export, and book functionality
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

async function testAdvancedFeatures() {
    log('🚀 Starting Advanced Features Test', 'info');
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
            pages: 2,
            facingPages: true
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

        // Phase 2: Layer Management
        log('=== PHASE 2: Layer Management ===', 'info');

        // Create layer
        const createLayer = await testTool(serverProcess, 'create_layer', {
            name: 'Test Layer',
            visible: true,
            locked: false,
            color: 'BLUE'
        });
        testResults.total++;
        if (createLayer) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Set active layer
        const setActiveLayer = await testTool(serverProcess, 'set_active_layer', {
            layerName: 'Test Layer'
        });
        testResults.total++;
        if (setActiveLayer) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // List layers
        const listLayers = await testTool(serverProcess, 'list_layers');
        testResults.total++;
        if (listLayers) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 3: Master Spread Management
        log('=== PHASE 3: Master Spread Management ===', 'info');

        // Create master spread
        const createMasterSpread = await testTool(serverProcess, 'create_master_spread', {
            name: 'Test Master',
            baseName: 'Test Base',
            namePrefix: 'T',
            showMasterItems: true
        });
        testResults.total++;
        if (createMasterSpread) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // List master spreads
        const listMasterSpreads = await testTool(serverProcess, 'list_master_spreads');
        testResults.total++;
        if (listMasterSpreads) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Create master text frame
        const masterTextFrame = await testTool(serverProcess, 'create_master_text_frame', {
            masterName: 'Test Master',
            content: 'Master Page Text',
            x: 20,
            y: 20,
            width: 100,
            height: 30,
            fontSize: 12,
            fontFamily: 'Helvetica Neue'
        });
        testResults.total++;
        if (masterTextFrame) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Apply master spread
        const applyMasterSpread = await testTool(serverProcess, 'apply_master_spread', {
            masterName: 'Test Master',
            pageRange: 'all'
        });
        testResults.total++;
        if (applyMasterSpread) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 4: Spread Management
        log('=== PHASE 4: Spread Management ===', 'info');

        // List spreads
        const listSpreads = await testTool(serverProcess, 'list_spreads');
        testResults.total++;
        if (listSpreads) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Get spread info
        const getSpreadInfo = await testTool(serverProcess, 'get_spread_info', {
            spreadIndex: 0
        });
        testResults.total++;
        if (getSpreadInfo) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Set spread properties
        const setSpreadProperties = await testTool(serverProcess, 'set_spread_properties', {
            spreadIndex: 0,
            name: 'Test Spread',
            allowPageShuffle: true,
            showMasterItems: true
        });
        testResults.total++;
        if (setSpreadProperties) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 5: Document Advanced Features
        log('=== PHASE 5: Document Advanced Features ===', 'info');

        // Get document elements
        const getDocumentElements = await testTool(serverProcess, 'get_document_elements', {
            elementType: 'all'
        });
        testResults.total++;
        if (getDocumentElements) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Get document stories
        const getDocumentStories = await testTool(serverProcess, 'get_document_stories');
        testResults.total++;
        if (getDocumentStories) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Get document layers
        const getDocumentLayers = await testTool(serverProcess, 'get_document_layers');
        testResults.total++;
        if (getDocumentLayers) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Get document sections
        const getDocumentSections = await testTool(serverProcess, 'get_document_sections');
        testResults.total++;
        if (getDocumentSections) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 6: Export Functionality
        log('=== PHASE 6: Export Functionality ===', 'info');

        // Export PDF (to temp location)
        const exportPdf = await testTool(serverProcess, 'export_pdf', {
            filePath: '/tmp/test-export.pdf',
            quality: 'SCREEN',
            includeMarks: false,
            includeBleed: false,
            pages: 'all'
        });
        testResults.total++;
        if (exportPdf) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Export images
        const exportImages = await testTool(serverProcess, 'export_images', {
            outputPath: '/tmp',
            format: 'PNG',
            resolution: 150,
            pages: 'all',
            quality: 80
        });
        testResults.total++;
        if (exportImages) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Package document
        const packageDocument = await testTool(serverProcess, 'package_document', {
            outputPath: '/tmp/package',
            includeFonts: true,
            includeLinks: true,
            includeProfiles: true
        });
        testResults.total++;
        if (packageDocument) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 7: Utility Functions
        log('=== PHASE 7: Utility Functions ===', 'info');

        // Execute custom code
        const executeCode = await testTool(serverProcess, 'execute_indesign_code', {
            code: 'app.activeDocument.name;'
        });
        testResults.total++;
        if (executeCode) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // View document
        const viewDocument = await testTool(serverProcess, 'view_document');
        testResults.total++;
        if (viewDocument) testResults.passed++; else testResults.failed++;
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
testAdvancedFeatures().catch(error => {
    log(`Test failed: ${error.message}`, 'error');
    process.exit(1);
}); 