/**
 * Handlers Index - Central export for all InDesign MCP Server handlers
 * 
 * This file provides a centralized way to import all handler classes
 * and serves as documentation for available handlers.
 */

// Core Document and Page Management
export { DocumentHandlers } from './documentHandlers.js';
export { PageHandlers } from './pageHandlers.js';

// Content Creation and Management
export { TextHandlers } from './textHandlers.js';
export { GraphicsHandlers } from './graphicsHandlers.js';
export { StyleHandlers } from './styleHandlers.js';

// Advanced Layout and Organization
export { MasterSpreadHandlers } from './masterSpreadHandlers.js';
export { SpreadHandlers } from './spreadHandlers.js';
export { LayerHandlers } from './layerHandlers.js';
export { PageItemHandlers } from './pageItemHandlers.js';
export { GroupHandlers } from './groupHandlers.js';

// Multi-Document and Production
export { BookHandlers } from './bookHandlers.js';
export { ExportHandlers } from './exportHandlers.js';

// System and Utility
export { UtilityHandlers } from './utilityHandlers.js';
export { HelpHandlers } from './helpHandlers.js';

// Presentation
export { PresentationHandlers } from './presentationHandlers.js';

/**
 * Handler Categories Overview:
 * 
 * 📄 Document & Page Management (2 handlers)
 * - DocumentHandlers: Document lifecycle, preferences, grid settings
 * - PageHandlers: Page operations, layout, content placement
 * 
 * ✍️ Content Creation (3 handlers)
 * - TextHandlers: Text frames, tables, find/replace
 * - GraphicsHandlers: Shapes, images, object styles
 * - StyleHandlers: Paragraph/character styles, colors
 * 
 * 🎯 Advanced Layout (3 handlers)
 * - MasterSpreadHandlers: Master page templates
 * - PageItemHandlers: Individual page item control
 * - GroupHandlers: Object grouping and organization
 * 
 * 📚 Production & Export (2 handlers)
 * - BookHandlers: Multi-document book management
 * - ExportHandlers: PDF, images, packaging
 * 
 * 🛠️ System Utilities (1 handler)
 * - UtilityHandlers: Code execution, session management
 * 
 * Total: 13 handler classes covering 135+ tools
 */

/**
 * Session Management Integration:
 * 
 * The following handlers are integrated with session management:
 * - DocumentHandlers: Stores page dimensions and document info
 * - TextHandlers: Uses smart positioning for content placement
 * - GraphicsHandlers: Uses smart positioning for shapes and images
 * - UtilityHandlers: Provides session info and cleanup
 * 
 * Session management is transparent and doesn't require separate calls.
 * It automatically:
 * - Tracks page dimensions when documents are created/opened
 * - Provides smart positioning when coordinates aren't specified
 * - Maintains state across operations
 * - Prevents content from being placed off-page
 */ 
