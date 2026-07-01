#!/usr/bin/env node

/**
 * Master Test Index
 * Runs all InDesign MCP Server tests in logical order with comprehensive coverage
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_CONFIG = {
    serverPath: join(__dirname, '../src/index.js'),
    delay: 2000,
    timeout: 30000,
    testFileTimeout: 120000
};

// Progress bar utilities
class ProgressBar {
    constructor(total, width = 50) {
        this.total = total;
        this.current = 0;
        this.width = width;
        this.startTime = Date.now();
    }

    update(current, label = '') {
        this.current = current;
        const percentage = (current / this.total) * 100;
        const filled = Math.round((this.width * current) / this.total);
        const empty = this.width - filled;

        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

        process.stdout.write(`\r[${bar}] ${percentage.toFixed(1)}% (${current}/${this.total}) ${label} [${elapsed}s]`);

        if (current === this.total) {
            process.stdout.write('\n');
        }
    }
}

// Comprehensive test suite configuration
const TEST_SUITES = [
    {
        name: 'Response Semantics',
        description: 'Tests handler response success and failure classification',
        tests: [
            'test-response-semantics.js',
            'test-handler-contracts.js'
        ],
        required: true,
        category: 'validation'
    },
    {
        name: 'Basic Connectivity',
        description: 'Tests basic InDesign connectivity and MCP protocol',
        tests: [
            'test-mcp-protocol.js',
            'test-indesign-basic.js'
        ],
        required: true,
        category: 'connectivity'
    },
    {
        name: 'Document Foundation',
        description: 'Tests basic document creation and management',
        tests: [
            'test-simple-document.js',
            'test-document-and-page.js'
        ],
        required: true,
        category: 'document'
    },
    {
        name: 'Document Preferences',
        description: 'Tests comprehensive document preferences functionality',
        tests: [
            'test-document-preferences.js'
        ],
        required: true,
        category: 'document'
    },
    {
        name: 'Grid and Layout',
        description: 'Tests grid settings and layout preferences',
        tests: [
            'test-grid-layout.js'
        ],
        required: true,
        category: 'layout'
    },
    {
        name: 'Content Management',
        description: 'Tests text, graphics, styles, colors, and table management',
        tests: [
            'test-content-management.js'
        ],
        required: false,
        category: 'content'
    },
    {
        name: 'PageItem and Group',
        description: 'Tests PageItem and Group management functionality',
        tests: [
            'test-pageitem-group.js'
        ],
        required: false,
        category: 'advanced'
    },
    {
        name: 'Advanced Features',
        description: 'Tests master spreads, spreads, layers, export, and utility functions',
        tests: [
            'test-advanced-features.js'
        ],
        required: false,
        category: 'advanced'
    },
    {
        name: 'Standard Document',
        description: 'Tests creating a complete document with proper layout and styling',
        tests: [
            'test-standard-document.js'
        ],
        required: false,
        category: 'workflow'
    },
    {
        name: 'Basic Workflow',
        description: 'Tests essential workflow operations',
        tests: [
            'test-basic-workflow.js'
        ],
        required: false,
        category: 'workflow'
    },
    {
        name: 'Enhanced Functionality',
        description: 'Tests session management, smart positioning, and new features',
        tests: [
            'test-enhanced-functionality.js'
        ],
        required: false,
        category: 'enhanced'
    },
    {
        name: 'Error Handling',
        description: 'Tests that errors are properly reported as failures',
        tests: [
            'test-error-handling.js'
        ],
        required: false,
        category: 'validation'
    },
    {
        name: 'Bounds Checking',
        description: 'Tests that content is properly positioned within page boundaries',
        tests: [
            'test-bounds-checking.js'
        ],
        required: false,
        category: 'validation'
    },
    // --- Added tests as per instructions ---
    {
        name: 'Swatches and Backgrounds',
        description: 'Tests swatch and background color management',
        tests: [
            'test-swatches-and-backgrounds.js'
        ],
        required: false,
        category: 'content'
    },
    {
        name: 'Real Image Placement',
        description: 'Tests real image placement and handling',
        tests: [
            'test-real-image.js'
        ],
        required: false,
        category: 'content'
    },
    {
        name: 'Image Fix',
        description: 'Tests image fix and correction routines',
        tests: [
            'test-image-fix.js'
        ],
        required: false,
        category: 'content'
    },
    {
        name: 'Image Assets',
        description: 'Tests image asset management and linking',
        tests: [
            'test-image-assets.js'
        ],
        required: false,
        category: 'content'
    },
    {
        name: 'Absolute Path Handling',
        description: 'Tests absolute path handling for images and assets',
        tests: [
            'test-absolute-path.js'
        ],
        required: false,
        category: 'content'
    }
];

// Handler coverage mapping
const HANDLER_COVERAGE = {
    'DocumentHandlers': {
        tested: ['test-document-preferences.js', 'test-simple-document.js', 'test-document-and-page.js'],
        tools: [
            'get_document_info', 'create_document', 'open_document', 'save_document', 'close_document',
            'get_document_preferences', 'set_document_preferences', 'get_document_grid_settings',
            'set_document_grid_settings', 'get_document_layout_preferences', 'set_document_layout_preferences'
        ]
    },
    'PageHandlers': {
        tested: ['test-document-and-page.js', 'test-basic-workflow.js'],
        tools: [
            'add_page', 'get_page_info', 'navigate_to_page', 'duplicate_page', 'move_page', 'delete_page',
            'set_page_properties', 'adjust_page_layout', 'resize_page', 'create_page_guides'
        ]
    },
    'TextHandlers': {
        tested: ['test-content-management.js', 'test-standard-document.js'],
        tools: [
            'create_text_frame', 'edit_text_frame', 'create_table', 'populate_table', 'find_replace_text'
        ]
    },
    'GraphicsHandlers': {
        tested: [
            'test-content-management.js',
            'test-standard-document.js',
            'test-real-image.js',
            'test-image-fix.js',
            'test-image-assets.js',
            'test-absolute-path.js'
        ],
        tools: [
            'create_rectangle', 'create_ellipse', 'create_polygon', 'place_image',
            'create_object_style', 'list_object_styles', 'apply_object_style', 'get_image_info'
        ]
    },
    'StyleHandlers': {
        tested: [
            'test-content-management.js',
            'test-standard-document.js',
            'test-swatches-and-backgrounds.js'
        ],
        tools: [
            'create_paragraph_style', 'create_character_style', 'apply_paragraph_style',
            'apply_character_style', 'apply_color', 'create_color_swatch', 'list_styles', 'list_color_swatches'
        ]
    },
    'BookHandlers': {
        tested: ['test-advanced-features.js'],
        tools: [
            'create_book', 'open_book', 'list_books', 'add_document_to_book', 'synchronize_book',
            'repaginate_book', 'update_all_cross_references', 'export_book', 'package_book'
        ]
    },
    'PageItemHandlers': {
        tested: ['test-pageitem-group.js'],
        tools: [
            'get_page_item_info', 'select_page_item', 'move_page_item', 'resize_page_item',
            'set_page_item_properties', 'duplicate_page_item', 'delete_page_item', 'list_page_items'
        ]
    },
    'GroupHandlers': {
        tested: ['test-pageitem-group.js'],
        tools: [
            'create_group', 'create_group_from_items', 'ungroup', 'get_group_info',
            'add_item_to_group', 'remove_item_from_group', 'list_groups', 'set_group_properties'
        ]
    },
    'MasterSpreadHandlers': {
        tested: ['test-advanced-features.js'],
        tools: [
            'create_master_spread', 'list_master_spreads', 'delete_master_spread',
            'duplicate_master_spread', 'apply_master_spread', 'create_master_text_frame',
            'create_master_rectangle', 'create_master_guides', 'get_master_spread_info'
        ]
    },
    'ExportHandlers': {
        tested: ['test-advanced-features.js'],
        tools: [
            'export_pdf', 'export_images', 'package_document'
        ]
    },
    'UtilityHandlers': {
        tested: ['test-enhanced-functionality.js', 'test-advanced-features.js'],
        tools: [
            'execute_indesign_code', 'view_document', 'get_session_info', 'clear_session'
        ]
    }
};

function log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const emoji = {
        info: 'ℹ️',
        success: '✅',
        error: '❌',
        warning: '⚠️',
        header: '🚀',
        section: '📋',
        progress: '📊'
    }[level] || 'ℹ️';
    console.log(`${emoji} [${timestamp}] ${message}`);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTestFile(testFile) {
    return new Promise((resolve, reject) => {
        const testPath = join(__dirname, testFile);
        const testProcess = spawn('node', [testPath], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let errorOutput = '';
        let settled = false;

        const finish = (result) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timeout);
            resolve(result);
        };

        const timeout = setTimeout(() => {
            testProcess.kill();
            finish({
                success: false,
                output,
                errorOutput,
                code: 'timeout',
                timedOut: true
            });
        }, TEST_CONFIG.testFileTimeout);

        testProcess.stdout.on('data', (data) => {
            output += data.toString();
        });

        testProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        testProcess.on('close', (code) => {
            if (code === 0) {
                finish({ success: true, output, errorOutput });
            } else {
                finish({ success: false, output, errorOutput, code });
            }
        });

        testProcess.on('error', (error) => {
            reject(error);
        });
    });
}

async function runTestSuite(suite, results, currentSuiteIndex, totalSuites, progressBar) {
    log(`\n${suite.name}`, 'section');
    log(`Description: ${suite.description}`, 'info');
    log(`Category: ${suite.category}`, 'info');
    log(`Tests: ${suite.tests.join(', ')}`, 'info');
    log(`Required: ${suite.required ? 'Yes' : 'No'}`, 'info');

    const suiteResults = {
        name: suite.name,
        category: suite.category,
        tests: [],
        passed: 0,
        failed: 0,
        required: suite.required
    };

    for (let i = 0; i < suite.tests.length; i++) {
        const testFile = suite.tests[i];
        const testNumber = results.totalTests + i + 1;

        // Update progress bar
        progressBar.update(testNumber, `Running: ${testFile}`);

        try {
            const result = await runTestFile(testFile);

            const testResult = {
                file: testFile,
                success: result.success,
                output: result.output,
                errorOutput: result.errorOutput,
                exitCode: result.code
            };

            suiteResults.tests.push(testResult);

            if (result.success) {
                log(`${testFile}: ✅ PASSED`, 'success');
                suiteResults.passed++;
            } else {
                log(`${testFile}: ❌ FAILED (exit code: ${result.code})`, 'error');
                suiteResults.failed++;

                // Extract failure information from output
                if (result.output) {
                    const outputLines = result.output.split('\n');
                    const failureLines = outputLines.filter(line =>
                        line.includes('❌') ||
                        line.includes('FAILED') ||
                        line.includes('Error:') ||
                        line.includes('Test failed')
                    );

                    if (failureLines.length > 0) {
                        log(`Failure details:`, 'error');
                        failureLines.slice(0, 5).forEach(line => {
                            log(`  ${line.trim()}`, 'error');
                        });
                        if (failureLines.length > 5) {
                            log(`  ... and ${failureLines.length - 5} more error lines`, 'error');
                        }
                    }
                }

                if (result.errorOutput) {
                    log(`Error output: ${result.errorOutput.trim()}`, 'error');
                }
            }

            // Add delay between tests
            await delay(1000);

        } catch (error) {
            log(`${testFile}: ❌ ERROR - ${error.message}`, 'error');
            suiteResults.tests.push({
                file: testFile,
                success: false,
                error: error.message
            });
            suiteResults.failed++;
        }
    }

    results.suites.push(suiteResults);
    results.totalTests += suite.tests.length;

    if (suiteResults.failed > 0) {
        results.totalFailed++;
        if (suite.required) {
            results.requiredFailed++;
        }
    } else {
        results.totalPassed++;
    }

    return suiteResults;
}

function generateCoverageReport(results) {
    log('\n=== COVERAGE ANALYSIS ===', 'section');

    // Calculate handler coverage
    const handlerCoverage = {};
    for (const [handler, coverage] of Object.entries(HANDLER_COVERAGE)) {
        const testedFiles = coverage.tested;
        const testFilesInResults = results.suites.flatMap(suite => suite.tests.map(test => test.file));
        const covered = testedFiles.some(file => testFilesInResults.includes(file));

        handlerCoverage[handler] = {
            covered,
            tools: coverage.tools.length,
            testedFiles
        };
    }

    // Display coverage
    log('Handler Coverage:', 'info');
    for (const [handler, coverage] of Object.entries(handlerCoverage)) {
        const status = coverage.covered ? '✅' : '❌';
        log(`${status} ${handler}: ${coverage.tools} tools`, coverage.covered ? 'success' : 'error');
    }

    // Calculate overall coverage
    const totalHandlers = Object.keys(handlerCoverage).length;
    const coveredHandlers = Object.values(handlerCoverage).filter(c => c.covered).length;
    const coveragePercentage = ((coveredHandlers / totalHandlers) * 100).toFixed(1);

    log(`\nOverall Handler Coverage: ${coveragePercentage}% (${coveredHandlers}/${totalHandlers})`, 'progress');

    return handlerCoverage;
}

function selectTestSuites(args) {
    let selectedSuites = TEST_SUITES;

    if (args.includes('--required')) {
        selectedSuites = selectedSuites.filter(suite => suite.required);
    }

    const suiteArgIndex = args.indexOf('--suite');
    if (suiteArgIndex !== -1) {
        const suiteName = args[suiteArgIndex + 1];
        if (!suiteName) {
            log('Missing value for --suite', 'error');
            process.exit(1);
        }

        const normalizedSuiteName = suiteName.toLowerCase();
        selectedSuites = selectedSuites.filter(suite =>
            suite.name.toLowerCase() === normalizedSuiteName ||
            suite.category.toLowerCase() === normalizedSuiteName
        );

        if (selectedSuites.length === 0) {
            log(`Unknown test suite: ${suiteName}`, 'error');
            log('Available suites:', 'info');
            TEST_SUITES.forEach(suite => log(`  ${suite.name}`, 'info'));
            process.exit(1);
        }
    }

    return selectedSuites;
}

async function runAllTests(selectedSuites = TEST_SUITES) {
    log('InDesign MCP Server - Master Test Suite', 'header');
    log(`Server Path: ${TEST_CONFIG.serverPath}`, 'info');
    log(`Total Test Suites: ${selectedSuites.length}`, 'info');

    // Calculate total tests
    const totalTests = selectedSuites.reduce((sum, suite) => sum + suite.tests.length, 0);
    log(`Total Tests: ${totalTests}`, 'info');

    const results = {
        startTime: new Date(),
        suites: [],
        totalTests: 0,
        totalPassed: 0,
        totalFailed: 0,
        requiredFailed: 0
    };

    // Initialize progress bar
    const progressBar = new ProgressBar(totalTests);

    try {
        for (let i = 0; i < selectedSuites.length; i++) {
            const suite = selectedSuites[i];
            const suiteResult = await runTestSuite(suite, results, i, selectedSuites.length, progressBar);

            // If this is a required suite and it failed, we might want to stop
            if (suite.required && suiteResult.failed > 0) {
                log(`⚠️ Required suite "${suite.name}" failed. Continuing with remaining tests...`, 'warning');
            }

            // Add delay between suites
            await delay(2000);
        }

    } catch (error) {
        log(`Master test execution error: ${error.message}`, 'error');
    }

    // Final Results
    const endTime = new Date();
    const duration = (endTime - results.startTime) / 1000;

    log('\n' + '='.repeat(60), 'info');
    log('MASTER TEST RESULTS', 'header');
    log('='.repeat(60), 'info');

    log(`Total Duration: ${duration.toFixed(1)} seconds`, 'info');
    log(`Total Suites: ${results.suites.length}`, 'info');
    log(`Total Tests: ${results.totalTests}`, 'info');
    log(`Suites Passed: ${results.totalPassed}`, 'success');
    log(`Suites Failed: ${results.totalFailed}`, results.totalFailed > 0 ? 'error' : 'success');

    if (results.requiredFailed > 0) {
        log(`Required Suites Failed: ${results.requiredFailed}`, 'error');
    }

    // Generate coverage report
    const coverageReport = generateCoverageReport(results);

    // Detailed Results
    log('\nDETAILED RESULTS:', 'section');
    results.suites.forEach((suite, index) => {
        const status = suite.failed > 0 ? '❌' : '✅';
        const required = suite.required ? ' (Required)' : '';
        log(`${index + 1}. ${status} ${suite.name}${required}`, suite.failed > 0 ? 'error' : 'success');
        log(`   Category: ${suite.category}`, 'info');
        log(`   Tests: ${suite.passed} passed, ${suite.failed} failed`, 'info');

        if (suite.failed > 0) {
            suite.tests.forEach(test => {
                if (!test.success) {
                    log(`   ❌ ${test.file} (exit code: ${test.exitCode || 'unknown'})`, 'error');
                }
            });
        }
    });

    // Overall Status
    log('\nOVERALL STATUS:', 'section');
    if (results.requiredFailed > 0) {
        log('❌ CRITICAL FAILURE - Required test suites failed', 'error');
        process.exit(1);
    } else if (results.totalFailed > 0) {
        log('⚠️ PARTIAL SUCCESS - Some optional test suites failed', 'warning');
        process.exit(0);
    } else {
        log('✅ COMPLETE SUCCESS - All test suites passed', 'success');
        process.exit(0);
    }
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    log('InDesign MCP Server - Master Test Suite', 'header');
    log('Usage: node tests/index.js [options]', 'info');
    log('Options:', 'info');
    log('  --help, -h     Show this help message', 'info');
    log('  --required     Run only required test suites', 'info');
    log('  --suite <name> Run a specific test suite', 'info');
    log('  --coverage     Show detailed coverage analysis', 'info');
    log('\nAvailable Test Suites:', 'info');
    TEST_SUITES.forEach((suite, index) => {
        const required = suite.required ? ' (Required)' : '';
        log(`  ${index + 1}. ${suite.name}${required}`, 'info');
        log(`     Category: ${suite.category}`, 'info');
        log(`     ${suite.description}`, 'info');
    });
    log('\nHandler Coverage:', 'info');
    for (const [handler, coverage] of Object.entries(HANDLER_COVERAGE)) {
        log(`  ${handler}: ${coverage.tools} tools`, 'info');
    }
    process.exit(0);
}

// Run the tests
const selectedSuites = selectTestSuites(args);
runAllTests(selectedSuites).catch(error => {
    log(`Master test failed: ${error.message}`, 'error');
    process.exit(1);
});
