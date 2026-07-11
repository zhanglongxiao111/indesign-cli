#!/usr/bin/env node

/**
 * Document and Page Test
 * Creates a document, then adds a page
 */

import { spawn } from 'child_process';

function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function sendCommand(command) {
    return new Promise((resolve, reject) => {
        const child = spawn('node', ['src/index.js'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true
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

        // Timeout after 10 seconds
        setTimeout(() => {
            child.kill();
            reject(new Error('Command timed out'));
        }, 10000);
    });
}

async function testTool(toolName, args = {}) {
    try {
        log(`Testing: ${toolName}`, 'info');

        const command = {
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: {
                name: toolName,
                arguments: args
            }
        };

        const result = await sendCommand(command);
        const response = JSON.parse(result);

        if (response.result && response.result.content && response.result.content[0]) {
            const toolResult = JSON.parse(response.result.content[0].text);

            if (toolResult.success) {
                log(`✅ ${toolName}: ${toolResult.operation} completed successfully`, 'success');
                return toolResult;
            } else {
                log(`❌ ${toolName}: ${toolResult.result}`, 'error');
                return false;
            }
        } else {
            log(`❌ ${toolName}: Invalid response format`, 'error');
            return false;
        }

    } catch (error) {
        log(`❌ ${toolName}: ${error.message}`, 'error');
        return false;
    }
}

async function testDocumentAndPage() {
    log('🚀 Testing Document and Page Creation', 'info');
    let createdDocumentName = '';

    try {
        // Step 1: Create Document
        log('=== STEP 1: Create Document ===', 'info');
        const documentCreated = await testTool('create_document', {
            width: 210,
            height: 297,
            pages: 1,
            facingPages: false,
            pageOrientation: 'PORTRAIT'
        });

        if (!documentCreated) {
            log('❌ Document creation failed - cannot continue', 'error');
            return false;
        }
        createdDocumentName = String(documentCreated.result || '').match(/Document name:\s*(.+)/)?.[1]?.trim() || '';

        await delay(2000); // Wait for document to be ready

        // Step 2: Add a Page
        log('=== STEP 2: Add Page ===', 'info');
        const pageAdded = await testTool('add_page', { position: 'AT_END' });

        if (!pageAdded) {
            log('❌ Page addition failed', 'error');
            return false;
        }

        await delay(2000); // Wait for page to be added

        // Step 3: Navigate to the new page
        log('=== STEP 3: Navigate to New Page ===', 'info');
        const navigationSuccess = await testTool('navigate_to_page', { pageIndex: 1 });

        if (!navigationSuccess) {
            log('❌ Page navigation failed', 'error');
            return false;
        }

        log('🎉 Document and page test completed successfully!', 'success');
        return true;

    } catch (error) {
        log(`❌ Test failed: ${error.message}`, 'error');
        return false;
    } finally {
        if (createdDocumentName) {
            const closed = await testTool('close_document', {
                expectedDocumentName: createdDocumentName,
                allowDiscard: true
            });
            if (!closed) {
                throw new Error(`Failed to close test document: ${createdDocumentName}`);
            }
        }
    }
}

// Run the test
testDocumentAndPage().then(success => {
    if (success) {
        log('🎉 Document and page test passed!', 'success');
        process.exit(0);
    } else {
        log('❌ Document and page test failed!', 'error');
        process.exit(1);
    }
}).catch(error => {
    log(`❌ Test failed to start: ${error.message}`, 'error');
    process.exit(1);
});
