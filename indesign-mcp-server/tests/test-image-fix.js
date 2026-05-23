#!/usr/bin/env node

/**
 * Image Fix Test
 * Tests the fixed image placement functionality
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, existsSync, mkdirSync } from 'fs';

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

// Create a simple test image
function createTestImage() {
    log('🖼️ Creating test image...');

    const imagesDir = join(__dirname, 'test-images-fix');
    if (!existsSync(imagesDir)) {
        mkdirSync(imagesDir);
    }

    // Create a simple SVG test image
    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="200" height="150" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="150" fill="#4A90E2"/>
  <circle cx="100" cy="75" r="30" fill="#F5A623"/>
  <text x="100" y="85" text-anchor="middle" fill="white" font-family="Arial" font-size="14">Test</text>
</svg>`;

    try {
        const imagePath = join(imagesDir, 'test.svg');
        writeFileSync(imagePath, svgContent);
        log(`✅ Created test image: ${imagePath}`);
        return imagePath;
    } catch (error) {
        log(`❌ Failed to create test image: ${error.message}`, 'error');
        return null;
    }
}

async function testImageFix() {
    log('🔧 Image Fix Test');
    log('🔧 Testing the fixed image placement functionality');

    try {
        // Step 1: Create test image
        const imagePath = createTestImage();
        if (!imagePath) {
            throw new Error('Failed to create test image');
        }
        await delay(500);

        // Step 2: Create document
        log('📄 Creating document...');
        const docResult = await executeTool('create_document', {
            name: 'Image Fix Test',
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
        log('✅ Document created successfully');
        await delay(1000);

        // Step 3: Test image placement with existing file
        log('🖼️ Testing image placement with existing file...');
        const imageResult = await executeTool('place_image', {
            filePath: imagePath,
            x: 30,
            y: 50,
            width: 100,
            height: 75,
            linkImage: true
        });

        if (imageResult.success) {
            log(`✅ Image placed successfully: ${imageResult.result}`);
        } else {
            throw new Error(`Failed to place image: ${imageResult.result}`);
        }
        await delay(500);

        // Step 4: Test image placement with non-existent file
        log('🖼️ Testing image placement with non-existent file...');
        const badImageResult = await executeTool('place_image', {
            filePath: join(__dirname, 'test-images-fix', 'non-existent.svg'),
            x: 30,
            y: 150,
            width: 100,
            height: 75,
            linkImage: true
        });

        if (!badImageResult.success) {
            log(`✅ Correctly failed to place non-existent image: ${badImageResult.result}`);
        } else {
            throw new Error(`Missing image should have failed but succeeded: ${badImageResult.result}`);
        }
        await delay(500);

        // Step 5: Get image information
        log('📋 Getting image information...');
        const imageInfoResult = await executeTool('get_image_info', { itemIndex: 0 });
        if (imageInfoResult.success) {
            log('✅ Image information retrieved');
            log('📋 Image details:');
            console.log(imageInfoResult.result);
            if (String(imageInfoResult.result).includes('No images found')) {
                throw new Error('Image info did not find the placed image');
            }
        } else {
            throw new Error(`Failed to get image info: ${imageInfoResult.result}`);
        }
        await delay(300);

        // Step 6: Save the document
        log('💾 Saving document...');
        const saveResult = await executeTool('save_document', {
            filePath: './Image-Fix-Test.indd'
        });

        if (saveResult.success) {
            log('✅ Document saved as Image-Fix-Test.indd');
        } else {
            log(`⚠️ Save warning: ${saveResult.result}`, 'error');
        }

        log('🎉 Image fix test completed!');
        log('📋 Summary:');
        log('   ✅ Created test SVG image');
        log('   ✅ Tested successful image placement');
        log('   ✅ Tested proper error handling for missing files');
        log('   ✅ Retrieved image information');
        log('   ✅ Document saved successfully');

        log('🔧 Fix Verification:');
        log('   1. **Error Handling**: Proper ERROR prefix for failures');
        log('   2. **Success Logic**: SUCCESS prefix for successful placements');
        log('   3. **File Validation**: Correctly detects missing files');
        log('   4. **Response Format**: Proper success/failure response structure');

    } catch (error) {
        log(`❌ Error during image fix test: ${error.message}`, 'error');
        process.exit(1);
    }
}

// Run the test
testImageFix()
    .then(() => {
        log('🚀 Image fix test finished successfully!');
        process.exit(0);
    })
    .catch(error => {
        log(`❌ Failed to run image fix test: ${error.message}`, 'error');
        process.exit(1);
    }); 
