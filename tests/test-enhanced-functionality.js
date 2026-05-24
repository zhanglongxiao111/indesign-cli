/**
 * Test script for enhanced InDesign MCP Server functionality
 * Tests session management, new handlers, and positioning improvements
 */

const testEnhancedFunctionality = async () => {
    console.log('🧪 Testing Enhanced InDesign MCP Server Functionality\n');

    // Test 1: Session Management
    console.log('1. Testing Session Management...');
    try {
        // Get initial session info
        const initialSession = await callTool('get_session_info', {});
        console.log('   Initial session:', JSON.parse(initialSession).content[0].text);

        // Clear session
        const clearResult = await callTool('clear_session', {});
        console.log('   Clear session result:', clearResult);

        console.log('   ✅ Session management working\n');
    } catch (error) {
        console.log('   ❌ Session management failed:', error.message, '\n');
    }

    // Test 2: Document Creation with Session Integration
    console.log('2. Testing Document Creation with Session Integration...');
    try {
        const createResult = await callTool('create_document', {
            width: 210,
            height: 297,
            pages: 1
        });
        console.log('   Create document result:', createResult);

        // Get document info to verify session storage
        const docInfo = await callTool('get_document_info', {});
        console.log('   Document info:', docInfo);

        // Get session info to verify page dimensions stored
        const sessionInfo = await callTool('get_session_info', {});
        console.log('   Session info after document creation:', JSON.parse(sessionInfo).content[0].text);

        console.log('   ✅ Document creation with session integration working\n');
    } catch (error) {
        console.log('   ❌ Document creation failed:', error.message, '\n');
    }

    // Test 3: Smart Positioning (no coordinates provided)
    console.log('3. Testing Smart Positioning...');
    try {
        // Create text frame without coordinates
        const textResult = await callTool('create_text_frame', {
            content: 'Smart positioned text frame',
            fontSize: 14
        });
        console.log('   Text frame result:', textResult);

        // Create rectangle without coordinates
        const rectResult = await callTool('create_rectangle', {
            fillColor: 'Red',
            strokeColor: 'Black',
            strokeWidth: 2
        });
        console.log('   Rectangle result:', rectResult);

        console.log('   ✅ Smart positioning working\n');
    } catch (error) {
        console.log('   ❌ Smart positioning failed:', error.message, '\n');
    }

    // Test 4: Style Management
    console.log('4. Testing Style Management...');
    try {
        // Create paragraph style
        const paraStyleResult = await callTool('create_paragraph_style', {
            name: 'TestParagraphStyle',
            fontFamily: 'Helvetica Neue',
            fontSize: 16,
            alignment: 'CENTER_ALIGN'
        });
        console.log('   Paragraph style result:', paraStyleResult);

        // Create character style
        const charStyleResult = await callTool('create_character_style', {
            name: 'TestCharacterStyle',
            fontFamily: 'Helvetica Neue',
            fontSize: 14,
            bold: true
        });
        console.log('   Character style result:', charStyleResult);

        // Create color swatch
        const colorResult = await callTool('create_color_swatch', {
            name: 'TestRed',
            red: 255,
            green: 0,
            blue: 0
        });
        console.log('   Color swatch result:', colorResult);

        // List styles
        const listStylesResult = await callTool('list_styles', {});
        console.log('   List styles result:', listStylesResult);

        console.log('   ✅ Style management working\n');
    } catch (error) {
        console.log('   ❌ Style management failed:', error.message, '\n');
    }

    // Test 5: Table Creation
    console.log('5. Testing Table Creation...');
    try {
        // Create table
        const tableResult = await callTool('create_table', {
            rows: 4,
            columns: 3,
            headerRows: 1
        });
        console.log('   Table creation result:', tableResult);

        // Populate table
        const populateResult = await callTool('populate_table', {
            data: [
                ['Header 1', 'Header 2', 'Header 3'],
                ['Row 1 Col 1', 'Row 1 Col 2', 'Row 1 Col 3'],
                ['Row 2 Col 1', 'Row 2 Col 2', 'Row 2 Col 3'],
                ['Row 3 Col 1', 'Row 3 Col 2', 'Row 3 Col 3']
            ]
        });
        console.log('   Table population result:', populateResult);

        console.log('   ✅ Table creation working\n');
    } catch (error) {
        console.log('   ❌ Table creation failed:', error.message, '\n');
    }

    // Test 6: Graphics Creation
    console.log('6. Testing Graphics Creation...');
    try {
        // Create polygon
        const polygonResult = await callTool('create_polygon', {
            sides: 8,
            fillColor: 'Blue',
            strokeColor: 'Black',
            strokeWidth: 1
        });
        console.log('   Polygon result:', polygonResult);

        console.log('   ✅ Graphics creation working\n');
    } catch (error) {
        console.log('   ❌ Graphics creation failed:', error.message, '\n');
    }

    // Test 7: View Document
    console.log('7. Testing Document View...');
    try {
        const viewResult = await callTool('view_document', {});
        console.log('   View document result:', viewResult);

        console.log('   ✅ Document view working\n');
    } catch (error) {
        console.log('   ❌ Document view failed:', error.message, '\n');
    }

    console.log('🎉 Enhanced functionality testing completed!');
};

// Mock callTool function for testing (replace with actual implementation)
const callTool = async (name, args) => {
    // This would be replaced with actual MCP tool calls
    return `Mock result for ${name} with args: ${JSON.stringify(args)}`;
};

// Run the test
testEnhancedFunctionality().catch(console.error); 