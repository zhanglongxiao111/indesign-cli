#!/usr/bin/env node

/**
 * Master Test Index
 * Runs InDesign MCP Server smoke and optional suites.
 * --required is the baseline gate, not full behavior coverage.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { registry } from '../src/tools/index.js';

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
        name: 'Architecture Registry',
        description: 'Baseline gate for terminal architecture registry, artifact projection, and required runner wiring',
        tests: [
            'architecture/registry.test.mjs',
            'architecture/required-runner.test.mjs'
        ],
        required: true,
        category: 'architecture'
    },
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

// Registry domain coverage mapping. This is a lightweight smoke view for the
// master runner; detailed behavior coverage lives in the focused test files.
const DOMAIN_COVERAGE = {
    document: {
        tested: ['test-document-preferences.js', 'test-simple-document.js', 'test-document-and-page.js'],
    },
    page: {
        tested: ['test-document-and-page.js', 'test-basic-workflow.js'],
    },
    text: {
        tested: ['test-content-management.js', 'test-standard-document.js'],
    },
    graphics: {
        tested: [
            'test-content-management.js',
            'test-standard-document.js',
            'test-real-image.js',
            'test-image-fix.js',
            'test-image-assets.js',
            'test-absolute-path.js'
        ],
    },
    style: {
        tested: [
            'test-content-management.js',
            'test-standard-document.js',
            'test-swatches-and-backgrounds.js'
        ],
    },
    book: {
        tested: ['test-advanced-features.js'],
    },
    pageItem: {
        tested: ['test-pageitem-group.js'],
    },
    group: {
        tested: ['test-pageitem-group.js'],
    },
    masterSpread: {
        tested: ['test-advanced-features.js'],
    },
    spread: {
        tested: ['test-advanced-features.js'],
    },
    export: {
        tested: ['test-advanced-features.js'],
    },
    utility: {
        tested: ['test-enhanced-functionality.js', 'test-advanced-features.js'],
    },
    layer: {
        tested: ['test-advanced-features.js'],
    },
    help: {
        tested: ['architecture/registry.test.mjs'],
    },
    template: {
        tested: ['architecture/registry.test.mjs'],
    },
    presentation: {
        tested: ['architecture/registry.test.mjs'],
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
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true
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

    // Calculate registry domain coverage
    const domainCoverage = {};
    for (const [domain, coverage] of Object.entries(DOMAIN_COVERAGE)) {
        const testedFiles = coverage.tested;
        const testFilesInResults = results.suites.flatMap(suite => suite.tests.map(test => test.file));
        const covered = testedFiles.some(file => testFilesInResults.includes(file));
        const toolCount = registry.byDomain.get(domain)?.length || 0;

        domainCoverage[domain] = {
            covered,
            tools: toolCount,
            testedFiles
        };
    }

    // Display coverage
    log('Registry Domain Coverage:', 'info');
    for (const [domain, coverage] of Object.entries(domainCoverage)) {
        const status = coverage.covered ? '✅' : '❌';
        log(`${status} ${domain}: ${coverage.tools} tools`, coverage.covered ? 'success' : 'error');
    }

    // Calculate overall coverage
    const totalDomains = Object.keys(domainCoverage).length;
    const coveredDomains = Object.values(domainCoverage).filter(c => c.covered).length;
    const coveragePercentage = ((coveredDomains / totalDomains) * 100).toFixed(1);

    log(`\nOverall Registry Domain Coverage: ${coveragePercentage}% (${coveredDomains}/${totalDomains})`, 'progress');

    return domainCoverage;
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
    if (process.argv.slice(2).includes('--required')) {
        log('--required runs the baseline gate only; it is not full behavior coverage.', 'warning');
    }
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
    log('\nRegistry Domain Coverage:', 'info');
    for (const domain of Object.keys(DOMAIN_COVERAGE)) {
        log(`  ${domain}: ${registry.byDomain.get(domain)?.length || 0} tools`, 'info');
    }
    process.exit(0);
}

// Run the tests
const selectedSuites = selectTestSuites(args);
runAllTests(selectedSuites).catch(error => {
    log(`Master test failed: ${error.message}`, 'error');
    process.exit(1);
});
