/**
 * Comprehensive test for PageItem and Group functionality
 */
import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

class PageItemGroupTest {
    constructor() {
        this.server = null;
        this.testResults = [];
        this.createdDocumentName = '';
    }

    async startServer() {
        console.log('🚀 Starting InDesign MCP Server...');

        this.server = spawn('node', ['src/index.js'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true
        });

        // Wait for server to start
        await setTimeout(2000);

        if (this.server.exitCode === null) {
            console.log('✅ Server started successfully\n');
            return true;
        } else {
            console.log('❌ Failed to start server');
            return false;
        }
    }

    async sendRequest(method, params = {}) {
        const request = {
            jsonrpc: '2.0',
            id: Date.now(),
            method: method,
            params: params
        };

        return new Promise((resolve, reject) => {
            const responseHandler = (data) => {
                try {
                    const response = JSON.parse(data.toString());
                    resolve(response);
                } catch (error) {
                    reject(error);
                }
            };

            this.server.stdout.once('data', responseHandler);
            this.server.stderr.once('data', (data) => {
                console.log('Server output:', data.toString());
            });

            this.server.stdin.write(JSON.stringify(request) + '\n');
        });
    }

    async testTool(name, args = {}) {
        console.log(`🧪 Testing: ${name}`);
        console.log('📤 Sending tools/call request...');

        try {
            const response = await this.sendRequest('tools/call', {
                name: name,
                arguments: args
            });

            console.log('📥 Received response for tools/call');

            if (response.result && response.result.content && response.result.content[0]) {
                const resultText = response.result.content[0].text;
                let result;

                try {
                    result = JSON.parse(resultText);
                    if (result.success) {
                        console.log(`✅ ${name}: PASS`);
                        console.log(`   Result: ${result.result}\n`);
                        this.testResults.push({
                            test: name,
                            status: 'PASS',
                            result: result.result
                        });
                        return result;
                    } else {
                        console.log(`❌ ${name}: FAIL`);
                        console.log(`   Result: ${result.result}\n`);
                        this.testResults.push({
                            test: name,
                            status: 'FAIL',
                            result: result.result
                        });
                        return false;
                    }
                } catch (parseError) {
                    console.log(`❌ ${name}: FAIL - Invalid JSON response`);
                    console.log(`   Raw response: ${resultText}\n`);
                    this.testResults.push({
                        test: name,
                        status: 'FAIL',
                        result: 'Invalid JSON response'
                    });
                    return false;
                }
            } else {
                console.log(`❌ ${name}: FAIL - Invalid response format`);
                this.testResults.push({
                    test: name,
                    status: 'FAIL',
                    result: 'Invalid response format'
                });
                return false;
            }
        } catch (error) {
            console.log(`❌ ${name}: FAIL - ${error.message}`);
            this.testResults.push({
                test: name,
                status: 'FAIL',
                result: error.message
            });
            return false;
        }
    }

    async runPageItemGroupTests() {
        console.log('🎯 Starting PageItem and Group Functionality Tests');
        console.log('==================================================');

        await this.startServer();

        // Test 1: Create a document with some content
        const createdDocument = await this.testTool('create_document', {
            preset: 'A4',
            orientation: 'Portrait',
            pages: 2,
            facingPages: true
        });
        this.createdDocumentName = String(createdDocument?.result || '').match(/Document name:\s*(.+)/)?.[1]?.trim() || '';

        // Test 2: Create some page items to work with
        await this.testTool('create_text_frame', {
            content: 'Test Text Frame',
            x: 50,
            y: 50,
            width: 100,
            height: 50
        });

        await this.testTool('create_rectangle', {
            x: 200,
            y: 50,
            width: 80,
            height: 60,
            fillColor: 'Blue'
        });

        await this.testTool('create_rectangle', {
            x: 350,
            y: 50,
            width: 60,
            height: 40,
            fillColor: 'Red'
        });

        // Test 3: PageItem Management
        console.log('\n📋 Testing PageItem Management...');

        await this.testTool('list_page_items', {
            pageIndex: 0
        });

        await this.testTool('get_page_item_info', {
            pageIndex: 0,
            itemIndex: 0
        });

        await this.testTool('select_page_item', {
            pageIndex: 0,
            itemIndex: 0
        });

        await this.testTool('move_page_item', {
            pageIndex: 0,
            itemIndex: 1,
            x: 250,
            y: 100
        });

        await this.testTool('resize_page_item', {
            pageIndex: 0,
            itemIndex: 2,
            width: 80,
            height: 50
        });

        await this.testTool('set_page_item_properties', {
            pageIndex: 0,
            itemIndex: 1,
            fillColor: 'Green',
            strokeColor: 'Black',
            strokeWeight: 2
        });

        await this.testTool('duplicate_page_item', {
            pageIndex: 0,
            itemIndex: 0,
            x: 50,
            y: 150
        });

        // Test 4: Group Management
        console.log('\n🔗 Testing Group Management...');

        await this.testTool('create_group_from_items', {
            pageIndex: 0,
            itemIndices: [0, 1]
        });

        await this.testTool('list_groups', {
            pageIndex: 0
        });

        await this.testTool('get_group_info', {
            pageIndex: 0,
            groupIndex: 0
        });

        await this.testTool('set_group_properties', {
            pageIndex: 0,
            groupIndex: 0,
            name: 'Test Group',
            visible: true,
            locked: false
        });

        await this.testTool('add_item_to_group', {
            pageIndex: 0,
            groupIndex: 0,
            itemIndex: 2
        });

        await this.testTool('get_group_info', {
            pageIndex: 0,
            groupIndex: 0
        });

        await this.testTool('remove_item_from_group', {
            pageIndex: 0,
            groupIndex: 0,
            itemIndex: 1
        });

        await this.testTool('ungroup', {
            pageIndex: 0,
            groupIndex: 0
        });

        // Test 5: Final cleanup and verification
        console.log('\n🧹 Testing Cleanup...');

        await this.testTool('list_page_items', {
            pageIndex: 0
        });

        await this.testTool('delete_page_item', {
            pageIndex: 0,
            itemIndex: 0
        });

        await this.testTool('list_page_items', {
            pageIndex: 0
        });

        this.printResults();
        await this.cleanup();
    }

    printResults() {
        console.log('\n📊 Test Results Summary');
        console.log('=======================');

        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.status === 'PASS').length;
        const failedTests = this.testResults.filter(r => r.status === 'FAIL').length;
        const successRate = ((passedTests / totalTests) * 100).toFixed(1);

        console.log(`Total Tests: ${totalTests}`);
        console.log(`✅ Passed: ${passedTests}`);
        console.log(`❌ Failed: ${failedTests}`);
        console.log(`📈 Success Rate: ${successRate}%\n`);

        console.log('📋 Detailed Results:');
        this.testResults.forEach((result, index) => {
            const status = result.status === 'PASS' ? '✅' : '❌';
            const truncatedResult = result.result.length > 50 ?
                result.result.substring(0, 50) + '...' : result.result;
            console.log(`${index + 1}. ${status} ${result.test}: ${truncatedResult}`);
        });

        if (failedTests > 0) {
            console.log('\n🔍 Failed Tests Details:\n');
            this.testResults
                .filter(r => r.status === 'FAIL')
                .forEach(result => {
                    console.log(`❌ ${result.test}:`);
                    console.log(`   Error: ${result.result}\n`);
                });
        }
    }

    async cleanup() {
        console.log('\n🧹 Cleaning up...');
        if (this.createdDocumentName) {
            await this.testTool('close_document', {
                expectedDocumentName: this.createdDocumentName,
                allowDiscard: true
            });
        }
        if (this.server) {
            this.server.kill();
        }
    }
}

async function main() {
    const test = new PageItemGroupTest();
    await test.runPageItemGroupTests();
}

main().catch(console.error);
