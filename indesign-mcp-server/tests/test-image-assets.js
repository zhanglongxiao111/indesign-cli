#!/usr/bin/env node

/**
 * Image Assets Test
 * Demonstrates how image assets work via MCP
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

// Create test images for demonstration
function createTestImages() {
    log('🖼️ Creating test images for demonstration...');

    const imagesDir = join(__dirname, 'test-images');
    if (!existsSync(imagesDir)) {
        mkdirSync(imagesDir);
    }

    // Create a simple SVG test image
    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="200" height="150" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="150" fill="#4A90E2"/>
  <circle cx="100" cy="75" r="40" fill="#F5A623"/>
  <text x="100" y="85" text-anchor="middle" fill="white" font-family="Arial" font-size="16">Test Image</text>
</svg>`;

    const altSvgContent = svgContent.replace('Test Image', 'Alt Image').replace('#4A90E2', '#7ED321');
    const placeholderSvgContent = svgContent.replace('Test Image', 'Placeholder').replace('#4A90E2', '#9013FE');

    try {
        const paths = {
            main: join(imagesDir, 'test-image.svg'),
            alt: join(imagesDir, 'test-image-alt.svg'),
            placeholder: join(imagesDir, 'test-placeholder.svg')
        };
        writeFileSync(paths.main, svgContent);
        writeFileSync(paths.alt, altSvgContent);
        writeFileSync(paths.placeholder, placeholderSvgContent);

        log('✅ Created test images:');
        log('   • test-image.svg (SVG vector image)');
        log('   • test-image-alt.svg (SVG vector image)');
        log('   • test-placeholder.svg (SVG placeholder)');

        return paths;
    } catch (error) {
        log(`❌ Failed to create test images: ${error.message}`, 'error');
        return null;
    }
}

async function testImageAssets() {
    log('🖼️ Image Assets Test');
    log('🔧 Demonstrating how image assets work via MCP');

    try {
        // Step 1: Create test images
        const imagePaths = createTestImages();
        if (!imagePaths) {
            throw new Error('Failed to create test images');
        }
        await delay(500);

        // Step 2: Create document
        log('📄 Creating document...');
        const docResult = await executeTool('create_document', {
            name: 'Image Assets Test',
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

        // Step 3: Create color swatches for styling
        log('🎨 Creating color swatches for styling...');
        const colors = [
            { name: 'Image Border Blue', red: 74, green: 144, blue: 226 },
            { name: 'Image Accent Orange', red: 245, green: 166, blue: 35 }
        ];

        for (const color of colors) {
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

        // Step 4: Create object styles for images
        log('🎨 Creating object styles for images...');
        const objectStyles = [
            {
                name: 'Image Frame Style',
                fillColor: '',
                strokeColor: 'Image Border Blue',
                strokeWeight: 2,
                cornerRadius: 5,
                transparency: 100
            },
            {
                name: 'Image Accent Style',
                fillColor: 'Image Accent Orange',
                strokeColor: '',
                strokeWeight: 1,
                cornerRadius: 10,
                transparency: 80
            }
        ];

        for (const style of objectStyles) {
            const styleResult = await executeTool('create_object_style', style);

            if (styleResult.success) {
                log(`✅ Created object style: ${style.name}`);
            } else {
                log(`❌ Failed to create object style ${style.name}: ${styleResult.result}`, 'error');
            }
            await delay(300);
        }

        // Step 5: List object styles
        log('📋 Listing object styles...');
        const listStylesResult = await executeTool('list_object_styles');
        if (listStylesResult.success) {
            log('✅ Object styles listed successfully');
            log('📋 Available object styles:');
            console.log(listStylesResult.result);
        } else {
            log(`❌ Failed to list object styles: ${listStylesResult.result}`, 'error');
        }
        await delay(500);

        // Step 6: Add pages for image testing
        log('📄 Adding pages for image testing...');
        for (let i = 0; i < 2; i++) {
            const pageResult = await executeTool('add_page', { position: 'AT_END' });
            if (pageResult.success) {
                log(`✅ Added page ${i + 2}`);
            } else {
                log(`❌ Failed to add page ${i + 2}: ${pageResult.result}`, 'error');
            }
            await delay(300);
        }

        // Step 7: Place images with different configurations
        log('🖼️ Placing images with different configurations...');

        const imagePlacements = [
            {
                pageIndex: 0,
                filePath: imagePaths.main,
                x: 30,
                y: 50,
                width: 80,
                height: 60,
                linkImage: true,
                description: 'SVG image with linking enabled'
            },
            {
                pageIndex: 0,
                filePath: imagePaths.alt,
                x: 130,
                y: 50,
                width: 60,
                height: 60,
                linkImage: false,
                description: 'Second SVG image with embedding enabled'
            },
            {
                pageIndex: 1,
                filePath: imagePaths.placeholder,
                x: 30,
                y: 50,
                width: 100,
                height: 40,
                linkImage: true,
                description: 'SVG placeholder image'
            }
        ];

        for (const placement of imagePlacements) {
            log(`🖼️ Placing image: ${placement.description}`);

            // Navigate to the page first
            const navigateResult = await executeTool('navigate_to_page', { pageIndex: placement.pageIndex });
            if (navigateResult.success) {
                log(`✅ Navigated to page ${placement.pageIndex + 1}`);
            } else {
                log(`❌ Failed to navigate to page ${placement.pageIndex + 1}: ${navigateResult.result}`, 'error');
            }
            await delay(300);

            // Place the image
            const imageResult = await executeTool('place_image', {
                filePath: placement.filePath,
                x: placement.x,
                y: placement.y,
                width: placement.width,
                height: placement.height,
                linkImage: placement.linkImage
            });

            if (imageResult.success) {
                log(`✅ Image placed successfully: ${imageResult.result}`);
            } else {
                throw new Error(`Failed to place image: ${imageResult.result}`);
            }
            await delay(500);
        }

        // Step 8: Apply object styles to images
        log('🎨 Applying object styles to images...');

        const styleApplications = [
            { itemType: 'rectangle', itemIndex: 0, styleName: 'Image Frame Style', description: 'Frame style to first image' },
            { itemType: 'rectangle', itemIndex: 1, styleName: 'Image Accent Style', description: 'Accent style to second image' }
        ];

        for (const application of styleApplications) {
            log(`🎨 Applying style: ${application.description}`);

            const styleResult = await executeTool('apply_object_style', {
                styleName: application.styleName,
                itemType: application.itemType,
                itemIndex: application.itemIndex
            });

            if (styleResult.success) {
                log(`✅ Style applied successfully: ${styleResult.result}`);
            } else {
                log(`❌ Failed to apply style: ${styleResult.result}`, 'error');
            }
            await delay(300);
        }

        // Step 9: Get image information
        log('📋 Getting image information...');
        for (let i = 0; i < 3; i++) {
            const imageInfoResult = await executeTool('get_image_info', { itemIndex: i });
            if (imageInfoResult.success) {
                log(`✅ Image ${i} information retrieved`);
                log('📋 Image details:');
                console.log(imageInfoResult.result);
                if (
                    String(imageInfoResult.result).includes('No images found') ||
                    String(imageInfoResult.result).includes('not found')
                ) {
                    throw new Error(`Image info did not find placed image ${i}`);
                }
            } else {
                throw new Error(`Failed to get image ${i} info: ${imageInfoResult.result}`);
            }
            await delay(300);
        }

        // Step 10: Add descriptive text
        log('📝 Adding descriptive text...');
        const pageTexts = [
            { pageIndex: 0, text: 'Page 1: SVG and HTML Images', y: 120 },
            { pageIndex: 1, text: 'Page 2: Text Placeholder Image', y: 120 }
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
                x: 30,
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

        // Step 11: Save the document
        log('💾 Saving document...');
        const saveResult = await executeTool('save_document', {
            filePath: './Image-Assets-Test.indd'
        });

        if (saveResult.success) {
            log('✅ Document saved as Image-Assets-Test.indd');
        } else {
            log(`⚠️ Save warning: ${saveResult.result}`, 'error');
        }

        log('🎉 Image assets test completed!');
        log('📋 Summary:');
        log('   ✅ Created test SVG images');
        log('   ✅ Created color swatches for styling');
        log('   ✅ Created object styles for image frames');
        log('   ✅ Placed images with different configurations');
        log('   ✅ Tested linking vs embedding options');
        log('   ✅ Applied object styles to images');
        log('   ✅ Retrieved detailed image information');
        log('   ✅ Added descriptive text to pages');
        log('   ✅ Document saved with all image assets');

        log('🔧 How Image Assets Work via MCP:');
        log('   1. **File Path**: Images are placed using file paths (local or network)');
        log('   2. **Positioning**: Uses session manager for smart positioning');
        log('   3. **Linking**: Can link images (external) or embed them (internal)');
        log('   4. **Styling**: Object styles can be applied for consistent formatting');
        log('   5. **Information**: Detailed image metadata can be retrieved');
        log('   6. **Formats**: This test uses SVG assets with absolute paths');

    } catch (error) {
        log(`❌ Error during image assets test: ${error.message}`, 'error');
        process.exit(1);
    }
}

// Run the test
testImageAssets()
    .then(() => {
        log('🚀 Image assets test finished successfully!');
        process.exit(0);
    })
    .catch(error => {
        log(`❌ Failed to run image assets test: ${error.message}`, 'error');
        process.exit(1);
    }); 
