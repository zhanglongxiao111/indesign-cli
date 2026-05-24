#!/usr/bin/env node

/**
 * Basic Workflow Test
 * Tests the fundamental workflow: Create Document → Add Pages → Create Content
 */

import { spawn } from 'child_process';

// Test results tracking
let testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    errors: [],
    startTime: Date.now(),
};

// Helper functions
function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function sendCommand(command) {
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

        // Timeout after 15 seconds
        setTimeout(() => {
            child.kill();
            reject(new Error('Command timed out'));
        }, 15000);
    });
}

async function testTool(toolName, args = {}) {
    testResults.total++;

    try {
        log(`Testing: ${toolName}`, 'info');

        const command = {
            jsonrpc: '2.0',
            id: testResults.total,
            method: 'tools/call',
            params: {
                name: toolName,
                arguments: args
            }
        };

        const result = await sendCommand(command);

        // Handle potential JSON parsing issues
        let response;
        try {
            response = JSON.parse(result);
        } catch (parseError) {
            log(`❌ ${toolName}: JSON parse error - ${result.substring(0, 100)}...`, 'error');
            testResults.failed++;
            testResults.errors.push({ tool: toolName, error: `JSON parse error: ${parseError.message}` });
            return false;
        }

        if (response.result && response.result.content && response.result.content[0]) {
            let toolResult;
            try {
                toolResult = JSON.parse(response.result.content[0].text);
            } catch (parseError) {
                // Check if it's an AppleScript error
                const content = response.result.content[0].text;
                if (content.includes('AppleScript execution failed') || content.includes('Error executing tool')) {
                    log(`⚠️ ${toolName}: AppleScript error - this may be expected if InDesign is not running`, 'warning');
                    testResults.failed++;
                    testResults.errors.push({ tool: toolName, error: `AppleScript error: ${content.substring(0, 100)}` });
                    return false;
                } else {
                    log(`❌ ${toolName}: Tool result parse error - ${content.substring(0, 100)}...`, 'error');
                    testResults.failed++;
                    testResults.errors.push({ tool: toolName, error: `Tool result parse error: ${parseError.message}` });
                    return false;
                }
            }

            if (toolResult.success) {
                log(`✅ ${toolName}: ${toolResult.operation} completed successfully`, 'success');
                testResults.passed++;
                return true;
            } else {
                log(`❌ ${toolName}: ${toolResult.result}`, 'error');
                testResults.failed++;
                testResults.errors.push({ tool: toolName, error: toolResult.result });
                return false;
            }
        } else {
            log(`❌ ${toolName}: Invalid response format`, 'error');
            testResults.failed++;
            testResults.errors.push({ tool: toolName, error: 'Invalid response format' });
            return false;
        }
    } catch (error) {
        log(`❌ ${toolName}: ${error.message}`, 'error');
        testResults.failed++;
        testResults.errors.push({ tool: toolName, error: error.message });
        return false;
    }
}

// Basic workflow test
async function testBasicWorkflow() {
    log('🚀 Starting Basic Workflow Test', 'info');
    log('📋 Testing: Create Document → Add Pages → Create Content', 'info');

    try {
        // Step 1: Create Document (CRITICAL FIRST STEP)
        log('=== STEP 1: Create Document ===', 'info');
        const documentCreated = await testTool('create_document', {
            width: 210,
            height: 297,
            pages: 1, // Start with just 1 page
            facingPages: false,
            pageOrientation: 'PORTRAIT',
            marginTop: 20,
            marginBottom: 20,
            marginLeft: 20,
            marginRight: 20
        });

        if (!documentCreated) {
            log('❌ Document creation failed - this is critical', 'error');
            return false;
        }

        await delay(3000); // Longer delay after document creation

        // Step 2: Add Additional Pages
        log('=== STEP 2: Add Pages ===', 'info');
        await testTool('add_page', { position: 'AT_END' });
        await delay(2000);

        await testTool('add_page', { position: 'AT_END' });
        await delay(2000);

        // Step 3: Navigate to Pages
        log('=== STEP 3: Navigate to Pages ===', 'info');
        await testTool('navigate_to_page', { pageIndex: 0 });
        await delay(2000);

        await testTool('navigate_to_page', { pageIndex: 1 });
        await delay(2000);

        await testTool('navigate_to_page', { pageIndex: 2 });
        await delay(2000);

        // Step 4: Create Content on Each Page
        log('=== STEP 4: Create Content ===', 'info');

        // Page 0: Text frame
        await testTool('navigate_to_page', { pageIndex: 0 });
        await delay(1000);

        await testTool('create_text_frame', {
            content: "Page 1 - This is test content.",
            x: 30,
            y: 30,
            width: 150,
            height: 40,
            fontFamily: 'Helvetica Neue',
            fontSize: 12
        });
        await delay(2000);

        // Page 1: Rectangle
        await testTool('navigate_to_page', { pageIndex: 1 });
        await delay(1000);

        await testTool('create_rectangle', {
            x: 30,
            y: 30,
            width: 50,
            height: 30,
            fillColor: 'BLUE'
        });
        await delay(2000);

        // Page 2: Ellipse
        await testTool('navigate_to_page', { pageIndex: 2 });
        await delay(1000);

        await testTool('create_ellipse', {
            x: 30,
            y: 30,
            width: 40,
            height: 40,
            fillColor: 'RED'
        });
        await delay(2000);

        // Step 5: Save Document
        log('=== STEP 5: Save Document ===', 'info');
        await testTool('save_document', { filePath: './test-basic-workflow.indd' });
        await delay(2000);

        log('🎉 Basic workflow test completed!', 'success');
        return true;

    } catch (error) {
        log(`❌ Basic workflow test failed: ${error.message}`, 'error');
        return false;
    }
}

function generateTestReport() {
    const endTime = Date.now();
    const duration = (endTime - testResults.startTime) / 1000;

    log('📋 === BASIC WORKFLOW TEST REPORT ===', 'info');
    log(`⏱️  Duration: ${duration.toFixed(2)} seconds`, 'info');
    log(`📊 Total Tests: ${testResults.total}`, 'info');
    log(`✅ Passed: ${testResults.passed}`, 'success');
    log(`❌ Failed: ${testResults.failed}`, testResults.failed > 0 ? 'error' : 'info');
    log(`📈 Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`, 'info');

    if (testResults.errors.length > 0) {
        log('❌ Errors:', 'error');
        testResults.errors.forEach(error => {
            log(`  - ${error.tool}: ${error.error}`, 'error');
        });
    }

    // Exit with appropriate code
    process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run the basic workflow test
testBasicWorkflow().then(success => {
    generateTestReport();
}).catch(error => {
    log(`❌ Test failed to start: ${error.message}`, 'error');
    process.exit(1);
}); 