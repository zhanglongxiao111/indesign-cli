#!/usr/bin/env node

/**
 * Standard Document Test
 * Creates a complete document with heading, subheading, text, image, and footer
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

async function testStandardDocument() {
    log('🚀 Starting Standard Document Creation Test', 'info');
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
            facingPages: false,
            marginTop: 25,
            marginBottom: 25,
            marginLeft: 20,
            marginRight: 20
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

        // Phase 2: Create Styles
        log('=== PHASE 2: Create Styles ===', 'info');

        // Create heading style
        const headingStyle = await testTool(serverProcess, 'create_paragraph_style', {
            name: 'Heading',
            fontFamily: 'Helvetica Neue',
            fontSize: 24,
            textColor: 'Black',
            alignment: 'CENTER_ALIGN',
            spaceBefore: 0,
            spaceAfter: 12
        });
        testResults.total++;
        if (headingStyle) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Create subheading style
        const subheadingStyle = await testTool(serverProcess, 'create_paragraph_style', {
            name: 'Subheading',
            fontFamily: 'Helvetica Neue',
            fontSize: 18,
            textColor: 'Black',
            alignment: 'LEFT_ALIGN',
            spaceBefore: 0,
            spaceAfter: 8
        });
        testResults.total++;
        if (subheadingStyle) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Create body text style
        const bodyStyle = await testTool(serverProcess, 'create_paragraph_style', {
            name: 'Body Text',
            fontFamily: 'Times New Roman',
            fontSize: 12,
            textColor: 'Black',
            alignment: 'JUSTIFY',
            leading: 14,
            spaceBefore: 0,
            spaceAfter: 6
        });
        testResults.total++;
        if (bodyStyle) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Create footer style
        const footerStyle = await testTool(serverProcess, 'create_paragraph_style', {
            name: 'Footer',
            fontFamily: 'Helvetica Neue',
            fontSize: 10,
            textColor: 'Black',
            alignment: 'CENTER_ALIGN',
            spaceBefore: 0,
            spaceAfter: 0
        });
        testResults.total++;
        if (footerStyle) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 3: Create Content
        log('=== PHASE 3: Create Content ===', 'info');

        // Create heading text frame
        const headingFrame = await testTool(serverProcess, 'create_text_frame', {
            content: 'Sample Document',
            x: 20,
            y: 25,
            width: 170,
            height: 30,
            fontSize: 24,
            fontFamily: 'Helvetica Neue',
            alignment: 'CENTER_ALIGN'
        });
        testResults.total++;
        if (headingFrame) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Create subheading text frame
        const subheadingFrame = await testTool(serverProcess, 'create_text_frame', {
            content: 'A Comprehensive Test Document',
            x: 20,
            y: 65,
            width: 170,
            height: 25,
            fontSize: 18,
            fontFamily: 'Helvetica Neue',
            alignment: 'LEFT_ALIGN'
        });
        testResults.total++;
        if (subheadingFrame) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Create body text frame
        const bodyFrame = await testTool(serverProcess, 'create_text_frame', {
            content: 'This is a sample document created by the InDesign MCP Server. It demonstrates various text formatting capabilities including different font sizes, alignments, and spacing. The document includes a heading, subheading, body text, and footer with proper page numbering.',
            x: 20,
            y: 100,
            width: 170,
            height: 150,
            fontSize: 12,
            fontFamily: 'Times New Roman',
            alignment: 'JUSTIFY'
        });
        testResults.total++;
        if (bodyFrame) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Create footer text frame
        const footerFrame = await testTool(serverProcess, 'create_text_frame', {
            content: 'Page 1',
            x: 20,
            y: 270,
            width: 170,
            height: 15,
            fontSize: 10,
            fontFamily: 'Helvetica Neue',
            alignment: 'CENTER_ALIGN'
        });
        testResults.total++;
        if (footerFrame) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 4: Create Graphics
        log('=== PHASE 4: Create Graphics ===', 'info');

        // Create a decorative rectangle
        const rectangle = await testTool(serverProcess, 'create_rectangle', {
            x: 20,
            y: 55,
            width: 170,
            height: 2,
            fillColor: 'Black',
            strokeColor: 'None',
            strokeWidth: 0
        });
        testResults.total++;
        if (rectangle) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Create a decorative circle
        const circle = await testTool(serverProcess, 'create_ellipse', {
            x: 185,
            y: 25,
            width: 15,
            height: 15,
            fillColor: 'None',
            strokeColor: 'Black',
            strokeWidth: 1
        });
        testResults.total++;
        if (circle) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 5: Apply Styles
        log('=== PHASE 5: Apply Styles ===', 'info');

        // Apply heading style to first text frame
        const applyHeading = await testTool(serverProcess, 'apply_paragraph_style', {
            styleName: 'Heading',
            frameIndex: 0
        });
        testResults.total++;
        if (applyHeading) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Apply subheading style to second text frame
        const applySubheading = await testTool(serverProcess, 'apply_paragraph_style', {
            styleName: 'Subheading',
            frameIndex: 1
        });
        testResults.total++;
        if (applySubheading) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Apply body style to third text frame
        const applyBody = await testTool(serverProcess, 'apply_paragraph_style', {
            styleName: 'Body Text',
            frameIndex: 2
        });
        testResults.total++;
        if (applyBody) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Apply footer style to fourth text frame
        const applyFooter = await testTool(serverProcess, 'apply_paragraph_style', {
            styleName: 'Footer',
            frameIndex: 3
        });
        testResults.total++;
        if (applyFooter) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // Phase 6: Document Verification
        log('=== PHASE 6: Document Verification ===', 'info');

        // Get document info to verify
        const documentInfo = await testTool(serverProcess, 'get_document_info');
        testResults.total++;
        if (documentInfo) testResults.passed++; else testResults.failed++;
        await delay(TEST_CONFIG.delay);

        // List styles to verify they were created
        const listStyles = await testTool(serverProcess, 'list_styles');
        testResults.total++;
        if (listStyles) testResults.passed++; else testResults.failed++;
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
testStandardDocument().catch(error => {
    log(`Test failed: ${error.message}`, 'error');
    process.exit(1);
}); 