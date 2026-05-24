#!/usr/bin/env node

/**
 * InDesign MCP Server - Entry Point
 * 
 * This file serves as the main entry point for the InDesign MCP Server.
 * It redirects to the modular implementation by default.
 * 
 * Usage:
 *   npm start    -> Uses modular version (src/index.js)
 *   node index.js -> Uses this bridge (redirects to modular)
 */

// Redirect to the modular version
import('./src/index.js').catch(error => {
    console.error('Failed to load modular version:', error.message);
    console.error('Please ensure the modular version is properly implemented.');
    process.exit(1);
}); 