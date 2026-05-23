/**
 * Utility handlers for InDesign MCP Server
 */
import { ScriptExecutor } from '../core/scriptExecutor.js';
import { formatResponse } from '../utils/stringUtils.js';
import { sessionManager } from '../core/sessionManager.js';

export class UtilityHandlers {
    /**
     * Execute custom InDesign code
     */
    static async executeInDesignCode(args) {
        const { code } = args;
        // Insert code as-is to avoid breaking syntax; execution wrapper handles errors
        const script = [
            'try {',
            '  app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;',
            code || '"No code provided";',
            '} catch (error) {',
            '  "Error executing code: " + error.message;',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "Execute InDesign Code");
    }

    /**
     * View document information and current state
     */
    static async viewDocument() {
        const script = [
            'if (app.documents.length === 0) {',
            '  "No document open";',
            '} else {',
            '  var doc = app.activeDocument;',
            '  var info = "=== DOCUMENT VIEW ===\\n";',
            '  info += "Document: " + doc.name + "\\n";',
            '  info += "Pages: " + doc.pages.length + "\\n";',
            '  info += "Active Page: " + (doc.activePage ? doc.activePage.name : "None") + "\\n";',
            '  info += "Zoom: " + app.activeWindow.zoomPercentage + "%\\n";',
            '  info += "View Mode: " + app.activeWindow.displaySettings.overprintPreview + "\\n";',
            '',
            '  // Page information',
            '  if (doc.pages.length > 0) {',
            '    var page = doc.pages[0];',
            '    info += "\\n=== FIRST PAGE INFO ===\\n";',
            '    info += "Page Name: " + page.name + "\\n";',
            '    info += "Page Width: " + page.bounds[3] - page.bounds[1] + "\\n";',
            '    info += "Page Height: " + page.bounds[2] - page.bounds[0] + "\\n";',
            '    info += "Text Frames: " + page.textFrames.length + "\\n";',
            '    info += "Rectangles: " + page.rectangles.length + "\\n";',
            '    info += "Ovals: " + page.ovals.length + "\\n";',
            '    info += "Polygons: " + page.polygons.length + "\\n";',
            '  }',
            '',
            '  info;',
            '}'
        ].join('\n');

        const result = await ScriptExecutor.executeInDesignScript(script);
        return formatResponse(result, "View Document");
    }

    /**
     * Get session information
     */
    static async getSessionInfo() {
        const sessionInfo = sessionManager.getSessionSummary();
        return formatResponse(JSON.stringify(sessionInfo, null, 2), "Get Session Info");
    }

    /**
     * Clear session data
     */
    static async clearSession() {
        sessionManager.clearSession();
        return formatResponse("Session data cleared successfully", "Clear Session");
    }
} 
