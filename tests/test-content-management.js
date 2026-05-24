#!/usr/bin/env node

/**
 * Content Management Test
 * Tests text, graphics, styles, and color management functionality
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

async function testContentManagement() {
    log('🚀 Starting Content Management Test', 'info');
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

        // Phase 2: Text Management
        log('=== PHASE 2: Text Management ===', 'info');

        // Create text frame
        const textFrame = await testTool(serverProcess, 'create_text_frame', {
            content: 'Sample text content for testing',
            x: 20,
            y: 20,
            width: 100,
            height: 50,
            fontSize: 12,
            fontFamily: 'Helvetica Neue'
        });
        testResults.total++;
        if (textFrame) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Edit text frame
        const editText = await testTool(serverProcess, 'edit_text_frame', {
            frameIndex: 0,
            content: 'Updated text content',
            fontSize: 14
        });
        testResults.total++;
        if (editText) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Find and replace text
        const findReplace = await testTool(serverProcess, 'find_replace_text', {
            findText: 'Updated',
            replaceText: 'Modified',
            caseSensitive: false
        });
        testResults.total++;
        if (findReplace) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 3: Graphics Management
        log('=== PHASE 3: Graphics Management ===', 'info');

        // Create rectangle
        const rectangle = await testTool(serverProcess, 'create_rectangle', {
            x: 140,
            y: 20,
            width: 50,
            height: 30,
            fillColor: 'Black',
            strokeColor: 'None',
            strokeWidth: 0
        });
        testResults.total++;
        if (rectangle) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Create ellipse
        const ellipse = await testTool(serverProcess, 'create_ellipse', {
            x: 140,
            y: 60,
            width: 30,
            height: 30,
            fillColor: 'None',
            strokeColor: 'Black',
            strokeWidth: 1
        });
        testResults.total++;
        if (ellipse) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 4: Styles Management
        log('=== PHASE 4: Styles Management ===', 'info');

        // Create paragraph style
        const paragraphStyle = await testTool(serverProcess, 'create_paragraph_style', {
            name: 'Test Paragraph Style',
            fontFamily: 'Times New Roman',
            fontSize: 14,
            textColor: 'Black',
            alignment: 'LEFT_ALIGN'
        });
        testResults.total++;
        if (paragraphStyle) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Create character style
        const characterStyle = await testTool(serverProcess, 'create_character_style', {
            name: 'Test Character Style',
            fontFamily: 'Arial',
            fontSize: 12,
            textColor: 'Black',
            bold: true
        });
        testResults.total++;
        if (characterStyle) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Apply paragraph style
        const applyStyle = await testTool(serverProcess, 'apply_paragraph_style', {
            styleName: 'Test Paragraph Style',
            frameIndex: 0
        });
        testResults.total++;
        if (applyStyle) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // List styles
        const listStyles = await testTool(serverProcess, 'list_styles');
        testResults.total++;
        if (listStyles) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 5: Colors Management
        log('=== PHASE 5: Colors Management ===', 'info');

        // Create color swatch
        const colorSwatch = await testTool(serverProcess, 'create_color_swatch', {
            name: 'Test Red',
            colorType: 'PROCESS',
            red: 255,
            green: 0,
            blue: 0
        });
        testResults.total++;
        if (colorSwatch) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // List color swatches
        const listColors = await testTool(serverProcess, 'list_color_swatches');
        testResults.total++;
        if (listColors) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Apply color
        const applyColor = await testTool(serverProcess, 'apply_color', {
            objectIndex: 1,
            colorName: 'Test Red',
            colorType: 'FILL'
        });
        testResults.total++;
        if (applyColor) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 6: Table Management
        log('=== PHASE 6: Table Management ===', 'info');

        // Create table
        const table = await testTool(serverProcess, 'create_table', {
            rows: 3,
            columns: 3,
            x: 20,
            y: 100,
            width: 150,
            height: 60,
            headerRows: 1
        });
        testResults.total++;
        if (table) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Populate table
        const populateTable = await testTool(serverProcess, 'populate_table', {
            tableIndex: 0,
            data: [
                ['Header 1', 'Header 2', 'Header 3'],
                ['Row 1 Col 1', 'Row 1 Col 2', 'Row 1 Col 3'],
                ['Row 2 Col 1', 'Row 2 Col 2', 'Row 2 Col 3']
            ]
        });
        testResults.total++;
        if (populateTable) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 7: Cleanup
        log('=== PHASE 7: Cleanup ===', 'info');
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
testContentManagement().catch(error => {
    log(`Test failed: ${error.message}`, 'error');
    process.exit(1);
}); 