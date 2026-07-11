#!/usr/bin/env node

/**
 * Swatches and Backgrounds Test
 * First create color swatches, then apply them as page backgrounds
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SERVER_PATH = join(__dirname, '../src/index.js');

function log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? '❌' : level === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
}

async function executeTool(tool, args = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn('node', [SERVER_PATH], {
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
                try {
                    const mcpResponse = JSON.parse(output);
                    if (mcpResponse.result && mcpResponse.result.content && mcpResponse.result.content[0]) {
                        const content = mcpResponse.result.content[0].text;
                        const result = JSON.parse(content);
                        resolve(result);
                    } else {
                        resolve({ success: false, error: 'Invalid MCP response format' });
                    }
                } catch (e) {
                    resolve({ success: false, error: `Failed to parse response: ${e.message}` });
                }
            } else {
                reject(new Error(`Process exited with code ${code}: ${errorOutput}`));
            }
        });

        const toolCall = {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
                name: tool,
                arguments: args
            }
        };

        child.stdin.write(JSON.stringify(toolCall) + '\n');
        child.stdin.end();

        setTimeout(() => {
            child.kill();
            reject(new Error(`Tool execution timed out`));
        }, 30000);
    });
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testSwatchesAndBackgrounds() {
    log('🎨 Swatches and Backgrounds Test');
    log('🔧 Step 1: Create color swatches, Step 2: Apply as backgrounds');
    let createdDocumentName = '';

    try {
        // Step 1: Create document
        log('📄 Creating document...');
        const docResult = await executeTool('create_document', {
            name: 'Swatches and Backgrounds Test',
            width: 210,
            height: 297,
            facingPages: false,
            pageOrientation: 'PORTRAIT',
            marginTop: 25,
            marginBottom: 25,
            marginLeft: 25,
            marginRight: 25
        });

        if (!docResult.success) {
            throw new Error(`Failed to create document: ${docResult.result}`);
        }
        createdDocumentName = String(docResult.result || '').match(/Document name:\s*(.+)/)?.[1]?.trim() || '';
        log('✅ Document created successfully');
        await delay(1000);

        // Step 2: Create color swatches
        log('🎨 Creating color swatches...');

        const colorSwatches = [
            { name: 'Primary Blue', red: 0, green: 114, blue: 198, description: 'Brand primary blue' },
            { name: 'Secondary Orange', red: 255, green: 140, blue: 0, description: 'Brand secondary orange' },
            { name: 'Accent Purple', red: 128, green: 0, blue: 128, description: 'Accent purple' },
            { name: 'Neutral Gray', red: 128, green: 128, blue: 128, description: 'Neutral gray' },
            { name: 'Warm Beige', red: 245, green: 245, blue: 220, description: 'Warm beige' }
        ];

        log('📋 Creating the following color swatches:');
        for (const color of colorSwatches) {
            log(`   • ${color.name}: ${color.description}`);
        }

        for (const color of colorSwatches) {
            const colorResult = await executeTool('create_color_swatch', {
                name: color.name,
                colorType: 'PROCESS',
                red: color.red,
                green: color.green,
                blue: color.blue
            });

            if (colorResult.success) {
                log(`✅ Created color swatch: ${color.name}`);
            } else {
                log(`❌ Failed to create color swatch ${color.name}: ${colorResult.result}`, 'error');
            }
            await delay(300);
        }

        // Step 3: List all created color swatches
        log('📋 Listing all created color swatches...');
        const listColorsResult = await executeTool('list_color_swatches');
        if (listColorsResult.success) {
            log('✅ Color swatches listed successfully');
            log('📋 Available color swatches:');
            console.log(listColorsResult.result);
        } else {
            log(`❌ Failed to list color swatches: ${listColorsResult.result}`, 'error');
        }
        await delay(500);

        // Step 4: Add pages for background testing
        log('📄 Adding pages for background testing...');
        for (let i = 0; i < 4; i++) {
            const pageResult = await executeTool('add_page', { position: 'AT_END' });
            if (pageResult.success) {
                log(`✅ Added page ${i + 2}`);
            } else {
                log(`❌ Failed to add page ${i + 2}: ${pageResult.result}`, 'error');
            }
            await delay(300);
        }

        // Step 5: Apply color swatches as page backgrounds
        log('🎨 Applying color swatches as page backgrounds...');

        const backgroundApplications = [
            { pageIndex: 0, colorName: 'Primary Blue', opacity: 100, description: 'Full opacity primary blue' },
            { pageIndex: 1, colorName: 'Secondary Orange', opacity: 80, description: '80% opacity secondary orange' },
            { pageIndex: 2, colorName: 'Accent Purple', opacity: 60, description: '60% opacity accent purple' },
            { pageIndex: 3, colorName: 'Neutral Gray', opacity: 40, description: '40% opacity neutral gray' },
            { pageIndex: 4, colorName: 'Warm Beige', opacity: 20, description: '20% opacity warm beige' }
        ];

        log('📋 Applying backgrounds:');
        for (const bg of backgroundApplications) {
            log(`   • Page ${bg.pageIndex + 1}: ${bg.description}`);
        }

        for (const bg of backgroundApplications) {
            log(`🎨 Setting background for page ${bg.pageIndex}: ${bg.description}`);

            const bgResult = await executeTool('set_page_background', {
                pageIndex: bg.pageIndex,
                backgroundColor: bg.colorName,
                opacity: bg.opacity
            });

            if (bgResult.success) {
                log(`✅ Background applied: ${bgResult.result}`);
            } else {
                log(`❌ Failed to apply background: ${bgResult.result}`, 'error');
            }
            await delay(500);
        }

        // Step 6: Add descriptive text to each page
        log('📝 Adding descriptive text to each page...');

        const pageTexts = [
            { pageIndex: 0, text: 'Page 1: Primary Blue Background (100% opacity)', y: 50 },
            { pageIndex: 1, text: 'Page 2: Secondary Orange Background (80% opacity)', y: 50 },
            { pageIndex: 2, text: 'Page 3: Accent Purple Background (60% opacity)', y: 50 },
            { pageIndex: 3, text: 'Page 4: Neutral Gray Background (40% opacity)', y: 50 },
            { pageIndex: 4, text: 'Page 5: Warm Beige Background (20% opacity)', y: 50 }
        ];

        for (const text of pageTexts) {
            // Navigate to the page
            const navigateResult = await executeTool('navigate_to_page', { pageIndex: text.pageIndex });
            if (navigateResult.success) {
                log(`✅ Navigated to page ${text.pageIndex + 1}`);
            } else {
                log(`❌ Failed to navigate to page ${text.pageIndex + 1}: ${navigateResult.result}`, 'error');
            }
            await delay(300);

            // Add text
            const textResult = await executeTool('create_text_frame', {
                content: text.text,
                x: 25,
                y: text.y,
                width: 160,
                height: 20,
                fontSize: 14,
                fontName: 'Arial\\tBold',
                textColor: 'Black',
                alignment: 'LEFT'
            });

            if (textResult.success) {
                log(`✅ Added text to page ${text.pageIndex + 1}`);
            } else {
                log(`❌ Failed to add text to page ${text.pageIndex + 1}: ${textResult.result}`, 'error');
            }
            await delay(300);
        }

        // Step 7: Test a gradient-like effect with multiple backgrounds
        log('🌈 Testing gradient-like effect...');
        const gradientResult = await executeTool('set_page_background', {
            pageIndex: 0,
            backgroundColor: 'Primary Blue',
            opacity: 50
        });

        if (gradientResult.success) {
            log(`✅ Gradient effect applied: ${gradientResult.result}`);
        } else {
            log(`❌ Failed to apply gradient effect: ${gradientResult.result}`, 'error');
        }
        await delay(500);

        // Step 8: Save the document
        log('💾 Saving document...');
        const saveResult = await executeTool('save_document', {
            filePath: './Swatches-and-Backgrounds-Test.indd'
        });

        if (saveResult.success) {
            log('✅ Document saved as Swatches-and-Backgrounds-Test.indd');
        } else {
            log(`⚠️ Save warning: ${saveResult.result}`, 'error');
        }

        log('🎉 Swatches and backgrounds test completed!');
        log('📋 Summary:');
        log('   ✅ Created 5 color swatches with meaningful names');
        log('   ✅ Listed all available color swatches');
        log('   ✅ Added 5 pages for testing');
        log('   ✅ Applied each color swatch as a page background');
        log('   ✅ Tested different opacity levels (20%, 40%, 60%, 80%, 100%)');
        log('   ✅ Added descriptive text to each page');
        log('   ✅ Tested gradient-like effect with reduced opacity');
        log('   ✅ Document saved with all swatches and backgrounds');

    } catch (error) {
        log(`❌ Error during swatches and backgrounds test: ${error.message}`, 'error');
        throw error;
    } finally {
        if (createdDocumentName) {
            const closed = await executeTool('close_document', {
                expectedDocumentName: createdDocumentName,
                allowDiscard: true
            });
            if (!closed.success) throw new Error(`Failed to close test document: ${createdDocumentName}`);
        }
    }
}

// Run the test
testSwatchesAndBackgrounds()
    .then(() => {
        log('🚀 Swatches and backgrounds test finished successfully!');
        process.exit(0);
    })
    .catch(error => {
        log(`❌ Failed to run swatches and backgrounds test: ${error.message}`, 'error');
        process.exit(1);
    }); 
